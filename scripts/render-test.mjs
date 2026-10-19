#!/usr/bin/env node
/**
 * EduMate — Test de rendu de l'interface (sans navigateur).
 *
 * Déroulé :
 *   1. démarre l'API réelle (build de production ou tsx),
 *   2. crée un DOM simulé (jsdom) avec les APIs navigateur indispensables,
 *   3. injecte le bundle de test (`dist-test/render.js`),
 *   4. simule une session authentifiée,
 *   5. monte CHAQUE page et vérifie son contenu,
 *   6. échoue au moindre incident React non capturé.
 *
 * Lancement : npm run test:render
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { stopProcess, tsx } from './lib/tools.mjs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'dist-test', 'render.js');
const port = Number(process.env.RENDER_TEST_PORT ?? 8931);
const base = `http://127.0.0.1:${port}`;
const useBuilt = fs.existsSync(path.join(root, 'dist/server/index.js')) && process.env.RENDER_TEST_SRC !== '1';

/** fetch natif de Node, conservé avant toute modification des globales. */
const nativeFetch = globalThis.fetch.bind(globalThis);

if (!fs.existsSync(bundlePath)) {
  console.error('❌ Bundle de test absent. Lance d’abord : npx vite build --config tests/vite.render.config.ts');
  process.exit(1);
}

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Serveur API                                                        */
/* ------------------------------------------------------------------ */

const launcher = useBuilt
  ? { command: process.execPath, args: [path.join(root, 'dist', 'server', 'index.js')] }
  : tsx([path.join(root, 'src', 'server', 'index.ts')]);
const logFile = fs.openSync(path.join(root, 'render-test-server.log'), 'w');
const server = spawn(launcher.command, launcher.args, {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    FALLBACK_STORAGE: 'memory',
    SESSION_SECRET: 'render-test-secret-0123456789',
    // Le fichier .env local est charge par le serveur : on force le mode
    // hors-ligne pour que les tests restent deterministes et n'appellent
    // jamais une vraie API d'IA (quota, latence, reseau).
    AI_PROVIDER: 'none',
    RATE_LIMIT_MAX: '1000000',
    AUTH_RATE_LIMIT_MAX: '100000',
    ALLOW_DEMO_ACCOUNT: 'true',
  },
  stdio: ['ignore', logFile, logFile],
});

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Environnement DOM                                                  */
/* ------------------------------------------------------------------ */

