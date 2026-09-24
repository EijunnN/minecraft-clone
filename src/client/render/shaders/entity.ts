// Shaders de entidades: jugadores remotos, bloque en la mano, contorno de selección y partículas.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { LIGHTING, TERRAIN_VERTEX_COMMON } from './terrain';

export const ENTITY_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
uniform mat4 uModel;
out vec3 vRel;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  vRel = p.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUV = aUV;
  gl_Position = uViewProj * p;
}
`;

export const ENTITY_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uSkin;
uniform vec2 uLightLevel;
uniform vec3 uTint;
in vec3 vRel;
in vec3 vNormal;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 tex = texture(uSkin, vUV);
  if (tex.a < 0.5) discard;
  vec3 albedo = srgbToLinear(tex.rgb) * uTint;
  vec3 N = normalize(vNormal);
  vec3 L = uLightDir.xyz;
  float NdotL = saturate(dot(N, L));
  float shadow = 0.0;
  if (NdotL > 0.0) {
    vec4 sc = shadowCoord(vRel, N);
    shadow = sampleShadow(sc, gl_FragCoord.xy, 1.5);
  }
  vec3 V = normalize(-vRel);
  vec3 lightCol = uLightColor.rgb * shadow * cloudShadow(vRel + uCamPos.xyz);
  vec3 col = albedo / PI * NdotL * lightCol;
  col += specularGGX(N, V, L, 0.7, vec3(0.04)) * lightCol;
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * N.y);
  vec3 amb = (ambientCube(N) * 1.6 + bounce) * skyLightCurve(uLightLevel.x) + blockLightColor(uLightLevel.y) + vec3(0.012, 0.013, 0.016);
  col += albedo / PI * amb;
  outColor = vec4(col, 1.0);
}
`;

export const ENTITY_SHADOW_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUV;
uniform mat4 uModel;
out vec2 vUV;
void main() {
  vec3 rel = (uModel * vec4(aPos, 1.0)).xyz;
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  vUV = aUV;
  gl_Position = p;
}
`;

export const ENTITY_SHADOW_FS = /* glsl */ `
uniform sampler2D uSkin;
in vec2 vUV;
out vec4 outColor;
void main() {
  if (texture(uSkin, vUV).a < 0.5) discard;
  outColor = vec4(1.0);
}
`;

// ------------------------------------------------------------------ contorno de selección

export const OUTLINE_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
uniform vec3 uOffset;
uniform vec3 uScale;
void main() {
  gl_Position = uViewProj * vec4(uOffset + aPos * uScale, 1.0);
  gl_Position.z -= 0.0004 * gl_Position.w;
}
`;

export const OUTLINE_FS = /* glsl */ `
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }
`;

// ------------------------------------------------------------------ partículas

export const PARTICLE_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec4 aPosSize;   // xyz relativo a cámara, w = tamaño
layout(location = 1) in vec4 aTex;       // x = capa, yz = desplazamiento UV, w = luz empaquetada
out vec2 vUV;
flat out float vLayer;
out vec2 vLight;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 p = aPosSize.xyz + (right * (corner.x - 0.5) + up * (corner.y - 0.5)) * aPosSize.w;
  vUV = aTex.yz + vec2(corner.x, 1.0 - corner.y) * 0.25;
  vLayer = aTex.x;
  float lp = aTex.w;
  vLight = vec2(floor(lp / 16.0), mod(lp, 16.0)) / 15.0;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const PARTICLE_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
uniform highp sampler2DArray uAlbedo;
uniform sampler2D uIrradiance;
in vec2 vUV;
flat in float vLayer;
in vec2 vLight;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 up = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb;
  if (vLayer < -0.5) {
    // Humo: disco gris suave (capa negativa = -1 - gris).
    vec2 q = vUV * 4.0 - 0.5;
    if (dot(q, q) > 0.25) discard;
    float g = -vLayer - 1.0;
    // > 0.96: llama naranja; > 0.9: chispa; resto: humo gris.
    vec3 base = g > 0.96 ? vec3(1.0, 0.45, 0.1) * 5.0 : g > 0.9 ? vec3(1.0, 0.95, 0.7) * 3.0 : vec3(g * g);
    vec3 lt = up * vLight.x * vLight.x + blockLightColor(vLight.y) + uLightColor.rgb * 0.4 * smoothstep(0.6, 1.0, vLight.x) + 0.03;
    outColor = vec4(g > 0.9 ? base : base / PI * lt, 1.0);
    return;
  }
  vec4 alb = texture(uAlbedo, vec3(vUV, vLayer));
  if (alb.a < 0.5) discard;
  vec3 light = up * vLight.x * vLight.x + blockLightColor(vLight.y) + uLightColor.rgb * 0.5 * smoothstep(0.6, 1.0, vLight.x) + 0.015;
  outColor = vec4(alb.rgb / PI * light, 1.0);
}
`;
