/**
 * EduMate — Shaders GLSL du fond « Liquid Glass » (v3.1 « fumée »).
 *
 * Philosophie visuelle de cette version : **aucune lumière flash**. Le fond
 * est une fumée sombre qui dérive lentement ; les formes en verre sont des
 * lentilles sombres qui réfractent cette fumée et se déforment / se
 * dissolvent en gouttes d'eau au survol du curseur.
 *
 * Trois familles d'effets, toutes volontairement légères :
 *
 *  1. **Fluide** — solveur de Navier-Stokes stabilisé, adapté de
 *     Pavel Dobryakov, « WebGL Fluid Simulation » (licence MIT) :
 *     https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *     C'est la même famille de solveur que celui utilisé par le projet
 *     « Endless Glass Xylophone » (Sujenphea, MIT), réécrit ici en GLSL ES 1.00
 *     pour les 'ShaderMaterial' de three.js et limité à une très basse
 *     résolution (96–128 px). Le dye n'est plus une lumière additive : c'est
 *     une *densité de fumée* qui assombrit et teinte légèrement le fond.
 *
 *  2. **Fumée** — dégradés organiques animés par bruit fbm à domaine déformé
 *     (domain warping), mélangés au fond par 'mix()' (jamais additifs) :
 *     la luminosité globale reste basse, quelle que soit l'activité.
 *
 *  3. **Verre** — lentilles Fresnel + iridescence fine + réfraction du fond,
 *     déformation « goutte d'eau » et dissolution par bruit 3D au survol.
 *
 * Tous les shaders sont en GLSL ES 1.00 : three.js les compile tels quels sur
 * son contexte WebGL2, sans conversion coûteuse.
 * NB : aucun commentaire GLSL ne contient de backtick (ce sont des templates
 * littéraux TypeScript).
 */

/* -------------------------------------------------------------------------- */
/*  Quad plein écran (passes du fluide)                                       */
/* -------------------------------------------------------------------------- */

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/*  Solveur de fluide (adapté de Pavel Dobryakov, MIT)                        */
/* -------------------------------------------------------------------------- */

export const ADVECTION_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + uDissipation * uDt;
  gl_FragColor = result / decay;
}
`;

export const SPLAT_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspectRatio;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

export const CURL_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

export const VORTICITY_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
uniform vec2 uTexelSize;
void main() {
  float L = texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * uDt;
  gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}
`;

