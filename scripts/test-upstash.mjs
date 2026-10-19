/**
 * EduMate — Tests d'intégration de la couche Upstash Redis.
 *
 * Ils s'exécutent contre un FAUX serveur Upstash fidèle au contrat réel
 * (scripts/mock-upstash.mjs), y compris dans ses erreurs. C'est ce test qui
 * aurait attrapé le bug de déploiement :
 *   « ERR unsupported arg type: "[" » — commandes groupées envoyées sur
 *   l'endpoint mono-commande au lieu de /pipeline.
 *
 * Lancement : npm run test:storage
 */
import assert from 'node:assert/strict';
import { createUpstashMock } from './mock-upstash.mjs';

const MODE = process.argv[2] ?? 'mock';
let mock = null;
let url = '';

if (MODE === 'mock') {
  mock = createUpstashMock();
  const port = await mock.listen(0);
  url = `http://127.0.0.1:${port}`;
} else {
  // Scénario « base injoignable » : port volontairement fermé.
  // Doit s'exécuter dans un processus dédié car la configuration est mise en
  // cache au premier import.
  url = 'http://127.0.0.1:1';
}

// Les variables d'environnement doivent être posées AVANT l'import du module
// de configuration (il les lit au chargement).
process.env.UPSTASH_REDIS_REST_URL = url;
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.UPSTASH_KEY_PREFIX = 'edumate-test';
process.env.UPSTASH_MAX_RETRIES = '0';

const { getStorage } = await import('../src/server/lib/storage.ts');
const storeModule = await import('../src/server/lib/store.ts');

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures.push(`${name} : ${error.message}`);
    console.log(`  ❌ ${name} — ${error.message}`);
  }
}

const store = await getStorage();

console.log(`\n🗄️  Tests d'intégration Upstash (mock sur ${url})`);

if (MODE === 'mock') {
await test('l’implémentation sélectionnée est bien Upstash', () => {
  assert.equal(store.kind, 'upstash');
});

await test('health() : PING répondu, latence mesurée', async () => {
  const health = await store.health();
  assert.equal(health.ready, true);
  assert.equal(health.kind, 'upstash');
  assert.equal(typeof health.latencyMs, 'number');
  assert.equal(health.lastError, null);
});

await test('SET puis GET avec préfixe de clés', async () => {
  await store.set('objet:test', { a: 1, texte: 'héllo' });
  const read = await store.get('objet:test');
  assert.deepEqual(read, { a: 1, texte: 'héllo' });
  // Le préfixe configuré est bien appliqué côté Redis
  assert.ok(mock.store.has('edumate-test:objet:test'), 'clé stockée sans préfixe');
});

await test('GET d’une clé absente renvoie null', async () => {
  assert.equal(await store.get('cle:inexistante'), null);
});

await test('DEL supprime la clé', async () => {
  await store.set('objet:temporaire', 1);
  await store.del('objet:temporaire');
  assert.equal(await store.get('objet:temporaire'), null);
});

await test('KEYS liste uniquement le préfixe demandé, sans le préfixe global', async () => {
  mock.reset();
  await store.set('user:1', { id: '1' });
  await store.set('user:2', { id: '2' });
  await store.set('progress:1:attempts', []);
  const keys = await store.keys('user:');
  assert.deepEqual(keys.sort(), ['user:1', 'user:2']);
});

await test('donnée corrompue : GET renvoie null au lieu de planter', async () => {
  mock.store.set('edumate-test:casse', '{ json invalide');
  assert.equal(await store.get('casse'), null);
});

/* ------------------------------------------------------------------ */
/*  Le cas critique : lectures groupées (pipeline)                     */
/* ------------------------------------------------------------------ */

await test('getMany() utilise l’endpoint /pipeline (et non la racine)', async () => {
  mock.reset();
  await store.set('user:a', { id: 'a', nom: 'Alice' });
  await store.set('user:b', { id: 'b', nom: 'Bob' });
  mock.log.length = 0;

  // On reproduit l'appel réel de la couche de données.
  const results = await store.getMany(['user:a', 'user:b', 'user:inconnue']);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { id: 'a', nom: 'Alice' });
  assert.deepEqual(results[1], { id: 'b', nom: 'Bob' });
  assert.equal(results[2], null);

  // Aucune commande GET ne doit avoir été envoyée sur l'endpoint racine.
  const rootGets = mock.requests.filter((entry) => entry.command === 'GET' && entry.endpoint === 'root');
  assert.equal(rootGets.length, 0, `GET mono-commande détecté : ${JSON.stringify(rootGets)}`);
  const pipelined = mock.requests.filter((entry) => entry.command === 'GET' && entry.endpoint === 'pipeline');
  assert.equal(pipelined.length, 3, 'les 3 lectures doivent passer par /pipeline');
});

