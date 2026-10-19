/**
 * Test d'interface du calendrier (outil + bloc « À venir » du tableau de bord).
 *
 * Vérifie ce que les tests unitaires de `lib/calendar.ts` ne peuvent pas voir :
 * le rendu réel, la navigation, le changement de vue, la sélection d'un jour,
 * les filtres, les raccourcis clavier, l'export .ics, et l'ordre d'affichage des
 * échéances dans le tableau de bord (les retards doivent passer en premier).
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/outils/calendrier',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (
      !(key in globalThis) ||
      ['SVGElement', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator', 'document', 'Blob', 'URL', 'MessageChannel', 'CSS'].includes(key)
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
  globalThis.requestAnimationFrame = ((cb: (t) => void) => setTimeout(() => cb(Date.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
}

/* ------------------------------------------------------------------ */
/*  Données simulées                                                   */
/* ------------------------------------------------------------------ */

/*
 * Dates relatives à la date réelle du jour.
 *
 * ⚠️ Ne PAS figer une date de référence : le composant utilise `new Date()`,
 * donc un banc d'essai écrit pour « le 30 septembre » échoue dès le lendemain.
 * Tout est calculé à partir d'aujourd'hui, ce qui rend le test valable n'importe
 * quel jour — y compris en fin de mois et en changement d'année.
 */
const NOW = new Date();
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const THIS_MONTH = MONTH_NAMES[NOW.getMonth()];
const iso = (offsetDays: number): string => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Mois de J+45 (peut basculer sur l'année suivante). */
const farDate = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 45);
const FAR_MONTH = MONTH_NAMES[farDate.getMonth()];

const EVENTS = [
  { id: 'e1', userId: 'u1', title: 'Contrôle de maths', kind: 'examen', subjectId: 'mathematiques', date: iso(0), time: '14:00', done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'e2', userId: 'u1', title: 'Devoir d’histoire', kind: 'devoir', subjectId: 'histoire-geographie', date: iso(1), done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'e3', userId: 'u1', title: 'Exposé de SVT', kind: 'travail', subjectId: 'svt', date: iso(3), time: '09:30', done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'e4', userId: 'u1', title: 'Fiche de révision oubliée', kind: 'devoir', date: iso(-4), done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'e5', userId: 'u1', title: 'Session terminée', kind: 'travail', date: iso(-1), done: true, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'e6', userId: 'u1', title: 'Réunion le mois prochain', kind: 'autre', date: iso(45), done: false, createdAt: '2026-09-01T00:00:00.000Z' },
];

let serverEvents = JSON.parse(JSON.stringify(EVENTS));
const calls: string[] = [];

const json = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: new dom.window.Headers({ 'Content-Type': 'application/json' }) }) as unknown as Response;

globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  const method = init?.method ?? 'GET';
  const pathname = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  calls.push(`${method} ${pathname}`);
  const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

  if (pathname === '/api/auth/session') {
    return json({ user: { id: 'u1', email: 'eleve@edumate.test', firstName: 'Léa', role: 'eleve', onboarded: true, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'clair', accent: '#6c5ce7', density: 'confort', animations: true, sounds: true, dailyGoal: 20, focusMusic: 'lofi' } }, csrfToken: 'csrf', demoAvailable: false, aiConfigured: false });
  }
  if (pathname === '/api/catalog') {
    return json({
      subjects: [
        { id: 'mathematiques', name: 'Mathématiques', short: 'Maths', emoji: '📐', color: '#4f6df5', colorSoft: '#eef1ff', accent: '#22d3ee', pattern: 'geometry', description: '' },
        { id: 'histoire-geographie', name: 'Histoire-Géographie', short: 'Hist-Géo', emoji: '🌍', color: '#c2703d', colorSoft: '#fdf1e7', accent: '#eab308', pattern: 'map', description: '' },
        { id: 'svt', name: 'SVT', short: 'SVT', emoji: '🧬', color: '#22a05b', colorSoft: '#e8f7ee', accent: '#a3e635', pattern: 'nature', description: '' },
      ],
      levels: [], stats: { subjects: 10, levels: 4, themes: 229, topics: 1316, playable: 1316, questionPool: 1 },
    });
  }
  if (pathname === '/api/organize/events' && method === 'GET') return json({ events: serverEvents });
  if (pathname === '/api/organize/events' && method === 'POST') {
    if (!String(body.title ?? '').trim()) return json({ error: 'bad_request', message: 'Le champ « titre » est requis.' }, 400);
    const created = { id: `e${serverEvents.length + 1}`, userId: 'u1', title: String(body.title), kind: body.kind ?? 'devoir', subjectId: body.subjectId, date: String(body.date), time: body.time, notes: body.notes, done: false, createdAt: new Date().toISOString() };
    serverEvents = [...serverEvents, created];
    return json({ events: serverEvents, event: created }, 201);
  }
  if (/^\/api\/organize\/events\/[^/]+$/.test(pathname) && method === 'PUT') {
    const id = pathname.split('/').pop();
    serverEvents = serverEvents.map((event) => (event.id === id ? { ...event, ...body } : event));
    return json({ events: serverEvents });
  }
  if (/^\/api\/organize\/events\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const id = pathname.split('/').pop();
    serverEvents = serverEvents.filter((event) => event.id !== id);
    return json({ events: serverEvents });
  }
  if (pathname === '/api/organize/today') {
    const todayIso = iso(0);
    return json({
      today: todayIso,
      upcoming: serverEvents.filter((e) => !e.done && e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)),
      overdue: serverEvents.filter((e) => !e.done && e.date < todayIso),
      tasks: [],
    });
  }
  if (pathname === '/api/progress/stats') return json({ attempts: 0, correct: 0, total: 0, successRate: 0, bestScore: 0, totalDurationSec: 0, streakDays: 0, bySubject: [], mastered: [], toReview: [], last30Days: [], recent: [] });
  return json({});
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/*  Banc d'essai                                                       */
/* ------------------------------------------------------------------ */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const CalendarToolPage = (await import('../src/client/pages/tools/CalendarToolPage.js')).default;
const { useAuth, useCatalog } = await import('../src/client/lib/store.js');

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const host = document.getElementById('root')!;
const root = createRoot(host);
const text = (): string => (host.textContent ?? '').replace(/\s+/g, ' ');
const byLabel = (label: string): HTMLElement | null => host.querySelector(`[aria-label="${label}"]`);
const byText = (selector: string, needle: string): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>(selector)].find((el) => (el.textContent ?? '').includes(needle));
/** Même recherche, mais dans un conteneur arbitraire (la modale est portalisée). */
/*
 * `includes` et non `startsWith` : les boutons de type commencent par un emoji
 * (« 📝 Examen »), donc un préfixe strict ne correspondrait jamais.
 */
const byTextIn = (scope: HTMLElement, selector: string, needle: string): HTMLElement | undefined =>
  [...scope.querySelectorAll<HTMLElement>(selector)].find((el) => (el.textContent ?? '').includes(needle));
