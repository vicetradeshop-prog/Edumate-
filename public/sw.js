/**
 * EduMate — Service worker (PWA).
 *
 * ══════════════════════════════════════════════════════════════════════
 *  CE QUE CE SERVICE WORKER FAIT — ET NE FAIT PAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * ❌ Il ne peut PAS empêcher Render de s'endormir : le plan gratuit arrête le
 *    conteneur après ~15 min d'inactivité, et un service worker s'exécute dans
 *    le navigateur, pas sur le serveur.
 *
 * ✅ Il rend cette attente **invisible** :
 *      - l'interface s'ouvre INSTANTANÉMENT depuis le cache, y compris serveur
 *        froid, au lieu d'un écran blanc ou d'une erreur réseau ;
 *      - les assets (JS/CSS) sont servis du disque : plus aucun téléchargement
 *        au démarrage ;
 *      - l'API, elle, reste strictement en réseau : jamais de score ni de
 *        session servis depuis un cache.
 *
 * Le maintien du serveur éveillé pendant une session de travail est traité à
 * part, côté applicatif (`src/client/lib/pwa.ts`, option « garder éveillé »).
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ÉCRIT À LA MAIN, SANS DÉPENDANCE NI ÉTAPE DE BUILD
 * ══════════════════════════════════════════════════════════════════════
 *
 * Un générateur (workbox, vite-plugin-pwa) injecterait la liste des fichiers à
 * pré-cacher au moment du build. Ici le fichier est statique, dans `public/`,
 * et copié tel quel dans `dist/client/`. Deux avantages décisifs :
 *   - aucune dépendance ajoutée au projet ;
 *   - aucune régénération à synchroniser avec le build.
 *
 * La contrepartie : les noms d'assets étant hachés (`index-CMIgDnEp.js`), ils ne
 * peuvent pas être connus à l'avance. D'où un pré-cache limité à la « coquille »
 * (HTML, manifeste, icônes) et un cache à la volée pour le reste — ce qui est
 * exactement le bon compromis pour des fichiers immuables.
 */

/* ------------------------------------------------------------------ */
/*  Versionnage                                                        */
/* ------------------------------------------------------------------ */

/**
 * À INCRÉMENTER À CHAQUE MODIFICATION DE CE FICHIER.
 *
 * Les navigateurs ne rechargent un service worker que si son contenu change,
 * mais les caches, eux, sont nommés : sans changement de nom, une stratégie
 * modifiée continuerait de servir d'anciennes réponses.
 */
const VERSION = 'v8';

/**
 * Coquille applicative : versionnée, donc purgée à chaque changement.
 * Contient uniquement des fichiers au nom STABLE (jamais hachés).
 */
const SHELL_CACHE = `edumate-shell-${VERSION}`;

/**
 * Assets et statiques : nom STABLE, jamais purgé par le versionnage.
 *
 * Pourquoi ? Les noms d'assets sont hachés par le build (`index-<hash>.js`) :
 * deux versions différentes ne peuvent donc jamais entrer en collision. Garder
 * les anciens permet à une page ouverte avec un HTML en cache de continuer à
 * charger ses morceaux après un redéploiement — sans cela, l'élève verrait
 * « Impossible de charger un fichier de l'application » au milieu d'une session.
 *
 * La croissance est bornée par `pruneAssets()` (MAX_ASSETS entrées).
 */
const ASSETS_CACHE = 'edumate-assets';

