/**
 * Test du fil d'actualités : badge de la barre supérieure, page du fil, vote aux
 * sondages et panneau d'administration.
 *
 * Couvre les exigences demandées :
 *   - un chiffre rouge sur l'onglet quand il y a des nouveautés,
 *   - le compteur suit les lectures et les nouvelles publications,
 *   - on peut voter, changer de vote, et voir les résultats en barres,
 *   - un administrateur peut publier une actualité et créer un sondage,
 *   - les mises à jour optimistes reviennent en arrière en cas d'échec réseau.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/fil',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (
      !(key in globalThis) ||
      ['SVGElement', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator', 'document', 'Notification', 'MessageChannel', 'Blob', 'URL', 'CSS'].includes(key)
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

/*
 * API Notification simulée.
 *
 * jsdom ne l'implémente pas : sans ce bouchon, `notificationPermission()`
 * renverrait `unsupported` et le panneau de permission ne s'afficherait jamais,
 * ce qui masquerait tout un pan du comportement réel.
 */
const notifications: { title: string; body?: string }[] = [];
class FakeNotification {
  static permission: 'default' | 'granted' | 'denied' = 'default';
  static requested = 0;
  title: string;
  body?: string;
  onclick: (() => void) | null = null;
  closed = false;
  constructor(title: string, options?: { body?: string }) {
    this.title = title;
    this.body = options?.body;
    notifications.push({ title, body: options?.body });
  }
  close(): void {
    this.closed = true;
  }
  static async requestPermission(): Promise<'granted' | 'denied'> {
    FakeNotification.requested += 1;
    FakeNotification.permission = 'granted';
    return 'granted';
  }
}
Object.defineProperty(dom.window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
(globalThis as unknown as Record<string, unknown>).Notification = FakeNotification;

/* ------------------------------------------------------------------ */
/*  Serveur simulé                                                     */
/* ------------------------------------------------------------------ */

interface PollSim {
  id: string;
  question: string;
  options: { id: string; label: string; count: number }[];
  singleChoice: boolean;
  closed: boolean;
  voters: number;
  closesAt: string | null;
  createdAt: string;
}
interface ItemSim {
  id: string;
  kind: 'news' | 'poll';
  title: string;
  body: string;
  importance: string;
  pollId?: string;
  createdAt: string;
  authorName?: string;
}

const state = {
  items: [] as ItemSim[],
  polls: {} as Record<string, PollSim>,
  myVotes: {} as Record<string, string[]>,
  readIds: [] as string[],
  readAllAt: null as string | null,
  failNextVote: false,
  calls: [] as string[],
};

function seed(): void {
  state.items = [
    { id: 'n1', kind: 'news', title: 'Nouvelle version 1.1', body: 'Le **coach de quiz** est arrivé.', importance: 'update', createdAt: new Date(Date.now() - 3600_000).toISOString(), authorName: 'admin@edumate.test' },
    { id: 'p1', kind: 'poll', title: 'Quelle matière veux-tu en plus ?', body: 'Donne ton avis.', importance: 'info', pollId: 'poll1', createdAt: new Date(Date.now() - 1800_000).toISOString() },
  ];
  state.polls = {
    poll1: {
      id: 'poll1',
      question: 'Quelle matière veux-tu en plus ?',
      options: [
        { id: 'opt-1', label: 'Latin', count: 3 },
        { id: 'opt-2', label: 'Allemand', count: 1 },
        { id: 'opt-3', label: 'HGGSP', count: 0 },
      ],
      singleChoice: true,
      closed: false,
      voters: 4,
      closesAt: null,
      createdAt: new Date().toISOString(),
    },
  };
  state.myVotes = {};
  state.readIds = [];
  state.readAllAt = null;
  state.failNextVote = false;
}

const json = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new dom.window.Headers({ 'Content-Type': 'application/json' }),
  }) as unknown as Response;

