/**
 * EduMate — Construction des étapes jouables côté client.
 *
 * Fonctions **pures** (aucun React, aucun réseau) : elles transforment les
 * charges reçues de l'API en étapes pour le lecteur `StepPlayer`. Être pures
 * les rend directement testables (`scripts/test-lessons.ts`).
 */
import type { AiLessonContent, Lesson, LessonExercise, LessonStep, RevisionPayload } from '../../shared/types.js';
import { checkShortAnswer } from '../../shared/answers.js';
import { answerLabel, splitSolution } from '../../shared/lessonText.js';

/* ------------------------------------------------------------------ */
/*  Correction immédiate des exercices de leçon                        */
/* ------------------------------------------------------------------ */

/**
 * Corrige une réponse d'exercice de leçon.
 * Même règle que le serveur pour les questions ouvertes (`shared/answers.ts`) :
 * l'élève voit exactement ce que le quiz accepterait.
 */
export function checkLessonAnswer(question: LessonExercise, value: string | number): boolean {
  if (question.kind === 'texte') {
    return checkShortAnswer({ accept: question.accept ?? [] }, String(value ?? ''));
  }
  const index = Number(value);
  return Number.isInteger(index) && question.answer !== null && index === question.answer;
}

/** Libellé de la réponse donnée par l'élève pendant le quiz. */
export function givenLabel(
  item: { kind: string; options: string[]; given: string | number | null },
): string {
  if (item.given === null || item.given === undefined || item.given === '') return 'Tu n’avais pas répondu';
  if (item.kind === 'texte') return `Ta réponse : ${String(item.given)}`;
  const index = Number(item.given);
  const option = item.options?.[index];
  if (!Number.isInteger(index) || !option) return `Ta réponse : ${String(item.given)}`;
  const letter = 'ABCDEF'[index] ?? '';
  return `Ta réponse : ${letter ? `${letter} — ` : ''}${option}`;
}

/* ------------------------------------------------------------------ */
/*  Révision de quiz → étapes jouables                                 */
/* ------------------------------------------------------------------ */

const MAX_REUSSITES_AFFICHEES = 8;

/**
 * Construit le parcours de révision à partir de la charge serveur.
 *
 * Mode « quiz »      : réussite(s) célébrée(s) → pour CHAQUE erreur :
 *                      correction pas à pas + exercice de rattrapage → bilan.
 * Mode « entraînement » (pas d'essai rejouable) : les questions neuves sont
 *                      proposées comme des exercices avec correction immédiate.
 *
 * Une charge sans AUCUNE question (sujet dégénéré) produit quand même un
 * parcours valide : mission + bilan — la page n'est jamais vide.
 */
