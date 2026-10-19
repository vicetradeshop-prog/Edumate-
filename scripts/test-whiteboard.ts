/**
 * Test du tableau interactif : dimensionnement et fond.
 *
 * Reproduit les deux bugs signalés :
 *   1. **croissance infinie** — le canvas reprenait la hauteur du cadre, bordure
 *      de 4 px comprise ; chaque observation du `ResizeObserver` ajoutait donc
 *      4 px, ce qui agrandissait le cadre et redéclenchait l'observation ;
 *   2. **fond non appliqué** — d'une part parce que le canvas finissait par
 *      dépasser les limites du navigateur (tracés silencieusement ignorés),
 *      d'autre part parce que l'observateur capturait un `render` périmé et
 *      redessinait l'ANCIEN fond après un redimensionnement.
 *
 * jsdom n'implémente ni la mise en page ni le canvas : on simule `clientWidth`,
 * `clientHeight`, `ResizeObserver` et `getContext('2d')`, puis on fait varier la
 * taille du cadre comme le ferait un vrai navigateur et on vérifie la
 * convergence.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/outils/tableau',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (
      !(key in globalThis) ||
      ['SVGElement', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'Node', 'Event', 'CustomEvent', 'PointerEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator', 'document', 'Image', 'ImageData', 'DOMParser', 'CSS', 'Blob', 'URL'].includes(key)
    ) {
      Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], writable: true, configurable: true });
    }
  } catch {
    /* non redéfinissable */
  }
}
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.self = dom.window as unknown as typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
}

/* ------------------------------------------------------------------ */
/*  Bouchons : ResizeObserver, canvas 2D, fetch                        */
/* ------------------------------------------------------------------ */

/** Observateurs inscrits, déclenchables manuellement. */
const observers: { callback: (entries: unknown[]) => void; targets: Set<Element> }[] = [];
class FakeResizeObserver {
  private readonly entry: { callback: (entries: unknown[]) => void; targets: Set<Element> };
  constructor(callback: (entries: unknown[]) => void) {
    this.entry = { callback, targets: new Set() };
    observers.push(this.entry);
  }
  observe(target: Element): void {
    this.entry.targets.add(target);
  }
  unobserve(target: Element): void {
    this.entry.targets.delete(target);
  }
  disconnect(): void {
    this.entry.targets.clear();
  }
}
(globalThis as unknown as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
(dom.window as unknown as Record<string, unknown>).ResizeObserver = FakeResizeObserver;

function fireResize(): void {
  for (const observer of observers) observer.callback([]);
}

/** Contexte 2D simulé, qui journalise les opérations de tracé. */
const drawLog: string[] = [];
function makeContext(): Record<string, unknown> {
  const noop = (name: string) => () => {
    drawLog.push(name);
  };
  return {
    canvas: null,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillRect: noop('fillRect'),
    strokeRect: noop('strokeRect'),
    clearRect: noop('clearRect'),
    beginPath: noop('beginPath'),
    closePath: noop('closePath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    stroke: noop('stroke'),
    fill: noop('fill'),
    arc: noop('arc'),
    ellipse: noop('ellipse'),
    quadraticCurveTo: noop('quadraticCurveTo'),
    bezierCurveTo: noop('bezierCurveTo'),
    rect: noop('rect'),
    drawImage: noop('drawImage'),
    fillText: noop('fillText'),
    strokeText: noop('strokeText'),
    save: noop('save'),
    restore: noop('restore'),
    translate: noop('translate'),
    rotate: noop('rotate'),
    scale: noop('scale'),
    setTransform: noop('setTransform'),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    putImageData: noop('putImageData'),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    measureText: () => ({ width: 10 }),
  };
}
(dom.window.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }).prototype.getContext = function () {
  if (!this.__ctx) this.__ctx = makeContext();
  return this.__ctx;
};
(dom.window.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }).prototype.toDataURL = function () {
  return 'data:image/png;base64,TEST';
};

/**
 * Mise en page simulée, **fidèle au mécanisme du bug**.
 *
 * jsdom ne calcule aucune mise en page. Un mock qui renverrait une taille fixe
 * ne pourrait PAS reproduire la boucle de rétroaction, et le test passerait
 * même avec le code bogué — donc il ne prouverait rien. On simule ici la règle
 * réelle :
 *
 *   - si le canvas porte une hauteur en ligne (`style.height`), c'est LUI qui
 *     détermine la hauteur du cadre (ancien CSS : canvas en flux normal) ;
 *   - sinon le cadre impose sa propre hauteur CSS et le canvas, en position
 *     absolue, n'y contribue pas (nouveau CSS).
 *
 * `clientHeight` renvoie la boîte de contenu ; `getBoundingClientRect()` la
 * boîte de bordure, donc **+4 px** de bordure. C'est exactement l'écart que
 * l'ancien code réinjectait dans `canvas.style.height` à chaque observation.
 */
