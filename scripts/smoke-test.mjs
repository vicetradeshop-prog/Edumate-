#!/usr/bin/env node
/**
 * EduMate — Test de bout en bout de l'API (100 % Node, sans Python).
 *
 * Démarre le serveur (build de production ou code source via tsx), puis vérifie
 * toutes les routes critiques : santé, catalogue, recherche, génération de quiz,
 * inscription, connexion, CSRF, correction, progression, calendrier, tâches,
 * favoris, assistant IA, traduction, annuaire des lycées, protection des routes.
 *
 * Lancement :
 *   npm run test:api          (code source, via tsx)
 *   npm run test:api:built    (build de production : dist/server/index.js)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stopProcess, tsx } from './lib/tools.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8899);
const BASE = `http://127.0.0.1:${PORT}`;
/** Administrateur déclaré : sert à tester la promotion et le refus d'accès. */
const ADMIN_EMAIL = 'admin.smoke@edumate.test';

const BUILT =
  (process.env.EDUMATE_SMOKE_BUILT === '1' || process.argv.includes('--built')) &&
  fs.existsSync(path.join(root, 'dist/server/index.js'));

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
/*  Client HTTP minimal avec cookies + CSRF (comme le frontend réel)   */
/* ------------------------------------------------------------------ */

class Client {
  constructor() {
    this.cookies = new Map();
    this.csrf = '';
  }

  get cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(method, urlPath, { body, headers = {}, allowError = false } = {}) {
    const finalHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
    if (this.cookies.size) finalHeaders.Cookie = this.cookieHeader;
    const token = this.csrf || this.cookies.get('edumate_csrf') || '';
    if (token && method !== 'GET' && !('X-CSRF-Token' in finalHeaders)) {
      finalHeaders['X-CSRF-Token'] = token;
    }

    const response = await fetch(BASE + urlPath, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // Mémorise les cookies (Set-Cookie peut apparaître plusieurs fois).
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }

    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    if (payload && typeof payload === 'object' && payload.csrfToken) this.csrf = payload.csrfToken;

    if (!response.ok && !allowError) {
      throw new Error(`${method} ${urlPath} → HTTP ${response.status} : ${text.slice(0, 300)}`);
    }
    return { status: response.status, body: payload, text };
  }

  get(urlPath, options) {
    return this.request('GET', urlPath, options);
  }
  post(urlPath, body, options) {
    return this.request('POST', urlPath, { ...options, body: body ?? {} });
  }
  put(urlPath, body, options) {
    return this.request('PUT', urlPath, { ...options, body });
  }
  patch(urlPath, body, options) {
    return this.request('PATCH', urlPath, { ...options, body });
  }
  delete(urlPath, options) {
    return this.request('DELETE', urlPath, options);
  }
}

const qs = (params) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

/* ------------------------------------------------------------------ */
/*  Démarrage du serveur                                               */
/* ------------------------------------------------------------------ */

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const stop = stopProcess;

/* ------------------------------------------------------------------ */
/*  Scénario                                                           */
/* ------------------------------------------------------------------ */

