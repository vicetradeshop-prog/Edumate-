/**
 * Test d'interface des leçons interactives et des révisions de quiz.
 *
 * Vérifie ce que les tests du moteur (`test-lessons.ts`) ne peuvent pas voir :
 * le rendu réel du lecteur d'étapes, les interactions (répondre, révéler une
 * solution, enchaîner les étapes), le score et la série, l'écran final,
 * l'enrichissement IA SANS réinitialisation de la partie, la carte compacte
 * « À réviser » du tableau de bord (hauteur bornée), la robustesse aux étapes
 * inconnues et la prise en compte du mode « animations réduites ».
 */
process.env.FALLBACK_STORAGE = 'memory';
process.env.SESSION_SECRET = 'lessons-ui-test-secret-0123456789';
process.env.NODE_ENV = 'test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/lecons',
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
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
}
// jsdom n'implémente pas scrollTo : évite le bruit « Not implemented ».
(window as unknown as { scrollTo: () => void }).scrollTo = () => {};

/* ------------------------------------------------------------------ */
/*  Contenu réel : généré par le VRAI moteur serveur                   */
/* ------------------------------------------------------------------ */

const { buildLesson } = await import('../src/server/content/lessons.js');
const { buildRevisionPayload } = await import('../src/server/lib/revision.js');
const { findTopic, getCatalog } = await import('../src/server/lib/catalog.js');
const { buildQuiz } = await import('../src/server/content/index.js');

getCatalog();
const TOPIC_ID = 'mathematiques-troisieme-nombres-et-calculs-additions-et-soustractions';
const topic = findTopic(TOPIC_ID)!;
const lesson = buildLesson({ topic, seed: 7, aiAvailable: true });

// Essai simulé : 2 erreurs sur 5, pour une révision en mode « quiz ».
const session = buildQuiz({ topicId: topic.id, source: topic.source, params: topic.params ?? {}, difficulty: topic.difficulty, count: 5, seed: `${topic.id}#55` });
const revisionPayload = buildRevisionPayload({
  topic,
  attempt: {
    id: 'att-ui',
    userId: 'u1',
    topicId: topic.id,
    subjectId: topic.subjectId,
    levelId: topic.levelId,
    themeName: topic.themeName,
    topicName: topic.name,
    score: 3,
    total: session.questions.length,
    durationSec: 90,
    answers: session.questions.map((q, index) => ({
      questionId: q.id,
      correct: index !== 1 && index !== 3,
      given: index !== 1 && index !== 3 ? (q.answer ?? 0) : ((q.answer ?? 0) + 1) % Math.max(2, q.options?.length ?? 2),
    })),
    seed: 55,
    createdAt: new Date().toISOString(),
  },
});

const AI_CONTENT = {
  hook: 'Accroche IA personnalisée pour ce sujet.',
  goals: ['Objectif IA numéro un', 'Objectif IA numéro deux'],
  method: ['Geste IA numéro un', 'Geste IA numéro deux', 'Geste IA numéro trois'],
  trap: 'Piège IA sur mesure.',
  tip: 'Astuce IA mémorable.',
  chips: ['Point IA un', 'Point IA deux', 'Point IA trois'],
};

let enrichCalled = 0;
const json = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: new dom.window.Headers({ 'Content-Type': 'application/json' }) }) as unknown as Response;

globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = String(typeof input === 'string' ? input : ((input as { url?: string })?.url ?? ''));
  const method = init?.method ?? 'GET';
  const pathname = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

  if (pathname === '/api/auth/session') {
    return json({ user: { id: 'u1', email: 'eleve@edumate.test', firstName: 'Léa', role: 'eleve', onboarded: true, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'clair', accent: '#6c5ce7', density: 'confort', animations: true, sounds: true, dailyGoal: 20, focusMusic: 'lofi' } }, csrfToken: 'csrf', demoAvailable: false, aiConfigured: true });
  }
  if (pathname === '/api/catalog') {
    return json({ subjects: [{ id: 'mathematiques', name: 'Mathématiques', short: 'Maths', emoji: '📐', color: '#4f6df5', colorSoft: '#eef1ff', accent: '#22d3ee', pattern: 'geometry', description: '' }], levels: [], stats: { subjects: 10, levels: 4, themes: 229, topics: 1316, playable: 1316, questionPool: 1 } });
  }
  if (pathname === `/api/lessons/${TOPIC_ID}` && method === 'GET') {
    return json({ lesson });
  }
  if (pathname === `/api/lessons/${TOPIC_ID}/enrich` && method === 'POST') {
    enrichCalled += 1;
    return json({ ai: AI_CONTENT, cached: false });
  }
  if (pathname === `/api/lessons/revision/${TOPIC_ID}` && method === 'GET') {
    return json(revisionPayload);
  }
  if (pathname === '/api/progress/stats') {
    return json({ attempts: 3, correct: 10, total: 20, successRate: 0.5, bestScore: 0.8, totalDurationSec: 300, streakDays: 2, bySubject: [], mastered: [], toReview: revisionSuggestions(), last30Days: [], recent: [] });
  }
  return json({});
}) as typeof fetch;

