// Criaturas: modelos de cajas animados con huesos (una matriz por parte), textura por especie
// con píxeles emisivos (ojos), destello rojo al recibir daño y blanco en la mecha del creeper.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { LIGHTING } from './terrain';

export const MAX_BONES = 24;

export const MOB_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in float aBone;
uniform mat4 uModel;
uniform mat4 uBones[${MAX_BONES}];
out vec3 vRel;
out vec3 vNormal;
out vec2 vUV;
void main() {
  mat4 m = uModel * uBones[int(aBone + 0.5)];
  vec4 p = m * vec4(aPos, 1.0);
  vRel = p.xyz;
  vNormal = normalize(mat3(m) * aNormal);
  vUV = aUV;
  gl_Position = uViewProj * p;
}
`;

export const MOB_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uSkin;
uniform vec2 uLightLevel;
uniform vec3 uTint;
uniform float uFlash;
in vec3 vRel;
in vec3 vNormal;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 tex = texture(uSkin, vUV);
  if (tex.a < 0.5) discard;
  // Alfa entre 128 y 250: píxel emisivo (ojos de araña y enderman).
  bool emissive = tex.a < 0.99;
  vec3 albedo = srgbToLinear(tex.rgb);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
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
  col += specularGGX(N, V, L, 0.75, vec3(0.04)) * lightCol;
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * N.y);
  // Luz del cielo algo desaturada: las superficies blancas (lana) no deben volverse azules.
  vec3 ac = ambientCube(N);
  ac = mix(vec3(dot(ac, vec3(0.2126, 0.7152, 0.0722))), ac, 0.55);
  vec3 amb = (ac * 1.6 + bounce) * skyLightCurve(uLightLevel.x) + blockLightColor(uLightLevel.y) + vec3(0.012, 0.013, 0.016);
  col += albedo / PI * amb;
  col *= uTint;
  if (emissive) col = max(col, albedo * 2.5);
  // Destello blanco (mecha del creeper).
  col = mix(col, vec3(1.2) * (0.3 + dot(amb + lightCol, vec3(0.33))), uFlash);
  outColor = vec4(col, 1.0);
}
`;

export const MOB_SHADOW_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUV;
layout(location = 3) in float aBone;
uniform mat4 uModel;
uniform mat4 uBones[${MAX_BONES}];
out vec2 vUV;
void main() {
  vec3 rel = (uModel * uBones[int(aBone + 0.5)] * vec4(aPos, 1.0)).xyz;
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  vUV = aUV;
  gl_Position = p;
}
`;

export const MOB_SHADOW_FS = /* glsl */ `
uniform sampler2D uSkin;
in vec2 vUV;
out vec4 outColor;
void main() {
  if (texture(uSkin, vUV).a < 0.5) discard;
  outColor = vec4(1.0);
}
`;
