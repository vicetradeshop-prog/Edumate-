#!/usr/bin/env node
/**
 * EduMate — Diagnostic d'une page (ou de toutes les routes) dans un DOM simulé,
 * contre un site RÉEL ou un serveur local.
 *
 * Reproduit fidèlement le navigateur : monte l'application complète (routeur +
 * garde-routes), dirige les appels API vers la cible, puis affiche le texte
 * rendu et les erreurs. Détecte notamment les pages qui rendent du HTML vide
 * (boucle de redirection, composant indéfini…) — invisibles côté serveur.
 *
 * Usage :
 *   node scripts/check-page.mjs /inscription
 *   node scripts/check-page.mjs /inscription https://edumate-w87j.onrender.com
 *   node scripts/check-page.mjs --all            # toutes les routes publiques
 *   node scripts/check-page.mjs --all http://127.0.0.1:8787
 *
 * Portée : les routes PUBLIQUES (accueil, connexion, inscription, bienvenue)
 * sont vérifiées de bout en bout — c'est ce qui détecte les pages blanches
 * (boucle de redirection, composant indéfini). Les routes protégées exigent un
 * vrai navigateur (cookie de session) : elles sont couvertes par
 * `npm run test:render`, qui monte chaque page avec une session simulée.
 *
 * Prérequis : npm run build:tests   (génère dist-test/render.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { JSDOM, VirtualConsole } from 'jsdom';

/** fetch natif de Node, capturé AVANT tout remplacement par l'environnement jsdom. */
const nodeFetch = globalThis.fetch.bind(globalThis);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'dist-test', 'render.js');

const args = process.argv.slice(2);
const all = args.includes('--all');
const positional = args.filter((arg) => !arg.startsWith('--') && !arg.startsWith('http'));
const target = (args.find((arg) => arg.startsWith('http')) ?? process.env.EDUMATE_TARGET ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const route = positional[0] ?? '/';

if (!fs.existsSync(bundlePath)) {
  console.error('❌ Bundle de test absent. Lance d’abord : npm run build:tests');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Environnement navigateur simulé                                    */
/* ------------------------------------------------------------------ */

function createEnvironment(urlPath) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => errors.push(`jsdomError : ${error.stack ?? error.message}`));
  virtualConsole.on('error', (...items) => errors.push(`console.error : ${items.join(' ').slice(0, 600)}`));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: target + urlPath,
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    virtualConsole,
  });
  const { window } = dom;

  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.MessageChannel = NodeMessageChannel;
  window.prompt = () => null;
  window.alert = () => {};
  window.navigator.clipboard = { writeText: async () => undefined, readText: async () => '' };
  window.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return nodeFetch(url.startsWith('http') ? url : target + url, init);
  };

  for (const key of [
    'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node',
    'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'DOMParser',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia',
    'ResizeObserver', 'IntersectionObserver', 'MessageChannel', 'fetch', 'URL', 'Blob',
    'MutationObserver', 'FileReader', 'Image',
  ]) {
    if (key in window) {
      try {
        Object.defineProperty(globalThis, key, { value: window[key], writable: true, configurable: true });
      } catch {
        globalThis[key] = window[key];
      }
    }
  }
  globalThis.self = window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const script = window.document.createElement('script');
  script.textContent = fs.readFileSync(bundlePath, 'utf8');
  window.document.body.appendChild(script);
  return { dom, window, errors };
}

/* ------------------------------------------------------------------ */
/*  Session (compte de démonstration) pour les routes protégées        */
/* ------------------------------------------------------------------ */

