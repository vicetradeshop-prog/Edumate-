/**
 * EduMate — Normalisation et comparaison des réponses ouvertes.
 *
 * Module **pur** partagé entre le serveur (correction des quiz) et le client
 * (correction immédiate des exercices de leçons). Les deux doivent appliquer
 * EXACTEMENT la même règle : sans cela, un exercice de leçon pourrait valider
 * une réponse que le quiz rejetterait ensuite (ou l'inverse), ce qui serait
 * incompréhensible pour l'élève.
 */

/** Normalise une réponse saisie : minuscules, sans accents, ponctuation réduite. */
export function normalizeAnswer(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,]/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9.\-+/' ]/g, '')
    .trim();
}

/** Forme minimale attendue par la comparaison (compatible `Question`). */
export interface AcceptableAnswer {
  accept?: string[];
}

/**
 * Compare une réponse saisie aux réponses acceptées.
 * Tolérance numérique : 1e-6 (les générateurs arrondissent parfois).
 */
export function checkShortAnswer(question: AcceptableAnswer, given: string): boolean {
  const normalized = normalizeAnswer(given);
  if (!normalized) return false;
  return (question.accept ?? []).some((expected) => {
    if (!expected) return false;
    if (expected === normalized) return true;
    const a = Number(expected);
    const b = Number(normalized);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return Math.abs(a - b) < 1e-6;
    return false;
  });
}