/** Fichiers de la coquille, pré-cachés à l'installation. */
const SHELL_FILES = [
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

/**
 * Clé unique sous laquelle la coquille est lue ET écrite.
 *
 * 🔴 Bug corrigé : la version précédente pré-cachait `/` **et** `/index.html`,
 * mais la revalidation n'écrivait que `/index.html`. Comme la cascade de repli
 * testait d'abord l'URL demandée, une navigation vers `/` correspondait à
 * l'entrée `/` — qui n'était donc **jamais** rafraîchie. La page d'accueil
 * restait figée sur la version installée le premier jour, et seule une
 * purge manuelle du cache la débloquait. C'est exactement le symptôme
 * « je n'ai plus les fonctionnalités, vider le cache les a remises ».
 *
 * Une seule clé pour les deux : `/` et `/index.html` désignent le même document,
 * ils doivent partager la même entrée de cache.
 */
const SHELL_KEY = '/index.html';

/**
 * Délai accordé au réseau pour une navigation, en millisecondes.
 *
 * Au-delà, on sert la coquille en cache. C'est le compromis central :
 *   - serveur chaud  → HTML frais en ~200 ms (donc JAMAIS de version périmée),
 *   - serveur froid  → ~2,5 s d'attente puis affichage depuis le cache, au lieu
 *     des ~30 s de réveil du plan gratuit Render.
 *
 * Le « cache d'abord » pur, choisi initialement, supprimait l'attente mais
 * rendait tout redéploiement invisible jusqu'à un second chargement.
 */
const SHELL_NETWORK_TIMEOUT_MS = 2500;

/** Nombre maximal d'entrées conservées dans le cache d'assets. */
const MAX_ASSETS = 80;

/* ------------------------------------------------------------------ */
/*  Installation                                                       */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      /*
       * `addAll` échoue en bloc si UN seul fichier manque. Or `/favicon.svg` ou
       * une icône absente ne doit pas empêcher la mise en cache du HTML. Chaque
       * fichier est donc ajouté individuellement, et les échecs sont ignorés.
       */
      await Promise.allSettled(SHELL_FILES.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      /*
       * Les fichiers de la coquille (manifeste, favicone, icônes) sont aussi
       * copiés dans le cache des assets : le navigateur les redemande hors
       * navigation (ex. relecture du manifeste) et, serveur endormi, un échec
       * produisait un bruit « 504 » en console.
       */
      try {
        const assetsForShell = await caches.open(ASSETS_CACHE);
        for (const url of SHELL_FILES) {
          const cachedFile = await cache.match(url);
          if (cachedFile) await assetsForShell.put(url, cachedFile.clone());
        }
      } catch { /* non bloquant */ }

      /*
       * Pré-cache des assets applicatifs (JS/CSS hachés).
       *
       * La coquille HTML seule ne suffit pas : au réveil d'un serveur endormi,
       * l'index.html est servi du cache mais les /assets/*.js doivent l'être
       * aussi, sinon l'application reste bloquée sur l'écran de démarrage.
       * On lit le HTML fraîchement mis en cache et on en extrait les URLs
       * d'assets pour les télécharger immédiatement.
       */
      try {
        const shell = await cache.match(SHELL_KEY);
        const html = shell ? await shell.text() : '';
        const seeds = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
          .map((m) => m[1])
          .filter((v, i, arr) => arr.indexOf(v) === i);
        const assets = await caches.open(ASSETS_CACHE);

        /*
         * Parcours en largeur des imports : le point d'entrée Vite importe
         * statiquement des chunks voisins (`from"./Card-xxxx.js"`) qui ne sont
         * PAS listés dans le HTML. Sans eux, le démarrage à froid échoue
         * silencieusement. On télécharge chaque JS, on y cherche ses propres
         * imports `/assets/…` ou `./…`, et on continue (plafond : 120 fichiers,
         * largement au-dessus du besoin réel).
         */
        const queued = new Set(seeds);
        const queue = [...seeds];
        let cachedCount = 0;
        while (queue.length > 0 && cachedCount < 120) {
          const url = queue.shift();
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (!response || !response.ok) continue;
            const isJs = url.endsWith('.js');
            const text = isJs ? await response.clone().text().catch(() => '') : '';
            await assets.put(url, response);
            cachedCount += 1;
            if (!isJs) continue;
            const base = url.slice(0, url.lastIndexOf('/') + 1);
            const refs = [...text.matchAll(/"(\.\/)?(assets\/)?([\w.-]+\.js)"/g)]
              .map((m) => (m[1] ? base + m[3] : '/' + m[2] + m[3]))
              .filter((v) => !queued.has(v));
            for (const ref of refs) {
              queued.add(ref);
              queue.push(ref);
            }
          } catch {
            /* Fichier inaccessible : le mode réseau prendra le relais. */
          }
        }
      } catch {
        /* Sans assets pré-cachés, la stratégie en ligne prend le relais. */
      }

      // Activation immédiate : l'élève bénéficie du cache dès le premier chargement.
      await self.skipWaiting();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/*  Activation                                                         */
/* ------------------------------------------------------------------ */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge d'entrées média potentiellement polluées (ancien repli HTML).
      try {
        const assets = await caches.open(ASSETS_CACHE);
        for (const key of await assets.keys()) {
          const path = new URL(key.request.url).pathname;
          if (path.startsWith('/music/') || /\.(mp3|wav|ogg|m4a|mp4|webm)$/.test(path)) {
            await assets.delete(key);
          }
        }
      } catch {
        /* la purge est un luxe : jamais bloquante */
      }

      const keep = new Set([SHELL_CACHE, ASSETS_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          // Les caches d'autres applications du même domaine sont préservés.
          .filter((name) => name.startsWith('edumate-') && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await pruneAssets();
      await self.clients.claim();
    })(),
  );
});

