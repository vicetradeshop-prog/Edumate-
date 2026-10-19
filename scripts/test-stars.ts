/**
 * Test du composant `Stars` (notation par étoiles).
 *
 * Couvre les défauts corrigés : débordement non borné, artefacts flottants,
 * désalignement vertical du remplissage, valeurs aberrantes (NaN, négatif,
 * total nul), accessibilité (aria-label, title).
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (!(key in globalThis) || ['SVGElement', 'HTMLElement', 'Element', 'Node', 'Event', 'getComputedStyle', 'navigator', 'document'].includes(key)) {
      Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], writable: true, configurable: true });
    }
  } catch { /* non redéfinissable */ }
}
(globalThis as unknown as Record<string, unknown>).window = dom.window;
(globalThis as unknown as Record<string, unknown>).document = dom.window.document;
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { Stars } = await import('../src/client/components/ui/Badge.js');

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function render(props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Stars, props)); });
  return host;
}

console.log('\n── Valeurs limites ──');
const cases: [string, Record<string, unknown>, string][] = [
  ['0/5', { score: 0 }, 'Note : 0,0 sur 5 (0 %)'],
  ['2,5/5', { score: 2.5 }, 'Note : 2,5 sur 5 (50 %)'],
  // 1.65 s'écrit 1.6499999… en binaire : `toFixed(1)` donne « 1,6 ». C'est le
  // comportement attendu, pas une erreur d'arrondi du composant.
  ['1,65/5', { score: 1.65 }, 'Note : 1,6 sur 5 (33 %)'],
  ['5/5', { score: 5 }, 'Note : 5,0 sur 5 (100 %)'],
  ['débordement 7/5', { score: 7 }, 'Note : 5,0 sur 5 (100 %)'],
  ['négatif -3', { score: -3 }, 'Note : 0,0 sur 5 (0 %)'],
  ['NaN', { score: Number.NaN }, 'Note : 0,0 sur 5 (0 %)'],
  ['total nul', { score: 3, total: 0 }, 'Note : 0,0 sur 5 (0 %)'],
  ['3/10', { score: 3, total: 10 }, 'Note : 1,5 sur 5 (30 %)'],
  ['8/10', { score: 8, total: 10 }, 'Note : 4,0 sur 5 (80 %)'],
];

for (const [label, props, expectedAria] of cases) {
  const host = await render(props);
  const stars = host.querySelector('.stars');
  check(`${label} : aria-label exact`, stars?.getAttribute('aria-label') === expectedAria, String(stars?.getAttribute('aria-label')));
  const widths = [...host.querySelectorAll<HTMLElement>('span[style*="overflow"]')]
    .map((span) => span.getAttribute('style')?.match(/width:\s*([\d.]+)%/)?.[1] ?? '?');
  check(`${label} : largeur sans artefact flottant`, widths.every((value) => value.length <= 5), widths.join(','));
  check(`${label} : 5 étoiles au maximum`, host.querySelectorAll('svg').length <= 10, `${host.querySelectorAll('svg').length} svg`);
}

console.log('\n── Rendu et accessibilité ──');
const zero = await render({ score: 0 });
check('score 0 : aucune couche de remplissage', zero.querySelectorAll('span[style*="overflow"]').length === 0);

const full = await render({ score: 5, showValue: true });
check('score 5 : les 5 remplissages à 100 %', [...full.querySelectorAll<HTMLElement>('span[style*="overflow"]')].every((span) => span.getAttribute('style')?.includes('width: 100%')));
check('showValue affiche la valeur', (full.textContent ?? '').includes('5,0/5'), full.textContent ?? '');

const small = await render({ score: 2.5, size: 13 });
check('petite taille : svg en display:block (pas de décalage vertical)', [...small.querySelectorAll('svg')].every((svg) => (svg.getAttribute('style') ?? '').includes('display: block')));
check('petite taille : trait affiné', [...small.querySelectorAll('svg')].every((svg) => Number(svg.getAttribute('stroke-width')) < 2), String(small.querySelector('svg')?.getAttribute('stroke-width')));
check('infobulle title présente', Boolean(small.querySelector('.stars')?.getAttribute('title')));
check('role="img" conservé', small.querySelector('.stars')?.getAttribute('role') === 'img');
check('svg marqués aria-hidden', [...small.querySelectorAll('svg')].every((svg) => svg.getAttribute('aria-hidden') === 'true'));

const partial = await render({ score: 1.65 });
const widths = [...partial.querySelectorAll<HTMLElement>('span[style*="overflow"]')].map((span) => span.getAttribute('style')?.match(/width:\s*([\d.]+)%/)?.[1]);
check('remplissage partiel : 100 % puis 65 %', widths[0] === '100' && widths[1] === '65', String(widths));

const custom = await render({ score: 4, label: 'Maîtrise du sujet' });
check('libellé personnalisé pris en compte', custom.querySelector('.stars')?.getAttribute('aria-label')?.startsWith('Maîtrise du sujet') === true, String(custom.querySelector('.stars')?.getAttribute('aria-label')));

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
