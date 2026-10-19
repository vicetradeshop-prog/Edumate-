/**
 * Test du comportement PWA côté application (`src/client/lib/pwa.ts`) et du
 * chargement de session tolérant au serveur froid (`src/client/lib/store.ts`).
 *
 * Le second point est le plus important des deux : avant ce correctif, un
 * conteneur Render endormi faisait échouer `/api/auth/session`, et l'échec était
 * interprété comme une déconnexion. L'élève arrivait sur la page d'accueil
 * **alors que son cookie de session était toujours valide** — le plus trompeur
 * des comportements possibles.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'https://edumate.test/tableau-de-bord',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (
      !(key in globalThis) ||
      ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MessageChannel', 'getComputedStyle', 'navigator', 'document', 'localStorage'].includes(key)
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
// Contexte sécurisé simulé : l'enregistrement du service worker est alors permis.
Object.defineProperty(globalThis.window, 'isSecureContext', { value: true, configurable: true });

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

/* ------------------------------------------------------------------ */
/*  Réseau simulé                                                      */
/* ------------------------------------------------------------------ */

type Responder = (url: string, init?: RequestInit) => Promise<Response>;
let responder: Responder;
const requestLog: string[] = [];

const json = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new dom.window.Headers({ 'Content-Type': 'application/json' }),
  }) as unknown as Response;

/** Simule un serveur injoignable (conteneur endormi, réseau coupé). */
const unreachable: Responder = async () => {
  throw new TypeError('Failed to fetch');
};

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  requestLog.push(url);
  return responder(url, init);
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/*  Service worker simulé (installé avant l'import : `detectSupport()`   */
/*  lit `navigator.serviceWorker` à la demande)                        */
/* ------------------------------------------------------------------ */

let registeredScope: string | null = null;
let registeredOptions: Record<string, unknown> | null = null;
let registeredUrl: string | null = null;

class FakeServiceWorker {
  state = 'installed';
  private readonly listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }
  postMessage(): void {
    /* sans objet */
  }
  fire(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }
}

const fakeWorker = new FakeServiceWorker();
const fakeRegistration = {
  active: fakeWorker,
  /*
   * `installing` renseigné : c'est ce qui déclenche `trackWorker()` dans
   * `attachUpdateDetection()`. Avec `null`, aucun écouteur d'état n'était branché
   * et le test ne pouvait pas observer la transition installed → activated.
   */
  installing: fakeWorker,
  waiting: null,
  scope: '/',
  async update(): Promise<void> {
    /* vérification de mise à jour */
  },
  async unregister(): Promise<boolean> {
    return true;
  },
  addEventListener(): void {
    /* sans objet */
  },
};

Object.defineProperty(dom.window.navigator, 'serviceWorker', {
  configurable: true,
  value: {
    controller: fakeWorker,
    async register(url: string, options?: { scope?: string }) {
      registeredUrl = url;
      registeredScope = options?.scope ?? null;
      return fakeRegistration;
    },
    addEventListener(): void {
      /* sans objet */
    },
  },
});


const pwa = await import('../src/client/lib/pwa.js');

/* ------------------------------------------------------------------ */
/*  1. Utilitaires purs                                                */
/* ------------------------------------------------------------------ */

console.log('\n── formatBytes ──');
check('0 octet', pwa.formatBytes(0) === '0 o', pwa.formatBytes(0));
check('octets', pwa.formatBytes(512) === '512 o', pwa.formatBytes(512));
check('kibioctets (séparateur français)', pwa.formatBytes(2048) === '2,0 Kio', pwa.formatBytes(2048));
check('mébioctets (séparateur français)', pwa.formatBytes(5 * 1024 * 1024) === '5,0 Mio', pwa.formatBytes(5 * 1024 * 1024));
check('valeur aberrante', pwa.formatBytes(Number.NaN) === '0 o', pwa.formatBytes(Number.NaN));
check('valeur négative', pwa.formatBytes(-10) === '0 o', pwa.formatBytes(-10));

/* ------------------------------------------------------------------ */
/*  2. État initial et préférence de maintien éveillé                  */
/* ------------------------------------------------------------------ */

console.log('\n── État PWA ──');
const initial = pwa.getPwaState();
check('service worker détecté comme pris en charge', initial.supported === true);
check('aucune mise à jour en attente au départ', initial.updateReady === false);
check('maintien éveillé activé par défaut', initial.keepAlive === true, String(initial.keepAlive));

let notifications = 0;
const unsubscribe = pwa.onPwaStateChange(() => {
  notifications += 1;
});