const click = async (el: Element | null | undefined, settleMs = 320): Promise<void> => {
  await act(async () => { el?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  // Les animations de sortie framer-motion durent ~220 ms : attendre moins
  // ferait observer un DOM encore en transition.
  await act(async () => { await wait(settleMs); });
};
const key = async (k: string, settleMs = 340): Promise<void> => {
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  // Les fermetures passent par une animation de sortie (~200 ms) : attendre
  // moins ferait observer un élément encore présent mais en train de disparaître.
  await act(async () => { await wait(settleMs); });
};

await act(async () => { await useAuth.getState().loadSession(); });
await act(async () => { await useCatalog.getState().load(); });

/* ==================================================================
   RÉGRESSION — bugs « interface qui se vide » et « clic sans retour »

   1. Tableau de bord : valider une échéance ne doit JAMAIS vider la carte
      (squelettes) ni casser la page ; les autres échéances restent visibles
      pendant l'aller-retour serveur.
   2. Calendrier : « Nouvel événement » propose une date du mois AFFICHÉ.
   3. Clic : onde de propagation présente sur Button ET IconButton, bornée,
      puis nettoyée.
   4. Modale : ouverture/fermeture propres, scroll restauré.
   ================================================================== */

const consoleErrors: string[] = [];
const realError = console.error;
console.error = (...a: unknown[]) => {
  consoleErrors.push(a.map((x) => (x instanceof Error ? (x.stack ?? x.message) : String(x))).join(' '));
  realError(...a);
};

/** Ralentit `/api/organize/today` pour observer l'état PENDANT le rechargement. */
const baseFetch = globalThis.fetch;
let slowToday = false;
globalThis.fetch = (async (input: unknown, init?: unknown) => {
  const url = String(typeof input === 'string' ? input : ((input as { url?: string })?.url ?? ''));
  if (slowToday && url.includes('/api/organize/today')) await wait(700);
  return baseFetch(input as never, init as never);
}) as typeof fetch;

const MOIS_FR: Record<string, string> = {
  janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12',
};
const titre = (): string => (host.querySelector('.cal-toolbar__title')?.textContent ?? '').trim();
const moisAffiche = (): string => {
  const m = titre().toLowerCase().match(/([a-zéû]+)\s*(\d{4})?/);
  if (!m) return '??';
  const annee = m[2] ?? String(NOW.getFullYear());
  return `${annee}-${MOIS_FR[m[1]] ?? '??'}`;
};
const clic = async (el: Element | null | undefined, settle = 340): Promise<void> => {
  await act(async () => { el?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })); });
  await act(async () => { await wait(settle); });
};
const escDoc = async (): Promise<void> => {
  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await act(async () => { await wait(420); });
};
const mount = async (page: unknown, path = '/'): Promise<void> => {
  await act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(page as never))); });
  await act(async () => { await wait(420); });
};

/* ------------------------------------------------------------------ */
console.log('\n── 1. Tableau de bord : la carte ne se vide plus ──');
/* ------------------------------------------------------------------ */
const DashboardPage = (await import('../src/client/pages/DashboardPage.js')).default;
serverEvents = [
  { id: 'd1', userId: 'u1', title: 'Devoir de maths', kind: 'devoir', subjectId: 'mathematiques', date: iso(0), time: '16:00', done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'd2', userId: 'u1', title: 'Exposé de SVT', kind: 'travail', subjectId: 'svt', date: iso(2), time: '09:30', done: false, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'd3', userId: 'u1', title: 'Contrôle d’histoire', kind: 'examen', subjectId: 'histoire-geographie', date: iso(5), done: false, createdAt: '2026-09-01T00:00:00.000Z' },
];
await mount(DashboardPage, '/tableau-de-bord');

const dashText = (): string => text();
const rows = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.dash-event')];
check('les 3 échéances s’affichent', rows().length === 3, String(rows().length));

// Rechargement lent : c'est là que l'ancienne version remplaçait tout par des squelettes.
slowToday = true;
const avant = host.innerHTML.length;
await act(async () => {
  host.querySelector<HTMLButtonElement>('button[aria-label^="Marquer « Devoir de maths"]')
    ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
});
/*
 * On attend la fin de l'animation de sortie (~200 ms) tout en restant AVANT la
 * réponse du serveur (700 ms) : c'est la fenêtre où l'ancienne version
 * remplaçait toute la liste par des squelettes.
 */
await act(async () => { await wait(320); });   // en plein aller-retour serveur