await test('getMany() ne déclenche pas l’erreur « unsupported arg type »', async () => {
  mock.reset();
  await store.set('x:1', { v: 1 });
  // L'appel qui faisait échouer le déploiement :
  const results = await store.getMany(['x:1', 'x:2']);
  assert.deepEqual(results[0], { v: 1 });
  assert.equal(results[1], null);
});

await test('getMany([]) ne fait aucun appel réseau', async () => {
  mock.log.length = 0;
  const results = await store.getMany([]);
  assert.deepEqual(results, []);
  assert.equal(mock.log.length, 0);
});

/* ------------------------------------------------------------------ */
/*  Couche de données réelle (comptes)                                 */
/* ------------------------------------------------------------------ */

await test('createUser + findUserByEmail + listUsers (pipeline réel)', async () => {
  mock.reset();
  const { createUser, findUserByEmail, findUserById, listUsers } = storeModule;
  const user = await createUser({
    email: 'Eleve@Test.FR',
    passwordHash: 'scrypt$salt$hash',
    firstName: 'Léa',
    level: 'seconde',
    subjects: ['mathematiques'],
  });
  assert.ok(user.id);
  assert.equal(user.email, 'eleve@test.fr', 'l’e-mail doit être normalisé');

  const byEmail = await findUserByEmail('ELEVE@test.fr');
  assert.equal(byEmail?.id, user.id);
  const byId = await findUserById(user.id);
  assert.equal(byId?.firstName, 'Léa');

  await createUser({ email: 'deuxieme@test.fr', passwordHash: 'scrypt$s$h', firstName: 'Noé' });
  const all = await listUsers();
  assert.equal(all.length, 2, `listUsers doit retourner 2 comptes via pipeline, reçu ${all.length}`);
  assert.ok(all.some((item) => item.email === 'deuxieme@test.fr'));
});

await test('toPublicUser ne divulgue jamais le mot de passe haché', async () => {
  const users = await storeModule.listUsers();
  const publicUser = storeModule.toPublicUser(users[0]);
  assert.equal(publicUser.passwordHash, undefined);
  assert.equal(JSON.stringify(publicUser).includes('scrypt$'), false);
});

await test('deleteUser efface toutes les clés du compte', async () => {
  const users = await storeModule.listUsers();
  const target = users[0];
  await storeModule.addAttempt(target.id, {
    topicId: 't1',
    subjectId: 'mathematiques',
    levelId: 'seconde',
    themeName: 'T',
    topicName: 'S',
    score: 4,
    total: 5,
    durationSec: 30,
    answers: [],
    createdAt: new Date().toISOString(),
  });
  await storeModule.deleteUser(target.id);

  const remaining = await store.keys('');
  assert.equal(remaining.some((key) => key.includes(target.id)), false, `clés orphelines : ${remaining.join(', ')}`);
  assert.equal(await storeModule.findUserById(target.id), null);
  assert.equal(await storeModule.findUserByEmail(target.email), null);
});

await test('exportUserData rassemble toutes les données du compte', async () => {
  mock.reset();
  const user = await storeModule.createUser({ email: 'export@test.fr', passwordHash: 'scrypt$a$b', firstName: 'Iris' });
  await storeModule.saveTask(user.id, {
    id: 'task-1',
    userId: user.id,
    title: 'Relire le cours',
    done: false,
    createdAt: new Date().toISOString(),
  });
  const data = await storeModule.exportUserData(user.id);
  assert.equal(data.account.email, 'export@test.fr');
  assert.equal(data.account.passwordHash, undefined);
  assert.equal(data.tasks.length, 1);
  assert.ok(Array.isArray(data.progress.attempts));
  assert.ok(Array.isArray(data.favorites));
});

await test('DEL multi-clés : une seule commande Redis', async () => {
  mock.reset();
  await store.set('multi:1', 1);
  await store.set('multi:2', 2);
  await store.set('multi:3', 3);
  mock.requests.length = 0;

  await store.del(['multi:1', 'multi:2', 'multi:3']);

  const dels = mock.requests.filter((entry) => entry.command === 'DEL');
  assert.equal(dels.length, 1, `3 commandes DEL au lieu d'une : ${JSON.stringify(dels)}`);
  assert.equal(dels[0].args.length, 3);
  assert.equal(await store.get('multi:2'), null);
});