console.log('\n── Maintien éveillé ──');
responder = async (url) => (url.includes('/api/health') ? json({ ok: true, database: 'upstash' }) : json({}));
requestLog.length = 0;

pwa.startKeepAlive();
check('premier ping au démarrage du maintien éveillé', requestLog.filter((u) => u.includes('/api/health')).length === 0, 'aucun ping immédiat attendu');
pwa.wakeUpNow();
await wait(30);
check('wakeUpNow déclenche un ping', requestLog.filter((u) => u.includes('/api/health')).length >= 1, requestLog.join(', '));
check('l’état reste « en ligne »', pwa.getPwaState().offline === false);

// Un ping ne doit pas être dupliqué s'il est déjà en vol.
requestLog.length = 0;
responder = async () => {
  await wait(60);
  return json({ ok: true });
};
pwa.wakeUpNow();
pwa.wakeUpNow();
pwa.wakeUpNow();
await wait(120);
check('pings concurrents fusionnés (un seul appel réseau)', requestLog.length === 1, `${requestLog.length} appels`);

console.log('\n── Serveur injoignable ──');
responder = unreachable;
pwa.wakeUpNow();
await wait(60);
check('état « hors ligne » détecté', pwa.getPwaState().offline === true);
check('aucune exception ne fuit du ping', true);

console.log('\n── Désactivation du maintien éveillé ──');
pwa.setKeepAlive(false);
check('préférence désactivée', pwa.getPwaState().keepAlive === false);
check('préférence mémorisée en localStorage', dom.window.localStorage.getItem('edumate:keepAwake') === '0');
requestLog.length = 0;
responder = async () => json({ ok: true });
pwa.wakeUpNow();
await wait(40);
check('wakeUpNow inactif une fois désactivé', requestLog.length === 0, requestLog.join(', '));
pwa.setKeepAlive(true);
check('réactivation possible', pwa.getPwaState().keepAlive === true);
check('réactivation mémorisée', dom.window.localStorage.getItem('edumate:keepAwake') === '1');
pwa.stopKeepAlive();

/* ------------------------------------------------------------------ */
/*  3. Enregistrement du service worker                                */
/* ------------------------------------------------------------------ */

console.log('\n── Enregistrement ──');
await pwa.registerServiceWorker();
await wait(20);
check('service worker enregistré sur /sw.js', registeredUrl === '/sw.js', String(registeredUrl));
check('portée racine', registeredScope === '/', String(registeredScope));
check('état actif reflété', pwa.getPwaState().active === true);
check('aucune erreur d’enregistrement', pwa.getPwaState().error === null, String(pwa.getPwaState().error));

console.log('\n── Détection de mise à jour ──');
// `controller` présent + worker `installed` = une version remplace l'actuelle.
fakeWorker.state = 'installed';
check('aucune mise à jour signalée sans événement', pwa.getPwaState().updateReady === false);

/*
 * 🔴 Régression : avec `skipWaiting()`, le worker passe de `installed` à
 * `activated` en quelques millisecondes. Si l'activation réinitialisait
 * `updateReady`, le bandeau « Nouvelle version disponible » clignotait sans
 * jamais être vu — et la page continuait d'exécuter l'ancien code.
 * Le drapeau doit donc rester à true jusqu'au rechargement.
 */
fakeWorker.fire('statechange');
check('worker « installed » → mise à jour signalée', pwa.getPwaState().updateReady === true);
fakeWorker.state = 'activated';
fakeWorker.fire('statechange');
check('l’activation ne masque PAS l’invite de rechargement', pwa.getPwaState().updateReady === true, String(pwa.getPwaState().updateReady));
check('le service worker est bien marqué actif', pwa.getPwaState().active === true);

console.log('\n── Message SW_UPDATED du service worker ──');
// Le SW prévient la page quand il détecte un HTML différent en revalidation.
let messageHandler: ((event: MessageEvent) => void) | null = null;
Object.defineProperty(dom.window.navigator, 'serviceWorker', {
  configurable: true,
  value: {
    controller: fakeWorker,
    async register(url: string, options?: Record<string, unknown>) {
      registeredUrl = url;
      registeredScope = String(options?.scope ?? '');
      registeredOptions = options ?? {};
      return fakeRegistration;
    },
    addEventListener(type: string, handler: (event: MessageEvent) => void) {
      if (type === 'message') messageHandler = handler;
    },
  },
});
await pwa.registerServiceWorker();
await wait(20);
check('écouteur de messages installé', messageHandler !== null);
check(
  'enregistrement avec updateViaCache: none (sinon mise à jour différée de 24 h)',
  String((registeredOptions as Record<string, unknown>)?.updateViaCache) === 'none',
  JSON.stringify(registeredOptions),
);
// Remise à zéro du drapeau pour tester le message isolément.
pwa.getPwaState();
if (messageHandler) {
  const event = { data: { type: 'SW_UPDATED', version: 'v2' } } as unknown as MessageEvent;
  messageHandler(event);
  check('SW_UPDATED → invite de rechargement affichée', pwa.getPwaState().updateReady === true);
  const other = { data: { type: 'AUTRE_CHOSE' } } as unknown as MessageEvent;
  messageHandler(other);
  check('message inconnu ignoré sans exception', true);
  const invalid = { data: null } as unknown as MessageEvent;
  messageHandler(invalid);
  check('message nul ignoré sans exception', true);
}

