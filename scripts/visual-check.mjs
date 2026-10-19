/**
 * EduMate — Contrôle visuel automatisé (Puppeteer).
 *
 * Vérifie, sur un vrai navigateur headless :
 *  1. que toutes les pages principales se rendent sans erreur console,
 *  2. que le fond « Liquid Glass » démarre (WebGL ou repli CSS),
 *  3. que le verre est bien appliqué (backdrop-filter sur le calque ::before
 *     des cartes — jamais sur le texte),
 *  4. qu'aucun débordement horizontal n'apparaît (desktop + mobile),
 *  5. que `prefers-reduced-motion` coupe le fond 3D,
 *  6. que le thème clair reste utilisable.
 *
 * Prérequis : npm run build + serveur démarré sur http://127.0.0.1:8123
 * (voir README de la refonte). Les captures sont écrites dans shots/.
 *
 * Usage : node scripts/visual-check.mjs [--keep-open]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.VISUAL_BASE ?? 'http://127.0.0.1:8123';
const OUT = path.join(process.cwd(), 'shots');
mkdirSync(OUT, { recursive: true });

let failures = 0;
let checks = 0;

function check(label, ok, detail = '') {
  checks += 1;
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    failures += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

/** Erreurs collectées par page (console, exceptions, requêtes en échec). */
function attachWatchers(page, bag) {
  page.on('console', (message) => {
    if (message.type() === 'error') bag.console.push(message.text().slice(0, 220));
  });
  page.on('pageerror', (error) => bag.pageErrors.push(String(error.message ?? error).slice(0, 220)));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.includes('/favicon')) return;
    bag.failed.push(`${url.slice(0, 140)} (${request.failure()?.errorText ?? '?'})`);
  });
}

async function snap(page, name, settleMs = 1600) {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function goto(page, urlPath, bag, { waitFor = '.liquid-bg' } = {}) {
  bag.console.length = 0;
  bag.pageErrors.length = 0;
  bag.failed.length = 0;
  await page.goto(`${BASE}${urlPath}`, { waitUntil: 'networkidle2', timeout: 45000 });
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => undefined);
  }
}

async function auditPage(page, bag, label, shotName) {
  await snap(page, shotName);
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const liquid = document.querySelector('.liquid-bg');
    const canvas = liquid?.querySelector('canvas.liquid-bg__canvas') ?? null;
    const card = document.querySelector('.card, .glass-panel');
    const before = card ? getComputedStyle(card, '::before') : null;
    return {
      theme: root.dataset.theme ?? '',
      fxBackground: root.dataset.fxBackground ?? '',
      fxWebglStarted: root.dataset.fxWebglStarted ?? '',
      liquidMode: liquid?.getAttribute('data-mode') ?? 'absent',
      revealed: liquid?.getAttribute('data-revealed') ?? '',
      canvasPointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : 'pas-de-canvas',
      liquidPointerEvents: liquid ? getComputedStyle(liquid).pointerEvents : 'absent',
      cardBackdrop: before ? before.backdropFilter || before.webkitBackdropFilter || '' : 'pas-de-carte',
      cardTextInBlurLayer: card ? getComputedStyle(card).backdropFilter : '',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      title: document.title,
      bodyText: document.body.innerText.length,
    };
  });
  check(`${label} : contenu rendu`, report.bodyText > 200, `${report.bodyText} car.`);
  check(`${label} : fond vivant présent (${report.liquidMode})`, report.liquidMode !== 'absent');
  check(`${label} : fond non interactif`, report.liquidPointerEvents === 'none' && report.canvasPointerEvents !== 'auto');
  check(`${label} : aucun débordement horizontal`, report.scrollWidth <= report.innerWidth + 1, `${report.scrollWidth} > ${report.innerWidth}`);
  check(`${label} : aucune erreur console`, bag.console.length === 0 && bag.pageErrors.length === 0, [...bag.pageErrors, ...bag.console].slice(0, 3).join(' | '));
  check(`${label} : aucune requête en échec`, bag.failed.length === 0, bag.failed.slice(0, 2).join(' | '));
  return report;
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader', // WebGL logiciel (SwiftShader) en headless
    '--window-size=1440,900',
  ],
});

const bag = { console: [], pageErrors: [], failed: [] };