/**
 * Borne la taille du cache d'assets.
 *
 * `cache.keys()` restitue les requêtes dans l'ordre d'insertion : les plus
 * anciennes sont supprimées en premier. Sans cette purge, le cache grossirait
 * indéfiniment au fil des redéploiements.
 */
async function pruneAssets() {
  try {
    const cache = await caches.open(ASSETS_CACHE);
    const keys = await cache.keys();
    if (keys.length <= MAX_ASSETS) return;
    const excess = keys.length - MAX_ASSETS;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    /* quota ou stockage indisponible : sans conséquence fonctionnelle */
  }
}

/* ------------------------------------------------------------------ */
/*  Interception des requêtes                                          */
/* ------------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Seules les requêtes GET sont mises en cache (POST/PUT/DELETE mutent).
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  /*
   * 🔒 RÈGLE ABSOLUE : l'API n'est JAMAIS mise en cache ni interceptée.
   *
   * Un score, une session ou une progression servis depuis un cache seraient
   * une faute grave (données périmées, élève déconnecté à tort, anti-triche
   * contourné). On laisse ces requêtes au réseau seul : en cas d'échec, le
   * `catch` existant de `lib/api.ts` produit déjà un message lisible.
   */
  if (url.pathname.startsWith('/api/')) return;

  /*
   * 🔒 Médias jamais interceptés ni mis en cache : le lecteur audio gère ses
   * propres requêtes Range, et un cache SW a déjà failli servir du HTML à la
   * place d'un fichier audio absent (repli SPA d'avant le garde-fou 404).
   */
  if (request.destination === 'audio' || request.destination === 'video' || url.pathname.startsWith('/music/')) return;

  // Ignorer les origines tierces (webradios, MyMemory, open data…).
  if (url.origin !== self.location.origin) return;

  // Navigations et HTML : « stale-while-revalidate ».
  if (request.mode === 'navigate' || isHtmlRequest(request, url)) {
    event.respondWith(shellStrategy(request));
    return;
  }

  // Assets hachés et statiques : cache d'abord.
  event.respondWith(assetsStrategy(request, url));
});

/** Le navigateur demande-t-il explicitement du HTML ? */
function isHtmlRequest(request, url) {
  if (request.destination === 'document') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') && !url.pathname.includes('.');
}

/* ------------------------------------------------------------------ */
/*  Stratégies                                                         */
/* ------------------------------------------------------------------ */