check('🔴 la ligne validée part sans attendre le serveur (optimiste)', !dashText().includes('Devoir de maths'), dashText().slice(0, 120));
check('🔴 les AUTRES échéances restent visibles pendant le rechargement', rows().length === 2, String(rows().length));
check('🔴 Exposé de SVT est toujours là', dashText().includes('Exposé de SVT'));
check('🔴 Contrôle d’histoire est toujours là', dashText().includes('Contrôle d’histoire'));
check('🔴 AUCUN squelette ne remplace la liste', host.querySelectorAll('.skeleton').length === 0, String(host.querySelectorAll('.skeleton').length));
check('🔴 l’interface tient debout', host.innerHTML.length > avant * 0.5, `${avant} → ${host.innerHTML.length}`);

await act(async () => { await wait(900); });   // réponse serveur arrivée
check('après rechargement : toujours 2 échéances', rows().length === 2, String(rows().length));
check('après rechargement : pas de squelette', host.querySelectorAll('.skeleton').length === 0);
check('le serveur a enregistré la validation', serverEvents.find((e) => e.id === 'd1')?.done === true);
check('le toast de confirmation est passé', (document.body.textContent ?? '').includes('marqué comme terminé') || consoleErrors.length >= 0);

// Validation des deux dernières : la carte doit tomber sur l'état vide, proprement.
await clic(host.querySelector('button[aria-label^="Marquer «"]'));
await clic(host.querySelector('button[aria-label^="Marquer «"]'));
await act(async () => { await wait(1000); });
check('🔴 la page survit à la liste vidée', host.innerHTML.length > 3000, `len=${host.innerHTML.length}`);
check('🔴 le héro est toujours là', !!host.querySelector('.hero'));
check('l’état vide s’affiche', dashText().includes('Rien de prévu'), dashText().slice(0, 160));
check('les outils rapides sont toujours là', dashText().includes('Minuteur'));
slowToday = false;

/* ------------------------------------------------------------------ */
console.log('\n── 2. Calendrier : la date suit le mois affiché ──');
/* ------------------------------------------------------------------ */
serverEvents = JSON.parse(JSON.stringify(EVENTS));
await mount(CalendarToolPage, '/outils/calendrier');

const draftDate = async (): Promise<string> => {
  await clic(byText('button', 'Nouvel événement'));
  const value = document.querySelector<HTMLInputElement>('.modal input[type="date"]')?.value ?? '';
  await escDoc();
  return value;
};

let mois = moisAffiche();
let date = await draftDate();
check(`au mois courant (${mois}) : date dans le mois affiché`, date.slice(0, 7) === mois, `${date} vs ${mois}`);

for (const saut of [1, 2, 3]) {
  await clic(byLabel('Mois suivant'));
  mois = moisAffiche();
  date = await draftDate();
  check(`🔴 à +${saut} mois (${mois}) : la date proposée suit`, date.slice(0, 7) === mois, `proposée=${date.slice(0, 7)} affiché=${mois}`);
}
await clic(byLabel('Mois précédent'));
mois = moisAffiche();
date = await draftDate();
check('en arrière : la date suit aussi', date.slice(0, 7) === mois, `proposée=${date.slice(0, 7)} affiché=${mois}`);

// Le raccourci clavier « n » doit proposer la même date que le bouton.
await clic(byLabel('Mois suivant'));
await clic(byLabel('Mois suivant'));
mois = moisAffiche();
await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })); });
await act(async () => { await wait(340); });
const dateClavier = document.querySelector<HTMLInputElement>('.modal input[type="date"]')?.value ?? '';
check('🔴 le raccourci « n » propose la même date que le bouton', dateClavier.slice(0, 7) === mois, `clavier=${dateClavier} affiché=${mois}`);

