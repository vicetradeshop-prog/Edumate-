/**
 * EduMate — PWA : enregistrement du service worker, mises à jour, et maintien
 * du serveur éveillé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DEUX PROBLÈMES DISTINCTS, DEUX RÉPONSES DISTINCTES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. **L'attente au démarrage.** Le plan gratuit de Render arrête le conteneur
 *    après ~15 min d'inactivité ; le premier accès prend alors jusqu'à ~30 s.
 *    Le service worker (`public/sw.js`) met l'interface en cache : elle
 *    s'affiche **instantanément**, pendant que le serveur se réveille en tâche
 *    de fond. L'élève ne voit plus d'écran blanc ni d'erreur réseau.
 *
 * 2. **L'endormissement lui-même.** Aucun service worker ne peut l'empêcher :
 *    il s'exécute dans le navigateur, pas sur le serveur. La seule action
 *    possible côté client est une **requête périodique** tant qu'un onglet est
 *    ouvert. C'est l'objet de `startKeepAlive()` : pendant une session de
 *    travail, le serveur reste éveillé et chaque interaction est immédiate.
 *
 *    Limites assumées, à connaître :
 *      - cela ne fonctionne **que onglet ouvert**. Une visite le lendemain
 *        subira toujours le réveil (mais l'interface s'affichera instantanément
 *        grâce au point 1) ;
 *      - les navigateurs limitent l'arrière-plan ( timers regroupés, ~1/min ).
 *        L'intervalle choisi reste bien au-dessus de ce plancher ;
 *      - chaque requête coûte une commande Redis (`/api/health` fait un PING).
 *        À un ping toutes les 9 min, cela représente ~160 commandes/jour, très
 *        loin du quota gratuit de 10 000.
 */

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

/** Chemin du service worker (servi depuis `public/`). */
const SW_URL = '/sw.js';

/**
 * Intervalle de maintien éveillé.
 *
 * Render endort le service après ~15 min sans requête. 9 min laisse une marge
 * confortable tout en restant discret, et passe au-dessus du plancher de
 * throttling des onglets d'arrière-plan (~1/min).
 */
const KEEP_ALIVE_INTERVAL_MS = 9 * 60 * 1000;

/** Clé localStorage de la préférence « garder éveillé ». */
const KEEP_ALIVE_KEY = 'edumate:keepAwake';

/** Clé localStorage mémorisant la version de SW déjà signalée. */
const SEEN_VERSION_KEY = 'edumate:swSeenVersion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CacheState {
  version: string;
  caches: Record<string, number>;
  storage: { usage: number; quota: number } | null;
}

type UpdateHandler = (state: PwaState) => void;

export interface PwaState {
  /** Le service worker est-il pris en charge par ce navigateur ? */
  supported: boolean;
  /** L'enregistrement est-il actif ? */
  active: boolean;
  /** Une nouvelle version est prête et attend un rechargement. */
  updateReady: boolean;
  /** Le contenu est-il servi depuis le cache (serveur injoignable) ? */
  offline: boolean;
  /** Le maintien éveillé est-il actif ? */
  keepAlive: boolean;
  /** Dernière erreur d'enregistrement, le cas échéant. */
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  État observable                                                    */
/* ------------------------------------------------------------------ */

/**
 * Prise en charge du service worker, évaluée à la demande.
 *
 * Calculée à chaque lecture plutôt qu'à l'initialisation du module : la valeur
 * dépend de `navigator` et du contexte sécurisé, qui ne sont pas nécessairement
 * établis au moment où ce fichier est évalué (tests, chargement différé).
 */
function detectSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    (typeof window === 'undefined' || window.isSecureContext !== false)
  );
}

let state: PwaState = {
  supported: detectSupport(),
  active: false,
  updateReady: false,
  offline: typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  keepAlive: readKeepAlivePreference(),
  error: null,
};

const listeners = new Set<UpdateHandler>();

function setState(patch: Partial<PwaState>): void {
  const next = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof PwaState)[]).some((key) => state[key] !== next[key]);
  state = next;
  if (changed) listeners.forEach((listener) => listener(state));
}

/** Snapshot de l'état courant, avec prise en charge réévaluée. */
export function getPwaState(): PwaState {
  const supported = detectSupport();
  if (supported !== state.supported) state = { ...state, supported };
  return state;
}