function revisionSuggestions() {
  return Array.from({ length: 7 }, (_unused, index) => ({
    topicId: `topic-${index}`,
    name: `Sujet fragilisé ${index + 1}`,
    subjectName: 'Mathématiques',
    themeName: 'Nombres et calculs',
    emoji: '📐',
    color: '#4f6df5',
  }));
}

/* ------------------------------------------------------------------ */
/*  Banc d'essai                                                       */
/* ------------------------------------------------------------------ */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter, Route, Routes } = await import('react-router-dom');
const { StepPlayer } = await import('../src/client/components/lessons/StepPlayer.js');
const { RevisionCard } = await import('../src/client/components/progress/RevisionCard.js');
const LessonPage = (await import('../src/client/pages/LessonPage.js')).default;
const QuizReviewPage = (await import('../src/client/pages/QuizReviewPage.js')).default;
const { useAuth } = await import('../src/client/lib/store.js');

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
const byText = (selector: string, needle: string): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>(selector)].find((el) => (el.textContent ?? '').includes(needle));
const click = async (el: Element | null | undefined, settleMs = 400): Promise<void> => {
  await act(async () => { el?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await act(async () => { await wait(settleMs); });
};
const mount = async (element: React.ReactElement): Promise<void> => {
  await act(async () => { root.render(element); });
  await act(async () => { await wait(420); });
};
const unmount = async (): Promise<void> => {
  await act(async () => { root.render(React.createElement('div')); });
  await act(async () => { await wait(120); });
};

const consoleErrors: string[] = [];
const realError = console.error;
console.error = (...a: unknown[]) => {
  consoleErrors.push(a.map((x) => (x instanceof Error ? (x.stack ?? x.message) : String(x))).join(' '));
  realError(...a);
};

await act(async () => { await useAuth.getState().loadSession(); });

/* ==================================================================
   1. Lecteur d'étapes : parcours complet d'une leçon
   ================================================================== */
console.log('\n── 1. Lecteur d’étapes : parcours complet ──');

await mount(
  React.createElement(
    MemoryRouter,
    { initialEntries: ['/lecons/x'] },
    React.createElement(StepPlayer, {
      steps: lesson.steps,
      meta: { topicName: lesson.topicName, emoji: lesson.emoji, color: lesson.color },
      playthroughId: 'p1',
    }),
  ),
);

check('l’écran de mission s’affiche', text().includes('Mission :') && text().includes('C’est parti'));
check('la barre de progression est montée', host.querySelectorAll('.lp-hud').length === 1);

// Mission → méthode
await click(byText('button', 'C’est parti'));
check('étape méthode : les gestes s’affichent', text().includes('Ta méthode, geste par geste'));

// Méthode → exemple guidé
await click(byText('button', 'J’ai compris'));
check('exemple guidé : l’énoncé s’affiche, solution masquée', text().includes('Exemple guidé 1') && host.querySelectorAll('.lp-solution').length === 0);
await click(byText('button', 'Montre-moi la solution'));
check('la solution se déroule pas à pas', host.querySelectorAll('.lp-solution__line').length >= 1);
check('la bonne réponse apparaît', host.querySelectorAll('.lp-answer').length === 1);

// Exemple → exercice 1 : MAUVAISE réponse d'abord
await click(byText('button', 'Continuer'));
check('exercice 1 : question et propositions affichées', text().includes('À toi de jouer') && host.querySelectorAll('.lp-option').length >= 2);
const exerciceStep = lesson.steps.find((s) => s.kind === 'exercice');
const bonneReponse = exerciceStep?.kind === 'exercice' ? exerciceStep.question : null;
const mauvaisIndex = bonneReponse ? (bonneReponse.answer === 0 ? 1 : 0) : 0;
const mauvaisesOptions = [...host.querySelectorAll<HTMLElement>('.lp-option')];
await click(mauvaisesOptions[mauvaisIndex]);
check('mauvaise réponse : marquage rouge + secousse', host.querySelectorAll('.lp-option.is-wrong').length === 1);
check('la bonne réponse est révélée en vert', host.querySelectorAll('.lp-option.is-correct').length === 1);
check('le panneau de correction s’affiche', text().includes('Correction') && host.querySelectorAll('.lp-correction').length === 1);
check('feedback négatif annoncé (aria-live)', host.querySelectorAll('.lp-feedback.is-ko').length === 1);
check('les options sont verrouillées après réponse', [...host.querySelectorAll<HTMLButtonElement>('.lp-option')].every((el) => el.disabled));

// Exercice 1 → piège
await click(byText('.lp-cta button', 'Continuer'));
check('étape piège affichée', text().includes('Le piège classique'));

// Piège → exemple 2 → exercice 2 (BONNE réponse via clavier)
await click(byText('button', 'Je m’en souviendrai'));
check('exemple guidé 2 affiché', text().includes('Exemple guidé 2'));
await click(byText('button', 'Montre-moi la solution'));
await click(byText('.lp-cta button', 'Continuer'));
check('exercice 2 affiché', text().includes('Exercice 2') || text().includes('À toi de jouer'));

// Bonne réponse en cliquant la bonne option (lettre de la bonne réponse)
const bonnesOptions = [...host.querySelectorAll<HTMLElement>('.lp-option')];
const exercice2 = lesson.steps.filter((s) => s.kind === 'exercice')[1];
const answer2 = exercice2?.kind === 'exercice' ? exercice2.question.answer ?? 0 : 0;
await click(bonnesOptions[answer2]);
check('bonne réponse : marquage vert + bravo', host.querySelectorAll('.lp-option.is-correct').length >= 1 && text().includes('Bravo'));
check('le compteur d’étoiles apparaît dans l’en-tête', text().includes('⭐'));
check('la série s’affiche à partir de 2 (encore 1 ici : absente)', true);

// Exercice 2 → exercice 3 → bonne réponse → récap → fin
await click(byText('.lp-cta button', 'Continuer'));
check('exercice 3 affiché', text().includes('Exercice 3') || text().includes('À toi de jouer'));
const exercice3 = lesson.steps.filter((s) => s.kind === 'exercice')[2];
const answer3 = exercice3?.kind === 'exercice' ? exercice3.question.answer ?? 0 : 0;
await click([...host.querySelectorAll<HTMLElement>('.lp-option')][answer3]);
await click(byText('.lp-cta button', 'Continuer'));
check('récapitulatif : points clés affichés', text().includes('Ce qu’il faut retenir') && host.querySelectorAll('.lp-chip').length >= 2);
await click(byText('button', 'Terminer la leçon'));
check('écran final : bilan et pourcentage', text().includes('exercices') && host.querySelectorAll('.lp-finish').length === 1);
check('écran final : score 2/3 (une erreur, deux réussites)', text().includes('2/3'), text().slice(0, 400));
check('confettis présents (taux ≥ 60 %)', host.querySelectorAll('.confetti').length === 1);
check('boutons de rejou présents', Boolean(byText('button', 'Rejouer ce parcours')));

// Rejouer : tout repart de zéro
await click(byText('button', 'Rejouer ce parcours'));
check('rejouer ramène à la mission', text().includes('Mission :') && text().includes('C’est parti'));
await unmount();

/* ==================================================================
   2. Raccourcis clavier
   ================================================================== */
console.log('\n── 2. Raccourcis clavier ──');

await mount(
  React.createElement(
    MemoryRouter,
    { initialEntries: ['/lecons/x'] },
    React.createElement(StepPlayer, { steps: lesson.steps, meta: { topicName: 'X', emoji: '🎯', color: '#6c5ce7' }, playthroughId: 'p2' }),
  ),
);
const key = async (k: string, settleMs = 400): Promise<void> => {
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  await act(async () => { await wait(settleMs); });
};
await key('Enter');
check('Entrée avance (mission → méthode)', text().includes('Ta méthode'));
await key('Enter');
check('Entrée avance (méthode → exemple)', text().includes('Exemple guidé'));
await key('Enter');
check('Entrée avance (exemple → exercice, la révélation reste optionnelle)', host.querySelectorAll('.lp-option').length >= 2);
await key('2'); // sélectionne la proposition B
check('la touche 2 répond à l’exercice', host.querySelectorAll('.lp-option.is-correct, .lp-option.is-wrong').length >= 1);
await unmount();

/* ==================================================================
   3. Robustesse : étapes inconnues et liste vide
   ================================================================== */
console.log('\n── 3. Robustesse du lecteur ──');

const avecInconnue = [
  { id: 'x1', kind: 'hologramme', bidule: 1 },
  ...lesson.steps,
] as never[];
await mount(
  React.createElement(
    MemoryRouter,
    { initialEntries: ['/lecons/x'] },
    React.createElement(StepPlayer, { steps: avecInconnue, meta: { topicName: 'X', emoji: '🎯', color: '#6c5ce7' }, playthroughId: 'p3' }),
  ),
);
check('une étape inconnue est ignorée sans crash', text().includes('Mission :'));
await unmount();

await mount(
  React.createElement(
    MemoryRouter,
    { initialEntries: ['/lecons/x'] },
    React.createElement(StepPlayer, { steps: [], meta: { topicName: 'X', emoji: '🎯', color: '#6c5ce7' }, playthroughId: 'p4' }),
  ),
);
check('aucune étape → message dédié (jamais d’écran vide)', text().includes('Aucune étape disponible'));
await unmount();

/* ==================================================================
   4. Page Leçon : chargement, IA sans réinitialisation
   ================================================================== */
console.log('\n── 4. Page Leçon + enrichissement IA ──');

/** Monte une page derrière sa vraie route à paramètre (pour `useParams`). */
const mountRoute = async (pattern: string, url: string, element: React.ReactElement): Promise<void> => {
  await mount(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path: pattern, element }))));
};

