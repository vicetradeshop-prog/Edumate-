/**
 * EduMate — API d'administration (prête pour l'évolution du projet).
 *
 * L'accès est protégé par `requireAdmin()` : le rôle administrateur est
 * attribué au premier compte créé (ou via ADMIN_EMAIL). Le panneau web
 * complet reste à construire, mais toutes les opérations sont déjà exposées
 * et sécurisées — aucune route « fantôme ».
 */
import { Router } from 'express';
import { deleteUser, findUserById, listUsers, updateUser, toPublicUser } from '../lib/store.js';
import { asyncHandler, badRequest, notFound, requireAdmin, requireCsrf, tooManyRequests } from '../lib/middleware.js';
import { buildMailTemplate, diagnoseMailer, hasMailer, sendMail } from '../lib/mailer.js';
import { requireEmail } from '../lib/validation.js';
import { getCatalog } from '../lib/catalog.js';
import { buildQuiz } from '../content/index.js';
import { FAMILIES } from '../content/index.js';
import { LIMITS, cleanText, optionalEnum, optionalString } from '../lib/validation.js';
import { createFeedItem, createPoll, deleteFeedItem, getPoll, listFeed, setPollClosed } from '../lib/feed.js';
import type { FeedImportance, FeedItem } from '../../shared/types.js';
import { LEVELS, SUBJECTS } from '../content/meta.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin());
adminRouter.use(requireCsrf());

adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const users = await listUsers();
  const catalog = getCatalog();
  res.json({
    users: users.length,
    activeUsers: users.filter((user) => user.role === 'eleve').length,
    admins: users.filter((user) => user.role === 'admin').length,
    catalog: catalog.stats,
    families: Object.keys(FAMILIES).length,
  });
}));

/* ------------------------------------------------------------------ */
/*  E-mails : état de la configuration et envoi de test                */
/* ------------------------------------------------------------------ */

/**
 * Garde-fou anti-abus de l'envoi de test : 5 messages par tranche de 10 minutes.
 *
 * La route est déjà réservée aux administrateurs, mais un bouton « tester »
 * sans limite transformerait un compte admin compromis en relais de spam —
 * et épuiserait le quota quotidien du fournisseur en quelques clics.
 */
const MAIL_TEST_WINDOW_MS = 10 * 60 * 1000;
const MAIL_TEST_MAX = 5;
const mailTestWindow = { start: Date.now(), count: 0 };