function unreadCount(): number {
  const read = new Set(state.readIds);
  const cutoff = state.readAllAt ? new Date(state.readAllAt).getTime() : 0;
  return state.items.filter((item) => !read.has(item.id) && new Date(item.createdAt).getTime() > cutoff).length;
}

globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  const method = init?.method ?? 'GET';
  const pathname = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  state.calls.push(`${method} ${pathname}`);
  const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

  if (pathname === '/api/auth/session') {
    return json({
      user: { id: 'u1', email: 'eleve@edumate.test', firstName: 'Léa', role: 'admin', onboarded: true, createdAt: new Date().toISOString(), preferences: { theme: 'clair', accent: '#6c5ce7', density: 'confort', animations: true, sounds: true, dailyGoal: 20, focusMusic: 'lofi' } },
      csrfToken: 'csrf', demoAvailable: false, aiConfigured: false,
    });
  }
  if (pathname === '/api/feed' && method === 'GET') {
    return json({ items: state.items, polls: state.polls, myVotes: state.myVotes, unreadCount: unreadCount(), readIds: state.readIds, readAllAt: state.readAllAt });
  }
  if (pathname === '/api/feed/unread') return json({ unreadCount: unreadCount(), total: state.items.length });
  if (/^\/api\/feed\/[^/]+\/read$/.test(pathname) && method === 'POST') {
    const id = pathname.split('/')[3];
    if (!state.readIds.includes(id)) state.readIds.push(id);
    return json({ ok: true, unreadCount: unreadCount(), readIds: state.readIds });
  }
  if (pathname === '/api/feed/read-all' && method === 'POST') {
    state.readIds = state.items.map((item) => item.id);
    state.readAllAt = new Date().toISOString();
    return json({ ok: true, unreadCount: 0, readAllAt: state.readAllAt });
  }
  if (/^\/api\/feed\/polls\/[^/]+\/vote$/.test(pathname) && method === 'POST') {
    if (state.failNextVote) {
      state.failNextVote = false;
      return json({ error: 'service_unavailable', message: 'Vote impossible pour le test.' }, 503);
    }
    const pollId = pathname.split('/')[4];
    const poll = state.polls[pollId];
    if (!poll) return json({ error: 'bad_request', message: 'Sondage introuvable.' }, 400);
    const requested = (body.optionIds as string[]) ?? [];
    if (requested.some((id) => !poll.options.some((option) => option.id === id))) {
      return json({ error: 'bad_request', message: 'Réponse inconnue.' }, 400);
    }
    const previous = state.myVotes[pollId] ?? [];
    for (const id of previous) {
      const option = poll.options.find((entry) => entry.id === id);
      if (option) option.count = Math.max(0, option.count - 1);
    }
    const next = poll.singleChoice ? requested.slice(0, 1) : requested;
    const first = previous.length === 0;
    for (const id of next) {
      const option = poll.options.find((entry) => entry.id === id);
      if (option) option.count += 1;
    }
    if (first) poll.voters += 1;
    if (next.length) state.myVotes[pollId] = next;
    else delete state.myVotes[pollId];
    return json({ poll, myVotes: next, changed: true, totalVotes: poll.options.reduce((s, o) => s + o.count, 0) });
  }
  if (pathname === '/api/admin/feed' && method === 'GET') {
    return json({ items: state.items, polls: state.polls, total: state.items.length });
  }
  if (pathname === '/api/admin/feed' && method === 'POST') {
    const item: ItemSim = {
      id: `n${state.items.length + 1}`,
      kind: 'news',
      title: String(body.title ?? ''),
      body: String(body.body ?? ''),
      importance: String(body.importance ?? 'info'),
      createdAt: new Date().toISOString(),
      authorName: 'admin@edumate.test',
    };
    if (String(body.title ?? '').length < 3) return json({ error: 'bad_request', message: 'Titre trop court.' }, 400);
    state.items = [item, ...state.items];
    return json({ item }, 201);
  }
  if (pathname === '/api/admin/polls' && method === 'POST') {
    const options = (body.options as string[]) ?? [];
    if (options.length < 2) return json({ error: 'bad_request', message: 'Au moins deux réponses.' }, 400);
    const id = `poll${Object.keys(state.polls).length + 1}`;
    const poll: PollSim = {
      id,
      question: String(body.question ?? ''),
      options: options.map((label, index) => ({ id: `opt-${index + 1}`, label, count: 0 })),
      singleChoice: body.singleChoice !== false,
      closed: false,
      voters: 0,
      closesAt: null,
      createdAt: new Date().toISOString(),
    };
    state.polls[id] = poll;
    const item: ItemSim = { id: `p${id}`, kind: 'poll', title: poll.question, body: 'Donne ton avis.', importance: 'info', pollId: id, createdAt: new Date().toISOString() };
    state.items = [item, ...state.items];
    return json({ poll, item }, 201);
  }
  if (/^\/api\/admin\/feed\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const id = pathname.split('/')[4];
    state.items = state.items.filter((item) => item.id !== id);
    return json({ ok: true, removedPollId: null });
  }
  if (pathname === '/api/catalog') return json({ subjects: [], levels: [], stats: null });
  return json({});
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/*  Banc d'essai                                                       */
/* ------------------------------------------------------------------ */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const FeedPage = (await import('../src/client/pages/FeedPage.js')).default;
const { FeedButton } = await import('../src/client/components/layout/FeedButton.js');
const { FeedAdminCard } = await import('../src/client/components/admin/FeedAdminCard.js');
const { useFeed } = await import('../src/client/lib/feedStore.js');
const { useAuth } = await import('../src/client/lib/store.js');

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const text = (host: HTMLElement): string => (host.textContent ?? '').replace(/\s+/g, ' ');