/** Écoute les évolutions (bandeau de mise à jour, écran des paramètres). */
export function onPwaStateChange(handler: UpdateHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/* ------------------------------------------------------------------ */
/*  Préférence de maintien éveillé                                     */
/* ------------------------------------------------------------------ */

/**
 * Lecture de la préférence.
 *
 * Stockée en `localStorage` et non dans les préférences du compte : c'est un
 * comportement lié à un **appareil et à un navigateur** (faire tourner des
 * requêtes périodiques depuis cet onglet), pas une donnée pédagogique à
 * synchroniser. Cela évite au passage d'étendre le contrat d'API pour un réglage
 * purement local.
 *
 * Activée par défaut : c'est le comportement attendu sur un déploiement gratuit.
 */
function readKeepAlivePreference(): boolean {
  try {
    const raw = window.localStorage.getItem(KEEP_ALIVE_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function writeKeepAlivePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEEP_ALIVE_KEY, enabled ? '1' : '0');
  } catch {
    /* stockage indisponible (navigation privée) : la préférence reste en mémoire */
  }
}

/* ------------------------------------------------------------------ */
/*  Maintien du serveur éveillé                                        */
/* ------------------------------------------------------------------ */

let keepAliveTimer: number | null = null;
let lastPing = 0;
let inFlight: Promise<void> | null = null;

/**
 * Une requête de santé.
 *
 * Volontairement silencieuse : un échec ne doit produire ni toast ni log
 * visible, sinon un serveur froid générerait un message d'erreur toutes les
 * 9 minutes. L'état `offline` est mis à jour, c'est suffisant.
 */
async function ping(): Promise<void> {
  if (inFlight) return inFlight;
  const started = Date.now();
  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        // Un cache-buster évite qu'un proxy ou le navigateur rejoue une réponse
        // ancienne : ce ping n'a de sens que s'il atteint réellement le serveur.
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      lastPing = started;
      setState({ offline: !response.ok });
    } catch {
      setState({ offline: true });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Démarre le maintien éveillé (sans effet s'il est déjà actif). */
export function startKeepAlive(): void {
  if (keepAliveTimer !== null) return;
  keepAliveTimer = window.setInterval(() => {
    void ping();
  }, KEEP_ALIVE_INTERVAL_MS);
  // Premier ping différé : la page vient de charger ses données, inutile de
  // doubler la requête.
}

/** Arrête le maintien éveillé. */
export function stopKeepAlive(): void {
  if (keepAliveTimer !== null) {
    window.clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/** Active ou désactive le maintien éveillé, et mémorise le choix. */
export function setKeepAlive(enabled: boolean): void {
  writeKeepAlivePreference(enabled);
  setState({ keepAlive: enabled });
  if (enabled) {
    startKeepAlive();
    void ping();
  } else {
    stopKeepAlive();
  }
}

/**
 * Réveille le serveur immédiatement.
 *
 * Utilisé au retour sur l'onglet : plutôt que de laisser l'élève déclencher une
 * requête qui attendra 30 s, on réveille le serveur dès qu'il revient.
 */
export function wakeUpNow(): void {
  if (!state.keepAlive) return;
  void ping();
}

/** Horodatage du dernier ping réussi (0 = jamais). */
export function lastKeepAlivePing(): number {
  return lastPing;
}

/* ------------------------------------------------------------------ */
/*  Enregistrement du service worker                                   */
/* ------------------------------------------------------------------ */

let registration: ServiceWorkerRegistration | null = null;

/**
 * Enregistre le service worker et branche la détection de mise à jour.
 *
 * Sans effet si le navigateur ne le prend pas en charge, si le contexte n'est
 * pas sécurisé (hors `localhost`), ou si l'enregistrement échoue : l'application
 * reste alors 100 % fonctionnelle, simplement sans cache.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!detectSupport()) {
    setState({ supported: false });
    return;
  }

  /*
   * `window.isSecureContext` est vrai en HTTPS et sur localhost. En HTTP simple
   * (accès par IP locale, par exemple), l'enregistrement est refusé par le
   * navigateur : autant ne pas essayer et éviter une erreur console.
   */
  if (!window.isSecureContext) {
    setState({ supported: false, error: 'Le contexte n’est pas sécurisé (HTTPS requis).' });
    return;
  }

  try {
    registration = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      /*
       * `updateViaCache: 'none'` : le navigateur ne doit JAMAIS se servir de son
       * cache HTTP pour vérifier `sw.js`. Avec la valeur par défaut, une mise à
       * jour du service worker peut être différée jusqu'à 24 h — ce qui
       * prolongerait exactement le symptôme « je suis resté sur l'ancienne
       * version ». Le serveur envoie déjà `Cache-Control: no-cache` sur ce
       * fichier ; cette option supprime le dernier maillon incontrôlé.
       */
      updateViaCache: 'none',
    });
    setState({ active: Boolean(registration.active), error: null });

    attachUpdateDetection(registration);
    attachWorkerMessages();

    /*
     * Le navigateur ne vérifie les mises à jour qu'au chargement et toutes les
     * 24 h. Une vérification explicite au démarrage, puis à chaque retour sur
     * l'onglet, permet de proposer la nouvelle version rapidement après un
     * redéploiement Render.
     */
    void safeUpdate();

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setState({ active: true });
    });
  } catch (error) {
    // Échec non bloquant : l'application fonctionne normalement sans cache.
    setState({ active: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Écoute les messages du service worker.
 *
 * `SW_UPDATED` est émis par `public/sw.js` quand la revalidation d'une navigation
 * constate que le HTML a changé : un redéploiement a eu lieu pendant que
 * l'onglet était ouvert. C'est le signal qui manquait — sans lui, le worker se
 * mettait à jour mais la page continuait d'exécuter l'ancien code sans aucun
 * indice, et l'élève restait sur une interface périmée.
 */
function attachWorkerMessages(): void {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; version?: string } | null;
    if (!data || data.type !== 'SW_UPDATED') return;
    /*
     * On ne force PAS le rechargement : l'élève est peut-être en plein quiz, et
     * perdre ses réponses serait bien plus grave qu'une interface légèrement
     * ancienne. Le bandeau propose, l'élève décide.
     */
    setState({ updateReady: true });
  });
}

/** Demande une vérification de mise à jour sans jamais lever d'erreur. */
async function safeUpdate(): Promise<void> {
  try {
    await registration?.update();
  } catch {
    /* réseau indisponible : la prochaine vérification suffira */
  }
}

/**
 * Détecte l'installation d'une nouvelle version.
 *
 * Distinction importante : au **tout premier** enregistrement,
 * `navigator.serviceWorker.controller` est `null` — il ne s'agit pas d'une mise
 * à jour, et il ne faut donc rien signaler à l'élève.
 */
function attachUpdateDetection(reg: ServiceWorkerRegistration): void {
  const worker = reg.installing ?? reg.waiting;
  if (worker) trackWorker(worker);

  reg.addEventListener('updatefound', () => {
    if (reg.installing) trackWorker(reg.installing);
  });

  // Un worker en attente au chargement (onglet ouvert depuis longtemps).
  if (reg.waiting && navigator.serviceWorker.controller) {
    setState({ updateReady: true });
  }
}

function trackWorker(worker: ServiceWorker): void {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      // Une version remplace l'actuelle : on propose le rechargement.
      setState({ updateReady: true });
    }
    if (worker.state === 'activated') {
      /*
       * 🔴 Ne PAS remettre `updateReady` à false ici.
       *
       * Le service worker appelle `skipWaiting()` à l'installation : il passe
       * donc de `installed` à `activated` en quelques millisecondes. Réinitialiser
       * le drapeau à l'activation faisait apparaître puis disparaître le bandeau
       * « Nouvelle version disponible » avant que l'œil ne le voie — pendant que
       * la page, elle, continuait d'exécuter l'ANCIEN code JavaScript.
       *
       * Le drapeau est donc **persistant** : il reste à true jusqu'au
       * rechargement effectif de la page (ou à `clearPwaCaches`). C'est la seule
       * façon fiable d'informer l'élève, puisque son onglet fait tourner du code
       * périmé tant qu'il n'a pas rechargé.
       */
      setState({ active: true });
    }
  });
}

