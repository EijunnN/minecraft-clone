// Programa lunar: la Tierra y la Luna como planetas de verdad, para el viaje y para el cielo de la Luna.
//
// Todo en tamaños reales: la Tierra de 6 371 km y la Luna de 1 737 km, con las distancias en km. Hay tres maneras de verlas:
// - la Tierra desde el aire (el ascenso y el descenso): en SKY_FS, con las tablas del cielo físico (su bruma y su limbo azul);
// - cualquiera de las dos desde el espacio (el tránsito y la Tierra en el cielo lunar): esferas con su superficie, su atmósfera
//   (la de la Tierra) y el Sol como única luz;
// - el suelo de la Luna hasta el horizonte (desde el suelo hasta 30 km de altura): un relieve que se recorre con rayos, curvado
//   con el radio real (el horizonte queda a ~2,4 km de los ojos, como allí) y con los mismos cráteres que genera el mundo
//   (el hash de world/moon.ts portado aquí) y, cerca, las alturas exactas del mapa lejano (MoonFarMap).
//
// Uniformes de cada programa (además del UBO de frame: uOrbit, uSite):
//   uEarthM, uMoonM (mat4): columnas 0..2 = ejes del cuerpo en el marco del juego; columna 3 = centro relativo a la cámara (km) y radio.

export const PLANET_COMMON = /* glsl */ `
const float R_EARTH_KM = 6371.0;
const float R_MOON_KM = 1737.4;
const float R_MOON_M = 1737400.0;
/** Altura media del suelo lunar (MOON_BASE de world/moon.ts). */
const float MOON_BASE_Y = 72.0;

float pn_hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float pn_noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = pn_hash3(i), b = pn_hash3(i + vec3(1, 0, 0)), c = pn_hash3(i + vec3(0, 1, 0)), d = pn_hash3(i + vec3(1, 1, 0));
  float e = pn_hash3(i + vec3(0, 0, 1)), g = pn_hash3(i + vec3(1, 0, 1)), h = pn_hash3(i + vec3(0, 1, 1)), k = pn_hash3(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float pn_hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float pn_noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pn_hash2(i), pn_hash2(i + vec2(1, 0)), f.x), mix(pn_hash2(i + vec2(0, 1)), pn_hash2(i + vec2(1, 1)), f.x), f.y);
}
/** fbm sobre la esfera (d unitario) de la frecuencia f0 hasta donde el tamaño de un píxel (fpKm) deja ver, con radio rKm. */
float pn_fbmSphere(vec3 d, float f0, int oct, float fpKm, float rKm) {
  float s = 0.0, a = 0.5, f = f0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float w = a * smoothstep(1.2, 0.35, fpKm * f / rKm);
    s += w * pn_noise3(d * f + float(i) * 7.31);
    norm += a;
    f *= 2.07;
    a *= 0.5;
  }
  return s / max(norm, 1e-4) + 0.5 * (1.0 - clamp(norm, 0.0, 1.0));
}
/** fbm plano (p en km) para el detalle cercano, desde la escala s0 (km) hacia abajo hasta el tamaño del píxel. */
float pn_fbmPlane(vec2 p, float s0, int oct, float fpKm) {
  float s = 0.0, a = 0.5, sc = s0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float w = smoothstep(0.4, 1.6, sc / max(fpKm, 1e-5));
    s += a * (mix(0.5, pn_noise2(p / sc + float(i) * 3.7), w) - 0.5);
    norm += a;
    sc *= 0.48;
    a *= 0.55;
  }
  return s / max(norm, 1e-4);
}

/** Tamaño (en la misma unidad que t) que ocupa un píxel a la distancia t. */
float pixelFootprint(float t) {
  return t * 2.0 * uNearFar.z / uRes.y;
}

/** Choque de un rayo (desde la cámara) con una esfera lejana de centro c y radio r: distancia o -1 (preciso a cualquier distancia). */
float farSphereHit(vec3 rd, vec3 c, float r) {
  float d = length(c);
  vec3 cd = c / d;
  float ca = dot(rd, cd);
  if (ca <= 0.0 && d > r) return -1.0;
  float perp = length(cross(rd, cd)) * d;
  if (perp >= r) return -1.0;
  float h = sqrt(max(r * r - perp * perp, 0.0));
  float t = d * ca - h;
  return t > 0.0 ? t : (d * ca + h > 0.0 ? 0.0 : -1.0);
}

/** Lambert lunar: el regolito refleja casi igual mire donde mire (la Luna llena parece un disco plano) y más de espaldas al Sol. */
float lunarLambert(float mu0, float mu, float cosPhase) {
  mu0 = max(mu0, 0.0);
  mu = max(mu, 0.0);
  float ls = 2.0 * mu0 / (mu0 + mu + 1e-3);
  float surge = 1.0 + 0.35 * smoothstep(0.985, 1.0, cosPhase);
  return mix(mu0, ls, 0.55) * surge;
}
`;

