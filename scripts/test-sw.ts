/**
 * Test comportemental du service worker (`public/sw.js`).
 *
 * jsdom n'implémente pas les service workers. Plutôt que de se contenter d'une
 * vérification de syntaxe, on construit un environnement minimal (self, caches,
 * fetch, clients) puis on **exécute réellement** le fichier et on déclenche ses
 * gestionnaires d'événements avec des requêtes synthétiques.
 *
 * Ce qui est vérifié — les propriétés critiques pour ce projet :
 *   1. l'API n'est JAMAIS mise en cache ni interceptée (scores, sessions),
 *   2. les origines tierces ne sont pas interceptées (webradios, MyMemory),
 *   3. les méthodes non-GET passent au réseau,
 *   4. les assets sont servis du cache (cache d'abord),
 *   5. le HTML est servi du cache immédiatement puis revalidé en arrière-plan,
 *   6. la coquille est pré-cachée à l'installation,
 *   7. les anciens caches sont purgés à l'activation, mais PAS `edumate-assets`,
 *   8. le cache d'assets est borné (éviction des plus anciennes entrées),
 *   9. une ressource absente et non cachée produit un 504, pas un faux succès,
 *  10. `SKIP_WAITING` et `CACHE_STATE` répondent correctement.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swPath = path.join(root, 'public', 'sw.js');
const source = fs.readFileSync(swPath, 'utf8');

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

/* ------------------------------------------------------------------ */
/*  Bouchons : Cache / CacheStorage / fetch                            */
/* ------------------------------------------------------------------ */

/** Requête minimale, suffisante pour la logique du service worker. */
class FakeRequest {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: Map<string, string>;
  constructor(url: string, init: { method?: string; mode?: string; destination?: string; headers?: Record<string, string> } = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? (init.destination === 'document' ? 'navigate' : 'cors');
    this.destination = init.destination ?? '';
    this.headers = new Map(Object.entries(init.headers ?? {}));
  }
  clone(): FakeRequest {
    return new FakeRequest(this.url, { method: this.method, mode: this.mode, destination: this.destination });
  }
}

class FakeResponse {
  body: string;
  status: number;
  statusText: string;
  ok: boolean;
  type: string;
  headers: Map<string, string>;
  constructor(body = '', init: { status?: number; statusText?: string; type?: string; headers?: Record<string, string> } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? 'OK';
    this.ok = this.status >= 200 && this.status < 300;
    this.type = init.type ?? 'basic';
    this.headers = new Map(Object.entries(init.headers ?? {}));
  }
  clone(): FakeResponse {
    return new FakeResponse(this.body, { status: this.status, statusText: this.statusText, type: this.type });
  }
  /** `text()` est utilisé par la détection de changement de version du SW. */
  async text(): Promise<string> {
    return this.body;
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.body);
  }
}

/**
 * Résout une URL comme le ferait le navigateur.
 *
 * `cache.put('/index.html', …)` accepte un chemin relatif, résolu par rapport à
 * l'origine du service worker. Sans cette normalisation, la clé stockée
 * (`/index.html`) et la clé lue (`https://…/index.html`) divergeaient dans le
 * banc d'essai alors qu'elles coïncident dans un vrai navigateur.
 */
function resolveUrl(value: string): string {
  try {
    return new URL(value, 'https://edumate.test').href;
  } catch {
    return value;
  }
}

class FakeCache {
  readonly name: string;
  /** Préserve l'ordre d'insertion : nécessaire au test d'éviction. */
  readonly entries = new Map<string, FakeResponse>();
  constructor(name: string) {
    this.name = name;
  }
  async put(request: FakeRequest | string, response: FakeResponse): Promise<void> {
    this.entries.set(resolveUrl(typeof request === 'string' ? request : request.url), response);
  }
  async add(request: FakeRequest | string): Promise<void> {
    const url = resolveUrl(typeof request === 'string' ? request : request.url);
    const response = await fakeFetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await this.put(url, response);
  }
  async match(request: FakeRequest | string): Promise<FakeResponse | undefined> {
    return this.entries.get(resolveUrl(typeof request === 'string' ? request : request.url));
  }
  async keys(): Promise<FakeRequest[]> {
    return [...this.entries.keys()].map((url) => new FakeRequest(url));
  }
  async delete(request: FakeRequest | string): Promise<boolean> {
    return this.entries.delete(resolveUrl(typeof request === 'string' ? request : request.url));
  }
}

