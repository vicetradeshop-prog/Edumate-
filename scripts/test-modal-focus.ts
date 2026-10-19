/**
 * Test ciblé : le vol de focus dans la modale du calendrier.
 *
 * Reproduit FIDÈLEMENT le schéma de CalendarToolPage :
 *   - l'état du brouillon vit dans le composant PAGE (donc chaque frappe le
 *     re-rend),
 *   - `onClose` est passé en fonction fléchée EN LIGNE (identité changeante),
 *   - le champ « titre » met cet état à jour à chaque lettre saisie.
 *
 * Avant correctif : l'effet de la modale dépendait de `onClose`, donc il se
 * ré-exécutait à chaque rendu et réarmait le focus initial — qui visait de sur
 * croît la croix de fermeture, premier `button` en ordre du document.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (!(key in globalThis) || ['SVGElement', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'InputEvent', 'DocumentFragment', 'getComputedStyle', 'navigator', 'document', 'DOMParser', 'CSS'].includes(key)) {
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

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { Modal } = await import('../src/client/components/ui/Modal.js');

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

/** Décrit l'élément qui a le focus, pour un message d'échec lisible. */
function describeActive(): string {
  const el = document.activeElement;
  if (!el) return 'null';
  const testid = el.getAttribute('data-testid');
  if (testid) return `data-testid="${testid}"`;
  const label = el.getAttribute('aria-label');
  if (label) return `aria-label="${label}"`;
  if (el.closest('[data-modal-close]')) return 'la CROIX de fermeture';
  return `<${el.tagName.toLowerCase()}>`;
}

/* ------------------------------------------------------------------ */
/*  Harnais : calqué sur CalendarToolPage                             */
/* ------------------------------------------------------------------ */

let pageRenders = 0;
let modalEffectRuns = 0;

interface Draft {
  title: string;
  date: string;
}

function CalendarHarness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  // L'état du brouillon vit ICI, comme dans la vraie page : chaque frappe
  // re-rend donc le composant qui crée la fonction `onClose`.
  const [draft, setDraft] = React.useState<Draft | null>({ title: '', date: '2026-09-30' });
  pageRenders += 1;

  React.useEffect(() => {
    onOpenChange?.(Boolean(draft));
  }, [draft, onOpenChange]);

  if (!draft)
    return React.createElement(
      'button',
      { 'data-testid': 'open', onClick: () => setDraft({ title: '', date: '2026-09-30' }) },
      'Ouvrir',
    );

  return React.createElement(
    Modal,
    {
      open: true,
      onClose: () => setDraft(null), // ⚠️ identité changeante à chaque rendu
      title: draft.date ? 'Modifier l’événement' : 'Nouvel événement',
      footer: React.createElement('button', { type: 'button', 'data-testid': 'footer' }, 'Valider'),
    },
    React.createElement(
      'div',
      { className: 'ed-stack' },
      React.createElement('label', { htmlFor: 'title' }, 'Titre'),
      React.createElement('input', {
        id: 'title',
        'data-testid': 'title',
        value: draft.title,
        onChange: (event: { target: { value: string } }) =>
          setDraft((current) => (current ? { ...current, title: event.target.value } : current)),
      }),
      React.createElement('input', { type: 'date', 'data-testid': 'date', value: draft.date, readOnly: true }),
      React.createElement('button', { type: 'button', 'data-testid': 'save' }, 'Enregistrer'),
    ),
  );
}

const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);

/* ------------------------------------------------------------------ */
/*  Scénario 1 : ouverture, puis saisie lettre par lettre             */
/* ------------------------------------------------------------------ */

console.log('\n── Scénario 1 : saisie dans le champ titre ──');

await act(async () => {
  root.render(React.createElement(CalendarHarness));
});
await act(async () => {
  await wait(150);
});

const input = document.querySelector<HTMLInputElement>('[data-testid="title"]');
const closeButton = document.querySelector<HTMLElement>('.modal__header button');

check('le champ titre existe dans la modale', Boolean(input));
check('la croix de fermeture existe', Boolean(closeButton));
check('le focus initial est sur le champ titre', document.activeElement === input, `actif = ${describeActive()}`);
check('la croix n’a PAS reçu le focus initial', document.activeElement !== closeButton);

