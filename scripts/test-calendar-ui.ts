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

console.log('\n── Vue Mois (par défaut) ──');
await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(CalendarToolPage))); });
await act(async () => { await wait(300); });

const cells = host.querySelectorAll('.calendar__cell');
check('42 cases dans la grille mensuelle', cells.length === 42, String(cells.length));
check('7 en-têtes de jour', host.querySelectorAll('.calendar__dow').length === 7);
check('la grille commence par « Lun »', host.querySelector('.calendar__dow')?.textContent === 'Lun', String(host.querySelector('.calendar__dow')?.textContent));
check(`le mois courant est affiché (${THIS_MONTH})`, new RegExp(THIS_MONTH, 'i').test(host.querySelector('.cal-toolbar__title')?.textContent ?? ''), String(host.querySelector('.cal-toolbar__title')?.textContent));
check('le jour courant est marqué', host.querySelectorAll('.calendar__cell--today').length === 1);
check('les événements apparaissent en pastilles', host.querySelectorAll('.calendar__chip').length >= 3, String(host.querySelectorAll('.calendar__chip').length));
check('le titre d’un événement est lisible', text().includes('Contrôle de maths'));
check('les statistiques sont affichées', text().includes('En retard') && text().includes('Aujourd’hui'));
check('les retards sont signalés', /échéance(?:s)? dépassée/.test(text()) || text().includes('En retard'), text().slice(0, 100));
check('les 3 vues sont proposées', ['Mois', 'Semaine', 'Agenda'].every((label) => byText('button', label) !== undefined));
check('les raccourcis sont documentés', text().includes('Raccourcis'));

console.log('\n── Sélection d’un jour ──');
const todayCell = host.querySelector('.calendar__cell--today');
await click(todayCell);
check('le panneau du jour s’ouvre sur « Aujourd’hui »', /Aujourd’hui · /.test(text()), text().slice(0, 200));
check('la case est marquée sélectionnée', host.querySelectorAll('.calendar__cell--selected').length === 1);
check('l’événement du jour y figure', text().includes('Contrôle de maths'));
check('le numéro de semaine est affiché', /semaine \d+/.test(text()));

console.log('\n── Compte à rebours ──');
check('« Aujourd’hui » pour l’échéance du jour', text().includes('Aujourd’hui'));
check('« Demain » pour J+1', text().includes('Demain'));
/*
 * L'étiquette de l'échéance du jour dépend de l'heure réelle d'exécution
 * (« dans 36 min » à 13 h 24, « Il y a 2 h » à 16 h). On la calcule donc avec la
 * fonction de production elle-même : le test vérifie l'intégration, pas une
 * valeur figée qui deviendrait fausse selon l'heure du jour.
 */
const CAL = await import('../src/client/lib/calendar.js');
const todayEvent = serverEvents.find((event) => event.date === iso(0)) as never;
const expectedToday = CAL.countdownLabel(todayEvent, new Date());
check(
  `compte à rebours du jour correct (« ${expectedToday} »)`,
  text().includes(expectedToday),
  `attendu « ${expectedToday} », absent de la page`,
);
check(
  'un compte à rebours horaire ou minuté est affiché',
  /(?:dans \d+ (?:h|min)|Maintenant|Il y a \d+ (?:h|min))/.test(text()),
  text().match(/(?:dans|Il y a) [^·]{1,12}/g)?.slice(0, 4).join(' | ') ?? '',
);
check('retard signalé', /Retard de \d+ j/.test(text()), text().match(/Retard de \d+ j/)?.[0] ?? '');
check('événement terminé marqué', text().includes('Terminé'));
check('échéance lointaine exprimée en semaines ou mois', /dans (?:\d+ sem\.|\d+ mois|1 semaine)/.test(text()), text().match(/dans [^·]{1,14}/g)?.slice(0, 4).join(' | ') ?? '');