/**
 * Coquille applicative : **cache d'abord, revalidation en arrière-plan**.
 *
 * C'est le choix qui résout le problème du serveur froid. Avec un
 * « réseau d'abord », une navigation attendrait les ~30 s de réveil de Render
 * avant d'afficher quoi que ce soit. Ici l'interface apparaît immédiatement,
 * pendant que le HTML frais est récupéré en tâche de fond pour le chargement
 * suivant.
 *
 * Servir un HTML légèrement ancien est sans danger : les assets qu'il référence
 * sont hachés et restent disponibles dans `ASSETS_CACHE` (jamais purgé par le
 * versionnage). La cohérence HTML ↔ chunks est donc préservée.
 */
/** Sentinelle de dépassement de délai (un `null` serait ambigu avec un échec). */
const TIMEOUT = Symbol('shell-network-timeout');

/**
 * Coquille applicative : **réseau d'abord avec délai court, repli sur le cache**.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS « CACHE D'ABORD » ?
 * ─────────────────────────────────────────────────────────────────────────
 * C'était le choix initial, pour supprimer l'attente du réveil Render. Mais il
 * rendait tout redéploiement **invisible** : le navigateur servait l'ancien
 * HTML, la revalidation en arrière-plan mettait le nouveau en cache, et il
 * fallait un SECOND chargement pour le voir. Un élève qui ouvre l'application
 * une fois par jour restait donc sur l'ancienne version.
 *
 * Le délai court conserve l'essentiel des deux mondes : serveur chaud, on obtient
 * le HTML frais en ~200 ms ; serveur froid, on bascule sur le cache après 2,5 s
 * au lieu d'attendre ~30 s.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REPLI SPA
 * ─────────────────────────────────────────────────────────────────────────
 * Toutes les navigations arrivent sur des routes arbitraires (`/tableau-de-bord`,
 * `/quiz/…`) que le serveur résout en `index.html`. Ces URL ne sont donc jamais
 * en cache : la lecture comme l'écriture passent par `SHELL_KEY`, une clé unique.
 */
async function shellStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(SHELL_KEY);

  /*
   * La requête réseau n'est PAS annulée quand le délai expire : elle continue en
   * arrière-plan et met le cache à jour. Le chargement suivant sera donc frais
   * même si celui-ci a dû se contenter du cache.
   */
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (!response || !response.ok || response.type !== 'basic') return response;
      const fresh = await response.clone().text().catch(() => null);
      const previous = cached ? await cached.clone().text().catch(() => null) : null;
      await cache.put(SHELL_KEY, response.clone()).catch(() => undefined);
      /*
       * Détection de changement de version.
       *
       * Sans elle, un redéploiement passé inaperçu laisse l'élève sur l'ancienne
       * interface sans aucun indice. En comparant le HTML reçu à celui en cache,
       * on peut prévenir la page et lui proposer de recharger.
       */
      if (fresh !== null && previous !== null && fresh !== previous) {
        notifyClientsUpdate();
      }
      return response;
    })
    .catch(() => null);

  // Rien en cache : il faut attendre le réseau, quoi qu'il en coûte.
  if (!cached) {
    const fresh = await networkPromise;
    if (fresh) return fresh;
    return offlineResponse();
  }

  /*
   * Course réseau / délai. `Promise.race` avec un minuteur : dès que le délai
   * est atteint, on sert le cache sans attendre davantage.
   */
  let timer = null;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), SHELL_NETWORK_TIMEOUT_MS);
    });
    const winner = await Promise.race([networkPromise, timeout]);
    if (winner === TIMEOUT || winner === null) return cached;
    return winner;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Prévient tous les onglets ouverts qu'une nouvelle version est disponible.
 *
 * `lib/pwa.ts` écoute ce message et affiche le bandeau « Nouvelle version
 * disponible — Recharger ». C'est le chaînon qui manquait : le service worker
 * se mettait bien à jour, mais la page en cours continuait d'exécuter l'ancien
 * code sans que rien ne le signale.
 */