const typed = 'Devoir de maths';
let stolen = 0;
const stolenAt: string[] = [];

for (const character of typed) {
  await act(async () => {
    const next = (input!.value ?? '') + character;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
    input!.focus();
    setter?.call(input!, next);
    input!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  // Attente supérieure au délai de 60 ms du focus initial : c'est là que le bug
  // se manifestait (le timer était réarmé à chaque rendu).
  await act(async () => {
    await wait(90);
  });
  if (document.activeElement !== input) {
    stolen += 1;
    stolenAt.push(`${character}→${describeActive()}`);
  }
}

check(`texte saisi intégralement conservé (« ${typed} »)`, input!.value === typed, `obtenu « ${input!.value} »`);
check(`focus jamais volé pendant ${typed.length} frappes`, stolen === 0, `volé ${stolen}× : ${stolenAt.slice(0, 4).join(', ')}`);
check('la modale reste ouverte pendant la saisie', Boolean(document.querySelector('.modal')));
check('la page s’est bien re-rendue à chaque frappe (condition du bug)', pageRenders >= typed.length, `${pageRenders} rendus`);

/* ------------------------------------------------------------------ */
/*  Scénario 2 : fermeture par Échap                                  */
/* ------------------------------------------------------------------ */

console.log('\n── Scénario 2 : fermeture ──');

await act(async () => {
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});
// L'animation de sortie dure 220 ms : on attend au-delà.
await act(async () => {
  await wait(420);
});
check('Échap ferme la modale', document.querySelector('.modal') === null);
check('le bouton « Ouvrir » est affiché après fermeture', Boolean(document.querySelector('[data-testid="open"]')));

/* ------------------------------------------------------------------ */
/*  Scénario 3 : clic sur la croix                                    */
/* ------------------------------------------------------------------ */

console.log('\n── Scénario 3 : réouverture et clic sur la croix ──');

await act(async () => {
  (document.querySelector('[data-testid="open"]') as HTMLElement).click();
});
await act(async () => {
  await wait(150);
});
const input2 = document.querySelector<HTMLInputElement>('[data-testid="title"]');
check('réouverture : la modale est de retour', Boolean(document.querySelector('.modal')));
check('réouverture : focus sur le champ titre', document.activeElement === input2, `actif = ${describeActive()}`);

const croix = document.querySelector<HTMLElement>('.modal__header button');
await act(async () => {
  croix!.click();
});
await act(async () => {
  await wait(420);
});
check('clic sur la croix ferme la modale', document.querySelector('.modal') === null);

/* ------------------------------------------------------------------ */
/*  Scénario 4 : piège à focus                                        */
/* ------------------------------------------------------------------ */

console.log('\n── Scénario 4 : piège à focus ──');

await act(async () => {
  (document.querySelector('[data-testid="open"]') as HTMLElement).click();
});
await act(async () => {
  await wait(150);
});

const selector = '.modal a[href], .modal button:not(:disabled), .modal input:not([type="hidden"]):not([disabled]), .modal select:not([disabled]), .modal textarea:not([disabled]), .modal [tabindex]:not([tabindex="-1"])';
const focusables = [...document.querySelectorAll<HTMLElement>(selector)];
check('la modale expose au moins 4 éléments focalisables', focusables.length >= 4, `${focusables.length} trouvés`);
const panel = document.querySelector('.modal');

const last = focusables[focusables.length - 1];
const first = focusables[0];
last.focus();
let tabLooped = false;
await act(async () => {
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  tabLooped = event.defaultPrevented;
});
check('Tab sur le dernier élément est intercepté (boucle vers le premier)', tabLooped);
check('le focus a bien été déplacé sur le premier élément', document.activeElement === first, `actif = ${describeActive()}`);

first.focus();
let shiftLooped = false;
await act(async () => {
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  shiftLooped = event.defaultPrevented;
});
check('Maj+Tab sur le premier élément boucle vers le dernier', shiftLooped);
check('le focus est revenu sur le dernier élément', document.activeElement === last, `actif = ${describeActive()}`);

/* ------------------------------------------------------------------ */
/*  Bilan                                                             */
/* ------------------------------------------------------------------ */

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