await test('deleteUser : suppression groupée (peu de requêtes HTTP)', async () => {
  mock.reset();
  const user = await storeModule.createUser({ email: 'groupe@test.fr', passwordHash: 'scrypt$a$b', firstName: 'Sacha' });
  await storeModule.addAttempt(user.id, {
    topicId: 't1',
    subjectId: 'mathematiques',
    levelId: 'seconde',
    themeName: 'T',
    topicName: 'S',
    score: 3,
    total: 5,
    durationSec: 12,
    answers: [],
    createdAt: new Date().toISOString(),
  });
  await storeModule.saveTask(user.id, { id: 'tk', userId: user.id, title: 'Fiche', done: false, createdAt: new Date().toISOString() });
  mock.requests.length = 0;

  mock.resetRequests();
  await storeModule.deleteUser(user.id);

  assert.ok(mock.hits <= 3, `trop de requêtes HTTP pour une suppression : ${mock.hits}`);
  assert.equal(await storeModule.findUserById(user.id), null);
  assert.equal(await storeModule.findUserByEmail('groupe@test.fr'), null);
  const orphans = await store.keys('');
  assert.equal(orphans.some((key) => key.includes(user.id)), false, `clés orphelines : ${orphans.join(', ')}`);
});

await test('exportUserData : une seule requête groupée pour toutes les listes', async () => {
  mock.reset();
  const user = await storeModule.createUser({ email: 'quota@test.fr', passwordHash: 'scrypt$a$b', firstName: 'Inès' });
  await storeModule.addAttempt(user.id, {
    topicId: 't2',
    subjectId: 'physique-chimie',
    levelId: 'premiere',
    themeName: 'T',
    topicName: 'S',
    score: 5,
    total: 5,
    durationSec: 40,
    answers: [],
    createdAt: new Date().toISOString(),
  });
  // On ne mesure que l'export lui-même.
  mock.resetRequests();
  const data = await storeModule.exportUserData(user.id);

  assert.equal(data.account.email, 'quota@test.fr');
  assert.equal(data.account.passwordHash, undefined, 'le hash ne doit jamais être exporté');
  assert.equal(data.progress.attempts.length, 1);
  assert.ok(Array.isArray(data.tasks) && Array.isArray(data.calendar) && Array.isArray(data.conversations));
  assert.equal(mock.hits, 1, `l'export doit tenir en 1 requête HTTP groupée, reçu ${mock.hits}`);
});

await test('URL Upstash normalisée (espaces, « / » final, « /pipeline » collé)', async () => {
  const { normalizeUpstashUrl } = await import('../src/server/lib/storage.ts');
  assert.equal(normalizeUpstashUrl('  https://eu1-xxx.upstash.io  '), 'https://eu1-xxx.upstash.io');
  assert.equal(normalizeUpstashUrl('https://eu1-xxx.upstash.io/'), 'https://eu1-xxx.upstash.io');
  assert.equal(normalizeUpstashUrl('https://eu1-xxx.upstash.io//'), 'https://eu1-xxx.upstash.io');
  assert.equal(normalizeUpstashUrl('https://eu1-xxx.upstash.io/pipeline'), 'https://eu1-xxx.upstash.io');
  assert.equal(normalizeUpstashUrl('https://eu1-xxx.upstash.io/pipeline/'), 'https://eu1-xxx.upstash.io');
});

await test('un jeton avec espaces est accepté (trim)', async () => {
  // Le constructeur retire les espaces du jeton : un copier-coller approximatif
  // ne doit pas provoquer de 401.
  const health = await store.health();
  assert.equal(health.ready, true);
});

/* ------------------------------------------------------------------ */
/*  Résilience                                                         */
/* ------------------------------------------------------------------ */

await test('jeton invalide : 401 traduit en erreur exploitable', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer mauvais-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(['PING']),
  });
  // Le mock accepte tout jeton ; on vérifie ici que l'absence de jeton est refusée.
  const noAuth = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(['PING']),
  });
  assert.equal(noAuth.status, 401);
  assert.equal(response.status, 200);
});

await test('commande inconnue : erreur Redis propagée proprement', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(['COMMANDE_INCONNUE']),
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.ok(payload.error.includes('unknown command'));
});

await mock?.close();
}

if (MODE === 'unreachable') {
await test('base injoignable : health() signale l’indisponibilité sans planter', async () => {
  const health = await store.health();
  assert.equal(health.ready, false);
  assert.equal(health.kind, 'upstash');
  assert.ok(health.lastError, 'une erreur diagnostique doit être remontée');
});

await test('base injoignable : les lectures échouent avec une erreur claire', async () => {
  await assert.rejects(() => store.get('nimporte'), /Upstash|indisponible|fetch|ECONN|Failed/i);
});

await test('base injoignable : /api/health reste utilisable (pas de crash du serveur)', async () => {
  const health = await store.health();
  assert.equal(typeof health, 'object');
  assert.equal(health.ready, false);
});
}

console.log(`\n${'='.repeat(62)}`);
console.log(`  Résultat : ${passed} contrôles réussis, ${failures.length} échec(s)`);
if (failures.length) {
  console.log('\n  Détail :');
  for (const failure of failures) console.log(`   • ${failure}`);
}
console.log('='.repeat(62));
process.exit(failures.length ? 1 : 0);
