/**
 * EduMate — Serveur unique : API REST + application React (SPA).
 *
 * Un seul process, un seul dépôt, un seul service Render :
 *   /api/*  → l'API
 *   /*      → le build du frontend (dist/client), avec repli sur index.html
 *             pour permettre le routage côté client.
 */
/*
 * ⚠️ CETTE LIGNE DOIT RESTER LA PREMIÈRE.
 * `./lib/env.js` injecte le contenu de `.env` dans `process.env` dès son
 * import. Comme `./lib/config.js` lit `process.env` au moment de son
 * évaluation, tout import placé avant lui rendrait le `.env` inopérant.
 * En ESM, les modules sont évalués dans l'ordre de déclaration des imports.
 */
import './lib/env.js';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';

import { config, hasAiProvider, appBaseUrl } from './lib/config.js';
import { getStartupError, getStorage } from './lib/storage.js';
import { catalogError, getCatalog } from './lib/catalog.js';
import { attachUser, errorHandler, notFoundHandler, rateLimit, securityHeaders } from './lib/middleware.js';
import { authRouter } from './routes/auth.js';
import { quizRouter } from './routes/quiz.js';
import { progressRouter } from './routes/progress.js';
import { organizeRouter } from './routes/organize.js';
import { tutorRouter } from './routes/tutor.js';
import { lessonsRouter } from './routes/lessons.js';
import { servicesRouter } from './routes/services.js';
import { adminRouter } from './routes/admin.js';
import { feedRouter } from './routes/feed.js';
import { planningRouter } from './routes/planning.js';
import { findUserByEmail, setUserPassword, updateUser } from './lib/store.js';
import { hashPassword } from './lib/auth.js';
import { mailerStats, mailerStatus } from './lib/mailer.js';
import { revokeResetTokens, sweepExpiredResetTokens } from './lib/passwordReset.js';
import { passwordIssues } from './lib/validate.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
/** Build du frontend : `dist/client` en production (`dist/server/index.js`). */
const CLIENT_DIST = path.resolve(dirname, '../client');
/** En développement (tsx sur `src/server`), le build n'existe pas encore. */
const hasClientBuild = (): boolean => existsSync(path.join(CLIENT_DIST, 'index.html'));