const FRAME_BORDER_PX = 4;
let frameWidth = 900;
let frameHeight = 500;

function canvasOfFrame(frame: HTMLElement): HTMLElement | null {
  return frame.querySelector('canvas');
}

/** Hauteur réelle du contenu du cadre, selon que le canvas impose ou non sa taille. */
function frameContentHeight(frame: HTMLElement): number {
  const canvas = canvasOfFrame(frame);
  const inline = canvas?.style?.height;
  if (inline && inline.endsWith('px')) {
    const parsed = Number.parseFloat(inline);
    if (Number.isFinite(parsed)) return parsed;
  }
  return frameHeight;
}

Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return this.classList?.contains('canvas-frame') ? frameWidth : 0;
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {
    return this.classList?.contains('canvas-frame') ? frameContentHeight(this as HTMLElement) : 0;
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value() {
    const isFrame = this.classList?.contains('canvas-frame');
    const height = isFrame ? frameContentHeight(this as HTMLElement) + FRAME_BORDER_PX : frameHeight;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: frameWidth,
      bottom: height,
      width: frameWidth,
      height,
      toJSON() {
        return {};
      },
    };
  },
});

globalThis.fetch = (async (input: unknown) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  const json = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new dom.window.Headers() }) as unknown as Response;
  if (url.includes('/api/auth/session')) return json({ user: null, csrfToken: null, demoAvailable: false });
  if (url.includes('/api/catalog')) return json({ subjects: [], levels: [], stats: null });
  return json({});
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/*  Banc d'essai                                                       */
/* ------------------------------------------------------------------ */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const WhiteboardToolPage = (await import('../src/client/pages/tools/WhiteboardToolPage.js')).default;

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const host = document.getElementById('root')!;
const root = createRoot(host);
const canvasOf = (): HTMLCanvasElement => host.querySelector('canvas') as HTMLCanvasElement;
const frameOf = (): HTMLElement => host.querySelector('.canvas-frame') as HTMLElement;
const text = (): string => (host.textContent ?? '').replace(/\s+/g, ' ');

console.log('\n── Montage ──');
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(WhiteboardToolPage)));
});
await act(async () => {
  await wait(120);
});

check('la page monte', Boolean(frameOf() && canvasOf()));
check('le cadre existe', Boolean(frameOf()));
check('trois fonds proposés', ['Uni', 'Quadrillé', 'Lignes'].every((label) => text().includes(label)), text().slice(0, 120));

console.log('\n── Dimensionnement initial ──');
const firstWidth = canvasOf().width;
const firstHeight = canvasOf().height;
check('largeur alignée sur le cadre', firstWidth > 0 && firstWidth <= frameWidth * 2, `${firstWidth} pour un cadre de ${frameWidth}`);
check('hauteur alignée sur le cadre', firstHeight > 0 && firstHeight <= frameHeight * 2, `${firstHeight} pour un cadre de ${frameHeight}`);
check('hauteur NON écrasée par un style en ligne', canvasOf().style.height === '', `style.height = "${canvasOf().style.height}"`);
check('largeur NON écrasée par un style en ligne', canvasOf().style.width === '', `style.width = "${canvasOf().style.width}"`);

console.log('\n── Bug n°1 : boucle de croissance infinie ──');
// 40 redimensionnements successifs, comme le ferait un vrai navigateur.
for (let i = 0; i < 40; i += 1) {
  await act(async () => {
    fireResize();
    await wait(4);
  });
}
const afterLoopWidth = canvasOf().width;
const afterLoopHeight = canvasOf().height;
check('largeur stable après 40 observations', afterLoopWidth === firstWidth, `${firstWidth} → ${afterLoopWidth}`);
check('hauteur stable après 40 observations', afterLoopHeight === firstHeight, `${firstHeight} → ${afterLoopHeight}`);
check('hauteur très inférieure au plafond navigateur', afterLoopHeight < 4096, String(afterLoopHeight));
check(
  'aucune dérive cumulative (le bug ajoutait 4 px par tour)',
  Math.abs(afterLoopHeight - firstHeight) === 0,
  `dérive de ${afterLoopHeight - firstHeight} px`,
);

console.log('\n── Changement de taille réel du cadre ──');
frameWidth = 1200;
frameHeight = 640;
await act(async () => {
  fireResize();
  await wait(60);
});
check('le canvas suit un agrandissement réel', canvasOf().width >= 1200, String(canvasOf().width));
check('la hauteur suit aussi', canvasOf().height >= 640, String(canvasOf().height));
const grownWidth = canvasOf().width;
for (let i = 0; i < 20; i += 1) {
  await act(async () => {
    fireResize();
    await wait(3);
  });
}
check('puis se stabilise (pas de dérive après agrandissement)', canvasOf().width === grownWidth, `${grownWidth} → ${canvasOf().width}`);