// ------------------------------------------------------------------ la Tierra
export const EARTH_SURFACE = /* glsl */ `
/**
 * Superficie de la Tierra en la dirección d (unitaria, en el marco de la Tierra), con el detalle cercano de las coordenadas planas
 * pKm (km, alrededor del sitio de salida). Devuelve el albedo (lineal); ocean, cloud y city salen aparte.
 */
vec3 earthSurface(vec3 d, vec2 pKm, float fpKm, float cloudK, out float ocean, out float cloud, out float city) {
  // El sitio de salida (el +Y del marco de la Tierra) queda a 40° de latitud norte, no en el polo.
  const float TILT = 0.873;
  d = vec3(d.x, d.y * cos(TILT) - d.z * sin(TILT), d.y * sin(TILT) + d.z * cos(TILT));
  float lat = abs(d.y);
  // Continentes: una forma grande y costas recortadas.
  float c = pn_fbmSphere(d, 2.0, 8, fpKm, R_EARTH_KM);
  c += 0.07 * pn_fbmPlane(pKm, 60.0, 7, fpKm);
  float land = smoothstep(0.505, 0.52, c);
  ocean = 1.0 - land;
  float coast = smoothstep(0.47, 0.515, c) * ocean;
  vec3 deep = vec3(0.008, 0.022, 0.06), shallow = vec3(0.02, 0.09, 0.12);
  vec3 sea = mix(deep, shallow, coast * 0.8);
  // Tierra: bosque en el trópico y el norte templado, desiertos hacia los 25°, montañas, tundra y nieve.
  float moist = pn_fbmSphere(d, 3.1, 6, fpKm, R_EARTH_KM) + 0.15 * pn_fbmPlane(pKm + 91.0, 20.0, 6, fpKm);
  float desertBelt = exp(-pow((lat - 0.42) / 0.14, 2.0));
  float dry = smoothstep(0.45, 0.62, moist + desertBelt * 0.35 - 0.1);
  vec3 forest = vec3(0.035, 0.065, 0.022), grass = vec3(0.1, 0.12, 0.045), desert = vec3(0.36, 0.25, 0.13);
  vec3 ground = mix(mix(forest, grass, smoothstep(0.35, 0.6, moist)), desert, dry * desertBelt);
  float mount = smoothstep(0.6, 0.75, pn_fbmSphere(d * 1.3 + 3.0, 4.0, 6, fpKm, R_EARTH_KM) + 0.1 * pn_fbmPlane(pKm - 17.0, 8.0, 6, fpKm));
  ground = mix(ground, vec3(0.11, 0.1, 0.09), mount * 0.7);
  // Campos, bosques y suelos: manchas de 1 a 30 km que se ven desde el avión.
  ground *= 0.75 + 0.9 * pn_fbmPlane(pKm * 1.3, 18.0, 8, fpKm) + 0.35 * (pn_fbmSphere(d, 24.0, 5, fpKm, R_EARTH_KM) - 0.5);
  ground = max(ground, vec3(0.01));
  // Nieve: en las montañas altas y en los casquetes (más allá de ~70° de latitud: sin(70°) ≈ 0,94).
  float snow = smoothstep(0.9, 0.95, lat + 0.04 * (c - 0.5) + mount * 0.25);
  vec3 alb = mix(sea, ground, land);
  float capEdge = 0.035 * (pn_fbmSphere(d, 7.0, 6, fpKm, R_EARTH_KM) - 0.5);
  alb = mix(alb, vec3(0.75, 0.78, 0.82), max(snow, smoothstep(0.962, 0.975, lat + capEdge)));
  // Ciudades (sólo se ven de noche): en la tierra templada y en las costas.
  city = land * (1.0 - snow) * smoothstep(0.64, 0.8, pn_fbmSphere(d * 2.0 + 5.0, 18.0, 4, fpKm, R_EARTH_KM)) * (1.0 - dry * desertBelt * 0.7);
  // Nubes: bandas por latitud, remolinos y jirones cercanos.
  float band = 0.52 + 0.06 * cos(lat * 9.0);
  vec3 dw = d + 0.08 * vec3(pn_noise3(d * 3.0 + 1.3), pn_noise3(d * 3.0 + 7.1), pn_noise3(d * 3.0 + 4.2));
  float cl = 0.65 * pn_fbmSphere(dw, 4.5, 8, fpKm, R_EARTH_KM) + 0.35 * (0.5 + pn_fbmPlane(pKm + 311.0, 90.0, 8, fpKm));
  cloud = smoothstep(band - 0.03, band + 0.1, cl) * cloudK;
  return mix(alb, vec3(0.78), cloud * 0.92);
}
`;