console.log('\n── Nettoyage ──');
const cleared = await pwa.clearPwaCaches();
check('clearPwaCaches réussit', cleared === true);
check('état désactivé après nettoyage', pwa.getPwaState().active === false);
check('maintien éveillé coupé après nettoyage', pwa.getPwaState().keepAlive === false);
unsubscribe();
check('les changements d’état ont bien été notifiés', notifications > 0, String(notifications));

/* ------------------------------------------------------------------ */
/*  4. Chargement de session tolérant au serveur froid                 */
/* ------------------------------------------------------------------ */

const store = await import('../src/client/lib/store.js');

const SESSION_USER = {
  id: 'u-1',
  email: 'eleve@edumate.test',
  firstName: 'Léa',
  role: 'eleve',
  onboarded: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'clair', accent: '#6c5ce7', density: 'confort', animations: true, sounds: true, dailyGoal: 20, focusMusic: 'lofi' },
};

console.log('\n── Serveur froid : les nouvelles tentatives aboutissent ──');
let sessionCalls = 0;
store.useAuth.setState({ user: null, status: 'loading', waking: false, sessionAttempts: 0 });
responder = async (url) => {
  if (!url.includes('/api/auth/session')) return json({});
  sessionCalls += 1;
  // Les deux premiers appels échouent (conteneur en train de se réveiller).
  if (sessionCalls <= 2) throw new TypeError('Failed to fetch');
  return json({ user: SESSION_USER, csrfToken: 'jeton-csrf-de-test', demoAvailable: false, aiConfigured: true });
};

const loadPromise = store.useAuth.getState().loadSession();
await wait(400);
const midState = store.useAuth.getState();
check('statut reste « loading » pendant le réveil', midState.status === 'loading', midState.status);
check('indicateur « waking » activé', midState.waking === true, String(midState.waking));
check('l’élève n’est PAS passé en anonyme', midState.status !== 'anonymous');

await loadPromise;
const after = store.useAuth.getState();
check('session finalement établie', after.status === 'authenticated', after.status);
check('utilisateur chargé', after.user?.firstName === 'Léa', String(after.user?.firstName));
check('jeton CSRF enregistré', after.waking === false);
check('indicateur « waking » désactivé après succès', after.waking === false);
check('trois appels ont été nécessaires', sessionCalls === 3, String(sessionCalls));

console.log('\n── Réponse 401 : aucune nouvelle tentative ──');
sessionCalls = 0;
store.useAuth.setState({ user: SESSION_USER as never, status: 'authenticated', waking: false, sessionAttempts: 0 });
responder = async (url) => {
  if (!url.includes('/api/auth/session')) return json({});
  sessionCalls += 1;
  return json({ error: 'unauthorized', message: 'Session expirée.' }, 401);
};
await store.useAuth.getState().loadSession();
const unauthorizedState = store.useAuth.getState();
check('un seul appel (pas d’insistance inutile)', sessionCalls === 1, String(sessionCalls));
check('bascule immédiate en anonyme', unauthorizedState.status === 'anonymous', unauthorizedState.status);
check('utilisateur vidé', unauthorizedState.user === null);
check('waking désactivé', unauthorizedState.waking === false);

console.log('\n── Serveur en 503 pendant le réveil ──');
sessionCalls = 0;
store.useAuth.setState({ user: null, status: 'loading', waking: false, sessionAttempts: 0 });
responder = async (url) => {
  if (!url.includes('/api/auth/session')) return json({});
  sessionCalls += 1;
  if (sessionCalls === 1) return json({ error: 'service_unavailable', message: 'Redémarrage.' }, 503);
  return json({ user: SESSION_USER, csrfToken: 'jeton', demoAvailable: false });
};
await store.useAuth.getState().loadSession();
check('un 503 déclenche une nouvelle tentative', sessionCalls === 2, String(sessionCalls));
check('session établie après le 503', store.useAuth.getState().status === 'authenticated', store.useAuth.getState().status);

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
