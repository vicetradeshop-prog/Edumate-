#!/usr/bin/env node
/**
 * Vérification de bout en bout des fonctions IA (build de production) :
 *  - /api/health          → assistant IA configuré
 *  - /api/services/translate → traduction réelle via l'IA
 *  - /api/tutor/ask       → réponse IA (offline: false)
 *  - /api/coach           → coach post-quiz (offline: false)
 *
 * Usage : node scripts/verify-ai.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PORT = Number(process.env.VERIFY_PORT ?? 8890);
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(import.meta.dirname, '..');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
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

class Client {
  constructor() {
    this.cookies = [];
    this.csrf = '';
  }
  async request(method, url, body) {
    const headers = { Accept: 'application/json', Cookie: this.cookies.join('; ') };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrf) headers['X-CSRF-Token'] = this.csrf;
    const response = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) {
      const [pair] = cookie.split(';');
      const name = pair.split('=')[0];
      this.cookies = this.cookies.filter((c) => !c.startsWith(`${name}=`));
      this.cookies.push(pair);
      if (name === 'edumate_csrf') this.csrf = decodeURIComponent(pair.split('=').slice(1).join('='));
    }
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    return { status: response.status, body: payload };
  }
  get(url) {
    return this.request('GET', url);
  }
  post(url, body) {
    return this.request('POST', url, body ?? {});
  }
}

const logPath = path.join(root, 'verify-ai-server.log');
const log = fs.openSync(logPath, 'w');
const server = spawn(process.execPath, [path.join('dist', 'server', 'index.js')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    FALLBACK_STORAGE: 'memory',
    SESSION_SECRET: 'verify-ai-secret-0123456789',
    ALLOW_DEMO_ACCOUNT: 'true',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
  },
  stdio: ['ignore', log, log],
});

function stop() {
  try {
    server.kill('SIGTERM');
  } catch {
    /* déjà arrêté */
  }
}

try {
  if (!(await waitForServer())) {
    console.error('❌ Serveur non démarré :\n' + fs.readFileSync(logPath, 'utf8').slice(0, 3000));
    stop();
    process.exit(1);
  }

  const client = new Client();

  console.log('\n── Santé du service');
  const health = await client.get('/api/health');
  check('Assistant IA configuré', health.body?.ai?.configured === true, JSON.stringify(health.body?.ai));

  console.log('\n── Traduction (IA)');
  const translation = await client.get('/api/services/translate?q=Bonjour%2C%20comment%20vas-tu%20aujourd%27hui%20%3F&source=fr&target=en');
  check(
    'Traduction fr→en réussie',
    translation.status === 200 && typeof translation.body?.translatedText === 'string' && translation.body.translatedText.length > 3,
    `${translation.status} → ${JSON.stringify(translation.body).slice(0, 160)}`,
  );
  const auto = await client.get('/api/services/translate?q=Hello%2C%20how%20are%20you%20today%3F&target=fr');
  check(
    'Traduction auto→fr réussie',
    auto.status === 200 && typeof auto.body?.translatedText === 'string' && auto.body.translatedText.length > 3,
    `${auto.status} → ${JSON.stringify(auto.body).slice(0, 160)}`,
  );

  console.log('\n── Session élève');
  const email = `verify${Date.now()}@example.com`;
  const signup = await client.post('/api/auth/signup', { firstName: 'Vérif', email, password: 'motdepasse123', level: 'seconde' });
  check('Inscription', signup.status === 200 || signup.status === 201, `HTTP ${signup.status}`);

  console.log('\n── Tuteur (IA réelle attendue)');
  const ask = await client.post('/api/tutor/ask', { message: 'Explique-moi comment dériver f(x) = 3x^2 + 2x, avec un exemple.', mode: 'expliquer', subjectId: 'mathematiques' });
  check('Réponse du tuteur', ask.status === 200 && (ask.body?.content ?? '').length > 200, `HTTP ${ask.status}, ${ask.body?.content?.length ?? 0} caractères`);
  check('Tuteur en mode IA (hors-ligne = false)', ask.body?.offline === false, JSON.stringify({ offline: ask.body?.offline, provider: ask.body?.provider }));

  console.log('\n── Coach de quiz (IA réelle attendue)');
  const search = await client.get('/api/search?q=math');
  const topicId = search.body?.items?.[0]?.id;
  check('Sujet de quiz trouvé', Boolean(topicId), String(topicId));
  const generated = await client.post('/api/generate', { topicId, count: 5 });
  check('Quiz généré', generated.status === 200 && generated.body?.questions?.length >= 3, `HTTP ${generated.status}`);
  const answers = (generated.body?.questions ?? []).map((question, index) => ({ questionId: question.id, value: index === 0 ? 0 : 1 }));
  const graded = await client.post('/api/grade', { topicId, seed: generated.body?.seed ?? 1, durationSec: 60, answers });
  check('Quiz corrigé', graded.status === 200 && Array.isArray(graded.body?.results), `HTTP ${graded.status}`);

  const coach = await client.post('/api/coach', {
    topicName: generated.body?.topic?.name ?? 'Quiz',
    score: graded.body?.score ?? 0,
    total: graded.body?.total ?? 5,
    message: 'Explique-moi comment trouver la bonne réponse à la question 1, étape par étape.',
    questions: (graded.body?.results ?? []).map((item) => ({
      prompt: item.prompt,
      options: item.options,
      answer: item.answer,
      given: item.given,
      accept: item.accept,
      explanation: item.explanation,
      correct: item.correct,
      skill: item.skill,
    })),
  });
  check('Coach : réponse 200', coach.status === 200, `HTTP ${coach.status}`);
  check('Coach : contenu substantiel', (coach.body?.content ?? '').length > 150, `${coach.body?.content?.length ?? 0} caractères`);
  check('Coach : mode IA (hors-ligne = false)', coach.body?.offline === false, JSON.stringify({ offline: coach.body?.offline }));
  const coachShort = await client.post('/api/coach', { message: 'x' });
  check('Coach : message trop court → 400', coachShort.status === 400, `HTTP ${coachShort.status}`);
  const anon = new Client();
  const coachAnon = await anon.post('/api/coach', { message: 'Explique-moi la question 1.' });
  check('Coach : anonyme → 401', coachAnon.status === 401, `HTTP ${coachAnon.status}`);

  console.log('\n── Aperçu des réponses IA');
  console.log('  Traduction fr→en :', JSON.stringify(translation.body?.translatedText));
  console.log('  Traduction auto→fr :', JSON.stringify(auto.body?.translatedText));
  console.log('  Coach (extrait) :', JSON.stringify((coach.body?.content ?? '').slice(0, 220)));

  console.log(`\n${failures === 0 ? '✅ Tout est vérifié.' : `❌ ${failures} vérification(s) en échec.`}`);
  stop();
  process.exit(failures === 0 ? 0 : 1);
} catch (error) {
  console.error('Erreur fatale :', error);
  stop();
  process.exit(1);
}