export const EARTH_SPACE = /* glsl */ `
/**
 * La Tierra vista desde fuera de su aire (M: ejes y centro). Devuelve el color y, en .a, cuánto tapa lo de detrás; t, la distancia.
 * El aire se ve como un velo azul que se espesa hacia el borde y un limbo encendido del lado del Sol, rojizo en el terminador.
 */
vec4 earthFromSpace(vec3 rd, mat4 M, vec3 sunDir, vec3 E, out float tOut) {
  vec3 c = M[3].xyz;
  float R = M[3].w;
  float d = length(c);
  vec3 cd = c / d;
  float ca = dot(rd, cd);
  tOut = -1.0;
  if (ca <= 0.0) return vec4(0.0);
  float perp = length(cross(rd, cd)) * d;
  const float H = 55.0;
  if (perp > R + H * 1.6) return vec4(0.0);
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 skyBlue = vec3(0.16, 0.34, 1.0);
  if (perp < R) {
    float t = d * ca - sqrt(max(R * R - perp * perp, 0.0));
    tOut = t;
    vec3 n = normalize(rd * t - c);
    vec3 dl = transpose(mat3(M)) * n;
    float fp = pixelFootprint(t) / max(dot(n, -rd), 0.08); // de lado, un píxel cubre más suelo
    float ocean, cloud, city;
    vec3 alb = earthSurface(dl, dl.xz * R, fp, 1.0, ocean, cloud, city);
    float mu0 = dot(n, sunDir);
    float mu = max(dot(n, -rd), 0.0);
    // La luz del Sol atraviesa más aire cerca del terminador: más débil y más roja.
    vec3 sunT = exp(-vec3(0.12, 0.28, 0.62) * 0.35 / max(mu0 + 0.06, 0.02));
    vec3 lit = E * sunT * max(mu0, 0.0);
    col = alb / PI * lit;
    // Brillo del Sol en el mar.
    vec3 h = normalize(sunDir - rd);
    col += E * sunT * ocean * (1.0 - cloud) * (pow(max(dot(n, h), 0.0), 260.0) * 1.6 + pow(max(dot(n, h), 0.0), 30.0) * 0.05) * step(0.0, mu0);
    // Luces de las ciudades en el lado de noche.
    col += vec3(1.0, 0.62, 0.28) * city * (1.0 - cloud * 0.8) * 0.022 * smoothstep(0.02, -0.12, mu0);
    // Velo de aire: más cuanto más de lado se mira; iluminado por el Sol.
    float veil = 0.08 + 0.92 * pow(1.0 - mu, 3.0);
    col = mix(col, col * vec3(0.7, 0.8, 0.95), veil * 0.5);
    col += skyBlue * E * 0.012 * veil * smoothstep(-0.25, 0.35, mu0);
    a = 1.0;
  }
  // Limbo: el aire alrededor del disco (y, ya sobre el disco, sólo en su borde).
  float hh = max(perp - R, 0.0);
  float edge = perp < R ? pow(perp / R, 24.0) * 0.35 : 1.0;
  if (edge > 1e-3) {
    vec3 nC = normalize(rd * (d * ca) - c);
    float lc = dot(nC, sunDir);
    float dens = exp(-hh / 8.0) * edge;
    vec3 limb = mix(vec3(1.0, 0.42, 0.18), skyBlue, smoothstep(-0.05, 0.25, lc));
    col += limb * E * 0.07 * dens * smoothstep(-0.2, 0.15, lc) * sqrt(max(R / 200.0, 1.0)) * 0.15;
  }
  return vec4(col, a);
}
`;