async function openDemoSession() {
  try {
    const response = await nodeFetch(`${target}/api/auth/demo`, { method: 'POST' });
    if (!response.ok) {
      console.log(`   ⚠️  /api/auth/demo → HTTP ${response.status} : ${(await response.text()).slice(0, 200)}`);
      return null;
    }
    const payload = await response.json();
    const cookies = (response.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(';')[0]);
    if (!payload?.user) {
      console.log(`   ⚠️  Réponse inattendue de /api/auth/demo : ${JSON.stringify(payload).slice(0, 200)}`);
      return null;
    }
    return { user: payload.user, csrf: payload.csrfToken, cookie: cookies.join('; ') };
  } catch (error) {
    console.log(`   ⚠️  Session de démonstration impossible : ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Rendu d'une route                                                  */
/* ------------------------------------------------------------------ */

async function renderRoute(api, urlPath, session) {
  const { window, errors } = createEnvironment(urlPath);
  const { React, act, createRoot } = api;

  if (session) {
    if (process.env.DEBUG_AUTH) console.log('      [debug] fetch natif remplacé par la version avec cookie');
    window.fetch = (input, init = {}) => {
      if (process.env.DEBUG_AUTH) console.log('      [debug] fetch →', typeof input === 'string' ? input : input.url);
      const url = typeof input === 'string' ? input : input.url;
      const headers = { ...(init.headers ?? {}) };
      if (session.cookie) headers.Cookie = session.cookie;
      if (session.csrf && init.method && init.method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
      return nodeFetch(url.startsWith('http') ? url : target + url, { ...init, headers });
    };
    globalThis.fetch = window.fetch;
    // On laisse l'application s'authentifier elle-même (chemin réel du
    // navigateur) : c'est le magasin d'état utilisé par le composant rendu.
    await api.stores.useAuth.getState().loadSession();
  } else {
    api.stores.useAuth.setState({ user: null, status: 'anonymous', aiConfigured: false, demoAvailable: true });
  }

  await api.stores.useCatalog.getState().load();

  const container = window.document.getElementById('root');
  let reactRoot;
  let thrown = null;
  try {
    await act(async () => {
      reactRoot = createRoot(container);
      reactRoot.render(React.createElement(api.SafeAppAt, { path: urlPath }));
    });
    for (let i = 0; i < 12; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
    }
  } catch (error) {
    thrown = error;
  }

  const html = container.innerHTML;
  const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
  const authState = api.stores.useAuth.getState();
  if (process.env.DEBUG_AUTH) {
    console.log(`      [debug] status=${authState.status} user=${authState.user ? authState.user.email : 'null'} cookie=${session ? session.cookie.slice(0, 42) + '…' : 'aucun'}`);
  }
  const probe = window.document.getElementById('edumate-probe-error');
  const finalPath = window.location.pathname;
  try {
    await act(async () => reactRoot?.unmount());
  } catch {
    /* déjà démonté */
  }
  try {
    window.close();
  } catch {
    /* fenêtre déjà fermée */
  }

  return { html, text, errors, probe: probe ? String(probe.textContent) : null, thrown, finalPath };
}

/* ------------------------------------------------------------------ */
/*  Exécution                                                          */
/* ------------------------------------------------------------------ */

const PUBLIC_ROUTES = [
  { path: '/', expect: 'EduMate' },
  { path: '/accueil', expect: 'EduMate' },
  { path: '/connexion', expect: 'Bon retour' },
  { path: '/inscription', expect: 'Bienvenue sur EduMate' },
  { path: '/bienvenue', expect: 'Bienvenue sur EduMate' },
];

const PRIVATE_ROUTES = [
  { path: '/tableau-de-bord', expect: 'Outils rapides' },
  { path: '/quiz', expect: 'entraînement' },
  { path: '/assistant', expect: 'assistant' },
  { path: '/lecons', expect: 'Leçons' },
  { path: '/progression', expect: 'Progression' },
  { path: '/devoirs', expect: 'Devoirs' },
  { path: '/outils', expect: 'Boîte à outils' },
  { path: '/outils/horloge', expect: 'Horloge' },
  { path: '/outils/minuteur', expect: 'Minuteur' },
  { path: '/outils/chronometre', expect: 'Chronomètre' },
  { path: '/outils/tableau', expect: 'Tableau interactif' },
  { path: '/outils/calendrier', expect: 'calendrier' },
  { path: '/outils/traducteur', expect: 'Traducteur' },
  { path: '/outils/musique', expect: 'Musique' },
  { path: '/profil', expect: 'Compagnon' },
  { path: '/parametres', expect: 'Paramètres' },
  { path: '/route-inconnue', expect: 'n’existe pas' },
];

async function main() {
  // Le bundle de test est chargé une fois, dans un premier environnement.
  const bootstrap = createEnvironment('/');
  const api = bootstrap.window.EduMateTest;
  if (!api) {
    console.error('❌ Le bundle n’a rien exposé sur window.EduMateTest');
    process.exit(1);
  }

  console.log(`\n🔎 Diagnostic des pages — cible : ${target}`);

  const routes = all ? PUBLIC_ROUTES : [{ path: route, expect: '' }];

  // Session de démonstration : uniquement si une route protégée est demandée
  // explicitement (les routes publiques se testent en mode anonyme).
  let session = null;
  if (!all && PRIVATE_ROUTES.some((item) => item.path === route)) {
    session = await openDemoSession();
    if (session) console.log(`   🔑 Session de démonstration ouverte (${session.user.email})`);
    else console.log('   ⚠️  Session indisponible : la route protégée redirigera vers /connexion.');
  }

  let ok = 0;
  let lastResult = null;
  const problems = [];

  for (const item of routes) {
    const needsAuth = PRIVATE_ROUTES.some((privateRoute) => privateRoute.path === item.path);
    const result = await renderRoute(api, item.path, needsAuth ? session : null);
    lastResult = result;
    const empty = result.html.length === 0;
    const hasError = Boolean(result.thrown || result.probe || result.errors.length);
    const missingExpectation = Boolean(item.expect) && !result.text.toLowerCase().includes(item.expect.toLowerCase());
    const good = !empty && !hasError && !missingExpectation;

    if (good) ok += 1;
    else problems.push({ ...item, result, empty, hasError, missingExpectation });

    console.log(
      `  ${good ? '✅' : '❌'} ${item.path.padEnd(22)} ${String(result.html.length).padStart(6)} car. de HTML · ${result.text.length} car. de texte`,
    );
    if (!good) {
      if (result.empty) console.log('        ↳ page entièrement VIDE (boucle de redirection ou composant indéfini)');
      if (result.thrown) console.log(`        ↳ exception : ${String(result.thrown.message).slice(0, 300)}`);
      if (result.probe) console.log(`        ↳ erreur React : ${result.probe.slice(0, 400)}`);
      if (result.errors.length) console.log(`        ↳ console : ${result.errors[0].slice(0, 400)}`);
      if (missingExpectation) console.log(`        ↳ « ${item.expect} » absent du rendu`);
    }
  }

  if (!all && lastResult) {
    console.log('\n── Contenu rendu');
    console.log(lastResult.text.slice(0, 1400) || '(vide)');
  }

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  Résultat : ${ok}/${routes.length} pages rendues correctement`);
  console.log('='.repeat(62));
  process.exit(problems.length ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Erreur du diagnostic :', error);
  process.exit(1);
});