export function buildRevisionSteps(payload: RevisionPayload): LessonStep[] {
  const steps: LessonStep[] = [];
  const items = payload.items ?? [];

  if (payload.mode === 'quiz' && payload.attempt) {
    const { score, total, percent } = payload.attempt;
    const missed = items.filter((item) => item.correct === false);
    const succeeded = items.filter((item) => item.correct === true);

    steps.push({
      id: 'mission',
      kind: 'mission',
      emoji: payload.emoji || '📖',
      title: `Révision : ${payload.topicName}`,
      intro: missed.length
        ? `Tu as obtenu ${score}/${total} (${percent} %). On reprend ensemble tes ${missed.length} erreur${missed.length > 1 ? 's' : ''}, puis tu t’entraînes sur des questions similaires pour ne plus jamais les rater !`
        : `Sans faute : ${score}/${total} (${percent} %) ! On survole tes réussites, puis quelques questions bonus pour confirmer.`,
      goals: missed.length
        ? ['Comprendre chaque erreur', 'Réussir les questions de rattrapage', 'Repartir sans angle mort']
        : ['Consolider ce qui est acquis', 'Garder le rythme sur ce sujet'],
    });

    if (succeeded.length) {
      steps.push({
        id: 'reussites',
        kind: 'concept',
        emoji: '🏆',
        title: `Tes ${succeeded.length} réussite${succeeded.length > 1 ? 's' : ''}`,
        points: succeeded
          .slice(0, MAX_REUSSITES_AFFICHEES)
          .map((item, index) => {
            const position = items.indexOf(item) + 1;
            const skill = item.skill ? ` — ${item.skill}` : '';
            return `Question ${position} ✓${skill}`;
          })
          .concat(succeeded.length > MAX_REUSSITES_AFFICHEES ? [`… et ${succeeded.length - MAX_REUSSITES_AFFICHEES} autre(s)`] : []),
        ai: false,
      });
    }

    missed.forEach((item) => {
      const position = items.indexOf(item) + 1;
      const solution = [
        givenLabel(item),
        `Bonne réponse : ${answerLabel(item)}`,
        ...splitSolution(item.explanation),
      ];
      steps.push({
        id: `correction-${item.id}`,
        kind: 'exemple',
        emoji: '🛠️',
        title: `Question ${position} — on corrige ensemble`,
        prompt: item.prompt,
        answerLabel: answerLabel(item),
        solution,
      });
      if (item.remediation) {
        steps.push({
          id: `rattrapage-${item.id}`,
          kind: 'exercice',
          emoji: '🎯',
          title: 'À toi ! Question similaire',
          question: item.remediation,
        });
      }
    });

    if (!missed.length && items.length) {
      // Sans faute : on propose quand même de l'entraînement léger.
      items.slice(0, 3).forEach((item, index) => {
        steps.push({
          id: `bonus-${item.id}`,
          kind: 'exercice',
          emoji: '⭐',
          title: `Question bonus ${index + 1}`,
          question: {
            id: `bonus-${item.id}`,
            kind: item.kind,
            prompt: item.prompt,
            options: item.options ?? [],
            answer: item.answer ?? null,
            accept: item.accept ?? null,
            explanation: item.explanation,
            skill: item.skill ?? null,
          },
        });
      });
    }

    const skills = [...new Set(missed.map((item) => item.skill).filter((skill): skill is string => Boolean(skill)))];
    steps.push({
      id: 'bilan',
      kind: 'recap',
      emoji: '🧠',
      title: 'Bilan de la révision',
      chips: skills.length
        ? skills.slice(0, 5).map((skill) => `À consolider : ${skill}`)
        : ['Quiz maîtrisé : passe au niveau supérieur !'],
      tip: missed.length
        ? 'Rejoue ce quiz juste après : les questions changent, ta méthode reste !'
        : 'Enchaîne avec la leçon complète ou augmente la difficulté du quiz.',
    });

    return steps;
  }

  /* ----------------------- Mode « entraînement » ----------------------- */
  steps.push({
    id: 'mission',
    kind: 'mission',
    emoji: payload.emoji || '📖',
    title: `Révision guidée : ${payload.topicName}`,
    intro: 'Des questions neuves t’attendent : réponds, lis la correction, progresse. Chaque bonne réponse compte !',
    goals: ['Réactiver les notions du sujet', 'Repérer tes points fragiles', 'T’entraîner sans pression'],
  });

  items.forEach((item, index) => {
    steps.push({
      id: `exercice-${item.id}`,
      kind: 'exercice',
      emoji: '🎯',
      title: `Exercice ${index + 1}`,
      question: {
        id: `exercice-${item.id}`,
        kind: item.kind,
        prompt: item.prompt,
        options: item.options ?? [],
        answer: item.answer ?? null,
        accept: item.accept ?? null,
        explanation: item.explanation,
        skill: item.skill ?? null,
      },
    });
  });

  const skills = [...new Set(items.map((item) => item.skill).filter((skill): skill is string => Boolean(skill)))];
  steps.push({
    id: 'bilan',
    kind: 'recap',
    emoji: '🧠',
    title: 'Ce qu’il faut retenir',
    chips: skills.length ? skills.slice(0, 5) : ['Chaque erreur corrigée est un point gagné'],
    tip: 'Enchaîne avec la leçon complète pour aller au fond du sujet, puis lance le quiz !',
  });

  return steps;
}

/* ------------------------------------------------------------------ */
/*  Fusion du contenu IA dans une leçon existante                      */
/* ------------------------------------------------------------------ */

/**
 * Applique un contenu IA (déjà validé par le serveur) aux étapes d'une leçon.
 * Retourne une NOUVELLE leçon (immuable) : les étapes non concernées
 * (exemples, exercices, générés localement) sont conservées telles quelles.
 */
export function applyAiToLesson(lesson: Lesson, ai: AiLessonContent): Lesson {
  const steps = lesson.steps.map((step): LessonStep => {
    switch (step.kind) {
      case 'mission':
        return { ...step, intro: ai.hook, goals: ai.goals };
      case 'concept':
        return step.ai ? { ...step, points: ai.method, ai: false } : step;
      case 'piege':
        return { ...step, text: ai.trap };
      case 'recap':
        return { ...step, chips: ai.chips, tip: ai.tip };
      default:
        return step;
    }
  });
  return { ...lesson, steps, ai };
}