async function runTests() {
  const anon = new Client();

  console.log('\n── Santé & configuration');
  const health = await anon.get('/api/health');
  check('GET /api/health répond 200', health.status === 200);
  check('health.ok est vrai', health.body?.ok === true);
  check('catalogue chargé (> 1000 sujets)', health.body.catalog.topics > 1000, String(health.body.catalog.topics));
  check('tous les sujets jouables', health.body.catalog.playable === health.body.catalog.topics);
  check('base de données signalée', ['memory', 'file', 'upstash'].includes(health.body.database), health.body.database);
  check('statut IA renseigné', Boolean(health.body.ai?.provider));

  console.log('\n── Catalogue & navigation');
  const catalog = await anon.get('/api/catalog');
  check('GET /api/catalog (10 matières)', catalog.status === 200 && catalog.body.subjects.length === 10);
  check('4 niveaux proposés', catalog.body.levels.length === 4);
  const browse = await anon.get('/api/browse');
  check('GET /api/browse (> 50 thèmes)', browse.status === 200 && browse.body.themes.length > 50, String(browse.body.themes?.length));

  const searchDerivation = await anon.get(`/api/search?${qs({ q: 'dérivée', limit: 5 })}`);
  check('Recherche « dérivée »', searchDerivation.status === 200 && searchDerivation.body.total > 0);
  check('Résultats pertinents (maths)', searchDerivation.body.items.slice(0, 3).every((item) => item.subjectId.includes('math')));

  const searchFilter = await anon.get(`/api/search?${qs({ subject: 'francais', level: 'seconde', limit: 40 })}`);
  check('Filtre matière + niveau', searchFilter.status === 200 && searchFilter.body.total > 20, String(searchFilter.body.total));
  check('Facettes renvoyées', Array.isArray(searchFilter.body.facets?.levels) && searchFilter.body.facets.levels.length >= 1);

  const searchDifficulty = await anon.get(`/api/search?${qs({ difficulty: 'facile', limit: 10 })}`);
  check('Filtre difficulté', searchDifficulty.body.items.every((item) => item.difficulty === 'facile'));

  const missing = await anon.get('/api/topics/inexistant', { allowError: true });
  check('Sujet inconnu → 404', missing.status === 404, String(missing.status));

  console.log('\n── Génération de quiz (échantillon aléatoire)');
  const all = await anon.get('/api/search?limit=120');
  const pool = all.body.items;
  const sample = [];
  for (let i = 0; i < 12; i += 1) sample.push(pool[Math.floor(Math.random() * pool.length)]);
  for (const topic of pool.filter((item) => item.source.startsWith('bank:')).slice(0, 2)) sample.push(topic);

  let okQuiz = 0;
  let okQuestions = 0;
  for (const topic of sample) {
    const quiz = await anon.post('/api/generate', { topicId: topic.id, count: 8 }, { allowError: true });
    if (quiz.status !== 200) {
      failures.push(`generate ${topic.id} → ${quiz.status}`);
      continue;
    }
    const questions = quiz.body.questions ?? [];
    if (questions.length < 5) {
      failures.push(`generate ${topic.id} : ${questions.length} questions`);
      continue;
    }
    if (questions.some((question) => 'answer' in question || 'explanation' in question)) {
      failures.push(`generate ${topic.id} : réponses exposées au client`);
      continue;
    }
    if (questions.some((question) => !question.prompt || (question.kind !== 'texte' && question.options.length < 2))) {
      failures.push(`generate ${topic.id} : question invalide`);
      continue;
    }
    okQuiz += 1;
    okQuestions += questions.length;
  }
  check('Génération de 12+ quiz aléatoires', okQuiz >= 12, `${okQuiz}/${sample.length}`);
  check('Questions complètes, sans fuite de réponse', okQuestions >= 80, `${okQuestions} questions`);

  const quizA = await anon.post('/api/generate', { topicId: sample[0].id, count: 6, seed: 42 });
  const quizB = await anon.post('/api/generate', { topicId: sample[0].id, count: 6, seed: 42 });
  check(
    'Même graine → même session (correction fiable)',
    JSON.stringify(quizA.body.questions.map((q) => q.prompt)) === JSON.stringify(quizB.body.questions.map((q) => q.prompt)),
  );
  const quizC = await anon.post('/api/generate', { topicId: sample[0].id, count: 6, seed: 43 });
  check(
    'Graine différente → session différente',
    JSON.stringify(quizC.body.questions.map((q) => q.prompt)) !== JSON.stringify(quizA.body.questions.map((q) => q.prompt)),
  );

  console.log('\n── Protection des routes');
  check('Progression sans session → 401', (await anon.get('/api/progress/stats', { allowError: true })).status === 401);
  check('Assistant sans session → 401', (await anon.get('/api/tutor/conversations', { allowError: true })).status === 401);
  check('Admin sans session → 401', (await anon.get('/api/admin/users', { allowError: true })).status === 401);
  check('Génération sans sujet → 400', (await anon.post('/api/generate', {}, { allowError: true })).status === 400);

  console.log('\n── Inscription, session, profil');
  const email = `eleve${Date.now()}@example.com`;
  const client = new Client();
  const signup = await client.post(
    '/api/auth/signup',
    {
      firstName: 'Léa',
      email,
      password: 'motdepasse123',
      age: 16,
      school: 'Lycée Test',
      level: 'premiere',
      subjects: ['mathematiques', 'francais'],
      avatar: '🦉',
    },
    { allowError: true },
  );
  check('Inscription → 201', signup.status === 201, `${signup.status} ${JSON.stringify(signup.body).slice(0, 160)}`);
  check('Session créée (cookie)', client.cookies.has('edumate_session'));
  check('Jeton CSRF délivré', Boolean(signup.body.csrfToken));
  check('Mot de passe jamais renvoyé', !JSON.stringify(signup.body).includes('passwordHash'));

  check('E-mail déjà utilisé → 409', (await client.post('/api/auth/signup', { firstName: 'Léa', email, password: 'motdepasse123' }, { allowError: true })).status === 409);
  const weak = new Client();
  check('Mot de passe faible → 400', (await weak.post('/api/auth/signup', { firstName: 'Xx', email: 'a@b.co', password: 'court' }, { allowError: true })).status === 400);
  check('E-mail invalide → 400', (await weak.post('/api/auth/signup', { firstName: 'Ok', email: 'pas-un-email', password: 'motdepasse123' }, { allowError: true })).status === 400);

  const session = await client.get('/api/auth/session');
  check('Session → profil complet', session.status === 200 && session.body.user.firstName === 'Léa');
  const options = await anon.get('/api/auth/options');
  check('Options d’inscription (4 niveaux, 10 matières)', options.body.levels.length === 4 && options.body.subjects.length === 10);

  const updated = await client.put('/api/auth/me', { firstName: 'Léa-Marie', tagline: 'Objectif bac !' });
  check('Mise à jour du profil', updated.status === 200 && updated.body.user.firstName === 'Léa-Marie');
  const prefs = await client.put('/api/auth/me/preferences', { theme: 'sombre', accent: '#00b894', dailyGoal: 30 });
  check('Préférences enregistrées', prefs.status === 200 && prefs.body.user.preferences.theme === 'sombre');

  console.log('\n── CSRF');
  const noCsrf = new Client();
  for (const [name, value] of client.cookies) noCsrf.cookies.set(name, value);
  const csrfAttack = await noCsrf.post('/api/organize/tasks', { title: 'Pirate' }, { headers: { 'X-CSRF-Token': '' }, allowError: true });
  check('Requête mutative sans en-tête CSRF → 403', csrfAttack.status === 403, `HTTP ${csrfAttack.status}`);

  console.log('\n── Quiz, correction et progression');
  const topicId = sample[0].id;
  const quiz = await client.post('/api/generate', { topicId, count: 6, seed: 99 });
  check('Génération authentifiée', quiz.status === 200 && quiz.body.questions.length >= 5);

  const answers = quiz.body.questions.map((question, index) => ({ questionId: question.id, value: index === 0 ? 1 : 0 }));
  const graded = await client.post('/api/grade', { topicId, seed: 99, durationSec: 42, answers });
  check('Correction → 200', graded.status === 200);
  check('Score cohérent', graded.body.total === quiz.body.questions.length && graded.body.score >= 0 && graded.body.score <= graded.body.total);
  check('Explications fournies', graded.body.results.every((result) => Boolean(result.explanation)));
  check('Bonne réponse renvoyée après correction', graded.body.results.every((result) => result.answer !== null || result.accept));

  const stats = await client.get('/api/progress/stats');
  check('Statistiques de progression', stats.status === 200 && stats.body.attempts === 1, JSON.stringify(stats.body.attempts));
  check('Détail par matière', Array.isArray(stats.body.bySubject) && stats.body.bySubject.length >= 1);
  check('Historique des 30 jours', stats.body.last30Days.length === 30);
  check('Historique des quiz', (await client.get('/api/progress/history')).body.total === 1);
  check('Maîtrise par sujet', (await client.get('/api/progress/topics')).body.items.length === 1);
  check('La correction ne renvoie plus de planification Leitner', graded.body?.review === undefined);
  check('Identifiant d’essai renvoyé (cible du bouton « Réviser »)', typeof graded.body?.attemptId === 'string' && graded.body.attemptId.length > 0);

  /*
   * Leçons interactives & révisions de quiz (remplacent la révision espacée).
   */
  console.log('\n── Leçons interactives & révisions');
  const lesson = await client.get(`/api/lessons/${topicId}?seed=7`);
  check('Leçon → 200', lesson.status === 200, `HTTP ${lesson.status}`);
  const lessonSteps = lesson.body?.lesson?.steps ?? [];
  check('Leçon : chaîne d’étapes valide (mission…recap)',
    lessonSteps.length >= 4 && lessonSteps[0].kind === 'mission' && lessonSteps[lessonSteps.length - 1].kind === 'recap');
  check('Leçon : exercice intégré avec correction embarquée',
    lessonSteps.some((step) => step.kind === 'exercice' && (step.question?.answer !== null || (step.question?.accept?.length ?? 0) > 0) && step.question?.explanation));
  check('Leçon : exemple guidé avec solution pas à pas',
    lessonSteps.some((step) => step.kind === 'exemple' && Array.isArray(step.solution) && step.solution.length > 0 && step.answerLabel));
  const lessonAgain = await client.get(`/api/lessons/${topicId}?seed=7`);
  check('Leçon déterministe (même graine → mêmes étapes)',
    JSON.stringify(lessonSteps) === JSON.stringify(lessonAgain.body?.lesson?.steps ?? []));
  const lessonAnon = await anon.get(`/api/lessons/${topicId}`, { allowError: true });
  check('Leçon accessible sans compte (contenu public)', lessonAnon.status === 200, `HTTP ${lessonAnon.status}`);
  const lesson404 = await client.get('/api/lessons/sujet-qui-nexiste-pas', { allowError: true });
  check('Leçon d’un sujet inconnu → 404', lesson404.status === 404, `HTTP ${lesson404.status}`);

  const revision = await client.get(`/api/lessons/revision/${topicId}`);
  check('Révision du dernier essai → 200', revision.status === 200, `HTTP ${revision.status}`);
  check('Révision en mode « quiz » (graine conservée avec l’essai)', revision.body?.mode === 'quiz', String(revision.body?.mode));
  check('Révision : autant de questions que l’essai corrigé', (revision.body?.items ?? []).length === graded.body.total);
  check('Révision : verdict et réponse de l’élève retrouvés',
    (revision.body?.items ?? []).every((item) => typeof item.correct === 'boolean' && item.explanation));
  const missedItems = (revision.body?.items ?? []).filter((item) => item.correct === false);
  check('Révision : rattrapage proposé après les erreurs',
    missedItems.length === 0 || missedItems.some((item) => item.remediation?.prompt),
    `${missedItems.filter((i) => i.remediation).length}/${missedItems.length}`);
  check('Révision : les rattrapages sont des questions neuves',
    (revision.body?.items ?? []).filter((i) => i.remediation).every((i) => !(revision.body?.items ?? []).some((q) => q.prompt === i.remediation.prompt)));
  const revisionAnon = await anon.get(`/api/lessons/revision/${topicId}`, { allowError: true });
  check('Révision protégée (anonyme → 401)', revisionAnon.status === 401, `HTTP ${revisionAnon.status}`);

  const enrich = await client.post(`/api/lessons/${topicId}/enrich`, {});
  check('Enrichissement IA sans fournisseur → repli gracieux (200, message)',
    enrich.status === 200 && (enrich.body?.ai === null || typeof enrich.body?.ai === 'object'),
    `HTTP ${enrich.status}`);

  console.log('\n── Favoris & recommandations');
  const fav = await client.post('/api/favorites', { topicId });
  check('Ajout d’un favori', fav.status === 200 && fav.body.added === true);
  const favList = await client.get('/api/favorites');
  check('Liste des favoris', favList.body.favorites.includes(topicId));
  const recos = await client.get('/api/recommendations');
  check('Recommandations personnalisées', recos.status === 200 && Array.isArray(recos.body.fresh) && recos.body.fresh.length > 0);

  console.log('\n── Organisation (calendrier & tâches)');
  const today = new Date().toISOString().slice(0, 10);
  const created = await client.post('/api/organize/events', { title: 'DM de maths', date: today, kind: 'devoir', subjectId: 'mathematiques', time: '18:30' });
  check('Création d’un événement', created.status === 201 && created.body.events.length === 1);
  const eventId = created.body.event.id;
  const edited = await client.put(`/api/organize/events/${eventId}`, { title: 'DM de maths (chap. 3)', done: true });
  check('Modification d’un événement', edited.status === 200 && edited.body.event.title.endsWith('(chap. 3)'));
  check('Événement sans date → 400', (await client.post('/api/organize/events', { title: 'Sans date' }, { allowError: true })).status === 400);
  check('Date au mauvais format → 400', (await client.post('/api/organize/events', { title: 'X', date: '31/12/2025' }, { allowError: true })).status === 400);
  check('Vue « aujourd’hui »', (await client.get('/api/organize/today')).body.upcoming !== undefined);
  check('Suppression d’un événement', (await client.delete(`/api/organize/events/${eventId}`)).status === 200);

  const task = await client.post('/api/organize/tasks', { title: 'Relire le cours de philo', subjectId: 'philosophie' });
  check('Création d’une tâche', task.status === 201 && task.body.tasks.length === 1);
  const taskDone = await client.put(`/api/organize/tasks/${task.body.task.id}`, { done: true });
  check('Tâche marquée terminée', taskDone.status === 200 && taskDone.body.task.done === true);

  console.log('\n── Assistant IA (tuteur intégré)');
  const tutorStatus = await client.get('/api/tutor/status');
  check('Statut de l’assistant', tutorStatus.status === 200 && Array.isArray(tutorStatus.body.modes));
  const ask = await client.post('/api/tutor/ask', { message: 'Comment dériver f(x) = 3x^2 + 2x ?', mode: 'expliquer', subjectId: 'mathematiques' });
  check('Réponse de l’assistant', ask.status === 200 && ask.body.content.length > 200);
  check('Mode utilisé signalé honnêtement', ask.body.offline === true || Boolean(ask.body.provider));
  check('Conversation enregistrée', Boolean(ask.body.conversationId));
  check('Historique des conversations', (await client.get('/api/tutor/conversations')).body.conversations.length >= 1);
  check('Détail d’une conversation', (await client.get(`/api/tutor/conversations/${ask.body.conversationId}`)).body.conversation.messages.length >= 2);
  check('Message trop court → 400', (await client.post('/api/tutor/ask', { message: 'x' }, { allowError: true })).status === 400);

  /* -------------------- Fiches de révision automatiques ------------------ */
  const fichesBefore = await client.get('/api/lessons/fiches');
  check('Fiches : liste accessible', fichesBefore.status === 200 && Array.isArray(fichesBefore.body.fiches));
  const ficheTopic = searchDerivation.body.items?.[0]?.id ?? 'mathematiques-seconde-equations-resoudre-equation-premier-degre';
  const locked = await client.get(`/api/lessons/fiches/${encodeURIComponent(ficheTopic)}`, { allowError: true });
  check('Fiche non débloquée → 404 verrouillée', locked.status === 404 && locked.body?.error === 'fiche_verrouillee');
  const fail = await client.post(`/api/lessons/${encodeURIComponent(ficheTopic)}/complete`, { score: 7, total: 10, durationSec: 120 });
  check('Leçon à 70 % → NON validée (seuil 80 %)', fail.status === 200 && fail.body.validated === false && fail.body.rate === 0.7);
  const statsAfterFail = await client.get('/api/progress/stats');
  check('Leçon échouée enregistrée dans l’historique', (statsAfterFail.body.lessons ?? []).some((l) => l.topicId === ficheTopic && l.validated === false));
  check('Temps de leçon compté aujourd’hui', (statsAfterFail.body.lessonSecondsToday ?? 0) >= 120);
  const win = await client.post(`/api/lessons/${encodeURIComponent(ficheTopic)}/complete`, { score: 9, total: 10, durationSec: 90 });
  check('Leçon ≥ 80 % → validée + fiche', win.status === 200 && win.body.validated === true && win.body.already === false);
  check('Fiche débloquée : contenu complet', win.body.fiche?.sections?.length >= 3 && win.body.fiche?.flashcards?.length >= 4);
  const win2 = await client.post(`/api/lessons/${encodeURIComponent(ficheTopic)}/complete`, { score: 10, total: 10 });
  check('Second déblocage : already = true, date conservée', win2.body.already === true && win2.body.fiche.unlockedAt === win.body.fiche.unlockedAt);
  const statsLessons = await client.get('/api/progress/stats');
  check('Progression : leçon validée visible', (statsLessons.body.lessons ?? []).some((l) => l.topicId === ficheTopic && l.validated === true && l.completions >= 3));
  const fichesAfter = await client.get('/api/lessons/fiches');
  check('Fiches : hub contient la fiche', fichesAfter.body.fiches.length === 1 && fichesAfter.body.fiches[0].topicId === ficheTopic);
  const ficheDetail = await client.get(`/api/lessons/fiches/${encodeURIComponent(ficheTopic)}`);
  check('Fiche : détail complet', ficheDetail.status === 200 && ficheDetail.body.fiche.topicId === ficheTopic);
  const badScore = await client.post(`/api/lessons/${encodeURIComponent(ficheTopic)}/complete`, { score: 99, total: 2 }, { allowError: true });
  check('Fiches : score invalide → 400', badScore.status === 400);

  /* ------------------- Planning de révision automatique ------------------ */
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const examCreate = await client.post('/api/planning/exams', {
    subjectId: 'mathematiques',
    title: 'Contrôle de dérivation',
    date: in7,
    topics: [ficheTopic],
    dailyMinutes: 30,
    selfLevel: 'moyen',
  });
  check('Planning : création d’un contrôle', examCreate.status === 201 && Boolean(examCreate.body.exam?.id));
  check('Planning : événement calendrier créé', Boolean(examCreate.body.exam?.calendarEventId));
  const examId = examCreate.body.exam?.id;
  const gen = await client.post(`/api/planning/exams/${examId}/generate`, {});
  check('Planning : génération', gen.status === 200 && gen.body.plan.days.length === 8 && gen.body.plan.exam.planReady === true);
  check('Planning : quiz blanc + express présents', gen.body.plan.days.some((d) => d.sessions.some((s) => s.activity === 'quizblanc')) && gen.body.plan.days.some((d) => d.sessions.some((s) => s.activity === 'express')));
  const firstSession = gen.body.plan.days[0].sessions[0];
  const doneS = await client.post(`/api/planning/exams/${examId}/sessions/${encodeURIComponent(firstSession.id)}`, { status: 'done' });
  check('Planning : séance terminée → progression', doneS.status === 200 && doneS.body.plan.prepPercent > 0);
  const second = doneS.body.plan.days[0].sessions.find((s) => s.status === 'prevue') ?? doneS.body.plan.days[1].sessions[0];
  const postponed = await client.post(`/api/planning/exams/${examId}/sessions/${encodeURIComponent(second.id)}`, { status: 'postponed' });
  const movedSession = postponed.body.plan.days.flatMap((d) => d.sessions).find((s) => s.id === second.id);
  check('Planning : report décale la séance', postponed.status === 200 && movedSession && movedSession.date > second.date);
  const todayPlan = await client.get('/api/planning/today');
  check('Planning : vue aujourd’hui', todayPlan.status === 200 && Array.isArray(todayPlan.body.today.sessions));
  const list = await client.get('/api/planning/exams');
  check('Planning : liste avec résumés', list.status === 200 && list.body.exams[0]?.prepPercent >= 0 && list.body.exams[0].nextSession !== undefined);
  const closed = await client.patch(`/api/planning/exams/${examId}`, { status: 'termine', feedback: 'bien', grade: 15, gradeMax: 20 });
  check('Planning : clôture + ressenti + note', closed.status === 200 && closed.body.exam.status === 'termine' && closed.body.exam.grade === 15);
  const badDate = await client.post('/api/planning/exams', { subjectId: 'mathematiques', title: 'Hop', date: '2020-01-01' }, { allowError: true });
  check('Planning : date passée refusée', badDate.status === 400);
  const removed = await client.delete(`/api/planning/exams/${examId}`);
  check('Planning : suppression propre', removed.status === 200 && removed.body.exams.length === 0);

  /* -------- v2.4 : thème ciblé, calendrier, détection de quiz lié -------- */
  const themes = await client.get('/api/browse?subject=mathematiques');
  // Thème du sujet dont la leçon a été validée plus haut : la case « leçon »
  // doit donc être cochée dans le planning de ce contrôle.
  const themeId = searchDerivation.body.items?.[0]?.themeId ?? themes.body.themes?.[0]?.id;
  check('Planning : thèmes disponibles', Boolean(themeId));
  const in5 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const plCreated = await client.post('/api/planning/exams', {
    subjectId: 'mathematiques',
    themeId,
    title: 'Contrôle de thèmes',
    date: in5,
    dailyMinutes: 30,
    selfLevel: 'moyen',
  });
  check('Planning : création par thème', plCreated.status === 201 && (plCreated.body.exam.topics ?? []).length >= 1 && plCreated.body.exam.themeId === themeId);
  const exam2 = plCreated.body.exam.id;
  // Leçon validée plus haut (ficheTopic) → case « leçon » cochée dans le planning
  const gen2 = await client.post(`/api/planning/exams/${exam2}/generate`, {});
  const notionFiche = gen2.body.plan.notions.find((n) => n.topicId === ficheTopic);
  check('Planning : case leçon cochée après leçon ≥ 80 %', notionFiche ? notionFiche.lessonOk === true : false);
  check('Planning : séances rattachées aux sujets du thème', gen2.body.plan.days.some((d) => d.sessions.length > 0) && gen2.body.plan.days.flatMap((d) => d.sessions).every((s) => plCreated.body.exam.topics.includes(s.topicId)));
  const plEvents = await client.get('/api/organize/events');
  const sessionEvents = (plEvents.body.events ?? []).filter((e) => (e.notes ?? '').includes('du planning'));
  check('Planning : séances synchronisées au calendrier', sessionEvents.length >= 2);
  // Quiz lié joué APRÈS la création → séance grisée automatiquement
  const target = gen2.body.plan.days[0].sessions[0];
  const plGen = await client.post('/api/generate', { topicId: target.topicId, count: 5, seed: 21 });
  const plAnswers = (plGen.questions ?? []).map((q, i) => ({ questionId: q.id, value: q.kind === 'texte' ? 'x' : i % 4 }));
  await client.post('/api/grade', { topicId: target.topicId, seed: plGen.seed, durationSec: 70, answers: plAnswers });
  const after = await client.get(`/api/planning/exams/${exam2}`);
  const autoSession = after.body.plan.days.flatMap((d) => d.sessions).find((s) => s.id === target.id);
  const lastAttempt = (await client.get('/api/progress/stats')).body.recent?.[0];
  const attemptPercent = lastAttempt?.percent ?? 0;
  // Règle v2.5.2 : un essai RÉUSSI (≥ 80 %) grise la séance ; un échec la
  // laisse « à faire » (l'élève doit rejouer).
  check(
    'Planning : auto-complétion seulement si quiz lié réussi',
    attemptPercent >= 80 ? autoSession?.autoDone === true : autoSession?.autoDone !== true && autoSession?.status !== 'done',
    `essai=${attemptPercent} % session=${autoSession?.status}/auto=${autoSession?.autoDone}`,
  );
  // Séance future verrouillée côté données : date > aujourd’hui
  const future = after.body.plan.days.slice(1).flatMap((d) => d.sessions).find((s) => s.status === 'prevue');
  check('Planning : séances futures datées', Boolean(future) && future.date > new Date().toISOString().slice(0, 10));
  // Report → l'événement calendrier suit
  const postponed2 = await client.post(`/api/planning/exams/${exam2}/sessions/${encodeURIComponent(future.id)}`, { status: 'postponed' });
  const plEventsAfter = await client.get('/api/organize/events');
  const movedEvent = (plEventsAfter.body.events ?? []).find((e) => e.id === (postponed2.body.plan.exam.sessionEvents ?? {})[future.id]);
  check('Planning : report synchronisé au calendrier', movedEvent && movedEvent.date === postponed2.body.plan.days.flatMap((d) => d.sessions).find((s) => s.id === future.id).date);
  /* -------- v2.8 : journal des ajustements & rôles planning/calendrier -------- */
  const journalNow = await client.get(`/api/planning/exams/${exam2}`);
  check('Planning : journal présent (génération + quiz + report)', (journalNow.body.plan.exam.journal ?? []).length >= 3);
  check('Planning : journal explique le quiz', (journalNow.body.plan.exam.journal ?? []).some((e) => e.kind === 'quiz' && e.message.includes('Quiz')));
  check('Planning : journal explique le report', (journalNow.body.plan.exam.journal ?? []).some((e) => e.kind === 'session' && e.message.includes('reportée')));
  const calEvents = await client.get('/api/organize/events');
  const sessionEvent = (calEvents.body.events ?? []).find((e) => (e.notes ?? '').startsWith('planning:'));
  const examEvent = (calEvents.body.events ?? []).find((e) => (e.notes ?? '').startsWith('planning-exam:'));
  check('Calendrier : séances marquées planning', Boolean(sessionEvent));
  check('Calendrier : contrôle marqué planning', Boolean(examEvent));
  // Termine une séance du contrôle 2 AVANT le changement de date : elle doit
  // survivre au recalcul (même identifiant, même statut, même date).
  const doneTarget = gen2.body.plan.days[0].sessions[0];
  const doneMark = await client.post(`/api/planning/exams/${exam2}/sessions/${encodeURIComponent(doneTarget.id)}`, { status: 'done' });
  check('Planning : séance marquée terminée', doneMark.body.plan.days.flatMap((d) => d.sessions).some((s) => s.id === doneTarget.id && s.status === 'done'));
  const newDate = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  const moved = await client.patch(`/api/planning/exams/${exam2}`, { date: newDate });
  check('Planning : changement de date journalisé', (moved.body.exam.journal ?? []).some((e) => e.message.includes('Contrôle modifié')));
  const calAfter = await client.get('/api/organize/events');
  const examEventAfter = (calAfter.body.events ?? []).find((e) => e.id === examEvent?.id);
  check('Calendrier : événement contrôle resynchronisé', examEventAfter?.date === newDate);
  const doneSessions = moved.body.plan.days.flatMap((d) => d.sessions).filter((s) => s.status === 'done');
  check('Planning : séances terminées conservées après recalcul', doneSessions.length >= 1);

  const removed2 = await client.delete(`/api/planning/exams/${exam2}`);
  const plEventsEnd = await client.get('/api/organize/events');
  check('Planning : suppression nettoie le calendrier', removed2.status === 200 && !(plEventsEnd.body.events ?? []).some((e) => (e.notes ?? '').includes('du planning')));

  console.log('\n── Services externes (traduction, lycées)');
  check('Liste des langues', (await anon.get('/api/services/translate/languages')).body.languages.length >= 10);
  check('Détection de langue (français)', (await anon.get(`/api/services/translate/detect?${qs({ q: 'Bonjour, comment vas-tu aujourd’hui ?' })}`)).body.language === 'fr');
  check('Détection de langue (anglais)', (await anon.get(`/api/services/translate/detect?${qs({ q: 'Hello, how are you doing today my friend?' })}`)).body.language === 'en');
  const translation = await anon.get(`/api/services/translate?${qs({ q: 'bonjour', source: 'fr', target: 'en' })}`, { allowError: true });
  check(
    translation.status === 200 ? 'Traduction fr→en' : 'Traduction fr→en (réseau indisponible : erreur propre)',
    translation.status === 200 ? Boolean(translation.body.translatedText) : [503, 504].includes(translation.status),
    `HTTP ${translation.status}`,
  );
  const schools = await anon.get(`/api/services/schools?${qs({ q: 'Lyon' })}`, { allowError: true });
  check('Recherche de lycées (open data)', schools.status === 200 && Array.isArray(schools.body.schools), `HTTP ${schools.status}`);

  console.log('\n── Déconnexion & compte démo');
  await client.post('/api/auth/logout');
  check('Déconnexion (cookie supprimé)', !client.cookies.has('edumate_session'));
  check('Session fermée → 401', (await client.get('/api/progress/stats', { allowError: true })).status === 401);

  const demo = new Client();
  const demoResponse = await demo.post('/api/auth/demo', {}, { allowError: true });
  check('Compte de démonstration', demoResponse.status === 200 && demoResponse.body.user.email === 'demo@edumate.app', `HTTP ${demoResponse.status}`);
  if (demoResponse.status === 200) {
    check('Progression du compte démo accessible', (await demo.get('/api/progress/stats')).status === 200);
  }

  console.log('\n── Connexion / mot de passe');
  const login = new Client();
  const logged = await login.post('/api/auth/login', { email, password: 'motdepasse123' }, { allowError: true });
  check('Connexion avec mot de passe', logged.status === 200 && logged.body.user.email === email, `HTTP ${logged.status}`);
  check('Mauvais mot de passe → 401', (await login.post('/api/auth/login', { email, password: 'mauvais' }, { allowError: true })).status === 401);
  check('Compte inexistant → 401 (même message)', (await login.post('/api/auth/login', { email: 'inconnu@example.com', password: 'motdepasse123' }, { allowError: true })).status === 401);
  check('Changement de mot de passe : ancien incorrect → 401', (await login.post('/api/auth/me/password', { currentPassword: 'mauvais', newPassword: 'nouveaumdp123' }, { allowError: true })).status === 401);
  check('Changement de mot de passe', (await login.post('/api/auth/me/password', { currentPassword: 'motdepasse123', newPassword: 'nouveaumdp123' }, { allowError: true })).status === 200);
  const relogin = new Client();
  check('Connexion avec le nouveau mot de passe', (await relogin.post('/api/auth/login', { email, password: 'nouveaumdp123' }, { allowError: true })).status === 200);

  console.log('\n── Données personnelles (export & suppression)');
  // La session précédente a été fermée par le test de déconnexion : on se
  // reconnecte (le mot de passe a été changé plus haut) pour tester l'export.
  const owner = new Client();
  const reopened = await owner.post('/api/auth/login', { email, password: 'nouveaumdp123' }, { allowError: true });
  check('Reconnexion pour le test des données', reopened.status === 200, `HTTP ${reopened.status}`);
  const exported = await owner.request('GET', '/api/auth/me/export', { allowError: true });
  check('Export des données → 200', exported.status === 200, `HTTP ${exported.status}`);
  if (exported.status === 200) {
    const payload = JSON.parse(exported.text);
    check('Export : profil sans mot de passe', Boolean(payload.account) && !JSON.stringify(payload.account).includes('passwordHash'));
    check('Export : progression incluse', Array.isArray(payload.progress?.attempts));
    check('Export : favoris, calendrier, tâches, conversations', Array.isArray(payload.favorites) && Array.isArray(payload.calendar) && Array.isArray(payload.tasks) && Array.isArray(payload.conversations));
    check('Export : horodatage', Boolean(payload.exportedAt));
  }

  const beforeDelete = await owner.get('/api/progress/stats');
  check('Progression présente avant suppression', beforeDelete.body.attempts >= 1);

  const deleted = await owner.delete('/api/auth/me', { headers: { 'X-CSRF-Token': owner.csrf } });
  check('Suppression du compte → 200', deleted.status === 200, `HTTP ${deleted.status}`);
  check('Suppression : plusieurs clés effacées', Number(deleted.body?.deletedKeys ?? 0) >= 6, String(deleted.body?.deletedKeys));
  const afterDelete = await owner.get('/api/progress/stats', { allowError: true });
  check('Session fermée après suppression → 401', afterDelete.status === 401, `HTTP ${afterDelete.status}`);
  const reloginAfterDelete = await new Client().post('/api/auth/login', { email, password: 'nouveaumdp123' }, { allowError: true });
  check('Compte réellement supprimé de la base → 401', reloginAfterDelete.status === 401, `HTTP ${reloginAfterDelete.status}`);

  console.log('\n── Administration');
  // Le tout premier compte d'une base vide devient administrateur : on crée donc
  // un élève supplémentaire pour vérifier le refus d'accès.
  const student = new Client();
  const studentEmail = `eleve-${Date.now()}@smoke.test`;
  const studentSignup = await student.post('/api/auth/signup', { firstName: 'Théo', email: studentEmail, password: 'motdepasse123' });
  check('Un compte créé après le premier n’est pas administrateur', studentSignup.body.user?.role === 'eleve', String(studentSignup.body.user?.role));
  check('Admin refusé pour un élève → 403', (await student.get('/api/admin/users', { allowError: true })).status === 403);

  // Une adresse listée dans ADMIN_EMAIL devient administrateur à la connexion.
  const adminClient = new Client();
  await adminClient.post('/api/auth/signup', { firstName: 'Ada', email: ADMIN_EMAIL, password: 'motdepasse123' });
  const adminLogin = await adminClient.post('/api/auth/login', { email: ADMIN_EMAIL, password: 'motdepasse123' });
  check('ADMIN_EMAIL promu administrateur à la connexion', adminLogin.body.user?.role === 'admin', String(adminLogin.body.user?.role));
  const adminUsers = await adminClient.get('/api/admin/users', { allowError: true });
  check('Accès administrateur autorisé → 200', adminUsers.status === 200, `HTTP ${adminUsers.status}`);
  check('Liste des comptes renvoyée à l’administrateur', Array.isArray(adminUsers.body?.users) && adminUsers.body.users.length >= 2, String(adminUsers.body?.total));
  check('Aucun hash de mot de passe dans la liste admin', !JSON.stringify(adminUsers.body ?? {}).includes('scrypt$'));
  const adminStats = await adminClient.get('/api/admin/stats', { allowError: true });
  check('Statistiques administrateur → 200', adminStats.status === 200, `HTTP ${adminStats.status}`);

  /*
   * Service worker et politique de cache.
   *
   * ⚠️ Réservé au mode `--built` : en mode source, `CLIENT_DIST` pointe sur
   * `src/client/` (le gabarit), qui ne contient ni `sw.js` ni manifeste
   * compilé. Ces fichiers n'existent que dans `dist/client/`, produit par
   * `vite build` — qui copie `public/` tel quel.
   *
   * `sw.js` DOIT être servi en `no-cache` : avec le `maxAge: 7d` appliqué aux
   * autres statiques en production, un service worker ne serait pas mis à jour
   * avant une semaine, et toute correction de stratégie de cache mettrait
   * autant de temps à atteindre les élèves.
   */
  if (BUILT) {
      console.log('\n── Service worker (PWA)');
      const swResponse = await fetch(`${BASE}/sw.js`);
      check('sw.js servi → 200', swResponse.status === 200, `HTTP ${swResponse.status}`);
      check(
        'sw.js en Cache-Control: no-cache (et non max-age)',
        /no-cache/.test(swResponse.headers.get('cache-control') ?? '') && !/max-age=\d{4,}/.test(swResponse.headers.get('cache-control') ?? ''),
        String(swResponse.headers.get('cache-control')),
      );
      const swBody = await swResponse.text();
      check('sw.js est bien du JavaScript', swBody.includes("addEventListener('install'"), `${swBody.length} octets`);
      check(
        'sw.js n’intercepte JAMAIS l’API',
        swBody.includes("url.pathname.startsWith('/api/')") && swBody.includes('return;'),
        'règle d’exclusion de /api absente',
      );
      /*
       * 🔴 Régression « je suis resté sur l'ancienne version ».
       *
       * Deux défauts la provoquaient :
       *   1. la coquille était pré-cachée sous DEUX clés (`/` et `/index.html`)
       *      mais revalidée sous une seule — l'entrée `/` restait figée pour
       *      toujours ;
       *   2. la stratégie « cache d'abord » servait l'ancien HTML avant même
       *      d'essayer le réseau, donc un redéploiement restait invisible
       *      jusqu'au second chargement.
       * On verrouille les trois propriétés qui les corrigent.
       */
      check('sw.js utilise une clé de coquille UNIQUE', swBody.includes("const SHELL_KEY = '/index.html'"), 'SHELL_KEY absent');
      check(
        'sw.js ne pré-cache PAS « / » séparément (source de la divergence)',
        !/SHELL_FILES\s*=\s*\[[^\]]*['"]\/['"]/.test(swBody),
        'SHELL_FILES contient encore "/"',
      );
      check(
        'sw.js sert le HTML en réseau d’abord avec délai',
        swBody.includes('SHELL_NETWORK_TIMEOUT_MS') && swBody.includes('Promise.race'),
        'stratégie réseau-d’abord absente',
      );
      check(
        'sw.js détecte un changement de version et prévient la page',
        swBody.includes('SW_UPDATED') && swBody.includes('notifyClientsUpdate'),
        'détection de changement absente',
      );
      check('sw.js ne met pas /api en cache', !/cache\.put\([^)]*\/api/.test(swBody));
      check(
        'VERSION du service worker >= v2 (purge des anciennes coquilles)',
        Number((swBody.match(/const VERSION = 'v(\d+)'/) ?? [0, 0])[1]) >= 2,
        String((swBody.match(/const VERSION = '(v\d+)'/) ?? [])[1]),
      );

      const manifestResponse = await fetch(`${BASE}/manifest.webmanifest`);
      check('manifeste servi → 200', manifestResponse.status === 200, `HTTP ${manifestResponse.status}`);
      check(
        'manifeste en no-cache',
        /no-cache/.test(manifestResponse.headers.get('cache-control') ?? ''),
        String(manifestResponse.headers.get('cache-control')),
      );
      const manifest = await manifestResponse.json();
      check('manifeste installable (display standalone)', manifest.display === 'standalone', String(manifest.display));
      check('manifeste : start_url et scope racine', manifest.start_url === '/' && manifest.scope === '/');
      check('manifeste : au moins une icône 512', (manifest.icons ?? []).some((icon) => String(icon.sizes).includes('512')));

      const indexResponse = await fetch(`${BASE}/`);
      check(
        'index.html en no-cache (sinon chunks périmés après redéploiement)',
        /no-cache/.test(indexResponse.headers.get('cache-control') ?? ''),
        String(indexResponse.headers.get('cache-control')),
      );
      const indexBody = await indexResponse.text();
      check('la page référence le manifeste', indexBody.includes('manifest.webmanifest'));
  }

  console.log('\n── Frontend statique');
  const page = await anon.get('/', { allowError: true });
  if (BUILT) {
    check('Le build du frontend est servi', page.status === 200 && page.text.includes('<div id="root">'), page.text.slice(0, 120));
  } else {
    check('Page d’information API (frontend non compilé)', page.status === 200 && page.text.includes('EduMate'));
  }
}

/* ------------------------------------------------------------------ */
/*  Lancement                                                          */
/* ------------------------------------------------------------------ */

async function main() {
  // Sur Windows, les wrappers .cmd de npm ne peuvent pas être « spawnés »
  // directement (EINVAL) : on passe par node + le point d'entrée JS de tsx.
  const launcher = BUILT
    ? { command: process.execPath, args: [path.join('dist', 'server', 'index.js')] }
    : tsx([path.join('src', 'server', 'index.ts')]);
  const label = BUILT ? 'build de production' : 'code source (tsx)';

  console.log(`\n🚀 Démarrage du serveur EduMate (${label}) sur le port ${PORT}…`);
  const logPath = path.join(root, 'smoke-server.log');
  const log = fs.openSync(logPath, 'w');
  const server = spawn(launcher.command, launcher.args, {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      FALLBACK_STORAGE: 'memory',
      SESSION_SECRET: 'smoke-test-secret-0123456789',
      // Le fichier .env local est charge par le serveur : on force le mode
      // hors-ligne pour que les tests restent deterministes et n'appellent
      // jamais une vraie API d'IA (quota, latence, reseau).
      AI_PROVIDER: 'none',
      ALLOW_DEMO_ACCOUNT: 'true',
      ADMIN_EMAIL: ADMIN_EMAIL,
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
    },
    stdio: ['ignore', log, log],
  });

  if (!(await waitForServer())) {
    stop(server);
    const output = fs.readFileSync(logPath, 'utf8');
    console.error('❌ Le serveur n’a pas démarré :\n' + output.slice(0, 4000));
    process.exit(1);
  }

  try {
    await runTests();
  } finally {
    stop(server);
    fs.closeSync(log);
  }

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  Résultat : ${passed} contrôles réussis, ${failures.length} échec(s)`);
  if (failures.length) {
    console.log('\n  Détail des échecs :');
    for (const failure of failures) console.log(`   • ${failure}`);
  }
  console.log('='.repeat(62));
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Erreur du test :', error);
  process.exit(1);
});