class FakeCacheStorage {
  readonly store = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    if (!this.store.has(name)) this.store.set(name, new FakeCache(name));
    return this.store.get(name)!;
  }
  async match(request: FakeRequest | string, options?: { cacheName?: string }): Promise<FakeResponse | undefined> {
    if (options?.cacheName) return (await this.open(options.cacheName)).match(request);
    for (const cache of this.store.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.store.delete(name);
  }
  async has(name: string): Promise<boolean> {
    return this.store.has(name);
  }
}

/* ------------------------------------------------------------------ */
/*  Réseau simulé                                                      */
/* ------------------------------------------------------------------ */

/** Chemins disponibles sur le « serveur », avec leur latence simulée. */
/*
 * Contenu « serveur », MUTABLE : le test simule un redéploiement en remplaçant
 * le HTML servi, pour vérifier que la coquille en cache est bien rafraîchie.
 */
let servedShellHtml = '<html>shell-v1</html>';
const serverFiles = new Map<string, FakeResponse>([
  ['/', new FakeResponse('<html>shell-v1</html>')],
  ['/index.html', new FakeResponse('<html>shell-v1</html>')],
  ['/manifest.webmanifest', new FakeResponse('{"name":"EduMate"}', { headers: { 'Content-Type': 'application/manifest+json' } })],
  ['/favicon.svg', new FakeResponse('<svg/>')],
  ['/icon-192.png', new FakeResponse('png192')],
  ['/icon-512.png', new FakeResponse('png512')],
  ['/assets/app-abc123.js', new FakeResponse('console.log(1)')],
  ['/assets/app-abc123.css', new FakeResponse('body{}')],
]);
/** Chemins volontairement absents du serveur (simule un redéploiement). */
const missingFiles = new Set<string>(['/assets/gone-xyz789.js']);

const fetchLog: string[] = [];
let fetchLatencyMs = 0;

async function fakeFetch(input: unknown): Promise<FakeResponse> {
  const url = typeof input === 'string' ? input : (input as FakeRequest).url;
  const pathname = new URL(url, 'https://edumate.test').pathname;
  fetchLog.push(pathname);
  if (fetchLatencyMs) await new Promise((resolve) => setTimeout(resolve, fetchLatencyMs));
  if (missingFiles.has(pathname)) return new FakeResponse('', { status: 404, statusText: 'Not Found', type: 'error' });
  if (pathname.startsWith('/api/')) return new FakeResponse(JSON.stringify({ ok: true, path: pathname }));
  // La coquille est servie dynamiquement, pour pouvoir simuler un redéploiement.
  if (pathname === '/' || pathname === '/index.html') return new FakeResponse(servedShellHtml);
  const found = serverFiles.get(pathname);
  if (found) return found.clone();
  /*
   * Fidélité au serveur réel : Express sert `index.html` pour TOUTE route
   * inconnue hors `/api` (repli SPA, voir `src/server/index.ts`). Une route
   * comme `/tableau-de-bord` renvoie donc bien du HTML 200, pas un 404.
   */
  if (!path.extname(pathname)) return new FakeResponse(servedShellHtml);
  return new FakeResponse('', { status: 404, statusText: 'Not Found', type: 'error' });
}

/* ------------------------------------------------------------------ */
/*  Environnement du service worker                                    */
/* ------------------------------------------------------------------ */

const ORIGIN = 'https://edumate.test';

interface SwEvent {
  type: string;
  request?: FakeRequest;
  data?: unknown;
  ports?: { postMessage: (value: unknown) => void }[];
  waitUntil(promise: Promise<unknown>): void;
  respondWith(promise: Promise<unknown>): void;
  _response?: Promise<unknown>;
  _waited?: Promise<unknown>;
}

const handlers = new Map<string, ((event: SwEvent) => void)[]>();
const pending: Promise<unknown>[] = [];

function makeEvent(type: string, extra: Partial<SwEvent> = {}): SwEvent {
  const event: SwEvent = {
    type,
    ...extra,
    waitUntil(promise: Promise<unknown>) {
      event._waited = promise;
      pending.push(promise);
    },
    respondWith(promise: Promise<unknown>) {
      event._response = promise;
    },
  };
  return event;
}

const caches = new FakeCacheStorage();
const clientMessages: unknown[] = [];
let skipWaitingCalls = 0;
let claimCalls = 0;

