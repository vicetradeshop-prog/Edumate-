#!/usr/bin/env node
/**
 * EduMate — Test de bout en bout avec une VRAIE base Upstash (simulée).
 *
 * Le serveur Express réel démarre avec UPSTASH_REDIS_REST_URL pointé vers un
 * faux serveur Upstash fidèle au contrat REST (scripts/mock-upstash.mjs), y
 * compris dans ses erreurs. On rejoue le parcours complet qui a échoué sur
 * Render : inscription, listing admin (lecture groupée), quiz, correction,
 * progression, organisation, export des données et suppression de compte.
 *
 * Objectif : qu'aucune erreur Upstash ne puisse plus passer inaperçue avant
 * un déploiement (« ERR unsupported arg type », quota, clés orphelines…).
 *
 * Lancement : npm run test:e2e-db
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createUpstashMock } from './mock-upstash.mjs';
import { stopProcess, tsx } from './lib/tools.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
const PORT = Number(process.env.E2E_DB_PORT ?? 8901);
const BASE = `http://127.0.0.1:${PORT}`;
// `--built` teste le bundle de production (dist/server/index.js), c'est-à-dire
// exactement ce que Render exécute.
/** `--badurl` : teste une URL Upstash mal collée (suffixe /pipeline). */
const URL_SUFFIXE = process.argv.includes('--badurl') || process.env.EDUMATE_E2E_BADURL === '1';