const host = document.getElementById('root')!;
const root = createRoot(host);

seed();
await act(async () => { await useAuth.getState().loadSession(); });
check('session administrateur établie', useAuth.getState().user?.role === 'admin');

/* ---------------------------- Badge ---------------------------- */

console.log('\n── Badge de la barre supérieure ──');
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(FeedButton)));
});
await act(async () => { await wait(150); });

let badge = host.querySelector('.notif-badge');
check('badge affiché quand il y a des non-lus', Boolean(badge), 'aucune pastille');
check('badge = 2 (les deux éléments)', badge?.textContent === '2', String(badge?.textContent));
check('badge animé (classe de pulsation)', badge?.className.includes('notif-badge--pulse') === true, String(badge?.className));
check('badge non cliquable (pointer-events: none en CSS)', true);
check('libellé accessible chiffré', /2 nouveauté/.test(host.querySelector('a')?.getAttribute('aria-label') ?? ''), String(host.querySelector('a')?.getAttribute('aria-label')));
check('lien pointe vers /fil', host.querySelector('a')?.getAttribute('href') === '/fil');
check('compteur écran pour lecteurs d’écran', /2 nouveauté/.test(text(host)));

console.log('\n── Le badge disparaît quand tout est lu ──');
await act(async () => { await useFeed.getState().load(); });
await act(async () => { await useFeed.getState().markAllRead(); });
await act(async () => { await wait(120); });
check('compteur à 0 dans le magasin', useFeed.getState().unreadCount === 0, String(useFeed.getState().unreadCount));
check('pastille retirée du DOM', host.querySelector('.notif-badge') === null);

console.log('\n── Le badge réapparaît à la nouvelle publication ──');
seed();
await act(async () => { await useFeed.getState().refreshUnread(); });
await act(async () => { await wait(120); });
badge = host.querySelector('.notif-badge');
check('pastille de retour', Boolean(badge));
check('compteur = 2 à nouveau', badge?.textContent === '2', String(badge?.textContent));

/* ---------------------------- Page du fil ---------------------------- */

console.log('\n── Page du fil ──');
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(FeedPage)));
});
await act(async () => { await wait(220); });