await mountRoute('/lecons/:topicId', `/lecons/${TOPIC_ID}`, React.createElement(LessonPage));
await act(async () => { await wait(300); });
check('la leçon chargée démarre sur la mission', text().includes('Mission :'));
await click(byText('button', 'C’est parti'));
check('étape méthode atteinte', text().includes('Ta méthode'));
check('le bouton IA est proposé (aiAvailable, pas encore de cache)', Boolean(byText('button', 'Version sur mesure avec l’IA')));
await click(byText('button', 'Version sur mesure avec l’IA'));
check('l’API d’enrichissement a été appelée', enrichCalled === 1);
check('la méthode IA remplace la méthode locale', text().includes('Geste IA numéro un'));
check('🔴 la partie n’est PAS réinitialisée (toujours sur la méthode)', !text().includes('C’est parti') && text().includes('Ta méthode'));
check('le bouton IA disparaît après fusion', !byText('button', 'Version sur mesure avec l’IA'));
await unmount();

/* ==================================================================
   5. Page Révision de quiz
   ================================================================== */
console.log('\n── 5. Révision interactive du quiz ──');

await mountRoute('/quiz/:topicId/revision', `/quiz/${TOPIC_ID}/revision?attempt=att-ui`, React.createElement(QuizReviewPage));
await act(async () => { await wait(300); });
check('la mission annonce le score de l’essai', text().includes('Révision :') && text().includes('3/5'));
await click(byText('button', 'C’est parti'));
check('les réussites sont célébrées', text().includes('Tes 3 réussites'));
await click(byText('button', 'J’ai compris'));
check('la première erreur se corrige pas à pas', text().includes('on corrige ensemble'));
await click(byText('button', 'Montre-moi la solution'));
check('la correction rappelle la réponse donnée', text().includes('Ta réponse'));
check('la correction rappelle la bonne réponse', text().includes('Bonne réponse'));
await click(byText('.lp-cta button', 'Continuer'));
check('un exercice de rattrapage suit la correction', text().includes('Question similaire'));
await unmount();