export const DIVERGENCE_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vUv.x - uTexelSize.x < 0.0) { L = -C.x; }
  if (vUv.x + uTexelSize.x > 1.0) { R = -C.x; }
  if (vUv.y + uTexelSize.y > 1.0) { T = -C.y; }
  if (vUv.y - uTexelSize.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const PRESSURE_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float C = texture2D(uPressure, vUv).x;
  if (vUv.x - uTexelSize.x < 0.0) { L = C; }
  if (vUv.x + uTexelSize.x > 1.0) { R = C; }
  if (vUv.y + uTexelSize.y > 1.0) { T = C; }
  if (vUv.y - uTexelSize.y < 0.0) { B = C; }
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_SUBTRACT_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

export const CLEAR_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uValue;
void main() {
  gl_FragColor = uValue * texture2D(uTexture, vUv);
}
`;

/* -------------------------------------------------------------------------- */
/*  Composite : fumée + fluide + souffle curseur + vignette + grain           */
/* -------------------------------------------------------------------------- */

/**
 * Le cœur visuel du fond. Rendu dans une cible à résolution réduite
 * (0.4×–0.66× l'écran) puis agrandi en plein écran : les dégradés flous
 * encaissent parfaitement l'upscaling bilinéaire, et le coût par pixel chute
 * d'un facteur 2 à 6 — c'est ce qui rend l'effet tenable sur une machine
 * moyenne.
 *
 * ⚠️ Règle d'or v3.1 : la fumée est MÉLANGÉE (mix), jamais additionnée.
 * Ajouter de la couleur = ajouter de la lumière = flash. Mélanger garde une
 * luminance bornée par les teintes de la palette, donc un fond toujours sombre.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;

uniform sampler2D uDye;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAspect;
uniform vec2 uMouse;          /* position curseur en uv (y vers le haut)   */
uniform float uMouseGlow;     /* intensité du souffle (0..1, amortie)      */
uniform float uDyeStrength;   /* présence des traînées de fumée            */
uniform vec3 uBase0;          /* fond bas                                  */
uniform vec3 uBase1;          /* fond haut                                 */
uniform vec3 uAuroraA;
uniform vec3 uAuroraB;
uniform vec3 uAuroraC;
uniform vec3 uHaloColor;
uniform float uAuroraStrength;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 mp = uv - uMouse;
  mp.x *= uAspect;
  float mdist = length(mp);

  /* Réfraction autour du curseur : la fumée se courbe très légèrement.
     Le dye, lui, est échantillonné sur vUv non déformé : les traînées
     restent stables, seule la matière de fond ondule. */
  uv -= (mp / max(mdist, 1e-4)) * smoothstep(0.30, 0.0, mdist) * 0.011;

  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  /* Fumée : fbm à domaine déformé — des voiles lents qui dérivent. */
  float t = uTime;
  vec2 warp = vec2(
    fbm(uv * 1.9 + vec2(t * 0.030, t * 0.018)),
    fbm(uv * 1.9 + vec2(-t * 0.024, t * 0.032) + 5.2)
  );
  float f1 = fbm(uv * 2.6 + warp * 2.1 + vec2(t * 0.016, -t * 0.026));
  float f2 = fbm(uv * 1.5 - warp * 1.4 + vec2(-t * 0.021, t * 0.012) + 9.7);

  vec3 col = mix(uBase0, uBase1, smoothstep(-0.15, 1.1, uv.y + (f1 - 0.5) * 0.10));

  /* Densité de fumée : deux nappes mélangées au fond (pas additives). */
  float smokeA = smoothstep(0.40, 0.95, f1);
  float smokeB = smoothstep(0.48, 0.98, f2);
  float density = clamp(smokeA * 0.8 + smokeB * 0.55, 0.0, 1.0);
  vec3 smokeTint = mix(uAuroraA, uAuroraB, smoothstep(0.25, 0.9, f2));
  smokeTint = mix(smokeTint, uAuroraC, smoothstep(0.5, 1.0, f1 * f2 * 1.9) * 0.55);
  col = mix(col, smokeTint, density * uAuroraStrength);

  /* Traînées du fluide = fumée interactive : la densité teinte légèrement
     puis OCCLUT la lumière (multiplication), comme un vrai volume. */
  vec3 dye = texture2D(uDye, vUv).rgb;
  float dd = clamp(max(dye.r, max(dye.g, dye.b)), 0.0, 1.2);
  vec3 dyeTint = dye / max(dd, 1e-4);
  col += dyeTint * dd * uDyeStrength * 0.5;
  col *= 1.0 - 0.30 * smoothstep(0.04, 0.9, dd);

  /* Souffle du curseur : une respiration à peine visible, jamais un flash. */
  col += uHaloColor * smoothstep(0.26, 0.0, mdist) * uMouseGlow;

  /* Vignette : recentre l'attention derrière le contenu. */
  col *= 1.0 - 0.38 * smoothstep(0.32, 1.3, dot(p, p) * 0.9);

  /* Grain : casse les bandes des dégradés (banding). */
  col += (hash21(uv * uResolution + fract(t) * 91.7) - 0.5) * 0.012;

  /* Tonemap doux + gamma : jamais de blanc cramé. */
  col = max(col, 0.0) / (1.0 + max(col, 0.0) * 0.55);
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Copie plein écran (upscale de la cible composite vers l'écran). */
export const BLIT_FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

/* -------------------------------------------------------------------------- */
/*  Formes en verre : lentilles sombres, goutte d'eau au survol               */
/* -------------------------------------------------------------------------- */

/**
 * Sommet : respiration liquide permanente + interaction curseur.
 *
 * Au survol (uHover > 0), la surface réagit autour du point touché (uHit,
 * en espace local) :
 *  - renflement gaussien « goutte d'eau » qui suit le doigt ;
 *  - ondulations concentriques amorties (rides à la surface) ;
 *  - jitter haute fréquence qui prépare la dissolution du fragment.
 * La normale est perturbée analytiquement pour que le Fresnel épouse le
 * relief (aucun recalcul CPU).
 */
export const GLASS_VERT = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform float uSeed;
uniform float uHover;
uniform vec3 uHit;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vec3 p = position;
  /* Respiration : la surface ondule comme une goutte en apesanteur. */
  float w = sin(p.x * 2.2 + uTime * 0.55 + uSeed)
          * cos(p.y * 1.8 - uTime * 0.42 + uSeed * 1.7)
          * sin(p.z * 2.5 + uTime * 0.31 + uSeed * 0.6);
  float amp = uWobble * (1.0 + uHover * 1.7);
  p += normal * w * amp;

  /* Interaction curseur : goutte d'eau + rides + friabilité. */
  float hd = distance(p, uHit);
  float infl = uHover * exp(-hd * hd * 0.55);
  float ripple = sin(hd * 6.5 - uTime * 5.5);
  p += normal * infl * (0.30 + 0.20 * ripple);
  p += normal * infl * 0.10
     * sin(p.x * 12.0 + uTime * 6.0)
     * sin(p.y * 10.0 - uTime * 5.0)
     * sin(p.z * 11.0 + uTime * 4.0);

  /* Normale perturbée : le relief se lit dans le Fresnel. */
  vec3 pn = normal;
  pn += infl * 0.55 * vec3(
    sin(p.y * 8.0 + uTime * 3.4),
    sin(p.z * 8.0 - uTime * 3.0),
    sin(p.x * 8.0 + uTime * 2.6)
  );
  pn += normal * w * amp * 0.5;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vLocal = p;
  vNormal = normalize(mat3(modelMatrix) * pn);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Fragment : lentille de verre sombre.
 *  - réfraction du fond (la fumée vue À TRAVERS la forme, décalée par la
 *    normale) : c'est ce qui donne l'impression de matière ;
 *  - Fresnel + iridescence fine sur les bords, sans spéculaire blanc ;
 *  - dissolution « gouttes d'eau » au survol : un bruit 3D érode la surface
 *    en îlots arrondis, ourlés d'un liseré coloré (violet, jamais blanc).
 */
export const GLASS_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vLocal;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
uniform float uOpacity;
uniform float uIridescence;
uniform float uHover;
uniform sampler2D uBg;
uniform vec2 uScreen;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    v += a * noise3(p);
    p = p * 2.17 + 3.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float ndv = clamp(dot(n, v), 0.0, 1.0);

  /* Fresnel : les bords s'allument doucement, le centre reste matière. */
  float fresnel = pow(1.0 - ndv, 2.6);

  /* Dissolution goutte d'eau : le bruit 3D érode la surface au survol.
     Au repos (uHover = 0) : cut = 0 et bande quasi nulle -> aucune perforation. */
  float nz = fbm3(vLocal * 1.9 + vec3(0.0, -uTime * 0.22, uTime * 0.13));
  float cut = uHover * 0.52;
  float band = 0.09 * uHover + 0.002;
  float nzAdj = nz + (1.0 - ndv) * 0.18 * uHover;
  float body = smoothstep(cut - band, cut + band, nzAdj);
  float edge = (1.0 - body) * smoothstep(cut - 0.26, cut - 0.03, nzAdj) * uHover;

  /* Réfraction : la fumée derrière la lentille, décalée par la normale. */
  vec2 suv = gl_FragCoord.xy / max(uScreen, vec2(1.0));
  vec2 roff = n.xy * (0.040 + fresnel * 0.030);
  vec3 refr = texture2D(uBg, clamp(suv + roff, 0.002, 0.998)).rgb;

  /* Iridescence fine façon couche mince : la teinte glisse avec l'angle. */
  float hue = fresnel * 1.7 + uTime * 0.03 + vWorld.y * 0.04;
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + hue));

  /* Reflet large et TAMISÉ (exposant faible, intensité faible) :
     surtout pas de point spéculaire blanc flash. */
  vec3 lightDir = normalize(vec3(0.35, 0.75, 0.55));
  float sheen = pow(max(dot(reflect(-v, n), lightDir), 0.0), 7.0) * 0.20;

  vec3 tint = mix(uColorA, uColorB, fresnel);
  vec3 col = refr * (0.90 + 0.40 * fresnel)
           + tint * (0.16 + fresnel * 0.62)
           + irid * uIridescence * (0.16 + fresnel * 0.7);
  col += tint * sheen;
  col += uColorB * edge * 0.8;

  float alpha = (0.22 + fresnel * 0.60 + sheen * 0.5 + edge * 0.55) * uOpacity;
  alpha *= body;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

/* -------------------------------------------------------------------------- */
/*  Particules fines (poussière tamisée, scintillement presque imperceptible) */
/* -------------------------------------------------------------------------- */

export const PARTICLES_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uHeight;
varying float vTwinkle;
void main() {
  vec3 p = position;
  /* Dérive organique lente : chaque poussière suit sa propre sinusoïde,
     et remonte dans la dalle visible en bouclant (aucune particule perdue). */
  p.x += sin(uTime * 0.06 + aPhase * 6.283) * 1.4;
  p.y = mod(p.y + 12.0 + uTime * (0.06 + aPhase * 0.1), 24.0) - 12.0;
  p.z += sin(uTime * 0.03 + aPhase * 4.2) * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTwinkle = 0.82 + 0.18 * sin(uTime * 0.7 + aPhase * 12.566);
  /* Taille perspective bornée : jamais d'énorme halo si une poussière
     passe près de la caméra. */
  gl_PointSize = min(aSize * uPixelRatio * uHeight * 0.04 / max(-mv.z, 1.0), 10.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLES_FRAG = /* glsl */ `
precision mediump float;
varying float vTwinkle;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.06, d);
  alpha *= alpha * vTwinkle * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