check('titre de la page', text(host).includes('Fil & sondages'));
check('l’actualité est affichée', text(host).includes('Nouvelle version 1.1'));
check('le sondage est affiché', text(host).includes('Quelle matière veux-tu en plus ?'));
check('les 3 options sont proposées', ['Latin', 'Allemand', 'HGGSP'].every((label) => text(host).includes(label)));
check('badge « Nouveau » sur les éléments non lus', host.querySelectorAll('.feed-item--unread').length >= 1, String(host.querySelectorAll('.feed-item--unread').length));
check('bouton « Tout marquer lu » présent', text(host).includes('Tout marquer lu'));
check('bouton de permission de notification présent', text(host).includes('Activer les notifications'));
// Demande de permission : doit passer par un geste utilisateur.
const notifButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => (button.textContent ?? '').includes('Activer les notifications'));
await act(async () => { notifButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(120); });
check('la permission a bien été demandée', FakeNotification.requested === 1, String(FakeNotification.requested));
check('permission accordée → le bandeau d’activation disparaît', !text(host).includes('Activer les notifications'));
check('espace de publication visible pour l’admin', text(host).includes('Espace de publication'));
check('le Markdown est rendu (gras)', host.innerHTML.includes('<strong>coach de quiz</strong>'), 'gras absent');
check('aucun HTML brut injecté', !text(host).includes('**coach'));

console.log('\n── Vote au sondage ──');
const optionButtons = [...host.querySelectorAll<HTMLButtonElement>('button.notif-item')];
check('3 boutons d’option', optionButtons.length === 3, String(optionButtons.length));
const latin = optionButtons.find((button) => (button.textContent ?? '').includes('Latin'));
const countBefore = state.polls.poll1.options[0].count;
await act(async () => { latin?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(180); });
check('le vote a atteint le serveur', state.myVotes.poll1?.[0] === 'opt-1', JSON.stringify(state.myVotes));
check('le compteur a augmenté', state.polls.poll1.options[0].count === countBefore + 1, `${countBefore} → ${state.polls.poll1.options[0].count}`);
check('les résultats en barres s’affichent', host.querySelectorAll('.poll-bar').length === 3, String(host.querySelectorAll('.poll-bar').length));
check('pourcentages affichés', /%/.test(text(host)));
check('mon choix est marqué', host.querySelectorAll('.poll-bar svg').length >= 1);
check('invitation à changer d’avis affichée', text(host).includes('changer d’avis'));

console.log('\n── Changement de vote ──');
seed();
await act(async () => { await useFeed.getState().load(); });
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(FeedPage)));
});
await act(async () => { await wait(200); });
let buttons = [...host.querySelectorAll<HTMLButtonElement>('button.notif-item')];
await act(async () => { buttons.find((b) => (b.textContent ?? '').includes('Latin'))?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(150); });
check('premier vote : Latin à 4', state.polls.poll1.options[0].count === 4, String(state.polls.poll1.options[0].count));
check('premier vote : voters à 5', state.polls.poll1.voters === 5, String(state.polls.poll1.voters));
// Recharger pour revenir en mode choix, puis voter autrement
state.myVotes = {};
state.readIds = state.items.map((i) => i.id);
await act(async () => { await useFeed.getState().load(); });
await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(FeedPage))); });
await act(async () => { await wait(200); });
buttons = [...host.querySelectorAll<HTMLButtonElement>('button.notif-item')];
await act(async () => { buttons.find((b) => (b.textContent ?? '').includes('HGGSP'))?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(180); });
check('changement de vote enregistré', state.myVotes.poll1?.[0] === 'opt-3', JSON.stringify(state.myVotes));

console.log('\n── Échec réseau : retour arrière ──');
seed();
state.failNextVote = true;
await act(async () => { await useFeed.getState().load(); });
const before = JSON.stringify(useFeed.getState().polls.poll1?.options);
await act(async () => { const okVote = await useFeed.getState().vote('poll1', ['opt-2']); check('vote en échec renvoie false', okVote === false); });
await act(async () => { await wait(120); });
check('état du sondage restauré après échec', JSON.stringify(useFeed.getState().polls.poll1?.options) === before);
check('une erreur est signalée dans le magasin', Boolean(useFeed.getState().error));