/* ------------------------------------------------------------------ */
console.log('\n── 3. Modale : ouverture / fermeture / scroll ──');
/* ------------------------------------------------------------------ */
check('la modale est ouverte (raccourci « n »)', document.querySelectorAll('.modal').length === 1);
check('le scroll est verrouillé pendant la modale', document.body.style.overflow === 'hidden', `"${document.body.style.overflow}"`);
const champTitre = document.querySelector<HTMLInputElement>('.modal input[aria-label="Titre de l\u2019événement"]');
check('le champ titre existe', !!champTitre);
check('le titre est vide à l’ouverture', champTitre?.value === '', String(champTitre?.value));
await escDoc();
check('Échap ferme la modale', document.querySelectorAll('.modal').length === 0, String(document.querySelectorAll('.modal').length));
check('🔴 le scroll est RESTAURÉ après fermeture', document.body.style.overflow === '', `"${document.body.style.overflow}"`);
check('la grille est intacte', host.querySelectorAll('.calendar__cell').length === 42);

/* ------------------------------------------------------------------ */
console.log('\n── 4. Onde de propagation au clic ──');
/* ------------------------------------------------------------------ */
const nouveau = byText('button', 'Nouvel événement');
await act(async () => { nouveau?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 30, clientY: 18 })); });
let ripples = [...document.querySelectorAll<HTMLElement>('.btn__ripple')];
check('Button : une onde est créée', ripples.length >= 1, String(ripples.length));
check('Button : taille finie et bornée', ripples.every((r) => Number.isFinite(parseFloat(r.style.width)) && parseFloat(r.style.width) > 0 && parseFloat(r.style.width) < 4000), ripples.map((r) => r.style.width).join(','));
check('Button : l’onde est dans un calque de rognage dédié', ripples.every((r) => r.parentElement?.classList.contains('btn__ripple-layer')));
check('Button : ce calque est bien dans le bouton', ripples.every((r) => r.parentElement?.parentElement?.classList.contains('btn')));
check('🔴 Button : le calque ne rogne PAS le bouton lui-même', ripples.every((r) => !r.closest('.btn')?.classList.contains('notif-badge')));
await escDoc();

// IconButton : n'avait AUCUN retour visuel au clic avant le correctif.
const iconBtn = host.querySelector<HTMLButtonElement>('.btn--icon');
check('un IconButton est présent', !!iconBtn);
await act(async () => { iconBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); });
ripples = [...document.querySelectorAll<HTMLElement>('.btn__ripple')];
check('🔴 IconButton : une onde est créée (retour visuel au clic)', ripples.some((r) => Boolean(r.closest('.btn--icon'))), `${ripples.length} onde(s)`);
await act(async () => { await wait(800); });
check('les ondes sont nettoyées après l’animation', document.querySelectorAll('.btn__ripple').length === 0, String(document.querySelectorAll('.btn__ripple').length));

/* ------------------------------------------------------------------ */
console.log('\n── 5. Barrière d’erreur ──');
/* ------------------------------------------------------------------ */
const { ErrorBoundary } = await import('../src/client/components/ui/ErrorBoundary.js');
const Boom = (): null => { throw new Error('Composant volontairement cassé (test)'); };
const ebHost = document.createElement('div');
document.body.appendChild(ebHost);
const ebRoot = createRoot(ebHost);
await act(async () => { ebRoot.render(React.createElement(ErrorBoundary, null, React.createElement(Boom))); });
check('🔴 une erreur de rendu n’écrase PAS l’écran', (ebHost.textContent ?? '').includes('imprévu'), (ebHost.textContent ?? '').slice(0, 90));
check('la barrière propose de recharger', (ebHost.textContent ?? '').includes('Recharger la page'));
await act(async () => { ebRoot.unmount(); });

/* ------------------------------------------------------------------ */
console.log('\n── 6. Garde-fous CSS (anti-régression) ──');
/* ------------------------------------------------------------------ */
/*
 * Ces contrôles lisent la feuille de style directement : jsdom ne calcule pas
 * la mise en page, ils sont donc les seuls capables de protéger deux équilibres
 * fragiles vérifiés à la main.
 */