function notifyClientsUpdate() {
  if (!self.clients || !self.clients.matchAll) return;
  self.clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clientList) => {
      for (const client of clientList) {
        try {
          client.postMessage({ type: 'SW_UPDATED', version: VERSION });
        } catch {
          /* onglet en cours de fermeture */
        }
      }
    })
    .catch(() => undefined);
}

/**
 * Assets : **cache d'abord**, puis réseau avec mise en cache.
 *
 * Les fichiers de `/assets/` portent une empreinte de contenu dans leur nom :
 * une version modifiée change de nom. Le cache ne peut donc jamais servir un
 * fichier périmé, ce qui rend le « cache d'abord » parfaitement sûr — et c'est
 * le plus rapide.
 */
async function assetsStrategy(request, url) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok && (response.type === 'basic' || response.type === 'default')) {
      // Les assets hachés sont immuables ; les autres peuvent évoluer.
      const immutable = url.pathname.startsWith('/assets/');
      await cache.put(request, response.clone());
      if (!immutable) pruneAssets();
    }
    return response;
  } catch {
    // Ressource déjà supprimée par un redéploiement et absente du cache :
    // on ne renvoie rien plutôt qu'une réponse trompeuse. L'application
    // affiche son propre message de diagnostic (voir `main.tsx`).
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

/** Page de secours hors ligne, autonome (aucune ressource externe). */
function offlineResponse() {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#6c5ce7" />
<title>EduMate — hors ligne</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
         background:#f4f6fd; color:#1b1e2b; }
  @media (prefers-color-scheme: dark) { body { background:#14162b; color:#e8eaf6; } }
  main { max-width:34rem; text-align:center; }
  .owl { font-size:64px; display:block; margin-bottom:8px; animation:bob 2.4s ease-in-out infinite; }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
  h1 { font-size:1.4rem; margin:0 0 10px; }
  p { line-height:1.65; margin:0 0 10px; opacity:.85; }
  code { background:rgba(108,92,231,.14); padding:2px 7px; border-radius:6px; font-size:.9em; }
  button { margin-top:20px; padding:12px 26px; border:0; border-radius:999px;
           background:#6c5ce7; color:#fff; font-size:1rem; font-weight:700; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  @media (prefers-reduced-motion: reduce) { .owl { animation:none; } }
</style>
</head>
<body>
<main>
  <span class="owl" aria-hidden="true">🦉</span>
  <h1>EduMate est hors ligne</h1>
  <p>Ta connexion semble interrompue, et cette page n’était pas encore en cache.</p>
  <p>Vérifie ton accès réseau puis réessaie. Tes données ne sont pas perdues :
     elles sont conservées sur le serveur.</p>
  <button type="button" onclick="location.reload()">Réessayer</button>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ------------------------------------------------------------------ */
/*  Canal de communication avec la page                                */
/* ------------------------------------------------------------------ */

/**
 * Messages acceptés depuis l'application (`postMessage`).
 *
 * `SKIP_WAITING` permet à l'interface de proposer « Nouvelle version disponible :
 * recharger » plutôt que d'attendre la fermeture de tous les onglets.
 * `CACHE_STATE` renvoie un état lisible pour l'écran des paramètres.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CACHE_STATE') {
    const port = event.ports && event.ports[0];
    if (!port) return;
    (async () => {
      try {
        const names = await caches.keys();
        const detail = {};
        for (const name of names) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          detail[name] = keys.length;
        }
        // Estimation du quota utilisé, quand le navigateur l'expose.
        let storage = null;
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          storage = { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
        }
        port.postMessage({ ok: true, version: VERSION, caches: detail, storage });
      } catch (error) {
        port.postMessage({ ok: false, error: String(error && error.message ? error.message : error) });
      }
    })();
  }
});
