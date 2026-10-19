/**
 * EduMate — Authentification et compte utilisateur.
 *
 * - inscription avec validation forte et hachage scrypt (jamais de clair),
 * - connexion avec réponse identique en cas d'identifiants invalides
 *   (aucune fuite sur l'existence d'un compte),
 * - session persistante via cookie httpOnly + jeton CSRF (double soumission),
 * - compte de démonstration partagé, désactivable par variable d'environnement,
 * - profil, préférences et suppression de compte.
 */
import { Router } from 'express';
import { config, isAdminEmail } from '../lib/config.js';
import { createCsrfToken, createToken, hashPassword, newId, verifyPassword } from '../lib/auth.js';
import {
  DEFAULT_PREFERENCES,
  countUsers,
  createUser,
  deleteUser,
  exportUserData,
  findUserByEmail,
  findUserById,
  toPublicUser,
  updateUser,
  type StoredUser,
} from '../lib/store.js';
import { asyncHandler, badRequest, conflict, requireAuth, requireCsrf, unauthorized } from '../lib/middleware.js';
import {
  LIMITS,
  cleanText,
  optionalEnum,
  requireString,
  optionalInt,
  optionalString,
  optionalStringArray,
  requireEmail,
  requirePassword,
} from '../lib/validation.js';
import type { Preferences, PublicUser } from '../../shared/types.js';
import { LEVELS, SUBJECTS, SUBJECTS_BY_LEVEL } from '../content/meta.js';

export const authRouter = Router();

const LEVEL_IDS = LEVELS.map((level) => level.id) as string[];
const SUBJECT_IDS = SUBJECTS.map((subject) => subject.id) as string[];
const AVATARS = ['🦉', '🦊', '🐼', '🐨', '🦁', '🐯', '🦄', '🐸', '🐙', '🦖', '🚀', '🧠', '📚', '⚡', '🌱', '🎯'];
const ACCENTS = ['#6c5ce7', '#4f6df5', '#00b894', '#e17055', '#0984e3', '#e84393', '#fdcb6e', '#00cec9'];

function setSessionCookies(res: import('express').Response, user: StoredUser): string {
  const token = createToken({ sub: user.id, email: user.email, role: user.role, demo: user.demo });
  const csrf = createCsrfToken();
  const maxAge = config.session.maxAgeSec * 1000;
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.secure,
    maxAge,
    path: '/',
  });
  // Lisible par le script : sert uniquement à la protection CSRF (double soumission).
  res.cookie('edumate_csrf', csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.session.secure,
    maxAge,
    path: '/',
  });
  return csrf;
}

function clearSessionCookies(res: import('express').Response): void {
  res.clearCookie(config.session.cookieName, { path: '/' });
  res.clearCookie('edumate_csrf', { path: '/' });
}

/* ------------------------------------------------------------------ */
/*  Session                                                            */
/* ------------------------------------------------------------------ */

authRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      res.json({ user: null, csrfToken: null, demoAvailable: config.security.allowDemoAccount });
      return;
    }
    const user = await findUserById(req.auth.sub);
    if (!user) {
      clearSessionCookies(res);
      res.json({ user: null, csrfToken: null, demoAvailable: config.security.allowDemoAccount });
      return;
    }
    /*
     * Le jeton CSRF reste stable pendant toute la session : le cookie et la
     * valeur renvoyée au client ne divergent donc jamais. Il n'est regénéré
     * qu'à la création de session (inscription / connexion) ou s'il manque.
     */
    const existingCsrf = typeof req.cookies?.edumate_csrf === 'string' ? req.cookies.edumate_csrf : '';
    const csrf = existingCsrf || createCsrfToken();
    if (!existingCsrf) {
      res.cookie('edumate_csrf', csrf, {
        httpOnly: false,
        sameSite: 'lax',
        secure: config.session.secure,
        maxAge: config.session.maxAgeSec * 1000,
        path: '/',
      });
    }
    res.json({
      user: toPublicUser(user) as PublicUser,
      csrfToken: csrf,
      demoAvailable: config.security.allowDemoAccount,
      aiConfigured: config.ai.provider !== 'none' && Boolean(config.ai.apiKey),
    });
  }),
);

/* ------------------------------------------------------------------ */
/*  Inscription                                                        */
/* ------------------------------------------------------------------ */

/**
 * Détermine le rôle d'un compte à sa création :
 *   - le tout premier compte d'une base vide devient administrateur,
 *   - toute adresse listée dans ADMIN_EMAIL devient administrateur.
 * Sans cette règle, personne ne pourrait ouvrir la section Administration.
 */