// ------------------------------------------------------------------ la Luna
export const MOON_SURFACE = /* glsl */ `
uniform sampler2D uMoonMap;
/** x0, z0 del mapa lejano (bloques), 1 / su lado (bloques), 1 si está listo. */
uniform vec4 uMoonMapInfo;
/** Semilla del mundo ya mezclada con la de los cráteres (seed ^ 0xc4a7e5), como en world/moon.ts. */
uniform int uMoonSeed;

/** hash2 de shared/constants.ts. */
uint moonHash2(int x, int z, uint seed) {
  uint h = (uint(x) * 0x27d4eb2du) ^ (uint(z) * 0x165667b1u) ^ (seed * 0x9e3779b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return h ^ (h >> 16u);
}
float moonH01(int x, int z, uint seed) {
  return float(moonHash2(x, z, seed)) / 4294967296.0;
}

/** Los cráteres del generador (las tres escalas de world/moon.ts), sólo la celda propia: cuánto sube o baja el suelo. */
float genCraters(vec2 w, float fp) {
  float dy = 0.0;
  uint seed = uint(uMoonSeed);
  for (int s = 0; s < 3; s++) {
    float cell = s == 0 ? 288.0 : s == 1 ? 112.0 : 40.0;
    float rMin = s == 0 ? 34.0 : s == 1 ? 11.0 : 3.0;
    float rMax = s == 0 ? 70.0 : s == 1 ? 26.0 : 8.0;
    float chance = s == 0 ? 0.55 : 0.6;
    if (fp > rMax * 1.5) continue; // más pequeño que un píxel
    int ci = int(floor(w.x / cell)), cj = int(floor(w.y / cell));
    if (moonH01(ci * 31, cj * 17 + s, seed) >= chance) continue;
    float h1 = moonH01(ci * 31 + 1, cj * 17 + s, seed);
    float r = rMin + (rMax - rMin) * h1 * h1;
    float margin = r * 1.3;
    vec2 c = vec2(float(ci), float(cj)) * cell + margin + (cell - 2.0 * margin) * vec2(moonH01(ci * 31 + 2, cj * 17 + s, seed), moonH01(ci * 31 + 3, cj * 17 + s, seed));
    float depth = min(r * 0.32, 9.0 + r * 0.12);
    float t = length(w - c) / r;
    if (t < 1.0) dy -= depth * pow(1.0 - t * t, 1.6) * (1.0 - 0.18 * t) - depth * 0.42 * t * t * t * t;
    else if (t < 1.45) {
      float u = (t - 1.0) / 0.45;
      dy += depth * 0.42 * (1.0 - u) * (1.0 - u) * (1.0 + 0.5 * u);
    }
  }
  return dy;
}

/** Cráteres grandes (de 1 a 40 km) que el generador no tiene: dan relieve y color vistos desde lo alto. fresh: halo claro. */
float bigCraters(vec2 w, float fp, out float fresh, out float floorDark) {
  float dy = 0.0;
  fresh = 0.0;
  floorDark = 0.0;
  uint seed = uint(uMoonSeed) ^ 0x5bd1e995u;
  float cell = 1600.0;
  for (int s = 0; s < 5; s++) {
    if (fp < cell * 0.25) {
      int ci = int(floor(w.x / cell)), cj = int(floor(w.y / cell));
      float h0 = moonH01(ci, cj + s * 7919, seed);
      if (h0 < 0.55) {
        float h1 = moonH01(ci + 101, cj + s * 7919, seed);
        float r = cell * (0.1 + 0.26 * h1 * h1);
        float margin = r * 1.3;
        vec2 c = vec2(float(ci), float(cj)) * cell + margin + (cell - 2.0 * margin) * vec2(moonH01(ci + 202, cj + s * 7919, seed), moonH01(ci + 303, cj + s * 7919, seed));
        float depth = r * (s < 2 ? 0.16 : 0.08);
        float t = length(w - c) / r;
        if (t < 1.0) {
          float bowl = pow(1.0 - t * t, 1.4);
          // Los grandes tienen el fondo plano y un pico central.
          if (s >= 3) bowl = min(bowl, 0.75) - 0.35 * exp(-t * t / 0.02);
          dy -= depth * bowl;
          floorDark = max(floorDark, smoothstep(0.8, 0.3, t) * (s >= 3 ? 0.5 : 0.2));
        } else if (t < 1.45) {
          float u = (t - 1.0) / 0.45;
          dy += depth * 0.35 * (1.0 - u) * (1.0 - u) * (1.0 + 0.5 * u);
        }
        // Cráter joven: paredes claras y un manto de eyección que se apaga hacia fuera (el fondo, algo más oscuro).
        if (moonH01(ci + 404, cj + s * 7919, seed) < 0.18) fresh = max(fresh, smoothstep(1.45, 1.0, t) * mix(0.3, 1.0, smoothstep(0.55, 0.95, t)));
      }
    }
    cell *= 3.3;
  }
  return dy;
}

/** Mares lejos del mapa: manchas oscuras grandes (las del generador sólo se conocen dentro del mapa). */
float farMare(vec2 w, float fp) {
  // Los mares de verdad miden cientos de km, con bordes recortados; de cerca, las manchas del generador (de ~400 m).
  float big = pn_noise2(w / 700000.0 + 3.1) * 0.55 + pn_noise2(w / 240000.0 - 7.7) * 0.3 + pn_noise2(w / 70000.0 + 1.9) * 0.15;
  float edge = pn_noise2(w / 20000.0 + 4.4) * smoothstep(8000.0, 2000.0, fp);
  float small = (pn_noise2(w / 420.0) * 0.7 + pn_noise2(w / 130.0 + 5.0) * 0.3) * smoothstep(200.0, 40.0, fp);
  return smoothstep(0.5, 0.56, big + 0.05 * (edge - 0.5) + 0.12 * (small - 0.5));
}

/** Peso del mapa lejano en w (1 dentro, 0 fuera o si no está listo), con un borde suave. */
float moonMapWeight(vec2 w, out vec2 uv) {
  uv = (w - uMoonMapInfo.xy) * uMoonMapInfo.z;
  vec2 e = smoothstep(vec2(0.0), vec2(0.06), uv) * smoothstep(vec2(1.0), vec2(0.94), uv);
  return e.x * e.y * uMoonMapInfo.w;
}

/**
 * Altura del suelo lunar (bloques, absoluta) en w (bloques del mundo). fp: tamaño del píxel (bloques). big: cuánto relieve dan
 * los cráteres grandes (0 a ras de suelo: no están en el mundo de bloques). mare: 0..1.
 */
float moonHeight(vec2 w, float fp, float big, out float mare) {
  vec2 uv;
  float wm = moonMapWeight(w, uv);
  float fresh, floorDark;
  float bigDy = big > 0.0 ? bigCraters(w, fp, fresh, floorDark) * big : 0.0;
  float hp = 0.0;
  float mp = 0.0;
  if (wm < 0.999) {
    mp = farMare(w, fp);
    float hills = (pn_noise2(w / 140.0) - 0.5) * 2.0 * mix(10.0, 2.2, mp) + (pn_noise2(w / 24.0 + 9.0) - 0.5) * 2.0 * mix(2.2, 0.8, mp);
    hp = MOON_BASE_Y + 1.0 - 9.0 * mp + hills + genCraters(w, fp) * mix(1.0, 0.7, mp);
  }
  float hm = hp;
  if (wm > 0.001) {
    vec4 m = texture(uMoonMap, uv);
    hm = m.r;
    mp = mix(mp, m.g, wm);
  }
  mare = mp;
  return mix(hp, hm, wm) + bigDy;
}

/** Albedo (lineal) del suelo lunar: el de los bloques de regolito claro y oscuro, con algo de variación y los halos de los cráteres jóvenes. */
vec3 moonAlbedo(vec2 w, float fp, float mare) {
  float fresh, floorDark;
  bigCraters(w, fp, fresh, floorDark);
  // Los de los bloques (regolito claro y oscuro), un poco por debajo de su media: los bloques llevan además su oclusión.
  vec3 hi = vec3(0.165, 0.163, 0.16), lo = vec3(0.042, 0.045, 0.053);
  vec3 a = mix(hi, lo, mare);
  float v = pn_noise2(w / 700.0) * 0.5 + pn_noise2(w / 5200.0 + 3.0) * 0.5;
  a *= 0.82 + 0.36 * v;
  a *= 1.0 - floorDark * 0.25;
  a = mix(a, vec3(0.3, 0.3, 0.29), fresh * 0.4);
  return a;
}
`;