export function createApp(): Express {
  const app = express();

  // Derrière le proxy de Render, `req.ip` doit refléter l'IP réelle du client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    compression({
      /*
       * 🔴 Les médias (audio/vidéo) ne doivent JAMAIS être compressés : un
       * élément <audio> ne décompresse pas gzip lui-même — un fichier .mp3 ou
       * .wav servi gzippé échouait au décodage (« NotSupportedError ») et le
       * bouton de lecture semblait mort.
       */
      filter: (req, res) => {
        const type = res.getHeader('Content-Type');
        if (typeof type === 'string' && (type.startsWith('audio/') || type.startsWith('video/'))) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.use(securityHeaders());
  app.use(attachUser());

  /* ------------------------------ API ----------------------------- */

  const apiLimiter = rateLimit({ max: config.security.rateLimitMax, name: 'api' });
  const authLimiter = rateLimit({ max: config.security.authRateLimitMax, name: 'auth' });

  app.get('/api/health', async (_req, res) => {
    const store = await getStorage();
    const catalog = getCatalog();
    const database = await store.health();
    const mail = mailerStatus();
    const mailCounters = mailerStats();
    res.json({
      ok: true,
      app: 'EduMate',
      version: '1.0.0',
      env: config.env,
      uptime: Math.round(process.uptime()),
      database: store.kind,
      databaseReady: database.ready,
      databaseLatencyMs: database.latencyMs,
      databaseOperations: database.operations,
      databaseError: database.lastError,
      databaseNotice: database.notice ?? getStartupError(),
      catalogError: catalogError(),
      ai: { provider: hasAiProvider() ? config.ai.provider : 'local', configured: hasAiProvider() },
      /*
       * État de l'envoi d'e-mails (mot de passe oublié).
       *
       * Les compteurs sont publics mais AGRÉGÉS : ils ne renseignent ni sur un
       * compte ni sur un destinataire. Ils sont indispensables parce que la
       * route /api/auth/forgot répond volontairement la même chose que
       * l'adresse existe ou non — sans eux, un prestataire qui refuse les
       * messages serait invisible. Le détail de la dernière erreur reste dans
       * les journaux du serveur.
       */
      mail: {
        provider: mail.provider,
        configured: mail.configured,
        from: mail.from || null,
        sent: mailCounters.sent,
        failed: mailCounters.failed,
        lastSentAt: mailCounters.lastSentAt,
        resetLinkTtlMinutes: config.passwordReset.ttlMinutes,
        resetPath: config.passwordReset.path,
      },
      catalog: {
        subjects: catalog.stats.subjects,
        levels: catalog.stats.levels,
        themes: catalog.stats.themes,
        topics: catalog.stats.topics,
        playable: catalog.stats.playable,
        questionPool: catalog.stats.questionPool,
      },
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api', apiLimiter, quizRouter);
  app.use('/api/progress', apiLimiter, progressRouter);
  app.use('/api/organize', apiLimiter, organizeRouter);
  app.use('/api/tutor', apiLimiter, tutorRouter);
  app.use('/api/lessons', apiLimiter, lessonsRouter);
  app.use('/api/services', apiLimiter, servicesRouter);
  app.use('/api/admin', apiLimiter, adminRouter);
  // Fil d'actualités, sondages et notifications (monté après /api/admin : les
  // deux sont indépendants, mais /api/feed/unread est appelé périodiquement).
  app.use('/api/feed', apiLimiter, feedRouter);
  // Planning de révision automatique (contrôles, séances, vue du jour).
  app.use('/api/planning', apiLimiter, planningRouter);

  /* --------------------------- Statiques -------------------------- */

  if (hasClientBuild()) {
    const staticOptions: RequestHandler = express.static(CLIENT_DIST, {
      index: false,
      maxAge: config.isProduction ? '7d' : 0,
      setHeaders: (res, filePath) => {
        /*
         * Ces trois fichiers portent des noms STABLES et doivent toujours être
         * revalidés — contrairement aux assets de `/assets/`, dont le nom
         * contient une empreinte de contenu et qui peuvent donc être cachés 7 j.
         *
         *   - `index.html`      : référence les assets hachés du build en cours.
         *                         S'il est caché, l'élève charge d'anciens
         *                         chunks après un redéploiement.
         *   - `sw.js`           : ⚠️ le plus important. Un service worker caché
         *                         7 jours ne serait pas mis à jour avant une
         *                         semaine, et toute correction de stratégie de
         *                         cache mettrait autant de temps à arriver.
         *   - `manifest.webmanifest` : lu à l'installation de l'application.
         *
         * `no-cache` ne signifie pas « ne pas cacher » mais « toujours revalider
         * avant de servir » : le fichier reste en cache, avec un `If-None-Match`
         * qui renvoie 304 quand rien n'a changé.
         */
        const name = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
        if (name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    app.use(staticOptions);

    // Repli SPA : toute route inconnue (hors /api) renvoie l'application.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      /*
       * 🔴 Un chemin AVEC extension (.mp3, .png, .css…) qui n'existe pas doit
       * répondre un vrai 404, pas index.html : sans cette garde, le repli SPA
       * renvoyait du HTML 200 pour un fichier audio absent — la sonde de
       * recommandation musicale croyait le fichier présent et le lecteur
       * « jouait » du HTML (bouton sans effet).
       */
      if (/\.[a-z0-9]{1,5}$/.test(req.path)) {
        next();
        return;
      }
      /*
       * `no-cache` posé explicitement.
       *
       * `res.sendFile()` n'applique PAS l'option `setHeaders` du middleware
       * statique : sans cette ligne, `/tableau-de-bord` renvoyait
       * `public, max-age=0` alors que `/index.html` — le MÊME document servi par
       * `express.static` — renvoyait `no-cache`. Deux politiques de cache pour un
       * seul fichier, selon l'URL employée.
       *
       * Les deux valeurs imposent bien une revalidation, mais `no-cache` est
       * explicite et ne dépend pas des valeurs par défaut du module `send`.
       * L'enjeu est réel : un `index.html` caché ferait charger d'anciens chunks
       * hachés après un redéploiement.
       */
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  } else {
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        notFoundHandler(req, res);
        return;
      }
      res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html lang="fr"><meta charset="utf-8"><title>EduMate</title>
           <body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;line-height:1.6">
           <h1>🦉 EduMate — API active</h1>
           <p>Le frontend n'est pas encore compilé dans ce répertoire.</p>
           <p>En développement : <code>npm run dev</code> puis ouvre <a href="http://localhost:5173">http://localhost:5173</a>.</p>
           <p>En production : <code>npm run build</code> puis <code>npm start</code>.</p>
           <p>État de l'API : <a href="/api/health">/api/health</a></p></body></html>`,
        );
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * Compte administrateur initial (optionnel).
 *
 * ADMIN_EMAIL accepte une liste d'adresses séparées par des virgules : chacune
 * devient administrateur. Un compte n'est créé au démarrage que si
 * ADMIN_PASSWORD est également renseigné (pour la première adresse).
 */
async function ensureAdminAccount(): Promise<void> {
  const emails = config.security.adminEmails;

  // Promotion des adresses déjà inscrites.
  for (const address of emails) {
    const already = await findUserByEmail(address);
    if (already && already.role !== 'admin') {
      await updateUser(already.id, { role: 'admin' });
      console.log(`[EduMate] Rôle administrateur attribué à ${address}`);
    }
  }

  const email = emails[0];
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role !== 'admin') {
      await updateUser(existing.id, { role: 'admin' });
      console.log(`[EduMate] Rôle administrateur attribué à ${email}`);
    }
    return;
  }
  const { createUser } = await import('./lib/store.js');
  await createUser({
    email,
    passwordHash: hashPassword(password),
    firstName: process.env.ADMIN_FIRST_NAME?.trim() || 'Admin',
    role: 'admin',
    onboarded: true,
  });
  console.log(`[EduMate] Compte administrateur créé : ${email}`);
}

/**
 * Supprime le ou les comptes de démonstration partagés quand le mode démo est
 * désactivé.
 *
 * Pourquoi un nettoyage automatique ? Parce que désactiver `ALLOW_DEMO_ACCOUNT`
 * coupe seulement la route `/api/auth/demo` : un compte « Camille » créé avant
 * ce changement resterait indéfiniment dans la base et dans la liste
 * d'administration. Or ce compte est sans risque à supprimer :
 *   - son mot de passe est aléatoire (`hashPassword(newId())`), donc personne
 *     ne peut s'y connecter autrement que par la route de démonstration ;
 *   - il est explicitement marqué `demo: true` ;
 *   - il est partagé : sa progression n'appartient à personne.
 * L'opération est tracée dans les journaux, compte par compte.
 */
async function removeDemoAccounts(): Promise<void> {
  if (config.security.allowDemoAccount) return;
  const { listUsers } = await import('./lib/store.js');
  const { deleteUser } = await import('./lib/store.js');
  const users = await listUsers();
  const demoAccounts = users.filter((user) => user.demo === true);
  if (!demoAccounts.length) return;
  for (const account of demoAccounts) {
    try {
      const result = await deleteUser(account.id);
      console.log(
        `[EduMate] Compte de démonstration supprimé (${account.email}, ${result.deletedKeys.length} clés) : ` +
          'ALLOW_DEMO_ACCOUNT est désactivé.',
      );
    } catch (error) {
      console.warn(
        `[EduMate] Suppression du compte de démonstration ${account.email} ignorée : ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Garantit qu'il existe toujours au moins un administrateur.
 *
 * Le premier compte reçoit déjà le rôle à l'inscription ; ce contrôle répare en
 * plus les bases créées avant cette règle (sinon la section Administration
 * resterait définitivement inaccessible).
 */
async function ensureAnAdminExists(): Promise<void> {
  if (config.security.adminEmails.length) return;
  const { listUsers } = await import('./lib/store.js');
  const users = await listUsers();
  if (!users.length) return;
  if (users.some((user) => user.role === 'admin')) return;

  // On promeut le compte le plus ancien (hors démonstration partagée).
  const oldest = [...users].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (oldest.demo) return;
  await updateUser(oldest.id, { role: 'admin' });
  console.log(`[EduMate] Aucun administrateur : rôle attribué au premier compte (${oldest.email}).`);
}

/**
 * Dépannage d'urgence : réinitialise le mot de passe d'un compte au démarrage.
 *
 * Cas concret : l'administrateur a perdu son mot de passe ET aucun prestataire
 * d'e-mails n'est encore configuré (donc le lien « mot de passe oublié » ne peut
 * pas partir). Render ne permet pas d'exécuter de script sur le plan gratuit :
 * poser deux variables d'environnement puis redéployer est la seule voie
 * d'accès à la base.
 *
 *   RECOVERY_EMAIL        = admin@monlycee.fr
 *   RECOVERY_PASSWORD     = NouveauMot2passe!
 *   RECOVERY_MAKE_ADMIN   = true          (facultatif)
 *
 * 🔴 Ces variables doivent être SUPPRIMÉES de Render juste après la connexion :
 *    tant qu'elles sont présentes, le mot de passe est réappliqué à chaque
 *    redémarrage et écraserait tout changement fait depuis l'interface.
 *
 * Garde-fous : mot de passe conforme à la politique de l'application, compte
 * inexistant = simple avertissement (jamais de création implicite), toutes les
 * sessions existantes sont révoquées, et l'opération est journalisée.
 */
async function applyAccountRecovery(): Promise<void> {
  const { email, password, makeAdmin } = config.recovery;
  if (!email && !password) return;

  if (!email || !password) {
    console.warn('[EduMate] RECOVERY_EMAIL et RECOVERY_PASSWORD doivent être renseignés ENSEMBLE : dépannage ignoré.');
    return;
  }

  const issues = passwordIssues(password);
  if (issues.length) {
    console.error(`[EduMate] RECOVERY_PASSWORD refusé (trop faible) : ${issues.join(', ')}.`);
    return;
  }

  let user: Awaited<ReturnType<typeof findUserByEmail>> = null;
  try {
    user = await findUserByEmail(email);
  } catch (error) {
    console.error(`[EduMate] Dépannage impossible (base injoignable) : ${(error as Error).message}`);
    return;
  }
  if (!user) {
    console.error(
      `[EduMate] RECOVERY_EMAIL=${email} ne correspond à aucun compte : rien n'a été modifié.\n` +
        '           Vérifie l’orthographe (l’adresse est comparée en minuscules).',
    );
    return;
  }

  try {
    await setUserPassword(user.id, password);
    await revokeResetTokens(user.id);
    if (makeAdmin && user.role !== 'admin') {
      await updateUser(user.id, { role: 'admin' });
    }
  } catch (error) {
    console.error(`[EduMate] Échec du dépannage du compte ${email} : ${(error as Error).message}`);
    return;
  }

  console.log(
    [
      '',
      '  🔑 [EduMate] DÉPANNAGE APPLIQUÉ (RECOVERY_EMAIL)',
      `     Compte          : ${email}`,
      `     Rôle            : ${makeAdmin ? 'administrateur' : user.role}`,
      '     Mot de passe    : remplacé par RECOVERY_PASSWORD',
      '     Sessions        : toutes les sessions précédentes ont été fermées',
      '',
      '     🔴 SUPPRIME maintenant RECOVERY_EMAIL et RECOVERY_PASSWORD dans',
      '        Render → Environment, puis redéploie. Tant qu’elles sont présentes,',
      '        ce mot de passe est réappliqué à CHAQUE démarrage.',
      '',
    ].join('\n'),
  );
}

export async function startServer(): Promise<void> {
  const store = await getStorage();
  const catalog = getCatalog();
  await ensureAdminAccount();
  await applyAccountRecovery();

  const app = createApp();
  const mail = mailerStatus();
  const server = app.listen(config.port, () => {
    const lines = [
      '',
      '  🦉 EduMate est prêt',
      `     Environnement   : ${config.env}`,
      `     Port            : ${config.port}`,
      `     Base de données : ${store.kind}${store.kind === 'upstash' ? ' (Upstash Redis)' : ''}`,
      `     IA              : ${hasAiProvider() ? config.ai.provider : 'tuteur intégré hors-ligne'}${hasAiProvider() ? '' : ' (aucune clé : renseigne AI_API_KEY)'}`,
      `     E-mails         : ${
        mail.configured
          ? `${mail.provider} ✔ (${mail.from})`
          : 'non configuré — les liens de réinitialisation partent dans les LOGS'
      }`,
      `     Compte démo     : ${config.security.allowDemoAccount ? 'activé (partagé)' : 'désactivé'}`,
      `     Catalogue       : ${catalog.stats.topics} sujets / ${catalog.stats.playable} jouables`,
      `     URL             : ${appBaseUrl() || `http://localhost:${config.port}`}`,
      '',
    ];
    console.log(lines.join('\n'));
    if (!mail.configured) {
      console.warn(
        '  ⚠️  « Mot de passe oublié » fonctionne, mais aucun e-mail ne part : renseigne\n' +
          '     MAIL_PROVIDER + MAIL_API_KEY (ou SMTP_HOST/USER/PASS) dans Render → Environment.\n' +
          '     En attendant, chaque lien demandé est écrit dans ces journaux (onglet Logs).\n',
      );
    }
    if (getStartupError()) console.warn(`  ⚠️  ${getStartupError()}\n`);
    /*
     * Contrôles de démarrage, asynchrones et non bloquants.
     * Ordre important : le nettoyage des comptes de démonstration doit précéder
     * la recherche d'un administrateur, sinon un compte démo pourrait être promu
     * administrateur puis supprimé dans la foulée.
     */
    void removeDemoAccounts()
      .then(() => ensureAnAdminExists())
      .catch((error: unknown) => {
        console.warn(`[EduMate] Contrôle des comptes ignoré : ${(error as Error).message}`);
      });
    /*
     * Purge des liens de réinitialisation périmés : la couche `Storage` n'expose
     * pas de TTL Redis, l'expiration est donc vérifiée à la lecture ET balayée
     * ici pour ne pas laisser d'empreintes orphelines s'accumuler dans Upstash.
     */
    void sweepExpiredResetTokens()
      .then((removed) => {
        if (removed > 0) console.log(`[EduMate] ${removed} lien(s) de réinitialisation expiré(s) purgé(s).`);
      })
      .catch((error: unknown) => {
        console.warn(`[EduMate] Purge des liens expirés ignorée : ${(error as Error).message}`);
      });
  });

  const shutdown = (signal: string): void => {
    console.log(`\n[EduMate] Signal ${signal} reçu, arrêt propre…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/*
 * En production, ce fichier est le point d'entrée du bundle (`npm start`).
 * En développement, `scripts/dev-server.mjs` importe `startServer()` :
 * la variable `EDUMATE_NO_AUTOSTART` évite alors un double démarrage.
 */
if (!process.env.EDUMATE_NO_AUTOSTART) {
  startServer().catch((error) => {
    console.error('[EduMate] Démarrage impossible :', error);
    process.exit(1);
  });
}