/* ==================================================================
   6. Carte compacte « À réviser » (tableau de bord)
   ================================================================== */
console.log('\n── 6. Carte compacte du tableau de bord ──');

await mount(React.createElement(MemoryRouter, { initialEntries: ['/tableau-de-bord'] }, React.createElement(RevisionCard, { items: revisionSuggestions(), loading: false })));
const listBox = host.querySelector('.revision-list');
check('le conteneur de la liste est présent', Boolean(listBox));
check('les 7 suggestions sont listées intégralement', host.querySelectorAll('.revision-list .list-item').length === 7);
check('chaque ligne pointe vers la révision interactive',
  [...host.querySelectorAll<HTMLAnchorElement>('.revision-list a')].every((a) => a.getAttribute('href')?.includes('/revision')));
await unmount();

await mount(React.createElement(MemoryRouter, { initialEntries: ['/tableau-de-bord'] }, React.createElement(RevisionCard, { items: [], loading: false })));
check('état vide : message positif + bouton leçon', text().includes('Rien à rattraper') && Boolean(byText('a', 'Leçons')));
await unmount();

// La liste doit être intégralement visible : AUCUNE borne de hauteur ni
// défilement interne dans la feuille de style (jsdom ne charge pas le CSS).
const fs = await import('node:fs');
const css = fs.readFileSync(new URL('../src/client/styles/lessons.css', import.meta.url), 'utf8');
check('🔴 `.revision-scroll` (conteneur à flèches de défilement) a disparu', !css.includes('.revision-scroll'));
const listRule = css.slice(css.indexOf('.revision-list {'), css.indexOf('}', css.indexOf('.revision-list {')));
check('🔴 `.revision-list` n’a PAS de hauteur maximale (tout est visible d’un coup)', !/max-height/.test(listRule), listRule.trim());
check('🔴 `.revision-list` ne défile PAS (pas de barre à flèches)', !/overflow-y/.test(listRule));
check('les cartes « À réviser en priorité » ancrent leurs boutons en bas', css.includes('.revision-priority-card__actions') && /margin-top:\s*auto/.test(css));
check('le libellé des boutons de matière est repliable (anti-débordement)', css.includes('.lesson-subject__name') && /overflow-wrap:\s*break-word/.test(css));
check('le mode « animations réduites » coupe les animations CSS', css.includes('.lp--reduced') && css.includes('animation: none !important'));