/** Masque une clé d'API pour l'affichage : `xkeysib-abc…xyz (34 car.)`. */
function maskSecret(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}…`;
  return `${text.slice(0, 7)}…${text.slice(-3)} (${text.length} car.)`;
}

/**
 * GET /api/admin/mail-status — diagnostic complet, sans rien envoyer.
 *
 * Répond aux trois questions que se pose l'administrateur : quel fournisseur
 * est actif, que manque-t-il exactement, et quels pièges s'appliquent
 * (notamment SMTP sur Render, où les ports 25/465/587 sont fermés).
 */
adminRouter.get('/mail-status', (_req, res) => {
  const diagnosis = diagnoseMailer();
  res.json({
    ...diagnosis,
    // La clé n'est JAMAIS renvoyée en clair : seule sa forme masquée permet de
    // vérifier qu'une valeur est bien présente (et laquelle, si plusieurs).
    apiKey: maskSecret((process.env.MAIL_API_KEY ?? '').trim()),
    smtp: {
      host: diagnosis.provider === 'smtp' ? (process.env.SMTP_HOST ?? '').trim() : '',
      port: diagnosis.provider === 'smtp' ? Number(process.env.SMTP_PORT ?? 587) : 0,
      user: diagnosis.provider === 'smtp' ? (process.env.SMTP_USER ?? '').trim() : '',
      passSet: diagnosis.provider === 'smtp' ? Boolean((process.env.SMTP_PASS ?? '').trim()) : false,
    },
    remainingTests: Math.max(0, MAIL_TEST_MAX - (Date.now() - mailTestWindow.start < MAIL_TEST_WINDOW_MS ? mailTestWindow.count : 0)),
  });
});

/**
 * POST /api/admin/mail-test — envoie VRAIMENT un e-mail de test.
 *
 * Seul moyen fiable de valider la chaîne complète (clé, expéditeur,
 * authentification du domaine, délivrabilité) avant qu'un élève n'en dépende.
 * Le destinataire par défaut est l'administrateur lui-même ; une autre adresse
 * est acceptée pour tester la réception côté élève.
 *
 * L'échec du fournisseur est renvoyé tel quel (statut 502) : contrairement à
 * `/api/auth/forgot`, cette route est réservée à l'administrateur, donc
 * exposer le détail ne révèle rien sur les comptes des élèves.
 */
adminRouter.post(
  '/mail-test',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const admin = await findUserById(req.auth!.sub);
    if (!admin) throw badRequest('Compte introuvable.');

    const to = requireEmail(typeof body.to === 'string' && body.to.trim() ? body.to : admin.email);

    const diagnosis = diagnoseMailer();
    if (!diagnosis.configured) {
      throw badRequest(
        `Aucun fournisseur d’e-mails opérationnel (${diagnosis.provider}). ` +
          (diagnosis.missing.length ? `Variable(s) manquante(s) : ${diagnosis.missing.join(', ')}. ` : '') +
          (diagnosis.warnings[0] ?? ''),
      );
    }

    const now = Date.now();
    if (now - mailTestWindow.start >= MAIL_TEST_WINDOW_MS) {
      mailTestWindow.start = now;
      mailTestWindow.count = 0;
    }
    if (mailTestWindow.count >= MAIL_TEST_MAX) {
      const retryAfterSec = Math.max(1, Math.round((mailTestWindow.start + MAIL_TEST_WINDOW_MS - now) / 1000));
      throw tooManyRequests(
        `Limite atteinte : ${MAIL_TEST_MAX} e-mails de test par tranche de 10 minutes. Réessaie dans ${Math.ceil(retryAfterSec / 60)} min.`,
        retryAfterSec,
      );
    }
    mailTestWindow.count += 1;

    const { html, text } = buildMailTemplate({
      firstName: admin.firstName,
      title: 'E-mail de test EduMate',
      intro: [
        'Si tu lis ce message, l’envoi d’e-mails est correctement configuré.',
        `Fournisseur : ${diagnosis.provider}. Expéditeur : ${diagnosis.from}.`,
        'Les liens de réinitialisation de mot de passe emprunteront exactement ce même canal.',
      ],
      warning:
        'Ce message est un test envoyé depuis le panneau d’administration. ' +
        'S’il est arrivé dans les indésirables, c’est le signe que le domaine expéditeur n’est pas authentifié (SPF/DKIM).',
      footer: 'Panneau d’administration EduMate — test de configuration e-mail.',
    });

    const startedAt = Date.now();
    const result = await sendMail({
      to,
      subject: '🦉 EduMate — test d’envoi d’e-mail',
      html,
      text,
      tag: 'admin-mail-test',
    });
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      console.error(`[EduMate] E-mail de TEST échoué vers ${to} (${result.provider}) : ${result.error}`);
      res.status(502).json({
        ok: false,
        provider: result.provider,
        error: result.error ?? 'échec inconnu',
        durationMs,
        hint: /timeout|délai/i.test(result.error ?? '')
          ? 'Connexion impossible : vérifie l’hôte, le port et — sur Render — le blocage des ports SMTP sortants.'
          : /401|403|invalid|auth/i.test(result.error ?? '')
            ? 'Clé d’API refusée ou expéditeur non vérifié chez le fournisseur.'
            : 'Lis le détail ci-dessus, puis les journaux du serveur.',
      });
      return;
    }

    console.log(`[EduMate] E-mail de test envoyé à ${to} via ${result.provider} en ${durationMs} ms.`);
    res.json({
      ok: true,
      to,
      provider: result.provider,
      from: diagnosis.from,
      messageId: result.messageId ?? null,
      durationMs,
      remainingTests: Math.max(0, MAIL_TEST_MAX - mailTestWindow.count),
    });
  }),
);

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const users = await listUsers();
  const query = String(req.query.q ?? '').toLowerCase().trim();
  const items = users
    .filter((user) => !query || user.email.includes(query) || user.firstName.toLowerCase().includes(query))
    .map((user) => ({ ...toPublicUser(user), demo: Boolean(user.demo) }));
  res.json({ users: items, total: items.length });
}));

adminRouter.patch('/users/:id', asyncHandler(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const user = await findUserById(req.params.id);
  if (!user) throw notFound('Utilisateur introuvable.');
  const role = optionalEnum(body.role, ['eleve', 'admin'] as const);
  const patch: Record<string, unknown> = {};
  if (role) patch.role = role;
  if (body.onboarded !== undefined) patch.onboarded = Boolean(body.onboarded);
  const updated = await updateUser(user.id, patch);
  res.json({ user: toPublicUser(updated!) });
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) throw notFound('Utilisateur introuvable.');
  if (user.role === 'admin') {
    const admins = (await listUsers()).filter((item) => item.role === 'admin');
    if (admins.length <= 1) throw badRequest('Impossible de supprimer le dernier administrateur.');
  }
  await deleteUser(user.id);
  res.json({ ok: true });
}));

adminRouter.get('/catalog', (_req, res) => {
  const catalog = getCatalog();
  const bySubject = new Map<string, { topics: number; families: Set<string> }>();
  for (const topic of catalog.topics) {
    const entry = bySubject.get(topic.subjectId) ?? { topics: 0, families: new Set<string>() };
    entry.topics += 1;
    entry.families.add(topic.source);
    bySubject.set(topic.subjectId, entry);
  }
  res.json({
    subjects: catalog.subjects.map((subject) => ({
      ...subject,
      topics: bySubject.get(subject.id)?.topics ?? 0,
      families: [...(bySubject.get(subject.id)?.families ?? [])],
    })),
    levels: LEVELS,
    themes: catalog.themes.length,
    families: Object.values(FAMILIES).map((family) => ({
      id: family.id,
      label: family.label,
      pool: typeof family.pool === 'number' ? family.pool : -1,
    })),
    stats: catalog.stats,
  });
});

/** Contrôle qualité : génère un échantillon de questions pour un sujet. */
adminRouter.get('/catalog/topics/:id/preview', (req, res) => {
  const catalog = getCatalog();
  const topic = catalog.topics.find((item) => item.id === req.params.id);
  if (!topic) throw notFound('Sujet introuvable.');
  const { questions } = buildQuiz({
    topicId: topic.id,
    source: topic.source,
    params: topic.params ?? {},
    difficulty: topic.difficulty,
    count: 5,
  });
  res.json({ topic, questions });
});

/* ------------------------------------------------------------------ */
/*  Fil d'actualités et sondages                                       */
/* ------------------------------------------------------------------ */

const IMPORTANCES: FeedImportance[] = ['info', 'update', 'urgent'];

/** Fil complet, vu par l'administrateur (avec l'état des sondages). */
adminRouter.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const items = await listFeed(60);
    const pollIds = items.map((item) => item.pollId).filter((id): id is string => Boolean(id));
    const polls: Record<string, unknown> = {};
    for (const pollId of pollIds) {
      const poll = await getPoll(pollId);
      if (poll) polls[pollId] = poll;
    }
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));
    res.json({ items: items.slice(0, limit), polls, total: items.length });
  }),
);

/**
 * Publie une actualité (nouveauté, mise à jour, annonce).
 *
 * Le corps est du Markdown léger : il sera rendu par `renderRichText`, qui
 * échappe le HTML. Un administrateur ne peut donc pas injecter de script dans
 * l'interface des élèves.
 */
adminRouter.post(
  '/feed',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = cleanText(body.title, LIMITS.title);
    if (title.length < 3) throw badRequest('Le titre doit contenir au moins 3 caractères.', { field: 'title' });
    const text = cleanText(body.body, LIMITS.text);
    if (!text) throw badRequest('Le contenu de l’annonce est requis.', { field: 'body' });
    const importance = optionalEnum(body.importance, IMPORTANCES) ?? 'info';
    const link = optionalString(body.link, 200);
    if (link && !/^\/[a-z0-9/_-]*$/i.test(link)) {
      // Lien interne uniquement : empêcher toute redirection sortante injectée.
      throw badRequest('Le lien doit être interne et commencer par « / ».', { field: 'link' });
    }

    const item = await createFeedItem({
      kind: 'news',
      title,
      body: text,
      importance,
      link,
      authorId: req.auth!.sub,
      authorName: req.auth!.email,
    });
    res.status(201).json({ item });
  }),
);

/**
 * Crée un sondage ET son annonce dans le fil, en une seule opération.
 *
 * Les deux sont liés volontairement : un sondage sans annonce n'apparaîtrait
 * nulle part, et une annonce de sondage sans sondage afficherait un panneau
 * vide. L'administrateur n'a donc qu'un formulaire à remplir.
 */
adminRouter.post(
  '/polls',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const question = cleanText(body.question, LIMITS.title);
    if (question.length < 3) throw badRequest('La question doit contenir au moins 3 caractères.', { field: 'question' });

    const rawOptions = Array.isArray(body.options) ? body.options : [];
    const options = rawOptions
      .map((option) => cleanText(option, 120))
      .filter((option) => option.length > 0)
      .slice(0, 8);
    if (options.length < 2) throw badRequest('Propose au moins deux réponses.', { field: 'options' });
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      throw badRequest('Deux réponses sont identiques.', { field: 'options' });
    }

    const singleChoice = body.singleChoice !== false;
    const closesAt = optionalString(body.closesAt, 24);
    if (closesAt && Number.isNaN(Date.parse(closesAt))) {
      throw badRequest('La date de clôture est invalide.', { field: 'closesAt' });
    }

    const poll = await createPoll({ question, options, singleChoice, closesAt });
    const item = await createFeedItem({
      kind: 'poll',
      title: question,
      // Le corps reste court : la question et les options sont affichées par le
      // composant de sondage, pas par le rendu Markdown.
      body: cleanText(body.body, LIMITS.text) || 'Donne ton avis — une seule réponse suffit.',
      importance: optionalEnum(body.importance, IMPORTANCES) ?? 'info',
      pollId: poll.id,
      authorId: req.auth!.sub,
      authorName: req.auth!.email,
    });
    res.status(201).json({ poll, item });
  }),
);

/** Clôt ou rouvre un sondage. */
adminRouter.patch(
  '/polls/:id',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.closed === undefined) throw badRequest('Précise « closed » (true ou false).');
    const poll = await setPollClosed(req.params.id, Boolean(body.closed));
    if (!poll) throw notFound('Ce sondage n’existe pas.');
    res.json({ poll });
  }),
);

/** Supprime un élément du fil (et son sondage le cas échéant). */
adminRouter.delete(
  '/feed/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteFeedItem(req.params.id);
    if (!result.deleted) throw notFound('Cet élément du fil n’existe pas.');
    res.json({ ok: true, removedPollId: result.pollId ?? null });
  }),
);

/** Aperçu rapide pour l'admin : éléments récents et taux de participation. */
adminRouter.get(
  '/feed/preview',
  asyncHandler(async (_req, res) => {
    const items: FeedItem[] = await listFeed(10);
    res.json({
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        importance: item.importance,
        createdAt: item.createdAt,
      })),
    });
  }),
);