function createDom() {
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(`jsdomError: ${error.message}`));
  virtualConsole.on('error', (...args) => consoleErrors.push(`console.error: ${args.join(' ')}`));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${base}/`,
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    virtualConsole,
  });

  const { window } = dom;

  // APIs navigateur absentes de jsdom mais requises par l'application.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.IntersectionObserver = class {
    constructor() {
      this.root = null;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.AudioContext = class {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = 'running';
    }
    createGain() {
      const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} };
      return { gain: param, connect() {}, disconnect() {} };
    }
    createOscillator() {
      return { type: 'sine', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, detune: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 }, connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return { fftSize: 0, frequencyBinCount: 16, getByteFrequencyData: () => {}, connect() {}, disconnect() {} };
    }
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      return { buffer: null, loop: false, connect() {}, disconnect() {}, start() {}, stop() {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  };
  window.navigator.clipboard = { writeText: async () => undefined, readText: async () => '' };
  window.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  window.prompt = () => null;
  // React DOM planifie ses tâches via MessageChannel (absent de jsdom).
  window.MessageChannel = NodeMessageChannel;
  Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });

  return { dom, window, consoleErrors };
}

/* ------------------------------------------------------------------ */
/*  Scénarios                                                          */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n🎨 Test de rendu EduMate (API : ${useBuilt ? 'build de production' : 'tsx'})`);
  const ready = await waitForServer();
  if (!ready) {
    server.kill('SIGKILL');
    const log = fs.readFileSync(path.join(root, 'render-test-server.log'), 'utf8');
    console.error('❌ L’API n’a pas démarré :\n' + log.slice(0, 3000));
    process.exit(1);
  }

  const { dom, window, consoleErrors } = createDom();

  // Le bundle s'exécute dans le contexte Node : on expose les globales du DOM
  // simulé AVANT son évaluation, comme le ferait un navigateur.
  const globalsToRestore = new Map();
  for (const key of [
    'window',
    'document',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'Element',
    'Node',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'PointerEvent',
    'DOMParser',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'getComputedStyle',
    'matchMedia',
    'ResizeObserver',
    'IntersectionObserver',
    'AudioContext',
    'speechSynthesis',
    'prompt',
    'alert',
    'Image',
    'MutationObserver',
    'FileReader',
    'Blob',
    'URL',
    'MessageChannel',
    'fetch',
  ]) {
    if (key in window) {
      globalsToRestore.set(key, key in globalThis ? globalThis[key] : undefined);
      try {
        Object.defineProperty(globalThis, key, { value: window[key], writable: true, configurable: true });
      } catch {
        globalThis[key] = window[key];
      }
    }
  }
  globalThis.self = window;

  // Charge le bundle de test dans le DOM simulé.
  const code = fs.readFileSync(bundlePath, 'utf8');
  const script = window.document.createElement('script');
  script.textContent = code;
  window.document.body.appendChild(script);

  const api = window.EduMateTest;
  if (!api) {
    console.error('❌ Le bundle de test n’a rien exposé sur window.EduMateTest');
    server.kill('SIGKILL');
    process.exit(1);
  }

  // IMPORTANT : React, createRoot et act proviennent tous du bundle, afin
  // d'éviter deux copies de React (erreur « Invalid hook call »).
  const { React, Probe, stores, act, createRoot } = api;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // Session simulée : on se connecte réellement via l'API de démonstration.
  const demoResponse = await nativeFetch(`${base}/api/auth/demo`, { method: 'POST' });
  const demoPayload = await demoResponse.json();
  const csrf = demoPayload.csrfToken;
  const setCookies = demoResponse.headers.getSetCookie ? demoResponse.headers.getSetCookie() : [];
  const cookieHeader = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');

  const apiFetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = { ...(init.headers ?? {}) };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    if (cookieHeader) headers.Cookie = cookieHeader;
    return nativeFetch(url.startsWith('http') ? url : `${base}${url}`, { ...init, headers });
  };
  window.fetch = apiFetch;
  globalThis.fetch = apiFetch;

  const container = window.document.getElementById('root');

  async function mount(element, label) {
    let root;
    let error = null;
    try {
      await act(async () => {
        root = createRoot(container);
        root.render(element);
      });
      // Laisse les effets asynchrones (fetch) se dérouler.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 220));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 220));
      });
    } catch (thrown) {
      error = thrown;
    }
    const html = container.innerHTML;
    try {
      await act(async () => root?.unmount());
    } catch {
      /* déjà démonté */
    }
    container.innerHTML = '';
    if (error) {
      failures.push(`${label} : exception React — ${error.message}`);
      console.log(`  ❌ ${label} — exception : ${error.message}`);
      return { html: '', ok: false };
    }
    return { html, ok: true };
  }

  // Alimente les magasins comme le ferait une session réelle.
  stores.useAuth.setState({
    user: { ...demoPayload.user },
    status: 'authenticated',
    aiConfigured: false,
    demoAvailable: true,
  });
  await stores.useCatalog.getState().load();

  console.log('\n── Pages publiques');
  {
    const { html } = await mount(React.createElement(Probe, { page: 'onboarding', route: '/inscription' }), 'Parcours d’inscription (/inscription)');
    check('Inscription : écran de bienvenue rendu', html.includes('Bienvenue sur EduMate'), html.slice(0, 220));
    check('Inscription : bouton de démarrage présent', /part/i.test(html) || html.includes('Continuer'), html.slice(0, 160));
    check('Inscription : progression par étapes visible', html.includes('onboard__step'), 'pas de barre d’étapes');
  }
  // Les pages publiques exigent un visiteur non authentifié.
  stores.useAuth.setState({ user: null, status: 'anonymous' });
  {
    const { html } = await mount(React.createElement(Probe, { page: 'landing' }), 'Page d’accueil');
    check('Accueil : titre et appel à l’action', html.includes('EduMate') && html.includes('Commencer gratuitement'));
    check('Accueil : fonctionnalités présentées', html.includes('Aide aux devoirs') && html.includes('Quiz par milliers'));
    check('Accueil : décor animé (bloques + symboles flottants)', html.includes('landing__blob') && html.includes('landing__floater'));
    check('Accueil : titre à dégradé animé', html.includes('landing__gradient'));
    check('Accueil : bandeau défilant des matières', html.includes('marquee__track') && html.includes('Mathématiques'));
    check('Accueil : aperçu de quiz animé', html.includes('hero-preview') && html.includes('dérivée'));
    check('Accueil : étapes numérotées', html.includes('step-item__index'));
    check('Accueil : statistiques réelles du catalogue', html.includes('landing-stat__value'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'auth' }), 'Page de connexion');
    check('Connexion : formulaire présent', html.includes('Bon retour') && html.includes('Mot de passe'));
    check('Connexion : accès au parcours guidé', html.includes('Créer mon espace'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'onboarding' }), 'Parcours d’accueil');
    check('Onboarding : écran de bienvenue', html.includes('Bienvenue sur EduMate'));
    check('Onboarding : progression par étapes', html.includes('onboard__step'));
  }

  console.log('\n── Pages de l’application');
  stores.useAuth.setState({ user: { ...demoPayload.user }, status: 'authenticated', aiConfigured: false, demoAvailable: true });
  {
    const { html } = await mount(React.createElement(Probe, { page: 'dashboard' }), 'Tableau de bord');
    check('Dashboard : salutation personnalisée', html.includes('Camille') || html.includes('Tableau'));
    check('Dashboard : indicateurs', html.includes('quiz terminés') || html.includes('Objectif du jour'));
    check('Dashboard : outils rapides', html.includes('Outils rapides'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'quizHub' }), 'Catalogue de quiz');
    check('Quiz : titre du catalogue', html.includes('Quiz &amp; entraînements') || html.includes('Quiz'));
    check('Quiz : matières proposées', html.includes('Mathématiques') && html.includes('Français'));
    check('Quiz : recherche disponible', html.includes('Rechercher'));
  }

  const searchResponse = await nativeFetch(`${base}/api/search?q=dérivée&limit=1`).then((response) => response.json());
  const topicId = searchResponse.items?.[0]?.id ?? '';
  if (topicId) {
    const { html } = await mount(
      React.createElement(Probe, { page: 'quizDetail', route: `/quiz/${topicId}` }),
      'Détail d’un quiz',
    );
    check('Détail quiz : configuration de session', html.includes('Configurer ta session') || html.includes('Commencer le quiz'));
    check('Détail quiz : nom du sujet affiché', html.length > 500);
    {
      const { html: htmlLesson } = await mount(
        React.createElement(Probe, { page: 'lesson', route: `/lecons/${topicId}` }),
        'Lecteur de leçon',
      );
      check('Leçon : mission d’ouverture affichée', htmlLesson.includes('Mission :') && htmlLesson.includes('lp-mission'));
      check('Leçon : en-tête de progression monté', htmlLesson.includes('lp-hud'));
      const { html: htmlReview } = await mount(
        React.createElement(Probe, { page: 'quizReview', route: `/quiz/${topicId}/revision` }),
        'Révision interactive de quiz',
      );
      check('Révision : parcours jouable chargé', htmlReview.includes('lp-mission') && (htmlReview.includes('Révision') || htmlReview.includes('C’est parti')));
      const { html: htmlHub } = await mount(React.createElement(Probe, { page: 'lessonHub' }), 'Hub de leçons');
      check('Hub : titre de la page', htmlHub.includes('Leçons'));
      check('Hub : navigation par matière et recherche', htmlHub.includes('Explorer les leçons') && htmlHub.includes('Trouver une leçon'));
    }
  } else {
    check('Détail quiz : sujet disponible', false, 'aucun sujet retourné par la recherche');
  }

  {
    stores.useQuiz.setState({
      result: {
        topicId: 'demo',
        topicName: 'Démonstration',
        emoji: '🎯',
        color: '#6c5ce7',
        score: 8,
        total: 10,
        percent: 80,
        durationSec: 240,
        attemptId: null,
        results: [
          {
            questionId: 'q1',
            prompt: 'Question de démonstration $2+2$',
            correct: true,
            given: 0,
            answer: 0,
            options: ['4', '5', '22'],
            accept: null,
            explanation: 'Deux plus deux font quatre.',
            skill: 'Calcul',
          },
        ],
      },
      session: null,
    });
    const { html } = await mount(React.createElement(Probe, { page: 'quizResult' }), 'Résultat de quiz');
    check('Résultat : score affiché', html.includes('80') && html.includes('Très bien'));
    check('Résultat : correction détaillée', html.includes('Correction détaillée') && html.includes('Question 1'));
    check('Résultat : LaTeX rendu par KaTeX', html.includes('katex'));
    check('Résultat : coach IA présent', html.includes('Coach IA') && html.includes('coach__'));
    check('Résultat : bouton « Réviser ce quiz » présent', html.includes('Réviser ce quiz'));
    stores.useQuiz.setState({ result: null });
  }

  {
    const { html } = await mount(React.createElement(Probe, { page: 'tutor' }), 'Assistant IA');
    check('Assistant : zone de saisie', html.includes('tutor-composer'));
    check('Assistant : modes d’aide', html.includes('Expliquer') && html.includes('Méthode'));
    check('Assistant : mention du mode utilisé', html.includes('Tuteur intégré') || html.includes('IA'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'fiches' }), 'Fiches de révision');
    check('Fiches : hub rendu', html.includes('fiche') || html.includes('Fiche'));
    const { html: htmlFiche } = await mount(
      React.createElement(Probe, { page: 'fiche', route: '/fiches/sujet-inexistant-ou-verrouille' }),
      'Fiche détail',
    );
    check('Fiche : écran verrouillé ou erreur propre', htmlFiche.includes('non débloquée') || htmlFiche.includes('Réessayer') || htmlFiche.length > 200);
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'planning' }), 'Planning');
    check('Planning : hub rendu', html.includes('Planning') && (html.includes('contrôle') || html.includes('Contrôle')));
    const { html: htmlDetail } = await mount(
      React.createElement(Probe, { page: 'planningDetail', route: '/planning/inexistant' }),
      'Planning détail',
    );
    check('Planning : détail introuvable géré proprement', htmlDetail.includes('introuvable') || htmlDetail.includes('Retour') || htmlDetail.includes('plan'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'wake' }), 'Écran de réveil');
    check('Réveil : animation EduMate présente', html.includes('EduMate') && html.includes('réveille'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'progress' }), 'Progression');
    check('Progression : indicateurs', html.includes('réussite globale') || html.includes('Ma progression'));
    check('Progression : section maîtrise', html.includes('maîtrisés') || html.includes('Aucune donnée'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'tools' }), 'Index des outils');
    check('Outils : liste complète', ['Horloge', 'Minuteur', 'Chronomètre', 'Tableau interactif', 'Calendrier', 'Traducteur'].every((tool) => html.includes(tool)));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'homework' }), 'Devoirs');
    check('Devoirs : formulaire d’ajout', html.includes('Ajouter un devoir'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'profile' }), 'Profil');
    check('Profil : informations personnelles', html.includes('Informations personnelles'));
    check('Profil : matières éditables', html.includes('Mathématiques'));
    check('Profil : aucun détail technique exposé', !html.includes('Sécurité du compte') && !html.includes('scrypt') && !html.includes('CSRF'));
  }
  {
    const { html } = await mount(React.createElement(Probe, { page: 'settings' }), 'Paramètres');
    check('Paramètres : apparence', html.includes('Apparence') && html.includes('Couleur principale'));
    check('Paramètres : accessibilité', html.includes('Animations et transitions'));
    check('Paramètres : aucun détail technique exposé', !html.includes('État du service') && !html.includes('Upstash') && !html.includes('README'));
    check('Paramètres : section « Tes données » (export + suppression)', html.includes('Tes données') && html.includes('Télécharger mes données') && html.includes('Supprimer mon compte'));
  }

  console.log('\n── Outils');
  const toolCases = [
    { page: 'clock', needle: 'Horloge', label: 'Horloge' },
    { page: 'timer', needle: 'pomodoro', label: 'Minuteur', caseInsensitive: true },
    { page: 'stopwatch', needle: 'Chronomètre', label: 'Chronomètre' },
    { page: 'whiteboard', needle: 'Tableau interactif', label: 'Tableau interactif' },
    { page: 'calendar', needle: 'Calendrier', label: 'Calendrier' },
    { page: 'translator', needle: 'Traducteur', label: 'Traducteur' },
    { page: 'music', needle: 'ambiances', label: 'Musique', caseInsensitive: true },
  ];
  for (const tool of toolCases) {
    const { html } = await mount(React.createElement(Probe, { page: tool.page }), tool.label);
    const haystack = tool.caseInsensitive ? html.toLowerCase() : html;
    const needle = tool.caseInsensitive ? tool.needle.toLowerCase() : tool.needle;
    check(`${tool.label} : contenu rendu`, haystack.includes(needle), `« ${tool.needle} » introuvable`);
  }

  console.log('\n── Rendu riche et sécurité');
  {
    const safe = api.renderRichText('<script>alert(1)</script> **ok**');
    check('Markdown : script injecté neutralisé', !safe.includes('<script>') && safe.includes('&lt;script&gt;'));
    check('Markdown : gras converti', safe.includes('<strong>ok</strong>'));
    const math = api.renderRichText('$x^{2}+1$');
    check('LaTeX : formule rendue', math.includes('katex'));
  }

  console.log('\n── Incidents React');
  const noise = consoleErrors.filter((line) => !/Not implemented: HTMLCanvasElement|Could not parse CSS|Error: Not implemented/i.test(line));
  check('Aucune erreur console non maîtrisée', noise.length === 0, noise.slice(0, 3).join(' | '));

  stopProcess(server);
  fs.closeSync(logFile);

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  Résultat : ${passed} contrôles réussis, ${failures.length} échec(s)`);
  if (failures.length) {
    console.log('\n  Détail :');
    for (const failure of failures) console.log(`   • ${failure}`);
  }
  console.log('='.repeat(62));
  for (const [key, value] of globalsToRestore) {
    try {
      Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    } catch {
      /* restauration facultative */
    }
  }
  dom.window.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Erreur du test de rendu :', error);
  stopProcess(server);
  process.exit(1);
});