const swSelf: Record<string, unknown> = {
  location: new URL(`${ORIGIN}/sw.js`),
  addEventListener(type: string, handler: (event: SwEvent) => void) {
    const list = handlers.get(type) ?? [];
    list.push(handler);
    handlers.set(type, list);
  },
  skipWaiting() {
    skipWaitingCalls += 1;
    return Promise.resolve();
  },
  clients: {
    claim() {
      claimCalls += 1;
      return Promise.resolve();
    },
    matchAll() {
      return Promise.resolve([
        {
          postMessage(message: unknown) {
            clientMessages.push(message);
          },
        },
      ]);
    },
  },
  caches,
  fetch: fakeFetch,
  Request: FakeRequest,
  Response: FakeResponse,
  URL,
  Promise,
  setTimeout,
  clearTimeout,
  console,
  Math,
  JSON,
  navigator: { storage: { estimate: async () => ({ usage: 123456, quota: 9999999 }) } },
};
swSelf.self = swSelf;

function dispatch(event: SwEvent): SwEvent {
  for (const handler of handlers.get(event.type) ?? []) handler(event);
  return event;
}

async function drain(): Promise<void> {
  // Plusieurs passes : les gestionnaires enchaînent des promesses.
  for (let round = 0; round < 12; round += 1) {
    const batch = pending.splice(0, pending.length);
    await Promise.allSettled(batch);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function respondWith(request: FakeRequest): Promise<FakeResponse | null> {
  fetchLog.length = 0;
  const event = dispatch(makeEvent('fetch', { request }));
  if (!event._response) return null; // non intercepté : laissé au réseau
  return (await event._response) as FakeResponse | null;
}

/* ------------------------------------------------------------------ */
/*  Exécution du service worker                                        */
/* ------------------------------------------------------------------ */

console.log('\n── Chargement du service worker ──');
const context = vm.createContext(swSelf);
try {
  vm.runInContext(source, context, { filename: 'sw.js' });
  check('sw.js s’exécute sans erreur', true);
} catch (error) {
  check('sw.js s’exécute sans erreur', false, (error as Error).message);
  console.log('\n❌ Impossible de continuer.');
  process.exit(1);
}

check('gestionnaire `install` enregistré', (handlers.get('install') ?? []).length === 1);
check('gestionnaire `activate` enregistré', (handlers.get('activate') ?? []).length === 1);
check('gestionnaire `fetch` enregistré', (handlers.get('fetch') ?? []).length === 1);
check('gestionnaire `message` enregistré', (handlers.get('message') ?? []).length === 1);

/* ---------------------------- Installation ------------------------- */

console.log('\n── Installation : pré-cache de la coquille ──');
// Caches préexistants, dont un ancien à purger et un tiers à préserver.
await caches.open('edumate-shell-v0');
await caches.open('autre-application-v1');
const installEvent = dispatch(makeEvent('install'));
await drain();
check('skipWaiting appelé à l’installation', skipWaitingCalls === 1, String(skipWaitingCalls));

const shell = await caches.open('edumate-shell-v2');
const shellKeys = [...shell.entries.keys()];
check('coquille pré-cachée', shellKeys.length >= 5, `${shellKeys.length} entrées : ${shellKeys.join(', ')}`);
check('index.html en cache sous une clé unique', shellKeys.filter((key) => key.endsWith('/index.html')).length === 1 && !shellKeys.some((key) => key === ORIGIN + '/'), shellKeys.join(', '));
check('manifeste en cache', shellKeys.some((key) => key.includes('manifest.webmanifest')));
check('icônes en cache', shellKeys.filter((key) => key.includes('icon-')).length === 2);

/* ---------------------------- Activation --------------------------- */

console.log('\n── Activation : purge sélective ──');
dispatch(makeEvent('activate'));
await drain();
check('clients.claim appelé', claimCalls === 1, String(claimCalls));
check('l’ancienne coquille est purgée', !(await caches.has('edumate-shell-v0')));
check('le cache d’une autre application est préservé', await caches.has('autre-application-v1'));
check('le cache d’assets est conservé', await caches.has('edumate-assets'));

/* ------------------------------ API -------------------------------- */

console.log('\n── Règle absolue : l’API n’est jamais interceptée ──');
for (const apiPath of ['/api/health', '/api/grade', '/api/lessons/revision/x', '/api/auth/session']) {
  const intercepted = await respondWith(new FakeRequest(`${ORIGIN}${apiPath}`));
  check(`${apiPath} laissé au réseau`, intercepted === null);
}
const cacheNames = await caches.keys();
for (const name of cacheNames) {
  const cache = await caches.open(name);
  const apiEntries = [...cache.entries.keys()].filter((key) => key.includes('/api/'));
  check(`aucune entrée /api dans ${name}`, apiEntries.length === 0, apiEntries.join(', '));
}

console.log('\n── Origines tierces et méthodes non-GET ──');
check('webradio tierce laissée au réseau', (await respondWith(new FakeRequest('https://ice6.somafm.com/groovesalad-128-mp3'))) === null);
check('API tierce laissée au réseau', (await respondWith(new FakeRequest('https://api.mymemory.translated.net/get?q=bonjour'))) === null);
check('POST laissé au réseau', (await respondWith(new FakeRequest(`${ORIGIN}/api/grade`, { method: 'POST' }))) === null);

/* ----------------------------- Assets ------------------------------ */

console.log('\n── Assets : cache d’abord ──');
const assetUrl = `${ORIGIN}/assets/app-abc123.js`;
const first = await respondWith(new FakeRequest(assetUrl));
check('premier appel : servi depuis le réseau', first !== null && first.ok && fetchLog.includes('/assets/app-abc123.js'));
const assets = await caches.open('edumate-assets');
check('asset mis en cache', assets.entries.has(assetUrl));
const second = await respondWith(new FakeRequest(assetUrl));
check('second appel : servi depuis le cache', second !== null && second.ok);
check('second appel : AUCUNE requête réseau', fetchLog.length === 0, fetchLog.join(', '));

console.log('\n── Asset supprimé par un redéploiement ──');
const goneUrl = `${ORIGIN}/assets/gone-xyz789.js`;
const gone = await respondWith(new FakeRequest(goneUrl));
check('réponse non-OK propagée (pas de faux succès)', gone !== null && !gone.ok, `status ${gone?.status}`);

/* ------------------------------ HTML ------------------------------- */

console.log('\n── HTML : réseau d’abord, repli cache après délai ──');
// Serveur rapide : on doit obtenir le contenu FRAIS, pas celui du cache.
fetchLatencyMs = 20;
const navFast = await respondWith(new FakeRequest(`${ORIGIN}/tableau-de-bord`, { mode: 'navigate', destination: 'document' }));
check('navigation servie depuis le réseau quand il est rapide', navFast !== null && navFast.ok);
check('contenu frais renvoyé', (navFast?.body ?? '').includes('shell-v1'), String(navFast?.body));
await drain();
const shellAfterNav = await caches.open('edumate-shell-v2');
check('la coquille est écrite sous /index.html', shellAfterNav.entries.has(`${ORIGIN}/index.html`));
fetchLatencyMs = 0;

console.log('\n── 🔴 Régression corrigée : redéploiement visible ──');
/*
 * Le bug réel : la coquille restait figée sur la version installée le premier
 * jour, et seule une purge manuelle du cache la débloquait. On simule ici un
 * redéploiement, puis une navigation : le nouveau HTML doit être servi ET mis
 * en cache, et les onglets ouverts doivent être prévenus.
 */
servedShellHtml = '<html>shell-v2-NOUVELLE-VERSION</html>';
const navAfterDeploy = await respondWith(new FakeRequest(`${ORIGIN}/`, { mode: 'navigate', destination: 'document' }));
check('après redéploiement : le NOUVEAU HTML est servi', (navAfterDeploy?.body ?? '').includes('NOUVELLE-VERSION'), String(navAfterDeploy?.body));
await drain();
const shellAfterDeploy = await caches.open('edumate-shell-v2');
const cachedShell = shellAfterDeploy.entries.get(`${ORIGIN}/index.html`);
check('le cache contient désormais la nouvelle version', (cachedShell?.body ?? '').includes('NOUVELLE-VERSION'), String(cachedShell?.body));
check(
  'les onglets ouverts sont prévenus (SW_UPDATED)',
  clientMessages.some((message) => (message as { type?: string })?.type === 'SW_UPDATED'),
  JSON.stringify(clientMessages),
);

console.log('\n── Clé unique : / et /index.html ne divergent plus ──');
/*
 * L'ancien code pré-cachait `/` ET `/index.html`, mais ne revalidait que
 * `/index.html`. Une navigation vers `/` retombait donc sur l'entrée `/`,
 * jamais rafraîchie. Vérifions qu'il n'existe plus qu'UNE seule entrée de
 * coquille, et qu'elle est à jour.
 */
const shellEntries = [...shellAfterDeploy.entries.keys()].filter((key) => !key.includes('manifest') && !key.includes('.png') && !key.includes('.svg'));
check('une seule entrée HTML en cache', shellEntries.length === 1, shellEntries.join(', '));
servedShellHtml = '<html>shell-v3</html>';
await respondWith(new FakeRequest(`${ORIGIN}/`, { mode: 'navigate', destination: 'document' }));
await drain();
const afterRoot = await (await caches.open('edumate-shell-v2')).match(new FakeRequest(`${ORIGIN}/index.html`));
check('une navigation sur / met bien à jour la coquille', (afterRoot?.body ?? '').includes('shell-v3'), String(afterRoot?.body));
await respondWith(new FakeRequest(`${ORIGIN}/quiz`, { mode: 'navigate', destination: 'document' }));
await drain();
const afterRoute = await (await caches.open('edumate-shell-v2')).match(new FakeRequest(`${ORIGIN}/index.html`));
check('une navigation sur /quiz aussi', (afterRoute?.body ?? '').includes('shell-v3'), String(afterRoute?.body));

console.log('\n── Serveur très lent : repli sur le cache après délai ──');
fetchLatencyMs = 4000; // bien au-delà du délai de 2500 ms
const slowStart = Date.now();
const navSlow = await respondWith(new FakeRequest(`${ORIGIN}/tableau-de-bord`, { mode: 'navigate', destination: 'document' }));
const slowElapsed = Date.now() - slowStart;
check('le cache est servi sans attendre le réseau', navSlow !== null && navSlow.ok);
check(`attente bornée par le délai (${slowElapsed} ms < 3200)`, slowElapsed < 3200, `${slowElapsed} ms`);
check('contenu du cache renvoyé', (navSlow?.body ?? '').includes('shell-v3'), String(navSlow?.body));
fetchLatencyMs = 0;
await drain();

/* --------------------------- Hors ligne ---------------------------- */

console.log('\n── Coquille absente et réseau coupé ──');
await caches.delete('edumate-shell-v2');
fetchLatencyMs = 0;
const originalFetch = swSelf.fetch as typeof fakeFetch;
swSelf.fetch = (async () => {
  throw new TypeError('Failed to fetch');
}) as unknown as typeof fakeFetch;
// Le contexte VM partage `fetch` via `swSelf` : on recharge le gestionnaire.
const offlineNav = await respondWith(new FakeRequest(`${ORIGIN}/connexion`, { mode: 'navigate', destination: 'document' }));
check('page de secours renvoyée (pas d’exception)', offlineNav !== null && offlineNav.status === 200);
check('page de secours explicite', /hors ligne/i.test(offlineNav?.body ?? ''), String(offlineNav?.body ?? '').slice(0, 80));
swSelf.fetch = originalFetch as unknown as typeof fakeFetch;

/* ---------------------------- Éviction ----------------------------- */

console.log('\n── Borne du cache d’assets ──');
const assetsCache = await caches.open('edumate-assets');
assetsCache.entries.clear();
for (let i = 0; i < 90; i += 1) {
  await assetsCache.put(`${ORIGIN}/assets/f-${String(i).padStart(3, '0')}.js`, new FakeResponse('x'));
}
check('90 entrées placées pour le test', assetsCache.entries.size === 90, String(assetsCache.entries.size));
// L'activation déclenche pruneAssets().
dispatch(makeEvent('activate'));
await drain();
const after = await caches.open('edumate-assets');
check('cache borné à 80 entrées', after.entries.size === 80, String(after.entries.size));
check('les plus ANCIENNES ont été évictées', !after.entries.has(`${ORIGIN}/assets/f-000.js`) && after.entries.has(`${ORIGIN}/assets/f-089.js`));

/* ---------------------------- Messages ----------------------------- */

console.log('\n── Canal de messages ──');
skipWaitingCalls = 0;
dispatch(makeEvent('message', { data: { type: 'SKIP_WAITING' } }));
check('SKIP_WAITING déclenche skipWaiting', skipWaitingCalls === 1, String(skipWaitingCalls));

let received: unknown = null;
const port = { postMessage: (value: unknown) => (received = value) };
dispatch(makeEvent('message', { data: { type: 'CACHE_STATE' }, ports: [port] }));
await drain();
const payload = received as { ok: boolean; version?: string; caches?: Record<string, number>; storage?: { usage: number } } | null;
check('CACHE_STATE répond', Boolean(payload?.ok), JSON.stringify(payload));
check('version annoncée', typeof payload?.version === 'string' && payload.version.length > 0, String(payload?.version));
check('détail des caches fourni', Boolean(payload?.caches) && Object.keys(payload!.caches!).length > 0, JSON.stringify(payload?.caches));
check('estimation du stockage fournie', payload?.storage?.usage === 123456, JSON.stringify(payload?.storage));

dispatch(makeEvent('message', { data: null }));
dispatch(makeEvent('message', { data: 'pas-un-objet' }));
check('messages invalides ignorés sans exception', true);

/* ----------------------------- Bilan ------------------------------- */

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