export const MOON_GROUND = /* glsl */ `
/**
 * El suelo de la Luna visto desde cerca (desde el suelo hasta ~30 km de altura): un relieve curvado con el radio real, recorrido con
 * un rayo desde la cámara (ro, bloques, absoluta; shift: lo que avanza la nave hacia +x). Sólo más allá de lo que ya dibujan los
 * bloques (tStart). Devuelve el color con .a = 1 si toca el suelo; tOut, la distancia (bloques).
 */
vec4 moonGround(vec3 ro, vec3 rd, float shift, vec3 sunDir, vec3 sunE, float tStart, out float tOut) {
  tOut = -1.0;
  float alt = ro.y - MOON_BASE_Y;
  float big = smoothstep(300.0, 3000.0, alt);
  const float MAXH = MOON_BASE_Y + 40.0;
  vec2 o = ro.xz + vec2(shift, 0.0);
  // Horizonte: más allá del punto en el que el rayo más bajo roza la esfera no hay nada que ver.
  float horizon = sqrt(2.0 * R_MOON_M * max(alt + 40.0, 1.0)) * 1.25;
  float tMax = horizon;
  float t = tStart;
  if (ro.y > MAXH) {
    if (rd.y >= 0.0) return vec4(0.0);
    t = max(t, (ro.y - MAXH) / -rd.y * 0.98);
  }
  float prevT = t, prevD = 1e9;
  bool hit = false;
  float mare;
  for (int i = 0; i < 110; i++) {
    if (t > tMax) break;
    vec3 p = ro + rd * t;
    float dh = length(p.xz - ro.xz);
    float curve = dh * dh / (2.0 * R_MOON_M);
    float fp = pixelFootprint(t);
    float gy = moonHeight(o + (p.xz - ro.xz), fp, big, mare) - curve;
    float dd = p.y - gy;
    if (dd < 0.0) {
      // Afinar entre el paso anterior y éste.
      float a = prevT, b = t;
      for (int k = 0; k < 5; k++) {
        float m = 0.5 * (a + b);
        vec3 q = ro + rd * m;
        float dq = length(q.xz - ro.xz);
        float g = moonHeight(o + (q.xz - ro.xz), pixelFootprint(m), big, mare) - dq * dq / (2.0 * R_MOON_M);
        if (q.y < g) b = m; else a = m;
      }
      t = b;
      hit = true;
      break;
    }
    // Rayo que sube y ya está por encima de todo: no toca nada.
    if (rd.y > 0.0 && p.y - MAXH + curve > 0.0 && dd > 0.0 && p.y > MAXH) break;
    prevT = t;
    prevD = dd;
    t += max(dd * 0.55, 0.012 * t + 1.5);
  }
  if (!hit) return vec4(0.0);
  tOut = t;
  vec3 p = ro + rd * t;
  vec2 w = o + (p.xz - ro.xz);
  float fp = pixelFootprint(t);
  float e = max(1.0, fp * 1.5);
  float m0;
  float hC = moonHeight(w, fp, big, mare);
  float hx = moonHeight(w + vec2(e, 0.0), fp, big, m0);
  float hz = moonHeight(w + vec2(0.0, e), fp, big, m0);
  // La curvatura inclina el suelo lejano hacia fuera.
  vec2 rel = p.xz - ro.xz;
  vec3 n = normalize(vec3(-(hx - hC) / e - rel.x / R_MOON_M, 1.0, -(hz - hC) / e - rel.y / R_MOON_M));
  vec3 alb = moonAlbedo(w, fp, mare);
  float mu0 = dot(n, sunDir);
  float lit = lunarLambert(mu0, dot(n, -rd), dot(-rd, sunDir));
  // Sombra: un rayo corto hacia el Sol sobre el mismo relieve.
  float shadow = 1.0;
  if (mu0 > 0.0 && sunDir.y > -0.02) {
    float st = max(2.0, fp * 2.0);
    for (int k = 0; k < 20; k++) {
      vec3 q = p + n * 0.6 + sunDir * st;
      float dq = length(q.xz - ro.xz);
      float g = moonHeight(o + (q.xz - ro.xz), pixelFootprint(t + st), big, m0) - dq * dq / (2.0 * R_MOON_M);
      shadow = min(shadow, smoothstep(-0.5, 1.5, q.y - g));
      if (shadow <= 0.0 || q.y > MAXH + 10.0) break;
      st *= 1.45;
    }
  }
  vec3 col = alb / PI * (sunE * lit * shadow + vec3(0.010, 0.012, 0.018));
  return vec4(col, 1.0);
}

/** La Luna vista como esfera (desde más de ~30 km): su superficie en coordenadas del sitio (site + shift) para casar con el suelo. */
vec4 moonFromSpace(vec3 rd, mat4 M, vec2 site, float shift, vec3 sunDir, vec3 sunE, out float tOut) {
  vec3 c = M[3].xyz;
  float R = M[3].w;
  tOut = -1.0;
  float t = farSphereHit(rd, c, R);
  if (t < 0.0) return vec4(0.0);
  tOut = t;
  vec3 n = normalize(rd * t - c);
  vec3 dl = transpose(mat3(M)) * n;
  float graze = max(dot(n, -rd), 0.08);
  // Proyección azimutal alrededor del sitio (el polo +Y de sus ejes): distancia sobre la superficie y rumbo.
  float th = acos(clamp(dl.y, -1.0, 1.0));
  vec2 dir2 = length(dl.xz) > 1e-6 ? normalize(dl.xz) : vec2(1.0, 0.0);
  vec2 w = site + vec2(shift, 0.0) + dir2 * th * R_MOON_M;
  float fp = pixelFootprint(t) * 1000.0 / graze;
  float mare;
  float hC = moonHeight(w, fp, 1.0, mare);
  float e = max(fp * 1.5, 50.0);
  float m0;
  float hx = moonHeight(w + vec2(e, 0.0), fp, 1.0, m0);
  float hz = moonHeight(w + vec2(0.0, e), fp, 1.0, m0);
  // Normal: la de la esfera inclinada por el relieve (en el marco tangente del punto).
  vec3 up = dl;
  vec3 tx = normalize(vec3(dir2.x * dl.y, -length(dl.xz), dir2.y * dl.y));
  if (length(dl.xz) < 1e-6) tx = vec3(1.0, 0.0, 0.0);
  vec3 tz = normalize(cross(tx, up));
  // (dir2 apunta a +x/+z locales: el gradiente en w se lleva a tx/tz del punto)
  vec2 g = vec2(hx - hC, hz - hC) / e;
  vec3 gx = tx * (g.x * dir2.x + g.y * dir2.y);
  vec3 gz = tz * (-g.x * dir2.y + g.y * dir2.x);
  vec3 nl = normalize(up - gx - gz);
  vec3 nw = mat3(M) * nl;
  vec3 alb = moonAlbedo(w, fp, mare);
  float lit = lunarLambert(dot(nw, sunDir), dot(nw, -rd), dot(-rd, sunDir));
  // A lo lejos la sombra de los cráteres se pierde: el terminador se suaviza con la curvatura de la esfera.
  lit *= smoothstep(-0.03, 0.05, dot(n, sunDir));
  vec3 col = alb / PI * (sunE * lit + vec3(0.010, 0.012, 0.018));
  return vec4(col, 1.0);
}
`;