console.log('\n── Navigation ──');
const monthTitleBefore = host.querySelector('.cal-toolbar__title')?.textContent ?? '';
await click(byLabel('Mois suivant'));
check('mois suivant atteint', (host.querySelector('.cal-toolbar__title')?.textContent ?? '') !== monthTitleBefore, `${monthTitleBefore} → ${host.querySelector('.cal-toolbar__title')?.textContent}`);
const nextMonth = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1);
check(`mois suivant affiché (${MONTH_NAMES[nextMonth.getMonth()]})`, new RegExp(MONTH_NAMES[nextMonth.getMonth()], 'i').test(host.querySelector('.cal-toolbar__title')?.textContent ?? ''), String(host.querySelector('.cal-toolbar__title')?.textContent));
await click(byLabel('Mois précédent'));
check('retour au mois initial', new RegExp(THIS_MONTH, 'i').test(host.querySelector('.cal-toolbar__title')?.textContent ?? ''), String(host.querySelector('.cal-toolbar__title')?.textContent));
await click(byText('button', 'Aujourd’hui'));
check('« Aujourd’hui » ramène au jour courant', host.querySelectorAll('.calendar__cell--today').length === 1);

console.log('\n── Vue Semaine ──');
await click(byText('button', 'Semaine'));
check('7 colonnes hebdomadaires', host.querySelectorAll('.cal-week__col').length === 7, String(host.querySelectorAll('.cal-week__col').length));
check('la colonne du jour est marquée', host.querySelectorAll('.cal-week__col--today').length === 1);
check('le numéro de semaine apparaît', /S\d+/.test(text()));
check('les événements de la semaine sont visibles', host.querySelectorAll('.cal-week__event').length >= 2, String(host.querySelectorAll('.cal-week__event').length));
check('les cases à cocher sont présentes', host.querySelectorAll('.cal-week__check').length >= 2);

console.log('\n── Vue Agenda ──');
await click(byText('button', 'Agenda'));
check('les en-têtes de jour sont groupés', host.querySelectorAll('.cal-agenda__head').length >= 3, String(host.querySelectorAll('.cal-agenda__head').length));
check('les étiquettes d’urgence sont présentes', host.querySelectorAll('.cal-chip').length >= 3);
check('le libellé long du jour est affiché', /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} /.test(text()), text().match(/(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} [a-zéûôî]+/)?.[0] ?? '');
check('les boutons d’action sont là', host.querySelectorAll('button[aria-label^="Modifier «"]').length >= 3);
check('dupliquer est proposé', host.querySelectorAll('button[aria-label^="Dupliquer «"]').length >= 3);

console.log('\n── Filtres et recherche ──');
await click(byText('button', 'Mois'));
await click(byText('button.pill', 'Examen'));
check('masquer « Examen » retire l’événement', !text().includes('Contrôle de maths'));
check('les autres événements restent', text().includes('Devoir d’histoire'));
await click(byText('button.pill', 'Examen'));
check('réafficher « Examen » le restaure', text().includes('Contrôle de maths'));