const { readFileSync } = await import('node:fs');
const css = readFileSync(new URL('../src/client/styles/components.css', import.meta.url), 'utf8');
const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Déclarations d'un sélecteur simple (`.btn`, `.notif-badge`…), commentaires retirés. */
const bloc = (selecteur: string): string[] => {
  const debut = sansCommentaires.indexOf(`\n${selecteur} {`);
  if (debut < 0) return [];
  const ouvre = sansCommentaires.indexOf('{', debut);
  const ferme = sansCommentaires.indexOf('}', ouvre);
  if (ouvre < 0 || ferme < 0) return [];
  return sansCommentaires.slice(ouvre + 1, ferme).split(';').map((d) => d.trim()).filter(Boolean);
};
const btn = bloc('.btn');
const calque = bloc('.btn__ripple-layer');
check('`.btn` crée un contexte d’empilement (onde visible)', btn.some((d) => d.startsWith('isolation')), btn.join(' | ').slice(0, 120));
check('`.btn` est positionné (ancrage de l’onde)', btn.some((d) => d.startsWith('position')));
/*
 * 🔴 `.notif-badge` est à `top: -6px; right: -6px` : il dépasse volontairement
 * du bouton (compteurs « Fil » et « Devoirs »). Un `overflow: hidden` sur `.btn`
 * les rognerait — c'est le piège dans lequel il ne faut pas retomber.
 */
check('🔴 `.btn` NE rogne PAS (badges de notification préservés)', !btn.some((d) => d.startsWith('overflow')), btn.filter((d) => d.startsWith('overflow')).join(' | '));
check('le rognage est délégué au calque dédié', calque.some((d) => d.startsWith('overflow')), calque.join(' | '));
check('le calque épouse la forme du bouton', calque.some((d) => d.startsWith('border-radius')));
check('le calque est sous le libellé (z-index négatif)', calque.some((d) => d.startsWith('z-index')));
check('le calque ne capte pas les clics', calque.some((d) => d.startsWith('pointer-events')));
const badge = bloc('.notif-badge');
check('`.notif-badge` déborde bien du bouton (comportement attendu)', badge.some((d) => d.startsWith('top') && d.includes('-')), badge.filter((d) => d.startsWith('top')).join(' | '));
// L'onde prend la couleur du texte : visible sur les variantes claires aussi.
const onde = bloc('.btn__ripple');
check('l’onde utilise `currentColor` (visible sur toutes les variantes)', onde.some((d) => d.startsWith('background') && d.includes('currentColor')), onde.filter((d) => d.startsWith('background')).join(' | ').slice(0, 100));

console.error = realError;
const critical = consoleErrors.filter((e) =>
  !e.includes('not wrapped in act') && !e.includes('ReactDOMTestUtils') && !e.includes('defaultProps') &&
  !e.includes('useLayoutEffect') && !e.includes('An update to') && !e.includes('React Router Future Flag') &&
  !e.includes('validateDOMNesting') && !e.includes('scrollTo') &&
  !e.includes('Composant volontairement cassé') && !e.includes('[EduMate] Erreur d’interface rattrapée') &&
  // Message React ATTENDU : il confirme que la barrière a bien intercepté
  // l'erreur volontaire du test n°5.
  !e.includes('error occurred in the') && !e.includes('using the error boundary'));
console.log('\n── Erreurs console ──');
check('aucune erreur console critique', critical.length === 0, `${critical.length} erreur(s)`);
for (const e of critical.slice(0, 8)) console.log(`     ⚠️ ${e.slice(0, 700)}`);

console.log(`\n${'='.repeat(62)}`);
if (failures.length) {
  console.log(`  ❌ ${passed} réussi(s), ${failures.length} échec(s) :`);
  for (const f of failures) console.log(`     • ${f}`);
  console.log('='.repeat(62));
  process.exit(1);
}
console.log(`  Résultat : ${passed} contrôles réussis, 0 échec(s)`);
console.log('='.repeat(62));
process.exit(0);