export const SPACE_SKY = /* glsl */ `
uniform mat4 uEarthM;
uniform mat4 uMoonM;

/** Estrellas sin titilar, la Vía Láctea y el Sol, como se ven sin aire. */
vec3 starsAndSun(vec3 rd, vec3 sunDir) {
  vec3 c = vec3(0.0);
  vec3 q = rd * 230.0;
  vec3 cell = floor(q);
  float h = pn_hash3(cell);
  if (h > 0.962) {
    vec3 off = vec3(pn_hash3(cell + 1.7), pn_hash3(cell + 5.3), pn_hash3(cell + 9.1)) - 0.5;
    float d = length(fract(q) - 0.5 - off * 0.4);
    float b = 0.3 + pow((h - 0.962) / 0.038, 3.0) * 2.6;
    vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.66), pn_hash3(cell + 3.3));
    c += tint * smoothstep(0.30, 0.0, d) * b * 0.55;
  }
  float band = exp(-pow(dot(rd, normalize(vec3(0.35, 0.8, 0.5))) * 4.2, 2.0));
  c += vec3(0.05, 0.055, 0.07) * 0.3 * band * (0.25 + 0.75 * pn_noise3(rd * 5.0 + 2.0) * pn_noise3(rd * 11.0));
  float cs = dot(rd, sunDir);
  c += vec3(1.0, 0.97, 0.9) * smoothstep(cos(0.0056), cos(0.0046), cs) * 160.0;
  // Corona tenue alrededor del disco.
  c += vec3(1.0, 0.95, 0.85) * pow(max(cs, 0.0), 2000.0) * 0.6;
  return c;
}

/**
 * El cielo sin aire: estrellas, el Sol, la Tierra (uEarthM) y la Luna (uMoonM): esfera si está lejos, suelo con relieve si se está
 * a menos de 30 km de ella (sólo si camOnMoon: la cámara está de verdad sobre ese suelo, en la dimensión de la Luna).
 */
vec3 spaceSky(vec3 rd, bool camOnMoon, float tStart) {
  vec3 sunDir = normalize(uSpaceSun.xyz);
  vec3 E = uSunIllum.rgb * 0.4;
  vec3 col = starsAndSun(rd, sunDir);
  float tE, tM;
  vec4 earth = earthFromSpace(rd, uEarthM, sunDir, E, tE);
  float moonAlt = length(uMoonM[3].xyz) - uMoonM[3].w;
  vec4 moon;
  if (camOnMoon && moonAlt < 30.0) {
    moon = moonGround(uCamPos.xyz, rd, uSite.z, sunDir, uLightColor.rgb, tStart, tM);
    if (tM > 0.0) tM *= 0.001;
  } else {
    moon = moonFromSpace(rd, uMoonM, uSite.xy, uSite.z, sunDir, E, tM);
  }
  // Lo lejano primero; lo cercano lo tapa.
  bool earthFirst = tE > 0.0 && (tM < 0.0 || tE > tM);
  if (earthFirst) {
    col = mix(col, earth.rgb, earth.a) + earth.rgb * (1.0 - earth.a);
    col = mix(col, moon.rgb, moon.a);
  } else {
    col = mix(col, moon.rgb, moon.a);
    col = mix(col, earth.rgb, earth.a) + earth.rgb * (1.0 - earth.a) * (moon.a > 0.5 ? 0.0 : 1.0);
  }
  return col;
}
`;

