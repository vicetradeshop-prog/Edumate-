/**
 * EduMate — Mise en forme textuelle des leçons (module partagé).
 *
 * Utilisé par le serveur (construction des leçons et des révisions) ET par le
 * client (transformation d'un corrigé de quiz en étapes jouables). Les deux
 * doivent découper et libeller EXACTEMENT de la même façon : une divergence
 * produirait des écrans de correction différents entre la leçon et la révision.
 */
import type { QuestionKind } from './types.js';

/** Libellé lisible de la bonne réponse d'une question. */
export function answerLabel(question: {
  kind: QuestionKind;
  options?: string[];
  answer?: number | null;
  accept?: string[] | null;
}): string {
  if (question.kind === 'texte') {
    const accept = question.accept ?? [];
    return accept.length ? accept.join(' ou ') : '—';
  }
  const index = question.answer ?? -1;
  const option = question.options?.[index] ?? '';
  if (index < 0 || !option) return '—';
  const letter = 'ABCDEF'[index] ?? '';
  return letter ? `${letter} — ${option}` : option;
}

/**
 * Découpe une explication en lignes pédagogiques, pour l'affichage
 * « étape par étape ».
 *
 * Règles prudentes : on ne découpe JAMAIS à l'intérieur d'un bloc de code
 * (```) ni d'une ligne contenant plusieurs formules ($…$). Les lignes trop
 * nombreuses sont regroupées pour garder un affichage lisible.
 */
export function splitSolution(explanation: string, max = 6): string[] {
  const text = String(explanation ?? '').trim();
  if (!text) return ['Relis l’énoncé : la réponse se déduit directement des données.'];

  const lines: string[] = [];
  for (const block of text.split(/\n+/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.includes('```') || (trimmed.match(/\$/g) ?? []).length > 2) {
      lines.push(trimmed);
      continue;
    }
    for (const sentence of trimmed.split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý0-9«$])/)) {
      const clean = sentence.trim();
      if (clean) lines.push(clean);
    }
  }
  if (!lines.length) return [text];

  if (lines.length <= max) return lines;
  const head = lines.slice(0, max - 1);
  head.push(lines.slice(max - 1).join(' '));
  return head;
}
