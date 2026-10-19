/**
 * EduMate — Calcul de niveau / XP de la page Progression.
 *
 * 100 % dérivé de données DÉJÀ renvoyées par `/api/progress/stats` : aucune
 * nouvelle clé en base, aucun endpoint, aucun risque de désynchronisation. Un
 * élève qui rejoue un quiz monte de niveau immédiatement, et la valeur est
 * identique sur tous ses appareils (elle ne dépend que de sa progression réelle).
 *
 * Pourquoi une racine carrée plutôt que des paliers fixes ?
 *   - les premiers niveaux arrivent vite (récompense immédiate, c'est ce qui
 *     accroche), puis chaque niveau demande progressivement plus de travail ;
 *   - la formule n'a PAS de plafond : il n'y a jamais de « niveau max » atteint
 *     qui casserait la motivation ;
 *   - elle est strictement croissante et continue, donc aucun palier où la barre
 *     de progression ferait un saut bizarre.
 */

/** Points par événement : on récompense la régularité autant que le volume. */
export const XP_WEIGHTS = {
  /** Bonne réponse donnée. */
  correctAnswer: 10,
  /** Quiz terminé, quel que soit le score (l'effort compte). */
  quizFinished: 25,
  /** Jour de travail consécutif. */
  streakDay: 40,
  /** Leçon validée (≥ 80 %). */
  lessonValidated: 60,
  /** Minute de travail cumulée. */
  minute: 2,
} as const;

/** XP total d'un élève, à partir de ses statistiques réelles. */
export function computeXp(stats: {
  correct: number;
  attempts: number;
  streakDays: number;
  totalDurationSec: number;
  lessonsValidated?: number;
}): number {
  const minutes = Math.max(0, Math.round((Number(stats.totalDurationSec) || 0) / 60));
  const total =
    Math.max(0, Number(stats.correct) || 0) * XP_WEIGHTS.correctAnswer +
    Math.max(0, Number(stats.attempts) || 0) * XP_WEIGHTS.quizFinished +
    Math.max(0, Number(stats.streakDays) || 0) * XP_WEIGHTS.streakDay +
    Math.max(0, Number(stats.lessonsValidated) || 0) * XP_WEIGHTS.lessonValidated +
    minutes * XP_WEIGHTS.minute;
  return Math.round(total);
}

/** Diviseur de la racine carrée : règle la vitesse de progression des niveaux. */
const LEVEL_DIVISOR = 250;

/** XP requis pour ATTEINDRE un niveau donné (le niveau 1 commence à 0). */
export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return LEVEL_DIVISOR * (safe - 1) ** 2;
}

/** Niveau atteint pour un XP donné (toujours ≥ 1). */
export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Number.isFinite(xp) ? xp : 0);
  return Math.floor(Math.sqrt(safe / LEVEL_DIVISOR)) + 1;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP du début du niveau courant. */
  floor: number;
  /** XP nécessaire pour le niveau suivant. */
  next: number;
  /** Progression dans le niveau courant, 0 → 1. */
  progress: number;
  /** XP manquant avant le niveau suivant. */
  remaining: number;
  /** Titre associé au niveau (pure fantaisie, mais c'est ce qui accroche). */
  title: string;
}

/** Titres par tranche de niveaux : donne une identité qui évolue. */
const TITLES: [number, string][] = [
  [1, 'Curieux'],
  [3, 'Apprenti'],
  [5, 'Régulier'],
  [8, 'Confirmé'],
  [12, 'Assidu'],
  [17, 'Expérimenté'],
  [23, 'Expert'],
  [30, 'Maître'],
  [40, 'Légende'],
];

export function titleForLevel(level: number): string {
  let title = TITLES[0][1];
  for (const [threshold, name] of TITLES) {
    if (level >= threshold) title = name;
  }
  return title;
}

/** Toutes les informations de niveau d'un coup (affichage + tests). */
export function levelInfoFromXp(xp: number): LevelInfo {
  const safeXp = Math.max(0, Number.isFinite(xp) ? Math.round(xp) : 0);
  const level = levelFromXp(safeXp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - floor);
  const progress = Math.min(1, Math.max(0, (safeXp - floor) / span));
  return {
    level,
    xp: safeXp,
    floor,
    next,
    progress,
    remaining: Math.max(0, next - safeXp),
    title: titleForLevel(level),
  };
}

/**
 * Formate un nombre d'XP lisible : `12 480` (espace insécable fine française).
 * Évite `toLocaleString` seul, dont le séparateur dépend de la locale du navigateur.
 */
export function formatXp(xp: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(xp) ? xp : 0));
  return safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}
