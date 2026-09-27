// Chat de voz por proximidad. La voz va directa de navegador a navegador (WebRTC, una conexión con cada jugador de
// la dimensión que también tiene la voz activada); el servidor sólo reparte quién la tiene y pasa las señales con
// las que se conectan. Cada voz entra en el motor de audio como un sonido más del mundo: sale de la cabeza de quien
// habla (HRTF), se apaga con la distancia hasta los 48 bloques y comparte la reverberación del resto de sonidos.
//
// Parte 2: el entorno (voiceEnvironment): las paredes la apagan y le quitan los agudos, en las cuevas y salas
// retumba y bajo el agua suena ahogada. Cada dimensión es un servidor aparte, así que sólo se oye a los de la misma.
//
// Parte 3: susurrar (otra tecla: se oye a la mitad de distancia), el volumen o el silencio de cada jugador (por su
// nombre, se guarda) y los grupos: los de un mismo grupo se oyen a cualquier distancia dentro de la dimensión. El
// susurro y el grupo viajan por un canal de datos de la propia conexión, sin pasar por el servidor.
//
// Se escucha a los demás en cuanto se entra (con la voz activada en los ajustes); el micrófono sólo se pide la
// primera vez que se pulsa la tecla de hablar (o al elegir el modo «por voz»).
import type { RtcSignal, ServerMsg } from '../../shared/protocol';
import type { Game } from '../game/Game';
import type { RemotePlayer } from '../game/RemotePlayers';
import { keyLabel } from '../game/keybinds';
import { BLOCK_FLUID } from '../../shared/blocks';
import { voiceOcclusion, voiceReverb, type BlockAt } from './voiceEnvironment';

/** Alcance de la voz (bloques): a partir de aquí no se oye. */
export const VOICE_RANGE = 48;
/** Alcance del susurro. */
export const WHISPER_RANGE = VOICE_RANGE / 2;
/** Los de un mismo grupo se oyen al menos a este volumen, estén donde estén (y sin paredes). */
const GROUP_GAIN = 0.85;
/** Nombre de un grupo: corto y sin espacios raros. */
export function cleanGroup(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24);
}
/** Hasta esta distancia se oye a todo volumen. */
const VOICE_NEAR = 2.5;
/** Conexiones como mucho (la malla crece con el cuadrado de los jugadores). */
const MAX_PEERS = 16;
/** Tras fallar una conexión, espera antes de reintentarla (ms). */
const RETRY_MS = 4000;
/** Nivel (RMS) a partir del cual se considera que alguien habla, y cuánto dura el «hablando» tras callar (ms). */
const TALK_RMS = 0.012;
const TALK_HOLD = 350;
/** Cada cuánto se recalcula lo que tapa cada voz y cuánto retumba (ms). */
const OCCLUSION_MS = 120;
const REVERB_MS = 600;
/** Quien habla bajo el agua (y se le oye desde fuera): la voz ahogada. */
const WATER_CUTOFF = 650;
const WATER_GAIN = 0.6;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

/** Volumen según la distancia: entero de cerca y una caída suave (cuadrática) hasta el alcance. */
export function voiceDistanceGain(d: number, range = VOICE_RANGE): number {
  if (d <= VOICE_NEAR) return 1;
  if (d >= range) return 0;
  const t = 1 - (d - VOICE_NEAR) / (range - VOICE_NEAR);
  return t * t;
}

