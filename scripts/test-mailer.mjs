#!/usr/bin/env node
/**
 * EduMate — Test de la configuration d'envoi d'e-mails.
 *
 * Vérifie ce que `smoke-test.mjs` ne peut pas couvrir : le DIAGNOSTIC, c'est-à-dire
 * ce que l'administrateur voit quand sa configuration est incomplète ou piégée.
 *
 * Trois démarrages réels du serveur, chacun avec un jeu de variables différent :
 *
 *   A. aucun fournisseur      → repli « journaux », test d'envoi refusé (400)
 *   B. smtp + hébergement Render + port 465
 *                             → 🔴 le piège doit être DÉTECTÉ et signalé,
 *                               échec d'envoi explicite, puis limite anti-abus
 *   C. brevo + clé + expéditeur @gmail.com
 *                             → avertissement de délivrabilité (SPF/DKIM impossibles)
 *
 * Aucun appel réseau sortant : le scénario B pointe SMTP_HOST sur 127.0.0.1
 * (connexion refusée immédiatement) et le scénario C ne déclenche pas d'envoi.
 *
 * Lancement : npm run test:mail
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stopProcess, tsx } from './lib/tools.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');

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

const ADMIN_EMAIL = 'admin.mail@edumate.test';
const ADMIN_PASSWORD = 'motdepasse123';

/* ------------------------------------------------------------------ */
/*  Client HTTP minimal (cookies + CSRF)                               */
/* ------------------------------------------------------------------ */

class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = '';
  }

  async request(method, urlPath, { body, allowError = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const token = this.csrf || this.cookies.get('edumate_csrf') || '';
    if (token && method !== 'GET') headers['X-CSRF-Token'] = token;

    const response = await fetch(this.base + urlPath, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
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
      throw new Error(`${method} ${urlPath} → HTTP ${response.status} : ${text.slice(0, 260)}`);
    }
    return { status: response.status, body: payload, text };
  }

  get(p, o) {
    return this.request('GET', p, o);
  }
  post(p, b, o) {
    return this.request('POST', p, { ...o, body: b ?? {} });
  }
}

/* ------------------------------------------------------------------ */
/*  Démarrage d'un serveur avec un jeu de variables donné              */
/* ------------------------------------------------------------------ */

async function startServer(port, extraEnv) {
  const logPath = path.join(root, 'mailer-test-server.log');
  const log = fs.openSync(logPath, 'w');
  const server = spawn(process.execPath, tsx([path.join('src', 'server', 'index.ts')]).args, {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      FALLBACK_STORAGE: 'memory',
      SESSION_SECRET: 'mailer-test-secret-0123456789',
      AI_PROVIDER: 'none',
      ALLOW_DEMO_ACCOUNT: 'false',
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      ...extraEnv,
    },
    stdio: ['ignore', log, log],
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        const health = await response.json();
        return { server, log, logPath, base, health };
      }
    } catch {
      /* pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const output = fs.readFileSync(logPath, 'utf8');
  stopProcess(server);
  throw new Error(`Le serveur n'a pas démarré sur le port ${port} :\n${output.slice(0, 2500)}`);
}

async function stopServer(instance) {
  stopProcess(instance.server);
  try {
    fs.closeSync(instance.log);
  } catch {
    /* déjà fermé */
  }
}

/** Ouvre une session administrateur et renvoie le client authentifié. */
async function adminClient(base) {
  const client = new Client(base);
  const login = await client.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { allowError: true });
  if (login.status !== 200) throw new Error(`Connexion administrateur impossible (HTTP ${login.status}) : ${login.text.slice(0, 200)}`);
  return client;
}

/* ------------------------------------------------------------------ */
/*  Scénarios                                                          */
/* ------------------------------------------------------------------ */