await click(byLabel('Rechercher'));
const search = host.querySelector<HTMLInputElement>('input[aria-label="Rechercher un événement"]');
check('le champ de recherche apparaît', Boolean(search));
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
await act(async () => { setter?.call(search!, 'histoire'); search!.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
await act(async () => { await wait(420); });
check('la recherche filtre les événements', text().includes('1 résultat'), text().match(/\d+ résultat/)?.[0] ?? '');
check('seul l’événement trouvé subsiste', text().includes('Devoir d’histoire') && !text().includes('Exposé de SVT'));
await act(async () => { setter?.call(search!, ''); search!.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
await act(async () => { await wait(100); });
check('vider la recherche restaure tout', text().includes('Exposé de SVT'));

console.log('\n── Création d’un événement ──');
const before = serverEvents.length;
await click(byText('button', 'Nouvel événement'));
// La modale est rendue dans un portail (document.body), hors de #root.
check('la modale s’ouvre', Boolean(document.querySelector('.modal')));
check('le sélecteur de type est affiché', document.querySelectorAll('.cal-kind').length === 4, String(document.querySelectorAll('.cal-kind').length));
check('la matière est proposée en NOM (pas en identifiant)', (document.querySelector('.modal')?.textContent ?? '').includes('Mathématiques'), 'Mathématiques introuvable dans la modale');
check('le jour et la semaine sont rappelés dans la modale', /semaine \d+/.test(document.querySelector('.modal')?.textContent ?? ''));

const titleInput = document.querySelector<HTMLInputElement>('input[aria-label="Titre de l’événement"]');
const taSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set;
// Validation : titre vide refusé
await click(document.querySelector('.modal') ? byTextIn(document.querySelector('.modal') as HTMLElement, 'button', 'Ajouter') : null);
check('titre vide refusé côté client', (document.querySelector('.modal')?.textContent ?? '').includes('Donne un titre'));
await act(async () => { setter?.call(titleInput!, 'Rattrapage de physique'); titleInput!.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
await act(async () => { await wait(60); });
check('le titre saisi est une chaîne (pas un objet événement)', titleInput!.value === 'Rattrapage de physique', titleInput!.value);
await click(byTextIn(document.querySelector('.modal') as HTMLElement, '.cal-kind', 'Examen'));
check('le type « Examen » devient actif', document.querySelector('.cal-kind--active')?.textContent?.includes('Examen') === true);
await click(document.querySelector('.modal') ? byTextIn(document.querySelector('.modal') as HTMLElement, 'button', 'Ajouter') : null);
check('l’événement est créé côté serveur', serverEvents.length === before + 1, `${before} → ${serverEvents.length}`);
check('l’événement créé porte le bon type', serverEvents[serverEvents.length - 1].kind === 'examen', String(serverEvents[serverEvents.length - 1].kind));
check('la modale se ferme après création', document.querySelector('.modal') === null);

console.log('\n── Marquer comme terminé ──');
const target = serverEvents.find((event) => event.title === 'Devoir d’histoire');
const row = [...host.querySelectorAll<HTMLButtonElement>('button.check-dot')].find((button) => (button.getAttribute('aria-label') ?? '').includes('Devoir d’histoire'));
check('la case à cocher de l’événement est trouvée', Boolean(row), 'aucune case trouvée');
await click(row);
await act(async () => { await wait(150); });
check('l’état « terminé » est enregistré côté serveur', serverEvents.find((event) => event.id === target?.id)?.done === true);

console.log('\n── Raccourcis clavier ──');
await key('2');
check('« 2 » bascule sur la vue Semaine', host.querySelectorAll('.cal-week__col').length === 7);
await key('3');
check('« 3 » bascule sur la vue Agenda', host.querySelectorAll('.cal-agenda__head').length >= 1);
await key('1');
check('« 1 » revient à la vue Mois', host.querySelectorAll('.calendar__cell').length === 42);
const monthBeforeKeys = host.querySelector('.cal-toolbar__title')?.textContent ?? '';
await key('ArrowRight');
check('flèche droite : mois suivant', (host.querySelector('.cal-toolbar__title')?.textContent ?? '') !== monthBeforeKeys);
await key('ArrowLeft');
check('flèche gauche : retour', (host.querySelector('.cal-toolbar__title')?.textContent ?? '') === monthBeforeKeys);
await key('t');
check('« T » revient à aujourd’hui', host.querySelectorAll('.calendar__cell--today').length === 1);
await key('/');
check('« / » ouvre la recherche', Boolean(host.querySelector('input[aria-label="Rechercher un événement"]')));
await key('Escape');
check('Échap ferme la recherche', host.querySelector('input[aria-label="Rechercher un événement"]') === null);

console.log('\n── Export .ics ──');
let downloaded: { name: string; size: number } | null = null;
const realCreate = dom.window.URL.createObjectURL;
Object.defineProperty(dom.window.URL, 'createObjectURL', { configurable: true, value: () => 'blob:fake' });
Object.defineProperty(dom.window.URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
Object.defineProperty(dom.window.HTMLAnchorElement.prototype, 'click', {
  configurable: true,
  value() { downloaded = { name: String(this.download ?? ''), size: 0 }; },
});
await click(byLabel('Exporter au format .ics'));
check('un fichier .ics est proposé au téléchargement', Boolean(downloaded) && String(downloaded?.name).endsWith('.ics'), JSON.stringify(downloaded));

console.log('\n── Suppression ──');
const countBeforeDelete = serverEvents.length;
const deleteButton = host.querySelector('button[aria-label^="Supprimer «"]');
await click(deleteButton);
check('une modale de confirmation s’ouvre', (document.querySelector('.modal')?.textContent ?? '').includes('Supprimer cet événement ?'));
await click(document.querySelector('.modal') ? byTextIn(document.querySelector('.modal') as HTMLElement, 'button', 'Supprimer') : null);
await act(async () => { await wait(150); });
check('l’événement est supprimé côté serveur', serverEvents.length === countBeforeDelete - 1, `${countBeforeDelete} → ${serverEvents.length}`);

/* ------------------------------------------------------------------ */
/*  Tableau de bord : bloc « À venir »                                 */
/* ------------------------------------------------------------------ */

console.log('\n── Tableau de bord : bloc « À venir » ──');
serverEvents = JSON.parse(JSON.stringify(EVENTS));
const DashboardPage = (await import('../src/client/pages/DashboardPage.js')).default;
const dashHost = document.createElement('div');
document.body.appendChild(dashHost);
const dashRoot = createRoot(dashHost);
await act(async () => {
  dashRoot.render(React.createElement(MemoryRouter, null, React.createElement(DashboardPage)));
});
await act(async () => { await wait(420); });

const dashText = (dashHost.textContent ?? '').replace(/\s+/g, ' ');
const rows = [...dashHost.querySelectorAll<HTMLElement>('.dash-event')];

check('le bloc affiche des échéances', rows.length > 0, String(rows.length));
check('au maximum 5 échéances (encombrement inchangé)', rows.length <= 5, String(rows.length));
check(
  'les RETARDS passent en premier',
  rows.length > 0 && /Retard de \d+ j/.test(rows[0].textContent ?? ''),
  rows[0]?.textContent?.replace(/\s+/g, ' ').slice(0, 90) ?? '',
);
check(
  'l’événement en retard concerné est bien celui de J-4',
  (rows[0]?.textContent ?? '').includes('Fiche de révision oubliée'),
  rows[0]?.textContent ?? '',
);
check('un compte à rebours est affiché sur chaque ligne', rows.every((row) => Boolean(row.querySelector('.dash-event__when'))));
check(
  'le NOM de la matière remplace l’identifiant technique',
  dashText.includes('Mathématiques') && !/·\s*mathematiques/.test(dashText),
  dashText.match(/mathematiques/)?.[0] ?? 'ok',
);
check('l’emoji de la matière est affiché', dashText.includes('📐'));
check('une action « terminer » est présente sur chaque ligne', rows.every((row) => row.querySelector('button[aria-label^="Marquer «"]')));
check('la couleur d’urgence est appliquée', rows.every((row) => (row.getAttribute('style') ?? '').includes('border-left-color')));

// Passage d'une échéance en « terminé »
const doneBefore = serverEvents.filter((event) => event.done).length;
const completeButton = rows[0].querySelector<HTMLButtonElement>('button[aria-label^="Marquer «"]');
await act(async () => { completeButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(380); });
check('l’action « terminer » atteint le serveur', serverEvents.filter((event) => event.done).length === doneBefore + 1, `${doneBefore} → ${serverEvents.filter((event) => event.done).length}`);
check('l’événement terminé quitte la liste', !(dashHost.textContent ?? '').includes('Fiche de révision oubliée'));

console.log(`\n${'='.repeat(62)}`);
if (failures.length) {
  console.log(`  ❌ ${passed} réussi(s), ${failures.length} échec(s) :`);
  for (const failure of failures) console.log(`     • ${failure}`);
  console.log('='.repeat(62));
  process.exit(1);
}
console.log(`  Résultat : ${passed} contrôles réussis, 0 échec(s)`);
console.log('='.repeat(62));
void realCreate;
process.exit(0);
