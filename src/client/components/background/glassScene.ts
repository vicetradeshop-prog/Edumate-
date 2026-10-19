/**
 * EduMate — Scène « Liquid Glass » (fond 3D vivant).
 *
 * ⚠️ Ce module est chargé PARESSEUSEMENT (dynamic import) par
 * `LiquidGlassBackground` : three.js n'est jamais téléchargé ni exécuté tant
 * que le fond n'est pas réellement utilisable (WebGL2 disponible, animations
 * autorisées). Le chargement initial de l'application n'est donc pas alourdi.
 *
 * Architecture du rendu (une seule passe par frame, tout en GPU) :
 *
 *   1. **Fluide** (optionnel) — solveur basse résolution (96–128 px) adapté de
 *      Pavel Dobryakov, « WebGL Fluid Simulation » (licence MIT) :
 *      https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *      Le curseur y injecte des « splats » de lumière violet/rose/bleu ; des
 *      splats ambiants très doux prennent le relais quand l'élève ne bouge
 *      plus la souris, pour garder le fond vivant.
 *   2. **Composite** — aurora (fbm à domaine déformé) + dye du fluide + halo
 *      du curseur + vignette + grain, rendu dans une cible à résolution
 *      réduite puis agrandi : les dégradés supportent parfaitement
 *      l'upscaling, et le coût par pixel est divisé par 2 à 6.
 *   3. **Verre 3D** — formes flottantes (Fresnel + iridescence + déformation
 *      liquide) et poussières lumineuses, rendues par-dessus.
 *
 * Garde-fous de performance (exigence absolue du projet) :
 *   - gouverneur de FPS : baisse de résolution progressive, puis repli CSS ;
 *   - pause totale quand l'onglet est masqué ;
 *   - cadence réduite (30 i/s) quand l'élève est inactif depuis 8 s ;
 *   - aucun objet alloué dans la boucle de rendu (tout est pré-alloué) ;
 *   - `dispose()` complet : géométries, matériaux, cibles, contexte WebGL.
 */
import * as THREE from 'three';
import { FpsGovernor, clampFx, dampFx, getFxTier, type FxTier } from '../../lib/fx.js';
import {
  ADVECTION_FRAG,
  BLIT_FRAG,
  CLEAR_FRAG,
  COMPOSITE_FRAG,
  CURL_FRAG,
  DIVERGENCE_FRAG,
  FULLSCREEN_VERT,
  GLASS_FRAG,
  GLASS_VERT,
  GRADIENT_SUBTRACT_FRAG,
  PARTICLES_FRAG,
  PARTICLES_VERT,
  PRESSURE_FRAG,
  SPLAT_FRAG,
  VORTICITY_FRAG,
} from './shaders.js';

/* Les couleurs des shaders sont authorées « telles quelles » (hex = valeur
   envoyée au GPU) : pas de conversion colorimétrique automatique. */
THREE.ColorManagement.enabled = false;

/* -------------------------------------------------------------------------- */
/*  Palettes                                                                  */
/* -------------------------------------------------------------------------- */

type Vec3 = [number, number, number];