async function resolveRole(email: string): Promise<'admin' | 'eleve'> {
  if (isAdminEmail(email)) return 'admin';
  const existingAccounts = await countUsers();
  if (existingAccounts === 0) {
    console.log(`[EduMate] Premier compte créé (${email}) : rôle administrateur attribué.`);
    return 'admin';
  }
  return 'eleve';
}

/**
 * Remonte un compte existant au rôle administrateur s'il figure dans
 * ADMIN_EMAIL. Permet de nommer un administrateur après coup, sans manipulation
 * manuelle de la base.
 */
async function healAdminRole(user: StoredUser): Promise<StoredUser> {
  if (user.role === 'admin' || !isAdminEmail(user.email)) return user;
  const updated = await updateUser(user.id, { role: 'admin' });
  console.log(`[EduMate] Rôle administrateur attribué à ${user.email} (ADMIN_EMAIL).`);
  return updated ?? user;
}

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);
    const firstName = requireString(body.firstName, 'prénom', { min: 2, max: LIMITS.firstName });

    const age = optionalInt(body.age, 8, 99);
    const school = optionalString(body.school, LIMITS.school);
    const level = optionalEnum(body.level, LEVEL_IDS);
    const subjects = optionalStringArray(body.subjects, 12).filter((subject) => SUBJECT_IDS.includes(subject));
    const avatar = optionalEnum(body.avatar, AVATARS) ?? '🦉';
    const accent = optionalEnum(body.accent, ACCENTS) ?? DEFAULT_PREFERENCES.accent;
    const theme = optionalEnum(body.theme, ['clair', 'sombre', 'auto'] as const) ?? DEFAULT_PREFERENCES.theme;

    const existing = await findUserByEmail(email);
    if (existing) {
      throw conflict('Un compte existe déjà avec cette adresse e-mail. Essaie de te connecter.');
    }

    const user = await createUser({
      email,
      passwordHash: hashPassword(password),
      firstName,
      age,
      school,
      level,
      subjects,
      avatar,
      preferences: { ...DEFAULT_PREFERENCES, theme, accent },
      role: await resolveRole(email),
      onboarded: true,
    });

    const csrf = setSessionCookies(res, user);
    res.status(201).json({ user: toPublicUser(user) as PublicUser, csrfToken: csrf });
  }),
);

/* ------------------------------------------------------------------ */
/*  Connexion / déconnexion                                            */
/* ------------------------------------------------------------------ */

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = requireEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    let user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      // Message volontairement identique : ne révèle pas si l'e-mail existe.
      throw unauthorized('E-mail ou mot de passe incorrect.');
    }
    user = await healAdminRole(user);
    const csrf = setSessionCookies(res, user);
    res.json({ user: toPublicUser(user) as PublicUser, csrfToken: csrf });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookies(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Compte de démonstration (partagé, sans inscription)                */
/* ------------------------------------------------------------------ */

const DEMO_EMAIL = 'demo@edumate.app';

async function ensureDemoUser(): Promise<StoredUser | null> {
  if (!config.security.allowDemoAccount) return null;
  const existing = await findUserByEmail(DEMO_EMAIL);
  if (existing) return existing;
  return createUser({
    email: DEMO_EMAIL,
    passwordHash: hashPassword(newId()),
    firstName: 'Camille',
    age: 16,
    school: 'Lycée de démonstration',
    level: 'premiere',
    subjects: ['mathematiques', 'francais', 'physique-chimie', 'histoire-geographie', 'anglais', 'nsi'],
    avatar: '🦉',
    preferences: { ...DEFAULT_PREFERENCES, theme: 'sombre' },
    role: 'eleve',
    onboarded: true,
    demo: true,
  });
}

authRouter.post(
  '/demo',
  asyncHandler(async (_req, res) => {
    const user = await ensureDemoUser();
    if (!user) throw badRequest('Le compte de démonstration est désactivé sur ce serveur.');
    const csrf = setSessionCookies(res, user);
    res.json({ user: toPublicUser(user) as PublicUser, csrfToken: csrf, demo: true });
  }),
);

/* ------------------------------------------------------------------ */
/*  Profil & préférences                                               */
/* ------------------------------------------------------------------ */

authRouter.put(
  '/me',
  requireAuth(),
  requireCsrf(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const user = await findUserById(req.auth!.sub);
    if (!user) throw unauthorized();

    const patch: Partial<StoredUser> = {};
    if (body.firstName !== undefined) patch.firstName = requireString(body.firstName, 'prénom', { min: 2, max: LIMITS.firstName });
    if (body.lastName !== undefined) patch.lastName = optionalString(body.lastName, LIMITS.lastName);
    if (body.age !== undefined) patch.age = optionalInt(body.age, 8, 99);
    if (body.school !== undefined) patch.school = optionalString(body.school, LIMITS.school);
    if (body.level !== undefined) patch.level = optionalEnum(body.level, LEVEL_IDS) ?? user.level;
    if (body.subjects !== undefined) patch.subjects = optionalStringArray(body.subjects, 12).filter((subject) => SUBJECT_IDS.includes(subject));
    if (body.avatar !== undefined) patch.avatar = optionalEnum(body.avatar, AVATARS) ?? user.avatar;
    if (body.tagline !== undefined) patch.tagline = optionalString(body.tagline, LIMITS.tagline);
    if (body.email !== undefined) {
      const email = requireEmail(body.email);
      if (email !== user.email) {
        const taken = await findUserByEmail(email);
        if (taken) throw conflict('Cette adresse e-mail est déjà utilisée.');
        patch.email = email;
      }
    }

    const updated = await updateUser(user.id, patch);
    res.json({ user: toPublicUser(updated!) as PublicUser });
  }),
);