const BUILT =
  (process.env.EDUMATE_E2E_BUILT === '1' || process.argv.includes('--built')) &&
  fs.existsSync(path.join(root, 'dist', 'server', 'index.js'));

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
/*  Client HTTP avec cookies + CSRF (identique au frontend réel)       */
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
  delete(urlPath, options) {
    return this.request('DELETE', urlPath, options);
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Scénario                                                           */
/* ------------------------------------------------------------------ */

async function runJourney(mock) {
  const anon = new Client();

  console.log('\n── Base de données');
  const health = await anon.get('/api/health');
  check('/api/health → 200', health.status === 200);
  check('base annoncée : upstash', health.body.database === 'upstash', String(health.body.database));
  check('base prête', health.body.databaseReady === true, String(health.body.databaseError ?? health.body.databaseNotice));
  check('aucune erreur de base au démarrage', !health.body.databaseError, String(health.body.databaseError));

  // Ce script démarre le serveur avec ALLOW_DEMO_ACCOUNT=false : c'est l'endroit
  // idéal pour verrouiller le comportement « pas de compte de démonstration ».
  console.log('\n── Compte de démonstration (désactivé par défaut)');
  const demoSession = await anon.get('/api/auth/session');
  check('session annonce demoAvailable=false', demoSession.body?.demoAvailable === false, String(demoSession.body?.demoAvailable));
  const demoLogin = await anon.post('/api/auth/demo', {}, { allowError: true });
  check('POST /api/auth/demo refusé', demoLogin.status === 400, `HTTP ${demoLogin.status}`);
  check(
    'message de refus explicite',
    /démonstration|demonstration/i.test(String(demoLogin.body?.message ?? '')),
    String(demoLogin.body?.message ?? ''),
  );
  const demoOptions = await anon.get('/api/auth/options');
  check('options annonce demoAvailable=false', demoOptions.body?.demoAvailable === false, String(demoOptions.body?.demoAvailable));

  console.log('\n── Compte');
  const signup = await anon.post('/api/auth/signup', {
    firstName: 'Camille',
    email: 'Eleve@Exemple.FR',
    password: 'motdepasse123',
    level: 'seconde',
    subjects: ['mathematiques', 'physique-chimie'],
  });
  check('inscription → 201', signup.status === 201, `HTTP ${signup.status}`);
  check('premier compte = administrateur', signup.body.user?.role === 'admin', String(signup.body.user?.role));
  check('e-mail normalisé en minuscules', signup.body.user?.email === 'eleve@exemple.fr', String(signup.body.user?.email));
  check('hash jamais renvoyé au client', !JSON.stringify(signup.body).includes('scrypt$'));

  const me = await anon.get('/api/auth/session');
  check('session relue depuis Upstash', me.body.user?.firstName === 'Camille', JSON.stringify(me.body).slice(0, 160));

  console.log('\n── Administration (lecture groupée)');
  const users = await anon.get('/api/admin/users');
  check('liste des comptes → 200', users.status === 200, `HTTP ${users.status}`);
  check('1 compte listé via pipeline', users.body.total === 1, String(users.body.total));
  check('aucun hash dans la liste admin', !JSON.stringify(users.body).includes('scrypt$'));
  const stats = await anon.get('/api/admin/stats');
  check('statistiques admin → 200', stats.status === 200, `HTTP ${stats.status}`);

  console.log('\n── Quiz');
  const search = await anon.get('/api/search?subject=mathematiques&level=seconde&limit=5');
  const topicId = search.body.items?.[0]?.id;
  check('recherche de sujets', Boolean(topicId), JSON.stringify(search.body).slice(0, 120));

  const quiz = await anon.post('/api/generate', { topicId, count: 6, seed: 99 });
  check('génération de 6 questions', quiz.body.questions?.length >= 5, String(quiz.body.questions?.length));
  const leaked = JSON.stringify(quiz.body.questions);
  check('aucune bonne réponse envoyée au navigateur', !/"correctAnswer"/.test(leaked) && !/"isCorrect":true/.test(leaked));

  const answers = quiz.body.questions.map((question, index) => ({ questionId: question.id, value: index === 0 ? 1 : 0 }));
  const graded = await anon.post('/api/grade', { topicId, seed: 99, durationSec: 42, answers });
  check('correction côté serveur → 200', graded.status === 200, `HTTP ${graded.status}`);
  check('score cohérent', graded.body.score >= 0 && graded.body.score <= graded.body.total, `${graded.body.score}/${graded.body.total}`);

  const progressStats = await anon.get('/api/progress/stats');
  check('tentative enregistrée dans Upstash', progressStats.body.attempts === 1, String(progressStats.body.attempts));
  const history = await anon.get('/api/progress/history');
  check('historique relu depuis la base', history.body.total === 1, String(history.body.total));

  console.log('\n── Organisation');
  const task = await anon.post('/api/organize/tasks', { title: 'Relire le cours de philo', subjectId: 'philosophie' });
  check('création d’une tâche', task.status === 201, `HTTP ${task.status}`);
  const tasks = await anon.get('/api/organize/tasks');
  check('tâche relue depuis la base', JSON.stringify(tasks.body).includes('Relire le cours de philo'));
  const today = new Date().toISOString().slice(0, 10);
  const event = await anon.post('/api/organize/events', { title: 'DM de maths', date: today, kind: 'devoir', subjectId: 'mathematiques' });
  check('création d’un événement', event.status === 201, `HTTP ${event.status}`);
  check('événement relu depuis la base', JSON.stringify((await anon.get('/api/organize/events')).body).includes('DM de maths'));

  console.log('\n── Assistant');
  const ask = await anon.post('/api/tutor/ask', { message: 'Comment dériver f(x) = 3x^2 + 2x ?', mode: 'expliquer', subjectId: 'mathematiques' });
  check('réponse de l’assistant', ask.status === 200 && String(ask.body.content ?? '').length > 20, `HTTP ${ask.status} · ${JSON.stringify(ask.body).slice(0, 120)}`);
  check('conversation persistée', (await anon.get('/api/tutor/conversations')).body.conversations?.length >= 1);

  console.log('\n── Données personnelles');
  const exported = await anon.get('/api/auth/me/export');
  check('export → 200', exported.status === 200, `HTTP ${exported.status}`);
  check('export : compte présent', exported.body.account?.email === 'eleve@exemple.fr');
  check('export : progression présente', exported.body.progress?.attempts?.length === 1);
  check('export : tâches présentes', exported.body.tasks?.length >= 1);
  check('export : calendrier présent', exported.body.calendar?.length >= 1);
  check('export : conversations présentes', exported.body.conversations?.length >= 1);
  check('export : aucun hash de mot de passe', !JSON.stringify(exported.body).includes('scrypt$'));

  console.log('\n── Second compte puis suppression');
  const second = new Client();
  const created = await second.post('/api/auth/signup', {
    firstName: 'Noé',
    email: 'second@exemple.fr',
    password: 'motdepasse123',
    level: 'troisieme',
  });
  const secondId = created.body.user?.id;
  check('second compte créé', Boolean(secondId));
  check('le second compte n’est PAS administrateur', created.body.user?.role === 'eleve', String(created.body.user?.role));
  check('le second compte ne voit pas l’administration', (await second.get('/api/admin/users', { allowError: true })).status === 403);
  await second.post('/api/organize/tasks', { title: 'Exercices de Noé' });
  await second.post('/api/generate', { topicId, count: 5, seed: 7 });
  await second.post('/api/grade', {
    topicId,
    seed: 7,
    durationSec: 10,
    answers: (await second.post('/api/generate', { topicId, count: 5, seed: 7 })).body.questions.map((question) => ({ questionId: question.id, value: 1 })),
  });

  const before = [...mock.store.keys()].filter((key) => key.includes(secondId)).length;
  check('données du second compte bien écrites', before >= 3, `${before} clés`);

  const removed = await second.delete('/api/auth/me');
  check('suppression du compte → 200', removed.status === 200, `HTTP ${removed.status}`);
  const orphans = [...mock.store.keys()].filter((key) => key.includes(secondId));
  check('aucune clé orpheline après suppression', orphans.length === 0, orphans.join(', '));
  check('index des comptes mis à jour', (await anon.get('/api/admin/users')).body.total === 1, 'le compte supprimé doit disparaître de la liste');

  console.log('\n── Intégrité du dialogue avec Upstash');
  const nested = mock.requests.filter((entry) => entry.args.some((arg) => Array.isArray(arg) || (arg && typeof arg === 'object')));
  check('aucun argument imbriqué envoyé à Redis', nested.length === 0, JSON.stringify(nested).slice(0, 200));
  const unknown = mock.log.filter((entry) => !['GET', 'SET', 'DEL', 'KEYS', 'PING'].includes(entry[0]));
  check('uniquement des commandes Redis prises en charge', unknown.length === 0, JSON.stringify(unknown).slice(0, 200));
  const finalHealth = await anon.get('/api/health');
  check('base toujours prête en fin de parcours', finalHealth.body.databaseReady === true, String(finalHealth.body.databaseError));
  check('aucune erreur Upstash dans les journaux du serveur', !/unsupported arg type|ERR /.test(serverLog), (serverLog.match(/ERR .*/g) ?? []).join(' | ').slice(0, 200));

  console.log(`\n── Coût en requêtes HTTP (quota gratuit : 10 000 commandes/jour)`);
  console.log(`   ${mock.hits} requêtes pour ${mock.log.length} commandes Redis (groupage actif)`);
  check('le groupage réduit bien le nombre de requêtes', mock.hits < mock.log.length, `${mock.hits} requêtes / ${mock.log.length} commandes`);
}

/* ------------------------------------------------------------------ */
/*  Démarrage                                                          */
/* ------------------------------------------------------------------ */

let serverLog = '';

async function main() {
  const mock = createUpstashMock();
  const dbPort = await mock.listen(0);
  console.log(`\n🗄️  Faux serveur Upstash prêt sur le port ${dbPort}`);

  const logPath = path.join(root, 'e2e-db-server.log');
  const log = fs.openSync(logPath, 'w');
  const launcher = BUILT
    ? { command: process.execPath, args: [path.join('dist', 'server', 'index.js')] }
    : tsx([path.join('src', 'server', 'index.ts')]);
  console.log(`🚀 Serveur testé : ${BUILT ? 'build de production (dist)' : 'code source (tsx)'}`);
  const server = spawn(launcher.command, launcher.args, {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      // Variante volontairement « mal collée » (suffixe /pipeline + espaces) :
      // la normalisation doit rendre le serveur pleinement fonctionnel.
      UPSTASH_REDIS_REST_URL: URL_SUFFIXE ? `  http://127.0.0.1:${dbPort}/pipeline  ` : `http://127.0.0.1:${dbPort}`,
      UPSTASH_REDIS_REST_TOKEN: 'jeton-de-test',
      UPSTASH_KEY_PREFIX: 'edumate-e2e',
      UPSTASH_MAX_RETRIES: '0',
      FALLBACK_STORAGE: 'memory',
      SESSION_SECRET: 'e2e-secret-0123456789abcdef',
      // Le fichier .env local est charge par le serveur : on force le mode
      // hors-ligne pour que les tests restent deterministes et n'appellent
      // jamais une vraie API d'IA (quota, latence, reseau).
      AI_PROVIDER: 'none',
      ALLOW_DEMO_ACCOUNT: 'false',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
    },
    stdio: ['ignore', log, log],
  });

  if (!(await waitForServer())) {
    stopProcess(server);
    fs.closeSync(log);
    console.error('❌ Le serveur n’a pas démarré :\n' + fs.readFileSync(logPath, 'utf8').slice(0, 4000));
    await mock.close();
    process.exit(1);
  }

  try {
    await runJourney(mock);
  } catch (error) {
    failures.push(`erreur inattendue : ${error.message}`);
    console.error('💥', error);
  } finally {
    stopProcess(server);
    fs.closeSync(log);
    serverLog = fs.readFileSync(logPath, 'utf8');
  }

  await mock.close();

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  Résultat : ${passed} contrôles réussis, ${failures.length} échec(s)`);
  if (failures.length) {
    console.log('\n  Détail des échecs :');
    for (const failure of failures) console.log(`   • ${failure}`);
    console.log('\n  Dernières lignes du serveur :');
    console.log(serverLog.split('\n').slice(-25).join('\n'));
  }
  console.log('='.repeat(62));
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('💥 Erreur du test :', error);
  process.exit(1);
});