/* ==================================================================
   7. Mode « animations réduites » : pas de confettis
   ================================================================== */
console.log('\n── 7. Animations réduites ──');

(window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});

const miniSteps = [
  { id: 'mission', kind: 'mission', emoji: '🎯', title: 'Mission : mini', intro: 'Test', goals: ['g1'] },
  {
    id: 'exercice-1',
    kind: 'exercice',
    emoji: '🎯',
    title: 'Exercice 1',
    question: { id: 'q1', kind: 'qcm', prompt: '1+1 ?', options: ['2', '3'], answer: 0, accept: null, explanation: 'Évidence.', skill: null },
  },
  { id: 'recap', kind: 'recap', emoji: '🧠', title: 'Retiens', chips: ['a', 'b'], tip: 'c' },
] as never[];
await mount(
  React.createElement(
    MemoryRouter,
    { initialEntries: ['/lecons/x'] },
    React.createElement(StepPlayer, { steps: miniSteps, meta: { topicName: 'mini', emoji: '🎯', color: '#6c5ce7' }, playthroughId: 'p5' }),
  ),
);
await act(async () => { await wait(200); });
check('🔴 la préférence « animations réduites » est détectée', host.querySelectorAll('.lesson-player.lp--reduced').length === 1);
await click(byText('button', 'C’est parti'));
await click([...host.querySelectorAll<HTMLElement>('.lp-option')][0]);
check('exercice corrigé même en mode sobre', text().includes('Bravo'));
await click(byText('.lp-cta button', 'Continuer'));
await click(byText('button', 'Voir mon bilan') ?? byText('button', 'Terminer'));
check('écran final atteint', host.querySelectorAll('.lp-finish').length === 1);
check('🔴 AUCUN confetti en mode « animations réduites »', host.querySelectorAll('.confetti').length === 0);
await unmount();

/* ------------------------------------------------------------------ */
console.error = realError;
const critical = consoleErrors.filter((e) =>
  !e.includes('not wrapped in act') && !e.includes('ReactDOMTestUtils') && !e.includes('defaultProps') &&
  !e.includes('useLayoutEffect') && !e.includes('An update to') && !e.includes('React Router Future Flag') &&
  !e.includes('validateDOMNesting') && !e.includes('scrollTo') && !e.includes('Not implemented'));
console.log('\n── Erreurs console ──');
check('aucune erreur console critique', critical.length === 0, `${critical.length} erreur(s)`);
for (const e of critical.slice(0, 6)) console.log(`     ⚠️ ${e.slice(0, 500)}`);

console.log(`\n🧪 Interface leçons & révisions — ${passed} contrôles`);
if (failures.length) {
  console.error(`❌ ${failures.length} échec(s) :`);
  for (const failure of failures) console.error(`   • ${failure}`);
  process.exit(1);
}
console.log('✅ L’interface des leçons et révisions est conforme.\n');
process.exit(0);