/** Convertit un hexadécimal `#rrggbb` en triplet 0..1. */
function hex(color: string): Vec3 {
  const value = parseInt(color.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

interface Palette {
  base0: Vec3;
  base1: Vec3;
  auroraA: Vec3;
  auroraB: Vec3;
  auroraC: Vec3;
  halo: Vec3;
  auroraStrength: number;
  dyeStrength: number;
  mouseGlowActive: number;
  mouseGlowIdle: number;
  glassA: Vec3;
  glassB: Vec3;
  glassOpacity: number;
  glassIridescence: number;
  glassAdditive: boolean;
  particleColor: Vec3;
  particleOpacity: number;
  particleAdditive: boolean;
  /** Couleurs injectées dans le fluide (traînées lumineuses). */
  dye: Vec3[];
}

const DARK_PALETTE: Palette = {
  base0: hex('#05030f'),
  base1: hex('#140b2e'),
  auroraA: hex('#5b21b6'),
  auroraB: hex('#86198f'),
  auroraC: hex('#1e40af'),
  halo: hex('#6d5bd0'),
  auroraStrength: 0.42,
  dyeStrength: 0.34,
  mouseGlowActive: 0.1,
  mouseGlowIdle: 0.035,
  glassA: hex('#7c5ce0'),
  glassB: hex('#c65bb8'),
  glassOpacity: 0.72,
  glassIridescence: 0.16,
  glassAdditive: false,
  particleColor: hex('#9d8fe0'),
  particleOpacity: 0.2,
  particleAdditive: true,
  dye: [
    [0.2, 0.1, 0.55],
    [0.55, 0.1, 0.38],
    [0.42, 0.16, 0.45],
    [0.12, 0.2, 0.6],
  ],
};

const LIGHT_PALETTE: Palette = {
  base0: hex('#ece5ff'),
  base1: hex('#fdf3ff'),
  auroraA: hex('#c4b5fd'),
  auroraB: hex('#f5d0fe'),
  auroraC: hex('#bfdbfe'),
  halo: hex('#8b5cf6'),
  auroraStrength: 0.4,
  dyeStrength: 0.22,
  mouseGlowActive: 0.08,
  mouseGlowIdle: 0.03,
  glassA: hex('#6d28d9'),
  glassB: hex('#db2777'),
  glassOpacity: 0.34,
  glassIridescence: 0.12,
  glassAdditive: false,
  particleColor: hex('#5b21b6'),
  particleOpacity: 0.12,
  particleAdditive: false,
  dye: [
    [0.3, 0.16, 0.75],
    [0.7, 0.16, 0.5],
    [0.6, 0.3, 0.62],
    [0.2, 0.3, 0.72],
  ],
};

/* -------------------------------------------------------------------------- */
/*  Réglages par palier de qualité                                            */
/* -------------------------------------------------------------------------- */

interface QualityConfig {
  pixelRatioCap: number;
  bgScale: number;
  simRes: number;
  dyeRes: number;
  pressureIterations: number;
  particleCount: number;
  shapeCount: number;
  fluidEnabled: boolean;
}

const QUALITY: Record<FxTier, QualityConfig> = {
  high: {
    pixelRatioCap: 1.5,
    bgScale: 0.66,
    simRes: 128,
    dyeRes: 512,
    pressureIterations: 12,
    particleCount: 620,
    shapeCount: 7,
    fluidEnabled: true,
  },
  medium: {
    pixelRatioCap: 1.25,
    bgScale: 0.5,
    simRes: 112,
    dyeRes: 320,
    pressureIterations: 10,
    particleCount: 380,
    shapeCount: 5,
    fluidEnabled: true,
  },
  low: {
    pixelRatioCap: 1,
    bgScale: 0.4,
    simRes: 0,
    dyeRes: 0,
    pressureIterations: 0,
    particleCount: 160,
    shapeCount: 3,
    fluidEnabled: false,
  },
};

/* -------------------------------------------------------------------------- */
/*  Types publics                                                             */
/* -------------------------------------------------------------------------- */

export interface LiquidGlassSceneOptions {
  /** Repli (CSS) demandé par la scène : machine trop lente, contexte perdu… */
  onFallback?: () => void;
  /** Première image rendue : le wrapper peut fondre le canvas. */
  onFirstFrame?: () => void;
  tier?: FxTier;
}

export interface LiquidGlassScene {
  setTheme(dark: boolean): void;
  dispose(): void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers internes                                                          */
/* -------------------------------------------------------------------------- */

interface DoubleFbo {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap: () => void;
  /** Libère les deux cibles (le wrapper est suivi par `track()`). */
  dispose: () => void;
}

function createFbo(width: number, height: number, options: { half: boolean; linear: boolean }): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
    type: options.half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: options.linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: options.linear ? THREE.LinearFilter : THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function createDoubleFbo(width: number, height: number, options: { half: boolean; linear: boolean }): DoubleFbo {
  const state = {
    read: createFbo(width, height, options),
    write: createFbo(width, height, options),
    swap(): void {
      const previous = state.read;
      state.read = state.write;
      state.write = previous;
    },
    dispose(): void {
      state.read.dispose();
      state.write.dispose();
    },
  };
  return state;
}

/** Résolution respectueuse du ratio d'aspect (même approche que Dobryakov). */
function resolutionFor(base: number, bufferWidth: number, bufferHeight: number): { width: number; height: number } {
  let aspect = bufferWidth / Math.max(1, bufferHeight);
  if (aspect < 1) aspect = 1 / aspect;
  const min = Math.round(base);
  const max = Math.round(base * aspect);
  return bufferWidth > bufferHeight ? { width: max, height: min } : { width: min, height: max };
}

/** Corrections d'aspect du solveur (formules de Dobryakov). */
function correctDeltaX(delta: number, aspect: number): number {
  return aspect < 1 ? delta * aspect : delta;
}
function correctDeltaY(delta: number, aspect: number): number {
  return aspect > 1 ? delta / aspect : delta;
}
function correctRadius(radius: number, aspect: number): number {
  return aspect > 1 ? radius * aspect : radius;
}

/* -------------------------------------------------------------------------- */
/*  Scène                                                                     */
/* -------------------------------------------------------------------------- */

/** Positions/échelles des formes en verre (7 max ; tronquées selon le palier).
 *  Détail géométrique relevé (v3.1) : des surfaces lisses, sans facettes
 *  visibles, pour que la réfraction et le Fresnel glissent proprement. */
const SHAPE_DEFS: Array<{
  kind: 'icosa' | 'sphere' | 'torus' | 'octa';
  scale: number;
  detail: number;
  pos: Vec3;
  tint: 0 | 1 | 2;
  wobble: number;
  spin: Vec3;
}> = [
  { kind: 'icosa', scale: 2.0, detail: 4, pos: [-8.6, 3.1, -6], tint: 0, wobble: 0.1, spin: [0.05, 0.08, 0.02] },
  { kind: 'sphere', scale: 1.35, detail: 40, pos: [7.9, -3.3, -9], tint: 1, wobble: 0.13, spin: [0.04, 0.06, 0.03] },
  { kind: 'torus', scale: 1.7, detail: 44, pos: [5.4, 4.4, -12], tint: 2, wobble: 0.05, spin: [0.07, 0.05, 0.04] },
  { kind: 'octa', scale: 1.5, detail: 3, pos: [-6.4, -4.3, -14], tint: 1, wobble: 0.08, spin: [0.06, 0.09, 0.05] },
  { kind: 'icosa', scale: 1.05, detail: 3, pos: [10.6, 1.4, -16], tint: 0, wobble: 0.12, spin: [0.08, 0.04, 0.06] },
  { kind: 'sphere', scale: 2.3, detail: 44, pos: [-11.8, -1.2, -18], tint: 2, wobble: 0.15, spin: [0.03, 0.05, 0.02] },
  { kind: 'icosa', scale: 0.85, detail: 3, pos: [1.6, 5.7, -8], tint: 1, wobble: 0.09, spin: [0.09, 0.07, 0.05] },
];

const TINTS: Array<[Vec3, Vec3]> = [
  [hex('#6d47d9'), hex('#c65bb8')], // violet profond → orchidée
  [hex('#a832c9'), hex('#4f46c9')], // magenta sombre → indigo
  [hex('#3f7fd9'), hex('#9a6ce0')], // bleu nuit → lavande
];

/** Secondes d'activité curseur pendant lesquelles les traînées sont injectées. */
const POINTER_ACTIVE_WINDOW = 2.5;
/** Après cette durée sans aucune interaction : cadence réduite (30 i/s). */
const IDLE_THROTTLE_AFTER = 8;

export function createLiquidGlassScene(canvas: HTMLCanvasElement, options: LiquidGlassSceneOptions = {}): LiquidGlassScene | null {
  const tier = options.tier ?? getFxTier();
  const quality = { ...QUALITY[tier] };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);

  const disposables: Array<{ dispose: () => void }> = [renderer];
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };

  let width = Math.max(1, window.innerWidth || 1);
  let height = Math.max(1, window.innerHeight || 1);
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);

  const darkAtStart = typeof document !== 'undefined' ? document.documentElement.dataset.theme !== 'clair' : true;
  let palette = darkAtStart ? DARK_PALETTE : LIGHT_PALETTE;
  let targetPalette = palette;
  let blendFrom: Palette = palette;
  let themeBlend = 1; // 1 = palette cible atteinte

  /* ---------------------------------- Scènes -------------------------------- */

  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mainScene = new THREE.Scene();
  const mainCamera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
  mainCamera.position.set(0, 0, 14);

  const quadGeometry = track(new THREE.PlaneGeometry(2, 2));
  const blitScene = new THREE.Scene();
  const blitCamera = new THREE.Camera();
  const blitMesh = new THREE.Mesh(quadGeometry);
  blitMesh.frustumCulled = false;
  blitScene.add(blitMesh);

  const passMaterial = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
    track(
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );

  /* --------------------------------- Fluide --------------------------------- */

  const supportsHalfFloatRender = renderer.extensions.has('EXT_color_buffer_float');
  const fluidActive = quality.fluidEnabled && supportsHalfFloatRender;

  const dummyDye = track(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
  dummyDye.needsUpdate = true;

  interface FluidMaterials {
    advectVelocity: THREE.ShaderMaterial;
    advectDye: THREE.ShaderMaterial;
    splat: THREE.ShaderMaterial;
    curl: THREE.ShaderMaterial;
    vorticity: THREE.ShaderMaterial;
    divergence: THREE.ShaderMaterial;
    pressure: THREE.ShaderMaterial;
    gradientSubtract: THREE.ShaderMaterial;
    clear: THREE.ShaderMaterial;
  }

  interface FluidTargets {
    velocity: DoubleFbo;
    dye: DoubleFbo;
    pressure: DoubleFbo;
    divergence: THREE.WebGLRenderTarget;
    curl: THREE.WebGLRenderTarget;
  }

  /* Les matériaux du solveur sont créés UNE fois ; seules les cibles (FBO)
     sont recrées quand le ratio d'aspect change (redimension, rotation). */
  const simTexel = new THREE.Vector2(1 / 128, 1 / 128);
  const dyeTexel = new THREE.Vector2(1 / 512, 1 / 512);

  const advectUniforms = (texel: THREE.Vector2, dissipation: number): Record<string, THREE.IUniform> => ({
    uVelocity: { value: null },
    uSource: { value: null },
    uTexelSize: { value: texel },
    uDt: { value: 1 / 60 },
    uDissipation: { value: dissipation },
  });

  const fluidMaterials: FluidMaterials | null = fluidActive
    ? {
        advectVelocity: passMaterial(ADVECTION_FRAG, advectUniforms(simTexel, 0.24)),
        advectDye: passMaterial(ADVECTION_FRAG, advectUniforms(dyeTexel, 0.5)),
        splat: passMaterial(SPLAT_FRAG, {
          uTarget: { value: null },
          uAspectRatio: { value: 1 },
          uColor: { value: new THREE.Vector3() },
          uPoint: { value: new THREE.Vector2() },
          uRadius: { value: 0.0025 },
        }),
        curl: passMaterial(CURL_FRAG, {
          uVelocity: { value: null },
          uTexelSize: { value: simTexel },
        }),
        vorticity: passMaterial(VORTICITY_FRAG, {
          uVelocity: { value: null },
          uCurl: { value: null },
          uCurlStrength: { value: 22 },
          uDt: { value: 1 / 60 },
          uTexelSize: { value: simTexel },
        }),
        divergence: passMaterial(DIVERGENCE_FRAG, {
          uVelocity: { value: null },
          uTexelSize: { value: simTexel },
        }),
        pressure: passMaterial(PRESSURE_FRAG, {
          uPressure: { value: null },
          uDivergence: { value: null },
          uTexelSize: { value: simTexel },
        }),
        gradientSubtract: passMaterial(GRADIENT_SUBTRACT_FRAG, {
          uPressure: { value: null },
          uVelocity: { value: null },
          uTexelSize: { value: simTexel },
        }),
        clear: passMaterial(CLEAR_FRAG, {
          uTexture: { value: null },
          uValue: { value: 0.8 },
        }),
      }
    : null;

  let fluidTargets: FluidTargets | null = null;

  function createFluidTargets(): FluidTargets | null {
    if (!fluidActive) return null;
    const bufferWidth = Math.max(2, Math.round(width * pixelRatio));
    const bufferHeight = Math.max(2, Math.round(height * pixelRatio));
    const sim = resolutionFor(quality.simRes, bufferWidth, bufferHeight);
    const dye = resolutionFor(quality.dyeRes, bufferWidth, bufferHeight);
    simTexel.set(1 / sim.width, 1 / sim.height);
    dyeTexel.set(1 / dye.width, 1 / dye.height);
    const half = { half: true, linear: true };
    const nearest = { half: true, linear: false };
    return {
      velocity: track(createDoubleFbo(sim.width, sim.height, half)),
      dye: track(createDoubleFbo(dye.width, dye.height, half)),
      pressure: track(createDoubleFbo(sim.width, sim.height, nearest)),
      divergence: track(createFbo(sim.width, sim.height, nearest)),
      curl: track(createFbo(sim.width, sim.height, nearest)),
    };
  }

  function disposeFluidTargets(): void {
    if (!fluidTargets) return;
    /* Ce sont les WRAPPERS (DoubleFbo) et les cibles simples qui ont été
       enregistrés dans `disposables` par `track()` — on les retire avant de
       les libérer pour que le `dispose()` final ne repasse pas dessus. */
    const untrack = (resource: { dispose: () => void }): void => {
      const index = disposables.indexOf(resource);
      if (index >= 0) disposables.splice(index, 1);
      resource.dispose();
    };
    untrack(fluidTargets.velocity);
    untrack(fluidTargets.dye);
    untrack(fluidTargets.pressure);
    untrack(fluidTargets.divergence);
    untrack(fluidTargets.curl);
    fluidTargets = null;
  }

  fluidTargets = createFluidTargets();

  const blitMaterial = passMaterial(BLIT_FRAG, { uTexture: { value: null } });

  /* ------------------------------- Composite -------------------------------- */

  const compositeUniforms: Record<string, THREE.IUniform> = {
    uDye: { value: fluidTargets ? fluidTargets.dye.read.texture : dummyDye },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
    uAspect: { value: width / height },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uMouseGlow: { value: 0 },
    uDyeStrength: { value: palette.dyeStrength },
    uBase0: { value: new THREE.Vector3(...palette.base0) },
    uBase1: { value: new THREE.Vector3(...palette.base1) },
    uAuroraA: { value: new THREE.Vector3(...palette.auroraA) },
    uAuroraB: { value: new THREE.Vector3(...palette.auroraB) },
    uAuroraC: { value: new THREE.Vector3(...palette.auroraC) },
    uHaloColor: { value: new THREE.Vector3(...palette.halo) },
    uAuroraStrength: { value: palette.auroraStrength },
  };
  const compositeMaterial = passMaterial(COMPOSITE_FRAG, compositeUniforms);
  const compositeMesh = new THREE.Mesh(quadGeometry, compositeMaterial);
  compositeMesh.frustumCulled = false;
  bgScene.add(compositeMesh);

  let bgTarget = track(
    createFbo(Math.max(2, Math.round(width * quality.bgScale)), Math.max(2, Math.round(height * quality.bgScale)), {
      half: false,
      linear: true,
    }),
  );

  /* --------------------------------- Verres --------------------------------- */

  const shapeGroup = new THREE.Group();
  mainScene.add(shapeGroup);

  const shapeGeometry = (def: (typeof SHAPE_DEFS)[number]): THREE.BufferGeometry => {
    switch (def.kind) {
      case 'sphere':
        return new THREE.SphereGeometry(def.scale, def.detail + 8, def.detail);
      case 'torus':
        return new THREE.TorusGeometry(def.scale, def.scale * 0.26, 22, def.detail + 32);
      case 'octa':
        return new THREE.OctahedronGeometry(def.scale, def.detail);
      case 'icosa':
      default:
        return new THREE.IcosahedronGeometry(def.scale, def.detail);
    }
  };

  interface FloatingShape {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    base: THREE.Vector3;
    seed: number;
    driftSpeed: number;
    driftAmplitude: number;
    spin: Vec3;
    /** Intensité de survol amortie (0 = au repos, 1 = curseur sur la forme). */
    hover: number;
  }

  /* Taille du tampon de rendu (pixels) : réfraction en espace écran. */
  const screenBuffer = new THREE.Vector2(
    Math.max(2, Math.round(width * pixelRatio)),
    Math.max(2, Math.round(height * pixelRatio)),
  );

  const shapes: FloatingShape[] = [];
  for (let index = 0; index < quality.shapeCount && index < SHAPE_DEFS.length; index += 1) {
    const def = SHAPE_DEFS[index];
    const geometry = track(shapeGeometry(def));
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uWobble: { value: def.wobble },
          uSeed: { value: index * 2.399 },
          uColorA: { value: new THREE.Vector3(...TINTS[def.tint][0]) },
          uColorB: { value: new THREE.Vector3(...TINTS[def.tint][1]) },
          uOpacity: { value: palette.glassOpacity },
          uIridescence: { value: palette.glassIridescence },
          uHover: { value: 0 },
          uHit: { value: new THREE.Vector3(0, 0, 0) },
          uBg: { value: bgTarget.texture },
          uScreen: { value: screenBuffer },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: palette.glassAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    mesh.rotation.set(index * 0.7, index * 1.3, index * 0.4);
    /* Verre non additif = mélange alpha : l'ordre de peinture compte.
       Tri du plus lointain au plus proche (z croissant vers la caméra). */
    mesh.renderOrder = 100 + def.pos[2];
    shapeGroup.add(mesh);
    shapes.push({
      mesh,
      material,
      base: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
      seed: index * 1.771,
      driftSpeed: 0.09 + (index % 3) * 0.035,
      driftAmplitude: 0.55 + (index % 4) * 0.22,
      spin: def.spin,
      hover: 0,
    });
  }

  /* ------------------------------- Particules -------------------------------- */

  const particleGeometry = track(new THREE.BufferGeometry());
  {
    const count = quality.particleCount;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const spreadX = Math.max(14, (width / height) * 13);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() * 2 - 1) * spreadX;
      positions[index * 3 + 1] = (Math.random() * 2 - 1) * 12;
      positions[index * 3 + 2] = -3 - Math.random() * 15;
      sizes[index] = 0.5 + Math.random() * 1.7;
      phases[index] = Math.random();
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    particleGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  }
  const particleMaterial = track(
    new THREE.ShaderMaterial({
      vertexShader: PARTICLES_VERT,
      fragmentShader: PARTICLES_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uHeight: { value: height },
        uColor: { value: new THREE.Vector3(...palette.particleColor) },
        uOpacity: { value: palette.particleOpacity },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: palette.particleAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  mainScene.add(particles);

  /* -------------------------------- Entrées --------------------------------- */

  const pointer = {
    x: 0.5,
    y: 0.5,
    prevX: 0.5,
    prevY: 0.5,
    hasDelta: false,
    dx: 0,
    dy: 0,
    lastActiveAt: -1e9,
    impulse: 0,
  };

  let lastInteractionAt = 0; // curseur, clavier, tactile OU défilement
  let clock = 0;
  let scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;

  const onPointerMove = (event: PointerEvent): void => {
    const x = clampFx(event.clientX / Math.max(1, window.innerWidth), 0, 1);
    const y = clampFx(1 - event.clientY / Math.max(1, window.innerHeight), 0, 1);
    pointer.dx = x - pointer.x;
    pointer.dy = y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.hasDelta = true;
    const now = event.timeStamp / 1000;
    pointer.lastActiveAt = now;
    lastInteractionAt = clock;
  };
  const onPointerDown = (): void => {
    pointer.impulse = Math.min(0.45, pointer.impulse + 0.22);
    lastInteractionAt = clock;
  };
  const onScroll = (): void => {
    scrollY = window.scrollY || 0;
    lastInteractionAt = clock;
  };
  const onKeyDown = (): void => {
    lastInteractionAt = clock;
  };
  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.hidden) stopLoop();
    else startLoop();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    dispose();
    options.onFallback?.();
  };

  let resizeTimer = 0;
  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyResize, 150);
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);

  /* -------------------------------- Redimension ------------------------------ */

  function applyResize(): void {
    if (disposed) return;
    const nextWidth = Math.max(1, window.innerWidth || 1);
    const nextHeight = Math.max(1, window.innerHeight || 1);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    mainCamera.aspect = width / height;
    mainCamera.updateProjectionMatrix();

    bgTarget.setSize(Math.max(2, Math.round(width * quality.bgScale)), Math.max(2, Math.round(height * quality.bgScale)));
    screenBuffer.set(Math.max(2, Math.round(width * pixelRatio)), Math.max(2, Math.round(height * pixelRatio)));
    (compositeUniforms.uResolution.value as THREE.Vector2).set(width, height);
    compositeUniforms.uAspect.value = width / height;
    particleMaterial.uniforms.uHeight.value = height;
    particleMaterial.uniforms.uPixelRatio.value = pixelRatio;

    // Le fluide est sensible au ratio d'aspect : on repart de cibles propres
    // (les matériaux du solveur, eux, sont réutilisés).
    if (fluidActive) {
      disposeFluidTargets();
      fluidTargets = createFluidTargets();
      compositeUniforms.uDye.value = fluidTargets ? fluidTargets.dye.read.texture : dummyDye;
    }
  }

  /* ---------------------------------- Splat ---------------------------------- */

  const splatPoint = new THREE.Vector2();
  const splatColor = new THREE.Vector3();

  function splat(target: DoubleFbo, radiusUv: number): void {
    if (!fluidMaterials) return;
    const material = fluidMaterials.splat;
    material.uniforms.uTarget.value = target.read.texture;
    (material.uniforms.uPoint.value as THREE.Vector2).copy(splatPoint);
    (material.uniforms.uColor.value as THREE.Vector3).copy(splatColor);
    material.uniforms.uRadius.value = radiusUv;
    blit(material, target.write);
    target.swap();
  }

  function splatPair(x: number, y: number, forceX: number, forceY: number, dyeColor: Vec3, dyeAmount: number, radiusPercent: number): void {
    if (!fluidMaterials || !fluidTargets) return;
    const aspect = width / height;
    const radius = correctRadius(radiusPercent / 100, aspect);
    splatPoint.set(x, y);
    fluidMaterials.splat.uniforms.uAspectRatio.value = aspect;

    splatColor.set(correctDeltaX(forceX, aspect), correctDeltaY(forceY, aspect), 0);
    splat(fluidTargets.velocity, radius);

    splatColor.set(dyeColor[0] * dyeAmount, dyeColor[1] * dyeAmount, dyeColor[2] * dyeAmount);
    splat(fluidTargets.dye, radius);
  }

  let dyeColorIndex = 0;
  function nextDyeColor(): Vec3 {
    const colors = palette.dye;
    dyeColorIndex = (dyeColorIndex + 1) % colors.length;
    return colors[dyeColorIndex];
  }

  let ambientTimer = 2.2;

  function injectAmbientSplat(): void {
    if (!fluidTargets) return;
    const angle = clock * 0.11 + dyeColorIndex * 2.1;
    const x = 0.5 + Math.sin(angle) * 0.3;
    const y = 0.5 + Math.cos(angle * 0.83 + 1.7) * 0.28;
    const tangentX = Math.cos(angle) * 9;
    const tangentY = -Math.sin(angle * 0.83 + 1.7) * 8;
    splatPair(x, y, tangentX, tangentY, nextDyeColor(), 0.2, 4.2);
  }

  /* ---------------------------------- Boucle --------------------------------- */

  function blit(material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    blitMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(blitScene, blitCamera);
  }

  function stepFluid(dt: number): void {
    if (!fluidMaterials || !fluidTargets) return;
    const materials = fluidMaterials;

    materials.curl.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    blit(materials.curl, fluidTargets.curl);

    materials.vorticity.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    materials.vorticity.uniforms.uCurl.value = fluidTargets.curl.texture;
    materials.vorticity.uniforms.uDt.value = dt;
    blit(materials.vorticity, fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    materials.divergence.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    blit(materials.divergence, fluidTargets.divergence);

    materials.clear.uniforms.uTexture.value = fluidTargets.pressure.read.texture;
    blit(materials.clear, fluidTargets.pressure.write);
    fluidTargets.pressure.swap();

    materials.pressure.uniforms.uDivergence.value = fluidTargets.divergence.texture;
    for (let iteration = 0; iteration < quality.pressureIterations; iteration += 1) {
      materials.pressure.uniforms.uPressure.value = fluidTargets.pressure.read.texture;
      blit(materials.pressure, fluidTargets.pressure.write);
      fluidTargets.pressure.swap();
    }

    materials.gradientSubtract.uniforms.uPressure.value = fluidTargets.pressure.read.texture;
    materials.gradientSubtract.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    blit(materials.gradientSubtract, fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    materials.advectVelocity.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    materials.advectVelocity.uniforms.uSource.value = fluidTargets.velocity.read.texture;
    materials.advectVelocity.uniforms.uDt.value = dt;
    blit(materials.advectVelocity, fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    materials.advectDye.uniforms.uVelocity.value = fluidTargets.velocity.read.texture;
    materials.advectDye.uniforms.uSource.value = fluidTargets.dye.read.texture;
    materials.advectDye.uniforms.uDt.value = dt;
    blit(materials.advectDye, fluidTargets.dye.write);
    fluidTargets.dye.swap();

    // Le composite échantillonne toujours la dernière image du dye.
    compositeUniforms.uDye.value = fluidTargets.dye.read.texture;
  }

  let rafId = 0;
  let running = false;
  let disposed = false;
  let lastFrameAt = 0;
  let firstFrameDone = false;
  let frameParity = 0;

  const governor = new FpsGovernor({
    softFloor: 42,
    hardFloor: 26,
    onSoft: () => {
      // Palier 1 : on baisse la résolution avant de toucher aux effets.
      pixelRatio = Math.max(0.6, pixelRatio * 0.72);
      quality.bgScale = Math.max(0.34, quality.bgScale * 0.8);
      particleGeometry.setDrawRange(0, Math.max(60, Math.floor(quality.particleCount * 0.5)));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      bgTarget.setSize(Math.max(2, Math.round(width * quality.bgScale)), Math.max(2, Math.round(height * quality.bgScale)));
      screenBuffer.set(Math.max(2, Math.round(width * pixelRatio)), Math.max(2, Math.round(height * pixelRatio)));
      particleMaterial.uniforms.uPixelRatio.value = pixelRatio;
    },
    onHard: () => {
      // Palier 2 : la machine ne suit pas → repli sur le dégradé CSS.
      dispose();
      options.onFallback?.();
    },
  });

  const pointerUv = new THREE.Vector2(0.5, 0.5);

  /* ------------------------- Survol des formes --------------------------- */
  /*
   * Raycast économique : une sphère englobante par forme (pas de raycast de
   * géométrie). La forme touchée reçoit uHover -> 1 (amorti) et le point de
   * contact en espace LOCAL : la déformation « goutte d'eau » reste collée à
   * la surface même pendant que la forme tourne.
   */
  const hoverRaycaster = new THREE.Raycaster();
  const hoverNdc = new THREE.Vector2();
  const hoverSphere = new THREE.Sphere();
  const hoverPoint = new THREE.Vector3();

  function updateShapeHover(dt: number): void {
    hoverNdc.set(pointer.x * 2 - 1, pointer.y * 2 - 1);
    mainCamera.updateMatrixWorld();
    hoverRaycaster.setFromCamera(hoverNdc, mainCamera);
    let best: FloatingShape | null = null;
    let bestDist = Infinity;
    for (const shape of shapes) {
      const geometry = shape.mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) continue;
      hoverSphere.copy(geometry.boundingSphere).applyMatrix4(shape.mesh.matrixWorld);
      // La surface réelle respire autour de la sphère : zone de contact élargie.
      hoverSphere.radius *= 1.18;
      if (hoverRaycaster.ray.intersectSphere(hoverSphere, hoverPoint)) {
        const dist = hoverRaycaster.ray.origin.distanceToSquared(hoverPoint);
        if (dist < bestDist) {
          bestDist = dist;
          best = shape;
        }
      }
    }
    for (const shape of shapes) {
      const target = shape === best ? 1 : 0;
      shape.hover = dampFx(shape.hover, target, 5.5, dt);
      if (target === 0 && shape.hover < 0.0015) shape.hover = 0;
      shape.material.uniforms.uHover.value = shape.hover;
    }
    if (best) {
      const geometry = best.mesh.geometry;
      if (geometry.boundingSphere) {
        hoverSphere.copy(geometry.boundingSphere).applyMatrix4(best.mesh.matrixWorld);
        hoverSphere.radius *= 1.18;
        if (hoverRaycaster.ray.intersectSphere(hoverSphere, hoverPoint)) {
          best.mesh.worldToLocal(hoverPoint);
          (best.material.uniforms.uHit.value as THREE.Vector3).copy(hoverPoint);
        }
      }
    }
  }

  function tick(now: number): void {
    if (disposed) return;
    rafId = window.requestAnimationFrame(tick);
    governor.tick(now);

    const dt = clampFx((now - lastFrameAt) / 1000, 1 / 240, 1 / 20);
    lastFrameAt = now;

    // Cadence réduite quand l'élève est inactif depuis un moment.
    const idleFor = clock - lastInteractionAt;
    frameParity = (frameParity + 1) % 2;
    if (firstFrameDone && idleFor > IDLE_THROTTLE_AFTER && frameParity === 1) return;

    clock += dt;

    /* --- Pointeur : traînées de fluide + halo --- */
    const pointerActive = now / 1000 - pointer.lastActiveAt < POINTER_ACTIVE_WINDOW;
    if (fluidTargets && pointer.hasDelta && pointerActive) {
      const distance = Math.hypot(pointer.dx, pointer.dy);
      if (distance > 0.0016) {
        const steps = Math.min(3, Math.max(1, Math.floor(distance / 0.02)));
        const color = palette.dye[dyeColorIndex % palette.dye.length];
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          splatPair(
            pointer.prevX + (pointer.x - pointer.prevX) * t,
            pointer.prevY + (pointer.y - pointer.prevY) * t,
            (pointer.dx / steps) * 3200,
            (pointer.dy / steps) * 3200,
            color,
            0.34,
            3.0,
          );
        }
      }
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      pointer.hasDelta = false;
    }
    if (fluidTargets) {
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        ambientTimer = 3.4 + Math.random() * 2.4;
        injectAmbientSplat();
      }
      stepFluid(clampFx(dt, 1 / 120, 1 / 30));
    }

    /* --- Halo curseur + réfraction --- */
    pointer.impulse = dampFx(pointer.impulse, 0, 2.4, dt);
    const glowTarget = (pointerActive ? palette.mouseGlowActive : palette.mouseGlowIdle) + pointer.impulse;
    compositeUniforms.uMouseGlow.value = dampFx(compositeUniforms.uMouseGlow.value as number, glowTarget, 3.2, dt);
    pointerUv.set(pointer.x, pointer.y);
    (compositeUniforms.uMouse.value as THREE.Vector2).lerp(pointerUv, 1 - Math.exp(-6 * dt));

    /* --- Thème : fondu des palettes --- */
    if (themeBlend < 1) {
      themeBlend = Math.min(1, themeBlend + dt * 2.2);
      applyPaletteBlend();
    }

    /* --- Formes : dérive lente + parallaxe curseur --- */
    for (const shape of shapes) {
      shape.material.uniforms.uTime.value = clock;
      const t = clock * shape.driftSpeed + shape.seed;
      shape.mesh.position.set(
        shape.base.x + Math.sin(t) * shape.driftAmplitude,
        shape.base.y + Math.cos(t * 0.82) * shape.driftAmplitude * 0.8,
        shape.base.z + Math.sin(t * 0.6) * 0.5,
      );
      shape.mesh.rotation.x += shape.spin[0] * dt;
      shape.mesh.rotation.y += shape.spin[1] * dt;
      shape.mesh.rotation.z += shape.spin[2] * dt;
    }
    mainCamera.position.x = dampFx(mainCamera.position.x, (pointer.x - 0.5) * 2.2, 1.6, dt);
    mainCamera.position.y = dampFx(mainCamera.position.y, (pointer.y - 0.5) * 1.5, 1.6, dt);
    mainCamera.lookAt(0, 0, -6);
    const scrollShift = clampFx(scrollY * 0.0016, 0, 2.2);
    shapeGroup.position.y = dampFx(shapeGroup.position.y, scrollShift, 2.2, dt);
    shapeGroup.rotation.y = dampFx(shapeGroup.rotation.y, (pointer.x - 0.5) * 0.08, 1.8, dt);
    shapeGroup.rotation.x = dampFx(shapeGroup.rotation.x, (0.5 - pointer.y) * 0.05, 1.8, dt);
    shapeGroup.updateMatrixWorld(true);
    updateShapeHover(dt);

    particleMaterial.uniforms.uTime.value = clock;
    compositeUniforms.uTime.value = clock;

    /* --- Rendu : composite basse résolution → écran → verres --- */
    renderer.setRenderTarget(bgTarget);
    renderer.render(bgScene, bgCamera);

    renderer.setRenderTarget(null);
    blitMaterial.uniforms.uTexture.value = bgTarget.texture;
    blit(blitMaterial, null);
    renderer.render(mainScene, mainCamera);

    if (!firstFrameDone) {
      firstFrameDone = true;
      options.onFirstFrame?.();
    }
  }

  /* ------------------------------ Fondu de thème ----------------------------- */

  function applyPaletteBlend(): void {
    const t = themeBlend * themeBlend * (3 - 2 * themeBlend); // smoothstep
    const mix3 = (target: THREE.IUniform, from: Vec3, to: Vec3): void => {
      const value = target.value as THREE.Vector3;
      value.set(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
    };
    const mix1 = (target: THREE.IUniform, from: number, to: number): void => {
      target.value = from + (to - from) * t;
    };
    mix3(compositeUniforms.uBase0, blendFrom.base0, targetPalette.base0);
    mix3(compositeUniforms.uBase1, blendFrom.base1, targetPalette.base1);
    mix3(compositeUniforms.uAuroraA, blendFrom.auroraA, targetPalette.auroraA);
    mix3(compositeUniforms.uAuroraB, blendFrom.auroraB, targetPalette.auroraB);
    mix3(compositeUniforms.uAuroraC, blendFrom.auroraC, targetPalette.auroraC);
    mix3(compositeUniforms.uHaloColor, blendFrom.halo, targetPalette.halo);
    mix1(compositeUniforms.uAuroraStrength, blendFrom.auroraStrength, targetPalette.auroraStrength);
    mix1(compositeUniforms.uDyeStrength, blendFrom.dyeStrength, targetPalette.dyeStrength);
    mix3(particleMaterial.uniforms.uColor, blendFrom.particleColor, targetPalette.particleColor);
    mix1(particleMaterial.uniforms.uOpacity, blendFrom.particleOpacity, targetPalette.particleOpacity);
    for (const shape of shapes) {
      mix1(shape.material.uniforms.uOpacity, blendFrom.glassOpacity, targetPalette.glassOpacity);
      mix1(shape.material.uniforms.uIridescence, blendFrom.glassIridescence, targetPalette.glassIridescence);
    }
    if (t >= 1) palette = targetPalette;
  }

  /* --------------------------------- Cycle de vie ---------------------------- */

  function startLoop(): void {
    // NB : pas de garde `document.hidden` ici — la boucle est déjà mise en pause
    // par onVisibility() quand l'onglet passe en arrière-plan, et rAF ne s'exécute
    // de toute façon pas dans un onglet masqué. Un test headless peut signaler
    // `document.hidden === true` à tort et bloquerait sinon le démarrage initial.
    if (disposed || running) return;
    running = true;
    lastFrameAt = performance.now();
    rafId = window.requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopLoop();
    window.clearTimeout(resizeTimer);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const resource of disposables) {
      try {
        resource.dispose();
      } catch {
        /* ressource déjà libérée */
      }
    }
    disposables.length = 0;
    try {
      renderer.forceContextLoss();
    } catch {
      /* contexte déjà perdu */
    }
  }

  startLoop();

  return {
    setTheme(dark: boolean): void {
      if (disposed) return;
      const next = dark ? DARK_PALETTE : LIGHT_PALETTE;
      if (next === targetPalette && themeBlend >= 1) return;
      // Capture de l'état affiché pour un fondu depuis les valeurs courantes.
      blendFrom = {
        ...next,
        base0: (compositeUniforms.uBase0.value as THREE.Vector3).toArray() as Vec3,
        base1: (compositeUniforms.uBase1.value as THREE.Vector3).toArray() as Vec3,
        auroraA: (compositeUniforms.uAuroraA.value as THREE.Vector3).toArray() as Vec3,
        auroraB: (compositeUniforms.uAuroraB.value as THREE.Vector3).toArray() as Vec3,
        auroraC: (compositeUniforms.uAuroraC.value as THREE.Vector3).toArray() as Vec3,
        halo: (compositeUniforms.uHaloColor.value as THREE.Vector3).toArray() as Vec3,
        auroraStrength: compositeUniforms.uAuroraStrength.value as number,
        dyeStrength: compositeUniforms.uDyeStrength.value as number,
        particleColor: (particleMaterial.uniforms.uColor.value as THREE.Vector3).toArray() as Vec3,
        particleOpacity: particleMaterial.uniforms.uOpacity.value as number,
        glassOpacity: shapes[0] ? (shapes[0].material.uniforms.uOpacity.value as number) : next.glassOpacity,
        glassIridescence: shapes[0] ? (shapes[0].material.uniforms.uIridescence.value as number) : next.glassIridescence,
      };
      targetPalette = next;
      themeBlend = 0;
      // Le mode de fusion change avec le thème (additif sur fond sombre,
      // normal sur fond clair) : bascule immédiate, le fondu des couleurs
      // masque la transition.
      const glassBlending = next.glassAdditive ? THREE.AdditiveBlending : THREE.NormalBlending;
      const particleBlending = next.particleAdditive ? THREE.AdditiveBlending : THREE.NormalBlending;
      for (const shape of shapes) {
        if (shape.material.blending !== glassBlending) {
          shape.material.blending = glassBlending;
          shape.material.needsUpdate = true;
        }
      }
      if (particleMaterial.blending !== particleBlending) {
        particleMaterial.blending = particleBlending;
        particleMaterial.needsUpdate = true;
      }
      startLoop(); // un changement de thème réveille la boucle si elle dormait
    },
    dispose,
  };
}