authRouter.put(
  '/me/preferences',
  requireAuth(),
  requireCsrf(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Partial<Preferences> & Record<string, unknown>;
    const user = await findUserById(req.auth!.sub);
    if (!user) throw unauthorized();

    const preferences: Preferences = { ...DEFAULT_PREFERENCES, ...user.preferences };
    if (body.theme !== undefined) preferences.theme = optionalEnum(body.theme, ['clair', 'sombre', 'auto'] as const) ?? preferences.theme;
    if (body.accent !== undefined) preferences.accent = optionalEnum(body.accent, ACCENTS) ?? preferences.accent;
    if (body.density !== undefined) preferences.density = optionalEnum(body.density, ['confort', 'compact'] as const) ?? preferences.density;
    if (body.animations !== undefined) preferences.animations = Boolean(body.animations);
    if (body.sounds !== undefined) preferences.sounds = Boolean(body.sounds);
    if (body.dailyGoal !== undefined) preferences.dailyGoal = optionalInt(body.dailyGoal, 5, 240) ?? preferences.dailyGoal;
    if (body.focusMusic !== undefined) preferences.focusMusic = cleanText(body.focusMusic, 40) || preferences.focusMusic;

    const updated = await updateUser(user.id, { preferences });
    res.json({ user: toPublicUser(updated!) as PublicUser });
  }),
);

authRouter.post(
  '/me/password',
  requireAuth(),
  requireCsrf(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const user = await findUserById(req.auth!.sub);
    if (!user) throw unauthorized();
    if (user.demo) throw badRequest('Le mot de passe du compte de démonstration ne peut pas être modifié.');

    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!verifyPassword(current, user.passwordHash)) throw unauthorized('Le mot de passe actuel est incorrect.');
    const next = requirePassword(body.newPassword);
    await updateUser(user.id, { passwordHash: hashPassword(next) });
    res.json({ ok: true });
  }),
);

/** Export de toutes les données personnelles (transparence / RGPD). */
authRouter.get(
  '/me/export',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.auth!.sub);
    if (!user) throw unauthorized();
    const data = await exportUserData(user.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="edumate-donnees-${user.id.slice(0, 8)}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }),
);

/**
 * Suppression du compte : efface le profil ET toutes les données associées
 * (progression, favoris, calendrier, tâches, conversations) de la base,
 * puis ferme la session.
 */
authRouter.delete(
  '/me',
  requireAuth(),
  requireCsrf(),
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.auth!.sub);
    if (!user) throw unauthorized();
    if (user.demo) throw badRequest('Le compte de démonstration ne peut pas être supprimé.');
    const result = await deleteUser(user.id);
    clearSessionCookies(res);
    res.json({ ok: true, deletedKeys: result.deletedKeys.length });
  }),
);

/* ------------------------------------------------------------------ */
/*  Métadonnées utiles au parcours d'inscription                       */
/* ------------------------------------------------------------------ */

authRouter.get('/options', (_req, res) => {
  res.json({
    levels: LEVELS.map((level) => ({ id: level.id, name: level.name, short: level.short })),
    subjects: SUBJECTS.map((subject) => ({ id: subject.id, name: subject.name, emoji: subject.emoji, color: subject.color })),
    /** Matières réellement étudiées à chaque niveau (spécialités incluses). */
    subjectsByLevel: SUBJECTS_BY_LEVEL,
    avatars: AVATARS,
    accents: ACCENTS,
    demoAvailable: config.security.allowDemoAccount,
  });
});