/** Nivel RMS de lo que hay ahora en un analizador. */
function rms(an: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  an.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

interface PeerAudio {
  /** Chrome sólo entrega el sonido remoto a Web Audio si el stream está puesto en un elemento (silenciado). */
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  /** Volumen por la distancia (lo comparten el sonido directo y el eco). */
  gain: GainNode;
  /** Lo que llega de frente tras las paredes, con los agudos que dejan pasar. */
  direct: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  send: GainNode;
}

/** El entorno de una voz (se recalcula cada poco y el audio se acerca a él con suavidad). */
interface PeerEnv {
  gain: number;
  cutoff: number;
  reverb: number;
  nextOcclusion: number;
  nextReverb: number;
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** Candidatos que llegaron antes que la descripción del otro. */
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  audio: PeerAudio | null;
  stream: MediaStream | null;
  talkUntil: number;
  env: PeerEnv;
  /** Canal de datos: el susurro y el grupo del otro. */
  dc: RTCDataChannel | null;
  whisper: boolean;
  group: string;
}

export type MicState = 'none' | 'asking' | 'ready' | 'denied';

export class VoiceChat {
  private peers = new Map<string, Peer>();
  /** Lo que el servidor sabe de nosotros (se reinicia con cada bienvenida). */
  private announced = false;
  /** Conexiones que fallaron: no se reintentan hasta este instante. */
  private retryAt = new Map<string, number>();
  private mic: MediaStream | null = null;
  micState: MicState = 'none';
  private micAnalyser: AnalyserNode | null = null;
  private micSrc: MediaStreamAudioSourceNode | null = null;
  private buf = new Float32Array(512);
  /** Estamos mandando voz ahora (tecla pulsada o voz por encima del umbral). */
  transmitting = false;
  /** Susurrando (con la tecla de susurrar): los demás nos oyen a la mitad de distancia. */
  whispering = false;
  /** Grupo de voz ('' sin grupo). */
  group = '';
  /** Último estado mandado por los canales de datos. */
  private sentState = '';
  /** Nivel del micrófono (0..1) para el medidor de los ajustes. */
  micLevel = 0;
  private vadUntil = 0;
  private hud: HTMLElement | null = null;
  /** Cuánto retumba donde estamos nosotros (se mezcla con lo de quien habla). */
  private listenerReverb = 0.04;
  private nextListenerReverb = 0;

  constructor(private g: Game) {}

  private get settings() {
    return this.g.cfg.settings;
  }

  /** Activo: con servidor de verdad y la voz encendida en los ajustes. */
  get active(): boolean {
    return !this.g.offline && !!this.g.net && this.settings.voiceEnabled;
  }

  /** Nueva sesión en el servidor (entrar, reconectar o cambiar de dimensión): hay que volver a presentarse. */
  onWelcome(): void {
    this.announced = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.retryAt.clear();
  }

  /** Mensajes 'voice' y 'rtc' del servidor (true si era uno de ellos). */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'voice') {
      const rp = this.g.remote.get(msg.id);
      if (rp) rp.voice = msg.on;
      if (!msg.on) this.closePeer(msg.id);
      return true;
    }
    if (msg.t === 'rtc') {
      void this.onSignal(msg.from, msg.d);
      return true;
    }
    return false;
  }

  /** Pide el micrófono (hace falta un gesto del jugador la primera vez). */
  async requestMic(): Promise<boolean> {
    if (this.mic) return true;
    if (this.micState === 'asking') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micState = 'denied';
      this.g.ui.toast('Este navegador no permite usar el micrófono');
      return false;
    }
    this.micState = 'asking';
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (e) {
      console.warn('Micrófono no disponible:', e);
      this.micState = 'denied';
      this.g.ui.toast('No se pudo usar el micrófono');
      return false;
    }
    this.micState = 'ready';
    const track = this.mic.getAudioTracks()[0];
    if (track) track.enabled = false;
    // Las conexiones que ya había empiezan a llevar nuestra voz (sin renegociar: el transceptor ya estaba).
    for (const p of this.peers.values()) this.attachMic(p);
    return true;
  }

  private attachMic(p: Peer): void {
    const track = this.mic?.getAudioTracks()[0] ?? null;
    const tr = p.pc.getTransceivers()[0];
    if (!tr || !track || tr.sender.track === track) return;
    tr.direction = 'sendrecv';
    void tr.sender.replaceTrack(track).catch(() => {});
  }

  private releaseMic(): void {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.micSrc?.disconnect();
    this.micSrc = null;
    this.micAnalyser = null;
    if (this.micState === 'ready') this.micState = 'none';
    this.transmitting = false;
  }

  /** Cada fotograma: presentarse, conexiones con quien toque, quién habla y dónde suena cada voz. */
  update(pttDown: boolean, whisperDown: boolean, cam: readonly [number, number, number]): void {
    const net = this.g.net;
    if (!this.active || !net) {
      if (this.announced && net) net.send({ t: 'voice', on: false });
      this.announced = false;
      if (this.peers.size) for (const id of [...this.peers.keys()]) this.closePeer(id);
      if (this.mic) this.releaseMic();
      this.renderHud();
      return;
    }
    if (!this.announced) {
      net.send({ t: 'voice', on: true });
      this.announced = true;
    }
    // Modo «por voz»: el micrófono se pide al activarlo (desde los ajustes) o aquí si ya se había concedido.
    if (this.settings.voiceMode === 'vad' && this.micState === 'none') void this.requestMic();
    this.updateMic(pttDown, whisperDown);
    if (net.id) this.syncPeers(net.id);
    this.shareState();
    this.placeVoices(cam);
    this.renderHud();
  }

  /** Pulsar para hablar o voz por encima del umbral: el micrófono sólo manda sonido mientras tanto. */
  private updateMic(pttDown: boolean, whisperDown: boolean): void {
    const track = this.mic?.getAudioTracks()[0];
    const now = performance.now();
    let level = 0;
    if (this.mic && !this.micAnalyser) {
      const graph = this.g.audio.voiceGraph();
      if (graph) {
        this.micSrc = graph.ctx.createMediaStreamSource(this.mic);
        this.micAnalyser = graph.ctx.createAnalyser();
        this.micAnalyser.fftSize = 512;
        this.micSrc.connect(this.micAnalyser);
      }
    }
    if (this.micAnalyser) level = rms(this.micAnalyser, this.buf);
    this.micLevel = Math.min(1, level * 8);
    let on: boolean;
    if (this.settings.voiceMode === 'vad') {
      // El umbral de los ajustes (0..1) va de muy sensible a sólo voz fuerte.
      const threshold = 0.004 + this.settings.voiceThreshold * 0.08;
      if (level > threshold) this.vadUntil = now + 450;
      on = now < this.vadUntil || whisperDown;
    } else on = pttDown || whisperDown;
    this.transmitting = on && !!track && track.readyState === 'live';
    this.whispering = this.transmitting && whisperDown;
    if (track && track.enabled !== this.transmitting) track.enabled = this.transmitting;
  }

  /** Una conexión con cada jugador de la dimensión que tiene la voz; fuera las de quien se fue o la apagó. */
  private syncPeers(myId: string): void {
    const now = performance.now();
    for (const id of [...this.peers.keys()]) {
      const rp = this.g.remote.get(id);
      if (!rp || !rp.voice) this.closePeer(id);
    }
    for (const rp of this.g.remote.values()) {
      if (!rp.voice || this.peers.has(rp.id) || this.peers.size >= MAX_PEERS) continue;
      // Ofrece siempre el de id menor: así nunca se cruzan dos ofertas. El otro espera la suya.
      if (myId >= rp.id) continue;
      if ((this.retryAt.get(rp.id) ?? 0) > now) continue;
      void this.offer(rp.id);
    }
  }

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p: Peer = {
      id, pc, pending: [], remoteSet: false, audio: null, stream: null, talkUntil: 0,
      env: { gain: 1, cutoff: 20000, reverb: 0.04, nextOcclusion: 0, nextReverb: 0 },
      dc: null, whisper: false, group: '',
    };
    pc.ondatachannel = (e) => {
      if (this.peers.get(id) === p) this.bindChannel(p, e.channel);
    };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => {
      if (!e.candidate || this.peers.get(id) !== p) return;
      const c = e.candidate;
      const ice: NonNullable<RtcSignal['ice']> = { candidate: c.candidate };
      if (c.sdpMid != null) ice.sdpMid = c.sdpMid;
      if (c.sdpMLineIndex != null) ice.sdpMLineIndex = c.sdpMLineIndex;
      this.g.net?.send({ t: 'rtc', to: id, d: { ice } });
    };
    pc.ontrack = (e) => {
      if (this.peers.get(id) !== p) return;
      p.stream = e.streams[0] ?? new MediaStream([e.track]);
      this.buildAudio(p);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== p) return;
      if (pc.connectionState === 'failed') {
        this.closePeer(id);
        this.retryAt.set(id, performance.now() + RETRY_MS);
      }
    };
    return p;
  }

  private async offer(id: string): Promise<void> {
    const p = this.createPeer(id);
    const tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.bindChannel(p, p.pc.createDataChannel('estado', { ordered: true }));
    const track = this.mic?.getAudioTracks()[0];
    if (track) await tr.sender.replaceTrack(track).catch(() => {});
    try {
      const offer = await p.pc.createOffer();
      if (this.peers.get(id) !== p) return;
      await p.pc.setLocalDescription(offer);
      const sdp = p.pc.localDescription;
      if (sdp && this.peers.get(id) === p) this.g.net?.send({ t: 'rtc', to: id, d: { sdp: { type: 'offer', sdp: sdp.sdp } } });
    } catch (e) {
      console.warn('Voz: no se pudo crear la oferta', e);
      this.closePeer(id);
      this.retryAt.set(id, performance.now() + RETRY_MS);
    }
  }

  private async onSignal(from: string, d: RtcSignal): Promise<void> {
    if (!this.active) return;
    try {
      if (d.sdp?.type === 'offer') {
        // Una oferta nueva sustituye a la conexión que hubiera (el otro la rehízo).
        if (this.peers.has(from)) this.closePeer(from);
        if (this.peers.size >= MAX_PEERS) return;
        const p = this.createPeer(from);
        await p.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp.sdp });
        p.remoteSet = true;
        const tr = p.pc.getTransceivers()[0];
        if (tr) tr.direction = 'sendrecv';
        this.attachMic(p);
        await this.flushCandidates(p);
        const answer = await p.pc.createAnswer();
        if (this.peers.get(from) !== p) return;
        await p.pc.setLocalDescription(answer);
        const sdp = p.pc.localDescription;
        if (sdp) this.g.net?.send({ t: 'rtc', to: from, d: { sdp: { type: 'answer', sdp: sdp.sdp } } });
      } else if (d.sdp?.type === 'answer') {
        const p = this.peers.get(from);
        if (!p || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp.sdp });
        p.remoteSet = true;
        await this.flushCandidates(p);
      } else if (d.ice) {
        const p = this.peers.get(from);
        if (!p) return;
        if (p.remoteSet) await p.pc.addIceCandidate(d.ice);
        else if (p.pending.length < 64) p.pending.push(d.ice);
      }
    } catch (e) {
      console.warn('Voz: señal rechazada', e);
    }
  }

  /** El canal de datos de una conexión: al abrirse manda nuestro estado; recibe el del otro. */
  private bindChannel(p: Peer, dc: RTCDataChannel): void {
    p.dc = dc;
    dc.onopen = () => this.sendState(p);
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 200) return;
      try {
        const m = JSON.parse(e.data) as { w?: unknown; g?: unknown };
        p.whisper = m.w === 1;
        p.group = typeof m.g === 'string' ? cleanGroup(m.g) : '';
      } catch {
        /* mensaje roto: se ignora */
      }
    };
  }

  private stateJson(): string {
    return JSON.stringify({ w: this.whispering ? 1 : 0, g: this.group });
  }

  private sendState(p: Peer): void {
    if (p.dc?.readyState === 'open') p.dc.send(this.stateJson());
  }

  /** Si cambió el susurro o el grupo, se lo cuenta a todos. */
  private shareState(): void {
    const s = this.stateJson();
    if (s === this.sentState) return;
    this.sentState = s;
    for (const p of this.peers.values()) this.sendState(p);
  }

  private async flushCandidates(p: Peer): Promise<void> {
    const list = p.pending.splice(0);
    for (const c of list) await p.pc.addIceCandidate(c).catch(() => {});
  }

  /** La voz que llega: volumen, filtro (lo usa el entorno), posición 3D y su parte de reverberación. */
  private buildAudio(p: Peer): void {
    if (p.audio || !p.stream) return;
    const graph = this.g.audio.voiceGraph();
    if (!graph) return; // se vuelve a intentar en placeVoices
    const { ctx, bus, reverb } = graph;
    const el = new Audio();
    el.muted = true;
    el.srcObject = p.stream;
    void el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(p.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const direct = ctx.createGain();
    direct.gain.value = p.env.gain;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.5;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    // La distancia la aplica voiceDistanceGain (con el alcance exacto); el panner sólo coloca la voz.
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    // El eco sale antes de las paredes: tras un muro se oye sobre todo la sala en la que habla el otro.
    const send = ctx.createGain();
    send.gain.value = p.env.reverb;
    src.connect(analyser);
    src.connect(gain).connect(direct).connect(filter).connect(panner).connect(bus);
    gain.connect(send).connect(reverb);
    p.audio = { el, src, analyser, gain, direct, filter, panner, send };
  }

  private placeVoices(cam: readonly [number, number, number]): void {
    const graph = this.g.audio.voiceGraph();
    if (!graph) return;
    const now = performance.now();
    const t = graph.ctx.currentTime;
    const world = this.g.world;
    const get: BlockAt | null = world ? (x, y, z) => world.getBlock(x, y, z) : null;
    if (get && now >= this.nextListenerReverb) {
      this.nextListenerReverb = now + REVERB_MS;
      this.listenerReverb = voiceReverb(get, cam[0], cam[1], cam[2]);
    }
    const listenerWet = get ? BLOCK_FLUID[get(Math.floor(cam[0]), Math.floor(cam[1]), Math.floor(cam[2]))] === 1 : false;
    for (const p of this.peers.values()) {
      if (!p.audio) this.buildAudio(p);
      const a = p.audio;
      const rp = this.g.remote.get(p.id);
      if (!a || !rp) continue;
      const v = rp.view;
      const hy = v.y + (v.sneaking ? 1.27 : 1.62);
      a.panner.positionX.value = v.x;
      a.panner.positionY.value = hy;
      a.panner.positionZ.value = v.z;
      const d = Math.hypot(v.x - cam[0], hy - cam[1], v.z - cam[2]);
      const range = p.whisper ? WHISPER_RANGE : VOICE_RANGE;
      const grouped = this.group !== '' && p.group === this.group;
      const vol = this.playerVolume(rp.name);
      const dist = grouped ? Math.max(GROUP_GAIN, voiceDistanceGain(d, range)) : voiceDistanceGain(d, range);
      a.gain.gain.setTargetAtTime(dist * vol, t, 0.05);
      if (get && (grouped || d < range)) this.updateEnv(p, a, get, cam, v.x, hy, v.z, listenerWet, now, t, grouped);
      if (rms(a.analyser, this.buf) > TALK_RMS) p.talkUntil = now + TALK_HOLD;
      this.setTalking(rp, now < p.talkUntil && vol > 0 && (grouped || d < range), p.whisper);
    }
    for (const rp of this.g.remote.values()) if (!this.peers.has(rp.id)) this.setTalking(rp, false);
  }

  /** Paredes en medio, eco del sitio y agua: el filtro, lo que llega de frente y lo que retumba. */
  private updateEnv(p: Peer, a: PeerAudio, get: BlockAt, cam: readonly [number, number, number],
    x: number, y: number, z: number, listenerWet: boolean, now: number, t: number, grouped: boolean): void {
    const env = p.env;
    if (grouped) {
      // En grupo la voz llega limpia (como por radio): sin paredes ni agua, con un poco de su eco.
      env.nextOcclusion = 0;
      a.direct.gain.setTargetAtTime(1, t, 0.12);
      a.filter.frequency.setTargetAtTime(20000, t, 0.12);
      a.send.gain.setTargetAtTime(0.04, t, 0.3);
      return;
    }
    if (now >= env.nextOcclusion) {
      // Repartidos en el tiempo para no calcular todas las voces en el mismo fotograma.
      env.nextOcclusion = now + OCCLUSION_MS * (0.8 + Math.random() * 0.4);
      const occ = voiceOcclusion(get, cam[0], cam[1], cam[2], x, y, z);
      env.gain = occ.gain;
      env.cutoff = occ.cutoff;
      // Quien habla bajo el agua suena ahogado desde fuera (si los dos están dentro, ya lo apaga el filtro general).
      const speakerWet = BLOCK_FLUID[get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
      if (speakerWet && !listenerWet) {
        env.gain *= WATER_GAIN;
        env.cutoff = Math.min(env.cutoff, WATER_CUTOFF);
      }
    }
    if (now >= env.nextReverb) {
      env.nextReverb = now + REVERB_MS * (0.8 + Math.random() * 0.4);
      env.reverb = voiceReverb(get, x, y, z);
    }
    // El eco: sobre todo el del sitio de quien habla, algo del nuestro.
    const wet = 0.7 * env.reverb + 0.3 * this.listenerReverb;
    a.direct.gain.setTargetAtTime(env.gain, t, 0.12);
    a.filter.frequency.setTargetAtTime(env.cutoff, t, 0.12);
    a.send.gain.setTargetAtTime(wet, t, 0.3);
  }

  private setTalking(rp: RemotePlayer, on: boolean, whisper = false): void {
    rp.talking = on;
    rp.whispering = on && whisper;
  }

  /** Volumen elegido para un jugador (0 silenciado, 1 normal, hasta 2). */
  playerVolume(name: string): number {
    const v = this.settings.voicePlayers[name.toLowerCase()];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
  }

  private setPlayerVolume(name: string, v: number): void {
    const key = name.toLowerCase();
    if (v === 1) delete this.settings.voicePlayers[key];
    else this.settings.voicePlayers[key] = Math.max(0, Math.min(2, v));
    this.g.ui.commitSettings();
  }

  /** Jugadores de la dimensión con la voz activada (para los ajustes y /voz). */
  voicePlayers(): string[] {
    return [...this.g.remote.values()].filter((r) => r.voice).map((r) => r.name);
  }

  /**
   * Comandos del chat de voz (los resuelve el propio cliente): /voz [on|off|silenciar|activar|volumen] y
   * /grupo [nombre|salir]. Devuelve false si el texto no es uno de ellos.
   */
  command(text: string): boolean {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    if (cmd !== '/voz' && cmd !== '/grupo') return false;
    const say = (m: string) => this.g.ui.addChat(null, m);
    const findName = (raw: string | undefined): string | null => {
      if (!raw) return null;
      const r = [...this.g.remote.values()].find((p) => p.name.toLowerCase() === raw.toLowerCase());
      return r ? r.name : raw;
    };
    if (cmd === '/grupo') {
      const arg = parts.slice(1).join(' ');
      if (!arg) {
        say(this.group ? `Estás en el grupo «${this.group}». /grupo salir para dejarlo.` : 'No estás en ningún grupo. Uso: /grupo <nombre> (los del mismo grupo os oís a cualquier distancia).');
      } else if (arg.toLowerCase() === 'salir') {
        say(this.group ? `Has dejado el grupo «${this.group}».` : 'No estabas en ningún grupo.');
        this.group = '';
      } else {
        const g = cleanGroup(arg);
        if (!g) say('Ese nombre de grupo no vale: usa letras, números, _ o -.');
        else {
          this.group = g;
          const mates = [...this.peers.values()].filter((p) => p.group === g).map((p) => this.g.remote.get(p.id)?.name).filter(Boolean);
          say(`Ahora estás en el grupo «${g}»${mates.length ? ` con ${mates.join(', ')}` : ''}. Os oís a cualquier distancia en esta dimensión.`);
        }
      }
      return true;
    }
    const sub = (parts[1] ?? '').toLowerCase();
    const s = this.settings;
    if (sub === 'on' || sub === 'off') {
      s.voiceEnabled = sub === 'on';
      this.g.ui.commitSettings();
      say(s.voiceEnabled ? 'Chat de voz activado.' : 'Chat de voz desactivado.');
    } else if (sub === 'silenciar' || sub === 'activar') {
      const name = findName(parts[2]);
      if (!name) say(`Uso: /voz ${sub} <jugador>`);
      else {
        this.setPlayerVolume(name, sub === 'silenciar' ? 0 : 1);
        say(sub === 'silenciar' ? `Ya no oyes a ${name}.` : `Vuelves a oír a ${name}.`);
      }
    } else if (sub === 'volumen') {
      const name = findName(parts[2]);
      const pct = Number(parts[3]);
      if (!name || !Number.isFinite(pct)) say('Uso: /voz volumen <jugador> <0-200>');
      else {
        this.setPlayerVolume(name, Math.round(Math.max(0, Math.min(200, pct))) / 100);
        say(`Voz de ${name} al ${Math.round(this.playerVolume(name) * 100)} %.`);
      }
    } else if (sub === '') {
      if (!this.active) say(this.g.offline ? 'El chat de voz sólo funciona en un mundo con servidor.' : 'El chat de voz está desactivado (/voz on).');
      else {
        const mode = s.voiceMode === 'vad' ? 'se abre al hablar' : `pulsa ${keyLabel(s.keys.voice)} para hablar`;
        const list = [...this.g.remote.values()].filter((r) => r.voice).map((r) => {
          const vol = this.playerVolume(r.name);
          const state = !this.connected(r.id) ? 'conectando' : vol === 0 ? 'silenciado' : `${Math.round(vol * 100)} %`;
          return `${r.name} (${state})`;
        });
        say(`Chat de voz: ${mode}, ${keyLabel(s.keys.whisper)} para susurrar${this.group ? `, grupo «${this.group}»` : ''}. ` +
          (list.length ? `Con voz: ${list.join(', ')}.` : 'Nadie más tiene la voz activada en esta dimensión.'));
      }
    } else say('Uso: /voz [on|off], /voz silenciar <jugador>, /voz activar <jugador>, /voz volumen <jugador> <0-200>');
    return true;
  }

  private closePeer(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.ondatachannel = null;
    if (p.dc) {
      p.dc.onopen = null;
      p.dc.onmessage = null;
    }
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    if (p.audio) {
      p.audio.src.disconnect();
      p.audio.gain.disconnect();
      p.audio.panner.disconnect();
      p.audio.send.disconnect();
      p.audio.el.srcObject = null;
    }
    const rp = this.g.remote.get(id);
    if (rp) rp.talking = rp.whispering = false;
  }

  /** Conectados de verdad (para la lista de jugadores y la depuración). */
  connected(id: string): boolean {
    const s = this.peers.get(id)?.pc.connectionState;
    return s === 'connected';
  }

  /** Icono del micrófono en la pantalla: apagado, escuchando, hablando o sin permiso. */
  private renderHud(): void {
    if (!this.hud) {
      const hudRoot = document.getElementById('hud');
      if (!hudRoot) return;
      this.hud = document.createElement('div');
      this.hud.id = 'voice-hud';
      this.hud.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/><path class="slash" d="M4 4l16 16"/></svg><span></span>';
      hudRoot.appendChild(this.hud);
    }
    const st = !this.active ? 'off' : this.micState === 'denied' ? 'denied' : this.whispering ? 'whisper' : this.transmitting ? 'talking' : 'idle';
    const key = this.settings.keys.voice;
    const text = st === 'denied' ? 'Sin micrófono' : st === 'whisper' ? 'Susurro'
      : (st === 'idle' && this.settings.voiceMode === 'ptt' ? keyLabel(key) : '') + (this.group ? ` · ${this.group}` : '');
    if (this.hud.dataset.state !== st || this.hud.dataset.text !== text) {
      this.hud.dataset.state = st;
      this.hud.dataset.text = text;
      this.hud.querySelector('span')!.textContent = text.replace(/^ · /, '');
    }
  }

  dispose(): void {
    const net = this.g.net;
    if (this.announced && net) net.send({ t: 'voice', on: false });
    this.announced = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.releaseMic();
    this.hud?.remove();
    this.hud = null;
  }
}