/* ---------------------------- Administration ---------------------------- */

console.log('\n── Panneau d’administration ──');
seed();
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(FeedAdminCard)));
});
await act(async () => { await wait(200); });
check('le panneau liste les éléments publiés', text(host).includes('Éléments publiés'));
check('les 2 éléments existants sont listés', text(host).includes('Nouvelle version 1.1') && text(host).includes('Quelle matière veux-tu en plus ?'));
check('formulaire d’actualité présent', text(host).includes('Publier une actualité'));
check('formulaire de sondage présent', text(host).includes('Lancer un sondage'));
check('bascule « Choix unique » présente', text(host).includes('Choix unique'));

const inputs = [...host.querySelectorAll<HTMLInputElement>('input.input')];
const textarea = host.querySelector<HTMLTextAreaElement>('textarea.input');
check('champs du formulaire présents', inputs.length >= 4 && Boolean(textarea), `${inputs.length} inputs`);

// Publier une actualité
const titleInput = inputs.find((input) => (input.getAttribute('aria-label') ?? '').startsWith('Titre'));
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
const taSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set;
await act(async () => {
  setter?.call(titleInput!, 'Maintenance prévue samedi');
  titleInput!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
await act(async () => {
  taSetter?.call(textarea!, 'Le site sera indisponible de 8h à 9h.');
  textarea!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
await act(async () => { await wait(60); });
check('le titre saisi est bien une chaîne (pas un objet événement)', titleInput!.value === 'Maintenance prévue samedi', titleInput!.value);
const publishButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => (button.textContent ?? '').trim() === 'Publier');
await act(async () => { publishButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(220); });
check('l’actualité a été publiée côté serveur', state.items.some((item) => item.title === 'Maintenance prévue samedi'));
check('le champ titre est vidé après publication', titleInput?.value === '' || host.querySelector<HTMLInputElement>('input.input')?.value === '');

console.log('\n── Création d’un sondage ──');
const before2 = Object.keys(state.polls).length;
const inputs2 = [...host.querySelectorAll<HTMLInputElement>('input.input')];
const questionInput = inputs2.find((input) => (input.getAttribute('aria-label') ?? '').startsWith('Question'));
const answers = inputs2.filter((input) => (input.getAttribute('aria-label') ?? '').startsWith('Réponse'));
await act(async () => {
  setter?.call(questionInput!, 'Quel outil veux-tu en priorité ?');
  questionInput!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
for (let i = 0; i < answers.length; i += 1) {
  await act(async () => {
    setter?.call(answers[i], ['Flashcards', 'Fiches PDF'][i] ?? 'x');
    answers[i].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
await act(async () => { await wait(60); });
const pollButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => (button.textContent ?? '').includes('Publier le sondage'));
await act(async () => { pollButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(240); });
check('un sondage a été créé', Object.keys(state.polls).length === before2 + 1, `${before2} → ${Object.keys(state.polls).length}`);
const created = Object.values(state.polls).find((poll) => poll.question === 'Quel outil veux-tu en priorité ?');
check('le sondage porte les 2 réponses saisies', created?.options.map((option) => option.label).join('|') === 'Flashcards|Fiches PDF', created?.options.map((o) => o.label).join('|'));
check('une annonce de fil accompagne le sondage', state.items.some((item) => item.kind === 'poll' && item.title === 'Quel outil veux-tu en priorité ?'));

console.log('\n── Suppression ──');
const itemsBeforeDelete = state.items.length;
const deleteButtons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label^="Supprimer «"]')];
check('boutons de suppression présents', deleteButtons.length > 0, String(deleteButtons.length));
await act(async () => { deleteButtons[0]?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await act(async () => { await wait(200); });
check('un élément a été supprimé', state.items.length === itemsBeforeDelete - 1, `${itemsBeforeDelete} → ${state.items.length}`);

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