/**
 * Active la nouvelle version en attente.
 * L'application doit ensuite recharger la page (voir `applyUpdateAndReload`).
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  // Repli : rien en attente côté enregistrement, on recharge simplement.
  window.location.reload();
}

/** Active la mise à jour puis recharge, en attendant la prise de contrôle. */
export function applyUpdateAndReload(): void {
  let reloaded = false;
  const reload = (): void => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  // `controllerchange` survient quand le nouveau worker prend la main.
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  applyUpdate();
  // Filet : si l'événement n'arrive pas, on recharge quand même après 3 s.
  window.setTimeout(reload, 3000);
}

/* ------------------------------------------------------------------ */
/*  Diagnostic et réinitialisation                                     */
/* ------------------------------------------------------------------ */

/** Interroge le service worker sur l'état de ses caches. */
export async function getCacheState(): Promise<CacheState | null> {
  const worker = navigator.serviceWorker?.controller ?? registration?.active ?? null;
  if (!worker) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(null), 4000);
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timeout);
      const data = event.data as { ok: boolean; version?: string; caches?: Record<string, number>; storage?: CacheState['storage'] };
      if (!data?.ok) {
        resolve(null);
        return;
      }
      resolve({
        version: String(data.version ?? '?'),
        caches: data.caches ?? {},
        storage: data.storage ?? null,
      });
    };
    try {
      worker.postMessage({ type: 'CACHE_STATE' }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Désenregistre le service worker et vide tous les caches EduMate.
 *
 * Utile en dépannage (« l'application affiche une ancienne version ») et exposé
 * dans les paramètres. Les caches tiers du même domaine ne sont pas touchés.
 */
export async function clearPwaCaches(): Promise<boolean> {
  let done = true;
  try {
    if (registration) {
      await registration.unregister();
      registration = null;
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('edumate-')).map((name) => caches.delete(name)));
    }
  } catch {
    done = false;
  }
  stopKeepAlive();
  // `updateReady` est remis à false ici uniquement : un vidage de cache est suivi
  // d'un rechargement, donc le drapeau n'a plus de raison d'être.
  setState({ active: false, updateReady: false, keepAlive: false });
  writeKeepAlivePreference(false);
  return done;
}

/* ------------------------------------------------------------------ */
/*  Suivi de la connectivité                                           */
/* ------------------------------------------------------------------ */

/** Branche les écouteurs réseau et le réveil au retour sur l'onglet. */
export function startNetworkWatch(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    setState({ offline: false });
    void safeUpdate();
    wakeUpNow();
  });
  window.addEventListener('offline', () => setState({ offline: true }));

  /*
   * Réveil au retour sur l'onglet : sans cela, l'élève qui a laissé EduMate en
   * arrière-plan pendant une pause déclencherait lui-même la requête lente.
   */
  /* Réveil immédiat au retour dans l'onglet (ou au focus fenêtre) : l'élève
     ne doit jamais attendre 30 s devant un écran vide après une absence. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      wakeUpNow();
      void safeUpdate();
    }
  });
  window.addEventListener('focus', () => wakeUpNow());
}

/* ------------------------------------------------------------------ */
/*  Utilitaires d'affichage                                            */
/* ------------------------------------------------------------------ */

/** Formate un nombre d'octets en unité lisible. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  const units = ['o', 'Kio', 'Mio', 'Gio'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const digits = value >= 10 || exponent === 0 ? 0 : 1;
  /*
   * `toLocaleString('fr-FR')` et non `toFixed()` : ce dernier produit « 5.0 »,
   * avec un point décimal anglais. Tout le reste du projet formate à la
   * française (voir `fr()` dans `src/server/content/lib.ts` et `formatNumber()`
   * dans `lib/format.ts`) ; un « 5.0 Mio » au milieu d'interfaces en « 1 316 »
   * et « 4 379 774 » serait incohérent.
   */
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[exponent]}`;
}

/** Mémorise qu'une version de SW a déjà été signalée (évite les rappels). */
export function markVersionSeen(version: string): void {
  try {
    window.localStorage.setItem(SEEN_VERSION_KEY, version);
  } catch {
    /* sans objet */
  }
}

/** Version déjà signalée à l'élève. */
export function seenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}