async function main() {
  /* ---------------- A. Aucun fournisseur configuré ---------------- */
  console.log('\n── A. Aucun fournisseur d’e-mails');
  const a = await startServer(8931, { MAIL_PROVIDER: '', MAIL_API_KEY: '' });
  try {
    check('health.mail présent', Boolean(a.health.mail), JSON.stringify(a.health.mail));
    check('health.mail.provider = log (repli journaux)', a.health.mail.provider === 'log', a.health.mail.provider);
    check('health.mail.configured = false', a.health.mail.configured === false);
    check('health.mail : compteurs à zéro', a.health.mail.sent === 0 && a.health.mail.failed === 0);
    check('🔒 health.mail.lastError jamais exposé', a.health.mail.lastError === undefined);

    const admin = await adminClient(a.base);
    const status = await admin.get('/api/admin/mail-status');
    check('GET /api/admin/mail-status → 200', status.status === 200, `HTTP ${status.status}`);
    check('diagnostic : non configuré', status.body.configured === false);
    check('diagnostic : le comportement de repli est expliqué', /journaux|LOGS/i.test(status.body.behaviour), status.body.behaviour);
    check('diagnostic : aucune donnée d’élève exposée', !JSON.stringify(status.body).includes('@edumate.test'), JSON.stringify(status.body).slice(0, 200));
    check('diagnostic : clé d’API masquée (vide ici)', status.body.apiKey === '');
    check('diagnostic : quota de tests annoncé', Number.isInteger(status.body.remainingTests) && status.body.remainingTests === 5, String(status.body.remainingTests));

    const test = await admin.post('/api/admin/mail-test', {}, { allowError: true });
    check('envoi de test sans fournisseur → 400 (pas 500)', test.status === 400, `HTTP ${test.status}`);
    check('400 : le message nomme le problème', /fournisseur|MAIL_/i.test(String(test.body?.message ?? '')), String(test.body?.message).slice(0, 160));
    check('400 : un échec de configuration ne consomme pas de test', (await admin.get('/api/admin/mail-status')).body.remainingTests === 5);

    // Protection d'accès.
    const anon = new Client(a.base);
    check('mail-status anonyme → 401', (await anon.get('/api/admin/mail-status', { allowError: true })).status === 401);
    const student = new Client(a.base);
    await student.post('/api/auth/signup', { firstName: 'Théo', email: `eleve.${Date.now()}@edumate.test`, password: 'motdepasse123' });
    check('mail-status élève → 403', (await student.get('/api/admin/mail-status', { allowError: true })).status === 403);
    check('mail-test élève → 403', (await student.post('/api/admin/mail-test', {}, { allowError: true })).status === 403);

    // Le parcours élève reste fonctionnel : le lien part dans les journaux.
    const target = `eleve.${Date.now()}@edumate.test`;
    await new Client(a.base).post('/api/auth/signup', { firstName: 'Lina', email: target, password: 'motdepasse123' });
    const forgot = await anon.post('/api/auth/forgot', { email: target }, { allowError: true });
    check('élève : demande de lien → 200 même sans fournisseur', forgot.status === 200 && forgot.body.ok === true, `HTTP ${forgot.status}`);
    check('élève : mailConfigured = false (information serveur, pas de fuite)', forgot.body.mailConfigured === false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const logs = fs.readFileSync(a.logPath, 'utf8');
    check('le lien est bien écrit dans les JOURNAUX', /Lien de réinitialisation pour/.test(logs));
    check('l’avertissement de démarrage est explicite', /AUCUN e-mail ne part/.test(logs));
  } finally {
    await stopServer(a);
  }

  /* ------------- B. SMTP sur Render : le piège doit être vu ------------- */
  console.log('\n── B. SMTP + hébergement Render (ports 25/465/587 bloqués)');
  const b = await startServer(8932, {
    MAIL_PROVIDER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'staffpub.ota@gmail.com',
    SMTP_PASS: 'mot-de-passe-application-factice',
    RENDER_SERVICE_ID: 'srv-test-0001',
    RENDER_EXTERNAL_URL: 'https://edumateapp.onrender.com',
    MAIL_TIMEOUT_MS: '1500',
  });
  try {
    const admin = await adminClient(b.base);
    const status = await admin.get('/api/admin/mail-status');
    check('diagnostic : fournisseur smtp reconnu', status.body.provider === 'smtp', status.body.provider);
    check('diagnostic : expéditeur déduit de SMTP_USER', status.body.from === 'staffpub.ota@gmail.com', status.body.from);
    check('diagnostic : aucune variable manquante', status.body.missing.length === 0, status.body.missing.join(', '));
    const warning = (status.body.warnings ?? []).join(' ');
    check('🔴 le blocage Render des ports SMTP est DÉTECTÉ', /Render/i.test(warning) && /465/.test(warning), warning.slice(0, 200));
    check('🔴 l’avertissement propose une alternative HTTPS', /brevo|HTTPS|API/i.test(warning), warning.slice(0, 200));
    check('🔒 SMTP_PASS jamais renvoyé, seulement sa présence', status.body.smtp.passSet === true && !JSON.stringify(status.body).includes('factice'));
    check('🔒 le mot de passe SMTP n’apparaît nulle part', !JSON.stringify(status.body).includes('mot-de-passe-application'));

    const logsB = fs.readFileSync(b.logPath, 'utf8');
    check('l’avertissement apparaît au DÉMARRAGE (pas seulement dans /admin)', /Render bloque le port SMTP/i.test(logsB));

    // Échec d'envoi : explicite, avec une piste, et sans fuite du mot de passe.
    const send = await admin.post('/api/admin/mail-test', {}, { allowError: true });
    check('envoi de test en échec → 502 (pas 200 mensonger)', send.status === 502, `HTTP ${send.status}`);
    check('502 : une piste de diagnostic est fournie', Boolean(send.body?.hint), String(send.body?.hint).slice(0, 160));
    check('🔒 502 : le mot de passe SMTP n’est pas renvoyé', !JSON.stringify(send.body ?? {}).includes('factice'));
    check('🔒 502 : aucune adresse d’élève exposée', !JSON.stringify(send.body ?? {}).includes('@edumate.test'));

    // Limite anti-abus : 5 envois par tranche de 10 minutes.
    let limited = 0;
    for (let i = 0; i < 6; i += 1) {
      const response = await admin.post('/api/admin/mail-test', {}, { allowError: true });
      if (response.status === 429) limited += 1;
    }
    check('limite anti-abus : 429 au-delà de 5 envois de test', limited >= 1, `${limited}/6 en 429`);
    const after = await admin.get('/api/admin/mail-status');
    check('quota de tests épuisé affiché honnêtement', after.body.remainingTests === 0, String(after.body.remainingTests));

    // Un destinataire invalide doit être refusé avant tout envoi.
    const bad = await admin.post('/api/admin/mail-test', { to: 'pas-un-email' }, { allowError: true });
    check('destinataire invalide → 400', bad.status === 400, `HTTP ${bad.status}`);
  } finally {
    await stopServer(b);
  }

  /* --------- C. API HTTPS + expéditeur @gmail.com non authentifiable ------- */
  console.log('\n── C. Brevo + expéditeur @gmail.com');
  const c = await startServer(8933, {
    MAIL_PROVIDER: '',
    MAIL_API_KEY: 'xkeysib-cle-factice-pour-le-test-0000',
    MAIL_FROM: 'EduMate <staffpub.ota@gmail.com>',
  });
  try {
    const admin = await adminClient(c.base);
    const status = await admin.get('/api/admin/mail-status');
    check('fournisseur déduit du format de la clé (xkeysib- → brevo)', status.body.provider === 'brevo', status.body.provider);
    check('configuration complète → configured = true', status.body.configured === true);
    check('expéditeur relu correctement', status.body.from === 'staffpub.ota@gmail.com', status.body.from);
    check('🔒 clé d’API MASQUÉE (jamais en clair)', status.body.apiKey.includes('…') && !status.body.apiKey.includes('xkeysib-cle-factice-pour-le-test-0000'), status.body.apiKey);
    check('🔒 la clé masquée indique sa longueur', /car\.\)$/.test(status.body.apiKey), status.body.apiKey);
    const warning = (status.body.warnings ?? []).join(' ');
    check('🟠 avertissement de délivrabilité pour un expéditeur @gmail.com', /gmail\.com/i.test(warning) && /indésirables|SPF|DKIM/i.test(warning), warning.slice(0, 200));
    check('🟠 l’avertissement propose une solution (domaine à soi)', /domaine/i.test(warning), warning.slice(0, 200));
    check('aucun blocage Render signalé (API HTTPS, port 443)', !/Render bloque/i.test(warning));
    check('diagnostic : rien ne manque', status.body.missing.length === 0, status.body.missing.join(', '));
  } finally {
    await stopServer(c);
  }

  /* --------- D. APP_URL périmé : l'URL Render réelle doit l'emporter --------- */
  console.log('\n── D. APP_URL périmé (service Render déplacé)');
  const STALE = 'https://ancien-service.onrender.com';
  const LIVE = 'https://service-actuel.onrender.com';
  const d = await startServer(8934, {
    APP_URL: STALE,
    RENDER_EXTERNAL_URL: LIVE,
    MAIL_API_KEY: 'xkeysib-cle-factice-0000',
    MAIL_FROM: 'EduMate <no-reply@exemple.fr>',
  });
  try {
    const admin = await adminClient(d.base);
    const status = await admin.get('/api/admin/mail-status');
    check('🔴 la base retenue est celle injectée par Render', status.body.linkBase === LIVE, status.body.linkBase);
    check('🔴 la provenance est signalée', status.body.linkBaseSource === 'RENDER_EXTERNAL_URL', status.body.linkBaseSource);
    const warningD = (status.body.warnings ?? []).join(' ');
    check('l’APP_URL périmé est explicitement dénoncé', warningD.includes(STALE) && /APP_URL/.test(warningD), warningD.slice(0, 200));
    check('le message dit quoi faire', /Render → Environment/.test(warningD));

    // LE test qui compte : le lien réellement envoyé à un élève.
    const target = `eleve.${Date.now()}@edumate.test`;
    await new Client(d.base).post('/api/auth/signup', { firstName: 'Sami', email: target, password: 'motdepasse123' });
    const forgot = await new Client(d.base).post('/api/auth/forgot', { email: target }, { allowError: true });
    const link = forgot.body?.devLink ?? '';
    check('🔴 le lien de l’e-mail part sur la BONNE URL', link.startsWith(`${LIVE}/reinitialiser?token=`), link.slice(0, 90));
    check('🔴 le lien ne contient plus l’ancienne URL', !link.includes(STALE), link.slice(0, 90));
    check('le lien conserve le chemin et un jeton', /\/reinitialiser\?token=[A-Za-z0-9_-]{20,}$/.test(link), link.slice(-40));

    // La sonde doit conclure que cette URL ne répond pas (domaine fictif).
    const probe = await admin.post('/api/admin/mail-probe', {}, { allowError: true });
    check('POST /api/admin/mail-probe → 200', probe.status === 200, `HTTP ${probe.status}`);
    check('🔴 la sonde détecte une URL qui ne répond pas', probe.body?.ok === false, JSON.stringify(probe.body).slice(0, 160));
    check('la sonde explique la cause', Boolean(probe.body?.error), String(probe.body?.error).slice(0, 120));
    check('la sonde renvoie l’avertissement APP_URL', (probe.body?.warnings ?? []).some((w) => w.includes(STALE)));

    const logsD = fs.readFileSync(d.logPath, 'utf8');
    check('l’avertissement apparaît au DÉMARRAGE', /APP_URL vaut/.test(logsD));
  } finally {
    await stopServer(d);
  }

  /* ---- E. Cas qui doivent continuer à fonctionner (non-régression) ---- */
  console.log('\n── E. Domaine personnalisé et URL cohérente');
  const e = await startServer(8935, {
    APP_URL: 'https://edumate.mon-lycee.fr',
    RENDER_EXTERNAL_URL: 'https://service-actuel.onrender.com',
    MAIL_API_KEY: 'xkeysib-cle-factice-0000',
    MAIL_FROM: 'EduMate <no-reply@mon-lycee.fr>',
  });
  try {
    const admin = await adminClient(e.base);
    const status = await admin.get('/api/admin/mail-status');
    check('🔴 un domaine personnalisé reste PRIORITAIRE sur l’URL Render', status.body.linkBase === 'https://edumate.mon-lycee.fr', status.body.linkBase);
    check('provenance = APP_URL', status.body.linkBaseSource === 'APP_URL', status.body.linkBaseSource);
    check('aucun avertissement d’URL périmée (cas légitime)', !(status.body.warnings ?? []).some((w) => /APP_URL vaut/.test(w)), (status.body.warnings ?? []).join(' | ').slice(0, 160));

    const sameHost = await startServer(8936, {
      APP_URL: 'https://service-actuel.onrender.com',
      RENDER_EXTERNAL_URL: 'https://service-actuel.onrender.com/',
      MAIL_API_KEY: 'xkeysib-cle-factice-0000',
      MAIL_FROM: 'EduMate <no-reply@exemple.fr>',
    });
    try {
      const admin2 = await adminClient(sameHost.base);
      const status2 = await admin2.get('/api/admin/mail-status');
      check('APP_URL identique à Render (avec « / » final) → aucune alerte', !(status2.body.warnings ?? []).some((w) => /APP_URL vaut/.test(w)));
      check('les « / » finaux sont normalisés', status2.body.linkBase === 'https://service-actuel.onrender.com', status2.body.linkBase);
      check('provenance = APP_URL quand les deux concordent', status2.body.linkBaseSource === 'APP_URL', status2.body.linkBaseSource);
    } finally {
      await stopServer(sameHost);
    }

    // health expose la base : diagnostic possible sans compte administrateur.
    const health = await (await fetch(`${e.base}/api/health`)).json();
    check('health.mail.linkBase exposé', health.mail?.linkBase === 'https://edumate.mon-lycee.fr', String(health.mail?.linkBase));
    check('health.mail.linkBaseSource exposé', health.mail?.linkBaseSource === 'APP_URL', String(health.mail?.linkBaseSource));
    check('🔒 health.mail n’expose ni clé ni mot de passe', !JSON.stringify(health.mail ?? {}).match(/xkeysib|SMTP_PASS/i));
  } finally {
    await stopServer(e);
  }

  /* -------------------------------- Bilan -------------------------------- */
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