try {
  /* ------------------------------ Pages publiques ------------------------- */
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  attachWatchers(page, bag);

  section('Pages publiques');
  await goto(page, '/', bag, { waitFor: '.landing' });
  const landing = await auditPage(page, bag, 'Landing', 'v3-landing');
  check('Landing : titre dégradé présent', await page.$('.landing__gradient') !== null || await page.$('.landing__title') !== null);
  /*
   * Sur un chargement complet, le moteur WebGL doit démarrer (~1,3 s) bien
   * avant l'éventuel repli du gouverneur FPS (~4 s en rendu logiciel).
   */
  check('Landing : moteur WebGL démarré', landing.liquidMode === 'webgl' || landing.fxWebglStarted === 'true', `mode=${landing.liquidMode} fx=${landing.fxBackground}`);

  await goto(page, '/connexion', bag, { waitFor: '.auth-shell' });
  await auditPage(page, bag, 'Connexion', 'v3-connexion');

  await goto(page, '/inscription', bag, { waitFor: null });
  await auditPage(page, bag, 'Inscription', 'v3-inscription');

  /* -------------------------------- Connexion démo ------------------------ */
  section('Connexion (compte de démonstration)');
  await goto(page, '/connexion', bag, { waitFor: '.auth-shell' });
  const demoButton = await page.evaluateHandle(() => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons.find((button) => /d[ée]monstration/i.test(button.textContent ?? '')) ?? null;
  });
  check('Bouton « compte de démonstration » trouvé', (await demoButton.jsonValue()) !== null);
  await page.evaluate((handle) => handle?.click(), demoButton);
  await page.waitForFunction(() => location.pathname.startsWith('/tableau-de-bord'), { timeout: 20000 });

  /* ------------------------------ Pages de l'app -------------------------- */
  section('Application (thème sombre, fond WebGL)');
  const dashboard = await auditPage(page, bag, 'Tableau de bord', 'v3-dashboard');
  check('Thème sombre par défaut', dashboard.theme === 'sombre', dashboard.theme);
  /*
   * La connexion démo est une navigation SPA : le fond 3D a démarré sur
   * /connexion et le gouverneur FPS (rendu logiciel SwiftShader très lent)
   * peut avoir replié en CSS avant cet audit. La trace persistante
   * data-fx-webgl-started prouve que le moteur WebGL a bien tourné.
   */
  check('Fond 3D : moteur WebGL démarré', dashboard.liquidMode === 'webgl' || dashboard.fxWebglStarted === 'true', `mode=${dashboard.liquidMode} fx=${dashboard.fxBackground} started=${dashboard.fxWebglStarted}`);
  check('Verre : backdrop-filter sur le calque ::before', /blur/.test(dashboard.cardBackdrop), dashboard.cardBackdrop);
  check('Verre : le texte n’est PAS dans un élément flouté', dashboard.cardTextInBlurLayer === 'none' || dashboard.cardTextInBlurLayer === '', dashboard.cardTextInBlurLayer);
  check('Composants v3 présents (GlassCard/LiquidGlassButton)', await page.evaluate(() => Boolean(document.querySelector('.card--glass') && document.querySelector('.btn--liquid'))));

  const appPages = [
    ['/quiz', 'QuizHub', 'v3-quiz-hub'],
    ['/lecons', 'Leçons', 'v3-lecons'],
    ['/fiches', 'Fiches', 'v3-fiches'],
    ['/planning', 'Planning', 'v3-planning'],
    ['/progression', 'Progression', 'v3-progression'],
    ['/devoirs', 'Devoirs', 'v3-devoirs'],
    ['/fil', 'Fil', 'v3-fil'],
    ['/assistant', 'Assistant', 'v3-assistant'],
    ['/outils', 'Outils', 'v3-outils'],
    ['/outils/minuteur', 'Minuteur', 'v3-minuteur'],
    ['/outils/tableau', 'Tableau', 'v3-tableau'],
    ['/profil', 'Profil', 'v3-profil'],
    ['/parametres', 'Paramètres', 'v3-parametres'],
  ];
  for (const [urlPath, label, shot] of appPages) {
    await goto(page, urlPath, bag, { waitFor: '.page' });
    await auditPage(page, bag, label, shot);
  }

  /* Un quiz complet : hub → détail → jeu → résultat. */
  section('Parcours quiz');
  await goto(page, '/quiz', bag, { waitFor: '.page' });
  const quizLink = await page.evaluateHandle(() => document.querySelector('a[href^="/quiz/"]'));
  const quizHref = await page.evaluate((handle) => handle?.getAttribute('href') ?? null, quizLink);
  if (quizHref) {
    await goto(page, quizHref, bag, { waitFor: '.page' });
    await auditPage(page, bag, 'Quiz : détail', 'v3-quiz-detail');
    const playClicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('a,button')].find((element) => /jouer|d[ée]marrer|commencer/i.test(element.textContent ?? ''));
      if (!button) return false;
      button.click();
      return true;
    });
    if (playClicked) {
      await page.waitForFunction(() => /jouer/.test(location.pathname) || document.querySelector('.quiz-player, .quiz-question'), { timeout: 15000 }).catch(() => undefined);
      await auditPage(page, bag, 'Quiz : jeu', 'v3-quiz-play');
    }
  } else {
    check('Quiz : aucun sujet jouable trouvé', false, 'pas de lien /quiz/*');
  }

  /* ------------------------------- Thème clair ---------------------------- */
  section('Thème clair (bascule depuis les paramètres)');
  await goto(page, '/parametres', bag, { waitFor: '.page' });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.theme = 'clair';
  });
  await snap(page, 'v3-dashboard-clair');
  const lightReport = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
  }));
  check('Thème clair : fond clair appliqué', !/^rgb\((\d|[1-3]\d|4[0-6]),/.test(lightReport.bg), lightReport.bg);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'sombre';
  });

  /* ---------------------------- Mouvement réduit -------------------------- */
  section('Accessibilité : prefers-reduced-motion');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await goto(page, '/tableau-de-bord', bag, { waitFor: '.liquid-bg' });
  await snap(page, 'v3-dashboard-reduced-motion', 2500);
  const reduced = await page.evaluate(() => {
    const liquid = document.querySelector('.liquid-bg');
    return {
      mode: liquid?.getAttribute('data-mode') ?? 'absent',
      hasCanvas: Boolean(liquid?.querySelector('canvas')),
      content: document.body.innerText.length,
    };
  });
  check('Mouvement réduit : fond 3D désactivé (mode css)', reduced.mode === 'css' && !reduced.hasCanvas, `mode=${reduced.mode} canvas=${reduced.hasCanvas}`);
  check('Mouvement réduit : contenu intact', reduced.content > 400);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  /* --------------------------------- Mobile ------------------------------- */
  section('Mobile (390×844)');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await goto(page, '/tableau-de-bord', bag, { waitFor: '.page' });
  const mobile = await auditPage(page, bag, 'Mobile : tableau de bord', 'v3-dashboard-mobile');
  // NB : en émulation mobile, `innerWidth` (394) inclut la barre de
  // défilement virtuelle ; la référence honnête est `clientWidth` (390).
  check('Mobile : pas de débordement', mobile.scrollWidth <= mobile.clientWidth + 1, `${mobile.scrollWidth}px > ${mobile.clientWidth}px`);

  /* --------------------------------- Admin -------------------------------- */
  section('Administration');
  // Contexte isolé : la session démo (cookies partagés) redirigerait
  // /connexion vers le tableau de bord et masquerait le formulaire.
  const adminContext = await browser.createBrowserContext();
  const adminPage = await adminContext.newPage();
  await adminPage.setViewport({ width: 1440, height: 900 });
  attachWatchers(adminPage, bag);
  await goto(adminPage, '/connexion', bag, { waitFor: '.auth-shell' });
  await adminPage.waitForSelector('input[type="email"]', { timeout: 10000 });
  await adminPage.type('input[type="email"]', 'admin@edumate.local');
  await adminPage.type('input[type="password"]', 'admin-test-123');
  await adminPage.evaluate(() => {
    const form = document.querySelector('form');
    form?.requestSubmit();
  });
  const adminLogged = await adminPage
    .waitForFunction(() => !location.pathname.startsWith('/connexion'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('Admin : connexion réussie', adminLogged);
  if (adminLogged) {
    await goto(adminPage, '/admin', bag, { waitFor: '.page' });
    await auditPage(adminPage, bag, 'Admin', 'v3-admin');
  }
  await adminContext.close();

  await page.close();
} finally {
  await browser.close();
}

console.log('\n==============================================================');
console.log(`  Résultat : ${checks - failures} contrôles réussis, ${failures} échec(s)`);
console.log(`  Captures : ${OUT}`);
console.log('==============================================================');
process.exit(failures === 0 ? 0 : 1);
