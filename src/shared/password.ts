/**
 * EduMate — Politique de mot de passe, PARTAGÉE entre le serveur et le client.
 *
 * Pourquoi un module partagé ? Les règles doivent être strictement identiques
 * des deux côtés :
 *   - le serveur les applique pour de vrai (`requirePassword` → HTTP 400),
 *   - le client les affiche en direct pour guider l'élève AVANT l'envoi.
 * Une règle dupliquée finit toujours par diverger, et l'élève se retrouve avec
 * un formulaire « valide » que le serveur refuse.
 *
 * Ce module ne dépend de rien (ni Express, ni React) : il est importable tel
 * quel par les deux builds.
 */

/** Longueur minimale imposée (règle scolaire simple, pas de complexité excessive). */
export const PASSWORD_MIN_LENGTH = 8;
/** Longueur maximale acceptée (limite aussi le coût de calcul de scrypt). */
export const PASSWORD_MAX_LENGTH = 128;

/** Critères vérifiés, dans l'ordre d'affichage. */
export interface PasswordCheck {
  id: 'length' | 'letter' | 'digit' | 'long' | 'variety';
  label: string;
  ok: boolean;
  /** Le critère est-il EXIGÉ (les deux derniers sont des bonus) ? */
  required: boolean;
}

/**
 * Liste des exigences non satisfaites — exactement ce que le serveur renvoie
 * dans son message d'erreur 400.
 */
export function passwordIssues(value: string): string[] {
  const issues: string[] = [];
  if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH) {
    issues.push(`${PASSWORD_MIN_LENGTH} caractères minimum`);
  } else {
    if (!/[a-zA-Z]/.test(value)) issues.push('au moins une lettre');
    if (!/\d/.test(value)) issues.push('au moins un chiffre');
  }
  return issues;
}

/** Le mot de passe respecte-t-il la politique minimale ? */
export function isStrongPassword(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length <= PASSWORD_MAX_LENGTH &&
    passwordIssues(value).length === 0
  );
}

/** Tous les critères, exigés et bonus, pour l'affichage pas à pas. */
export function passwordChecks(value: string): PasswordCheck[] {
  const text = typeof value === 'string' ? value : '';
  const hasLetter = /[a-zA-Z]/.test(text);
  const hasDigit = /\d/.test(text);
  return [
    { id: 'length', label: `${PASSWORD_MIN_LENGTH} caractères minimum`, ok: text.length >= PASSWORD_MIN_LENGTH, required: true },
    { id: 'letter', label: 'au moins une lettre', ok: hasLetter, required: true },
    { id: 'digit', label: 'au moins un chiffre', ok: hasDigit, required: true },
    { id: 'long', label: '12 caractères ou plus', ok: text.length >= 12, required: false },
    {
      id: 'variety',
      label: 'minuscule, MAJUSCULE et signe',
      ok: /[a-z]/.test(text) && /[A-Z]/.test(text) && /[^A-Za-z0-9]/.test(text),
      required: false,
    },
  ];
}

export interface PasswordStrength {
  /** Note de 0 à 4 : pilote la largeur et la couleur de la jauge. */
  score: number;
  label: string;
  color: string;
  /** Exigences minimales non satisfaites (vide = mot de passe acceptable). */
  issues: string[];
  checks: PasswordCheck[];
  /** Le mot de passe peut-il être envoyé au serveur ? */
  acceptable: boolean;
}

/**
 * Évalue un mot de passe pour l'affichage (jauge + liste de critères).
 *
 * Les trois premiers critères sont ceux que le serveur EXIGE ; les deux
 * suivants sont des bonus qui font monter la jauge sans jamais bloquer l'élève.
 * La note ne dépend donc pas seulement de la longueur : un mot de passe long
 * mais sans chiffre reste refusé.
 */
export function passwordStrength(value: string): PasswordStrength {
  const text = typeof value === 'string' ? value : '';
  const checks = passwordChecks(text);
  const issues = passwordIssues(text);
  const requiredOk = checks.filter((check) => check.required).every((check) => check.ok);
  const bonus = checks.filter((check) => !check.required && check.ok).length;

  let score = 0;
  if (text.length > 0) score = 1;
  if (requiredOk) score = 2;
  if (requiredOk && bonus >= 1) score = 3;
  if (requiredOk && bonus >= 2) score = 4;

  const levels = [
    { label: 'Trop court', color: 'var(--ed-danger, #e11d48)' },
    { label: 'Insuffisant', color: 'var(--ed-danger, #e11d48)' },
    { label: 'Correct', color: 'var(--ed-warning, #f59e0b)' },
    { label: 'Solide', color: 'var(--ed-info, #0ea5e9)' },
    { label: 'Excellent', color: 'var(--ed-success, #16a34a)' },
  ] as const;

  return {
    score,
    label: text.length === 0 ? '—' : levels[score].label,
    color: text.length === 0 ? 'var(--ed-border, #3a3f5c)' : levels[score].color,
    issues,
    checks,
    acceptable: requiredOk && text.length <= PASSWORD_MAX_LENGTH,
  };
}