/** Todo lo de los planetas, en orden (para el programa de composición). */
export const PLANETS = PLANET_COMMON + EARTH_SURFACE + EARTH_SPACE + MOON_SURFACE + MOON_GROUND + SPACE_SKY;

/** La Tierra vista desde el aire (para SKY_FS): el suelo curvo con la bruma y la luz de las tablas del cielo físico. */
export const EARTH_AIR = /* glsl */ `
/** ¿Toca el rayo el suelo curvo de la Tierra desde la cámara? (distancia en km o -1). */
float earthGroundHit(vec3 rd) {
  float r = cameraRadius();
  return raySphereNear(vec3(0.0, r, 0.0), rd, Rg);
}

/**
 * Color en la dirección rd desde lo alto (h km sobre el suelo): el suelo con su luz y la bruma encima (tablas de transmitancia y de
 * vista del cielo), o el cielo con el limbo. shiftKm: lo que ha avanzado la nave hacia +x (el planeta gira debajo).
 */
vec3 earthFromAir(vec3 rd, sampler2D skyView, sampler2D transLut, float shiftKm, float cloudK) {
  float r = cameraRadius();
  vec3 ro = vec3(0.0, r, 0.0);
  float tG = raySphereNear(ro, rd, Rg);
  vec3 insc = texture(skyView, skyViewUV(rd)).rgb;
  if (tG <= 0.0) return insc;
  vec3 p = ro + rd * tG;
  vec3 n = p / Rg;
  // Marco de la Tierra: girada lo que ha avanzado la nave (rotZ(+shift/R) sobre la normal).
  float a = shiftKm / Rg;
  vec3 dl = vec3(cos(a) * n.x - sin(a) * n.y, sin(a) * n.x + cos(a) * n.y, n.z);
  vec2 pKm = p.xz + vec2(shiftKm, 0.0);
  float fp = pixelFootprint(tG) / max(dot(n, -rd), 0.08); // de lado, un píxel cubre más suelo
  float ocean, cloud, city;
  vec3 alb = earthSurface(dl, pKm, fp, cloudK, ocean, cloud, city);
  // Cerca de la plataforma: el mar lejano que se ve desde el suelo (por rumbo), para no cambiar de sitio al despegar.
  float dist = length(p.xz);
  float nearK = smoothstep(18.0, 6.0, dist);
  if (nearK > 0.0) {
    float oc = texture(uFarOcean, vec2(atan(rd.z, rd.x) / TAU + 0.5, 0.5)).r;
    vec3 nearLand = vec3(0.045, 0.075, 0.03);
    vec3 nearSea = vec3(0.01, 0.03, 0.06);
    alb = mix(alb, mix(nearLand, nearSea, oc), nearK * (1.0 - cloud));
    ocean = mix(ocean, oc, nearK);
  }
  vec3 sunDir = uSunDir.xyz;
  float muS = dot(n, sunDir);
  vec3 Ts = texture(transLut, transmittanceUV(Rg, max(muS, 0.0))).rgb * smoothstep(-0.02, 0.03, muS);
  vec3 E = uSunIllum.rgb * Ts * max(muS, 0.0) + uSunIllum.rgb * vec3(0.5, 0.7, 1.0) * 0.035 * smoothstep(-0.15, 0.25, muS);
  vec3 L = alb / PI * E;
  vec3 h = normalize(sunDir - rd);
  L += uSunIllum.rgb * Ts * ocean * (1.0 - cloud) * (pow(max(dot(n, h), 0.0), 300.0) * 1.2 + pow(max(dot(n, h), 0.0), 30.0) * 0.04);
  L += vec3(1.0, 0.62, 0.28) * city * 0.022 * smoothstep(0.02, -0.12, muS);
  // Transmitancia de la cámara al suelo: T(suelo, hacia arriba) / T(cámara, hacia arriba) por el mismo rayo invertido.
  float mu = rd.y;
  float muP = dot(n, rd);
  vec3 Tv = texture(transLut, transmittanceUV(Rg, -muP)).rgb / max(texture(transLut, transmittanceUV(r, -mu)).rgb, vec3(1e-4));
  return L * clamp(Tv, 0.0, 1.0) + insc;
}
`;