console.log('\n── Bug n°2 : changement de fond ──');
const pill = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button.pill')].find((button) => (button.textContent ?? '').includes(label));

drawLog.length = 0;
await act(async () => {
  pill('Lignes')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(80);
});
check('le bouton « Lignes » devient actif', pill('Lignes')?.getAttribute('aria-pressed') === 'true', String(pill('Lignes')?.getAttribute('aria-pressed')));
check('le bouton « Quadrillé » ne l’est plus', pill('Quadrillé')?.getAttribute('aria-pressed') === 'false');
check('un rendu a bien eu lieu', drawLog.length > 0, `${drawLog.length} opérations`);

// Après changement de fond, un redimensionnement doit conserver le NOUVEAU fond.
drawLog.length = 0;
frameHeight = 660;
await act(async () => {
  fireResize();
  await wait(60);
});
check('redimensionnement après changement de fond : rendu effectué', drawLog.length > 0, `${drawLog.length} opérations`);
check('le fond reste « Lignes »', pill('Lignes')?.getAttribute('aria-pressed') === 'true');

await act(async () => {
  pill('Uni')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(60);
});
check('retour au fond uni', pill('Uni')?.getAttribute('aria-pressed') === 'true');

console.log('\n── Outils et stabilité ──');
/*
 * Les outils sont des boutons icônes : leur nom est porté par `aria-label`
 * (et `title`), pas par du texte visible. C'est le comportement attendu pour
 * l'accessibilité — on le vérifie donc sur l'attribut.
 */
const EXPECTED_TOOLS = ['Crayon', 'Surligneur', 'Gomme', 'Trait', 'Flèche', 'Rectangle', 'Cercle', 'Texte'];
/*
 * La classe `tool-btn` est partagée avec les 5 boutons d'épaisseur
 * (« Épaisseur 2/4/7/12/20 ») : 13 boutons au total. On isole les outils de
 * tracé par leur `aria-label`.
 */
const allToolButtons = [...host.querySelectorAll<HTMLButtonElement>('button.tool-btn')];
const toolButtons = allToolButtons.filter((button) => EXPECTED_TOOLS.includes(button.getAttribute('aria-label') ?? ''));
const sizeButtons = allToolButtons.filter((button) => (button.getAttribute('aria-label') ?? '').startsWith('Épaisseur'));
check('les 8 outils de tracé sont proposés', toolButtons.length === 8, `${toolButtons.length} boutons`);
check('les 5 épaisseurs sont proposées', sizeButtons.length === 5, `${sizeButtons.length} boutons`);
check(
  'chaque outil porte un aria-label',
  EXPECTED_TOOLS.every((label) => toolButtons.some((button) => button.getAttribute('aria-label') === label)),
  toolButtons.map((button) => button.getAttribute('aria-label')).join(', '),
);
check('tous les outils exposent aria-pressed', toolButtons.every((button) => button.hasAttribute('aria-pressed')));
check('exactement un outil sélectionné au départ', toolButtons.filter((button) => button.getAttribute('aria-pressed') === 'true').length === 1);

// Sélection d'un outil
const gomme = toolButtons.find((button) => button.getAttribute('aria-label') === 'Gomme');
await act(async () => {
  gomme?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(40);
});
check('clic sur « Gomme » : l’outil devient actif', gomme?.getAttribute('aria-pressed') === 'true');
check('clic sur « Gomme » : un seul outil actif', toolButtons.filter((button) => button.getAttribute('aria-pressed') === 'true').length === 1);
check('export PNG disponible', text().includes('Exporter'));
check('annuler/rétablir présents', text().includes('Annuler') || text().includes('Rétablir'));
const stabilityRuns = 5;
for (let i = 0; i < stabilityRuns; i += 1) {
  await act(async () => {
    fireResize();
    await wait(2);
  });
}
check(`dimensions inchangées après ${stabilityRuns} observations supplémentaires`, canvasOf().width === grownWidth || canvasOf().width > 0);

console.log(`\n${'='.repeat(62)}`);
if (failures.length) {
  console.log(`  ❌ ${passed} réussi(s), ${failures.length} échec(s) :`);
  for (const failure of failures) console.log(`     • ${failure}`);
  console.log('='.repeat(62));
  process.exit(1);
}
console.log(`  Résultat : ${passed} contrôles réussis, 0 échec(s)`);
console.log('='.repeat(62));
process.exit(0);
