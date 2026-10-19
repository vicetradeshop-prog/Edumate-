/**
 * EduMate — Familles de générateurs : LANGUES (français, anglais, espagnol).
 *
 * La conjugaison est *calculée* à partir de tables exactes : les questions
 * sont donc infinies et toujours correctes. Le vocabulaire et la grammaire
 * s'appuient sur des corpus de données vérifiés (data/french.ts, data/languages.ts).
 */
import type { Question } from '../../../shared/types.js';
import type { GeneratorContext, QuestionFamily } from '../types.js';
import { qcm, shortAnswer, trueFalse } from '../lib.js';
import {
  AGREEMENTS,
  ANTONYMS,
  CONJUGATION_RULES,
  FIGURES_OF_SPEECH,
  FRENCH_TENSES,
  FRENCH_VERBS,
  GENRES,
  GRAMMAR_CONCEPTS,
  HOMOPHONES,
  LITERARY_MOVEMENTS,
  LITERARY_WORKS,
  REGISTERS,
  SYNONYMS,
  VERSIFICATION,
  WORD_FAMILIES,
  conjugateFrench,
  type FrenchTense,
  type FrenchVerb,
} from '../data/french.js';
import {
  ENGLISH_VERBS,
  ENGLISH_VOCAB,
  FALSE_FRIENDS,
  PHRASAL_VERBS,
  SPANISH_PRESENT,
  SPANISH_VERBS,
  SPANISH_VOCAB,
  type SpanishVerb,
} from '../data/languages.js';

const TENSES = Object.keys(FRENCH_TENSES) as FrenchTense[];
const TENSE_LABELS: Record<FrenchTense, string> = FRENCH_TENSES;

/** Sélectionne un verbe compatible avec le temps demandé (forme disponible). */
function pickConjugable(rng: GeneratorContext['rng'], tense: FrenchTense, group?: number): FrenchVerb | null {
  const candidates = FRENCH_VERBS.filter((v) => {
    if (group && v.group !== group) return false;
    return conjugateFrench(v, tense, rng.int(0, 5) as 0 | 1 | 2 | 3 | 4 | 5) !== null;
  });
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

function frenchForms(verb: FrenchVerb, tense: FrenchTense): (string | null)[] {
  return [0, 1, 2, 3, 4, 5].map((i) => conjugateFrench(verb, tense, i as 0 | 1 | 2 | 3 | 4 | 5));
}

/* ------------------------------------------------------------------ */
/*  FRANÇAIS                                                           */
/* ------------------------------------------------------------------ */

const frConjugaison: QuestionFamily = {
  id: 'fr.conjugaison',
  label: 'Conjugaison française',
  pool: () => FRENCH_VERBS.length * TENSES.length * 6,
  make(ctx) {
    const { rng, topicId } = ctx;
    const tense = (ctx.params.tense as FrenchTense) ?? rng.pick(TENSES);
    const group = (ctx.params.group as number) ?? rng.pick([1, 1, 2, 3, 3]);
    const verb = pickConjugable(rng, tense, group);
    if (!verb) return null;
    const person = rng.int(0, 5) as 0 | 1 | 2 | 3 | 4 | 5;
    const correct = conjugateFrench(verb, tense, person);
    if (!correct) return null;
    const pronouns = ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'];
    const pronoun = pronouns[person];
    const elide = pronoun === 'je' && /^[aeéèêihou]/i.test(correct) ? 'j’' : `${pronoun} `;

    // Distracteurs : autres personnes du même temps + autres verbes au même temps/personne
    const distractors = new Set<string>();
    frenchForms(verb, tense).forEach((f) => {
      if (f && f !== correct) distractors.add(f);
    });
    let guard = 0;
    while (distractors.size < 3 && guard < 30) {
      guard += 1;
      const other = pickConjugable(rng, tense, verb.group);
      const f = other ? conjugateFrench(other, tense, rng.int(0, 5) as 0 | 1 | 2 | 3 | 4 | 5) : null;
      if (f && f !== correct) distractors.add(f);
    }
    return qcm({
      topicId,
      prompt: `Conjuguez le verbe **${verb.infinitive}** au **${TENSE_LABELS[tense]}** : ${elide}___`,
      correct,
      distractors: [...distractors].slice(0, 3),
      explanation: `« ${verb.infinitive} » (${verb.group === 1 ? '1ᵉʳ groupe' : verb.group === 2 ? '2ᵉ groupe' : '3ᵉ groupe'}) au ${TENSE_LABELS[tense]} : ${pronouns
        .map((p, i) => `${p} ${frenchForms(verb, tense)[i] ?? '—'}`)
        .join(', ')}. ${verb.note ?? ''}`,
      difficulty: verb.group === 1 ? 'facile' : 'moyen',
      skill: `Conjugaison — ${TENSE_LABELS[tense]}`,
      rng,
    });
  },
};

const frParticipe: QuestionFamily = {
  id: 'fr.participe',
  label: 'Participes passés',
  pool: () => FRENCH_VERBS.length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const verb = rng.pick(FRENCH_VERBS);
    const others = rng.pickMany(FRENCH_VERBS.filter((v) => v.infinitive !== verb.infinitive), 6);
    const distractors = Array.from(new Set(others.map((v) => v.pastParticiple).filter((p) => p !== verb.pastParticiple))).slice(0, 3);
    return qcm({
      topicId,
      prompt: `Quel est le participe passé du verbe **${verb.infinitive}** ?`,
      correct: verb.pastParticiple,
      distractors,
      explanation: `${verb.infinitive} → ${verb.pastParticiple} (auxiliaire « ${verb.auxiliary === 'avoir' ? 'avoir' : 'être'} » aux temps composés).`,
      difficulty: verb.group === 1 ? 'facile' : 'moyen',
      skill: 'Participe passé',
      rng,
    });
  },
};

const frPasseCompose: QuestionFamily = {
  id: 'fr.passeCompose',
  label: 'Temps composés',
  pool: () => FRENCH_VERBS.length * 6,
  make(ctx) {
    const { rng, topicId } = ctx;
    const verb = rng.pick(FRENCH_VERBS);
    // Pour les verbes conjugués avec « être », on évite les personnes dont le
    // genre est inconnu (je/tu) afin de garantir une réponse unique et exacte.
    const person = (verb.auxiliary === 'etre' ? rng.int(3, 5) : rng.int(0, 5)) as 0 | 1 | 2 | 3 | 4 | 5;
    const pronouns = ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'];
    const auxForms = { avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], etre: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'] };
    const aux = verb.auxiliary === 'avoir' ? auxForms.avoir[person] : auxForms.etre[person];
    let participle = verb.pastParticiple;
    if (verb.auxiliary === 'etre' && person >= 3) {
      participle = `${participle}s`;
    }
    const pronoun = pronouns[person];
    const elided = pronoun === 'je' && /^[aeéèêiho]/i.test(aux) ? `j’${aux}` : `${pronoun} ${aux}`;
    const correct = `${elided} ${participle}`;
    const wrongAux = verb.auxiliary === 'avoir' ? auxForms.etre[person] : auxForms.avoir[person];
    const wrongElided = pronoun === 'je' && /^[aeéèêiho]/i.test(wrongAux) ? `j’${wrongAux}` : `${pronoun} ${wrongAux}`;
    const rawParticiple = verb.pastParticiple;
    const distractors = [
      `${wrongElided} ${rawParticiple}`,
      `${elided} ${verb.infinitive}`,
      verb.auxiliary === 'etre' && person >= 3 ? `${elided} ${rawParticiple}` : `${elided} ${rawParticiple}s`,
    ];
    return qcm({
      topicId,
      prompt: `Conjuguez **${verb.infinitive}** au passé composé avec le pronom « ${pronoun} ».`,
      correct,
      distractors: distractors.filter((d) => d !== correct),
      explanation: `Le passé composé se forme avec l’auxiliaire « ${verb.auxiliary === 'avoir' ? 'avoir' : 'être'} » au présent suivi du participe passé « ${verb.pastParticiple} ». ${
        verb.auxiliary === 'etre' ? 'Avec l’auxiliaire être, le participe passé s’accorde en genre et en nombre avec le sujet.' : ''
      }`,
      difficulty: 'moyen',
      skill: 'Passé composé',
      rng,
    });
  },
};

const frHomophones: QuestionFamily = {
  id: 'fr.homophones',
  label: 'Homophones grammaticaux',
  pool: () => HOMOPHONES.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(HOMOPHONES);
    if (rng.chance(0.3)) {
      return trueFalse(topicId, `La phrase suivante est correcte : « ${item.sentence.replace('___', item.wrong)} »`, false, `Non : il faut « ${item.correct} ». ${item.rule}`, 'moyen', 'Homophones');
    }
    const distractors = rng.pickMany(HOMOPHONES.filter((h) => h.sentence !== item.sentence), 3).map((h) => h.correct);
    return qcm({
      topicId,
      prompt: `Complétez : « ${item.sentence} »`,
      correct: item.correct,
      distractors: [item.wrong, ...distractors].filter((d) => d !== item.correct),
      explanation: item.rule,
      difficulty: 'moyen',
      skill: 'Homophones grammaticaux',
      rng,
    });
  },
};

const frAccords: QuestionFamily = {
  id: 'fr.accords',
  label: 'Accords',
  pool: () => AGREEMENTS.length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(AGREEMENTS);
    return qcm({
      topicId,
      prompt: item.question,
      correct: item.correct,
      distractors: item.wrong.slice(0, 3),
      explanation: item.rule,
      difficulty: 'moyen',
      skill: 'Accord du participe passé / adjectif',
      rng,
    });
  },
};

const frReglesConjugaison: QuestionFamily = {
  id: 'fr.regles',
  label: 'Règles de conjugaison',
  pool: () => CONJUGATION_RULES.length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(CONJUGATION_RULES);
    return qcm({ topicId, prompt: item.question, correct: item.correct, distractors: item.wrong.slice(0, 3), explanation: item.rule, difficulty: 'moyen', skill: 'Règles de conjugaison', rng });
  },
};

const frNatures: QuestionFamily = {
  id: 'fr.natures',
  label: 'Natures et fonctions',
  pool: () => GRAMMAR_CONCEPTS.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(GRAMMAR_CONCEPTS);
    if (rng.chance(0.5)) {
      const distractors = rng.pickMany(GRAMMAR_CONCEPTS.filter((c) => c.term !== item.term), 3).map((c) => c.definition);
      return qcm({
        topicId,
        prompt: `Quelle est la définition d'une / d'un **${item.term}** ?`,
        correct: item.definition,
        distractors,
        explanation: `${item.term.charAt(0).toUpperCase() + item.term.slice(1)} : ${item.definition}. Exemple : ${item.example}.`,
        difficulty: 'facile',
        skill: 'Grammaire — natures et fonctions',
        rng,
      });
    }
    const distractors = rng.pickMany(GRAMMAR_CONCEPTS.filter((c) => c.definition !== item.definition), 3).map((c) => c.term);
    return qcm({
      topicId,
      prompt: `Quel terme correspond à cette définition : « ${item.definition} » ?`,
      correct: item.term,
      distractors,
      explanation: `Il s'agit de ${item.term} (exemple : ${item.example}).`,
      difficulty: 'moyen',
      skill: 'Grammaire — natures et fonctions',
      rng,
    });
  },
};

const frFigures: QuestionFamily = {
  id: 'fr.figures',
  label: 'Figures de style',
  pool: () => FIGURES_OF_SPEECH.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(FIGURES_OF_SPEECH);
    if (rng.chance(0.5)) {
      const distractors = rng.pickMany(FIGURES_OF_SPEECH.filter((f) => f.name !== item.name), 3).map((f) => f.name);
      return qcm({
        topicId,
        prompt: `Quelle figure de style correspond à cette définition : « ${item.definition} » ?`,
        correct: item.name,
        distractors,
        explanation: `C'est la ${item.name}. Exemple : ${item.example}.`,
        difficulty: 'moyen',
        skill: 'Figures de style',
        rng,
      });
    }
    const distractors = rng.pickMany(FIGURES_OF_SPEECH.filter((f) => f.example !== item.example), 3).map((f) => f.example);
    return qcm({
      topicId,
      prompt: `Quelle figure de style illustre cet exemple : ${item.example} ?`,
      correct: item.name,
      distractors: Array.from(new Set([...distractors, item.definition].filter((d) => d !== item.name))).slice(0, 3),
      explanation: `${item.name.charAt(0).toUpperCase() + item.name.slice(1)} : ${item.definition}.`,
      difficulty: 'moyen',
      skill: 'Figures de style',
      rng,
    });
  },
};

const frVersification: QuestionFamily = {
  id: 'fr.versification',
  label: 'Versification',
  pool: () => VERSIFICATION.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(VERSIFICATION);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `En versification, qu'est-ce qu'un / une **${item.term}** ?`,
        correct: item.definition,
        distractors: rng.pickMany(VERSIFICATION.filter((v) => v.term !== item.term), 3).map((v) => v.definition),
        explanation: `${item.term} : ${item.definition}.`,
        difficulty: 'facile',
        skill: 'Versification',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quel terme de versification correspond à : « ${item.definition} » ?`,
      correct: item.term,
      distractors: rng.pickMany(VERSIFICATION.filter((v) => v.definition !== item.definition), 3).map((v) => v.term),
      explanation: `Il s'agit de ${item.term} (${item.definition}).`,
      difficulty: 'moyen',
      skill: 'Versification',
      rng,
    });
  },
};

const frMouvements: QuestionFamily = {
  id: 'fr.mouvements',
  label: 'Mouvements littéraires',
  pool: () => LITERARY_MOVEMENTS.length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(LITERARY_MOVEMENTS);
    const kind = rng.pick(['periode', 'auteur', 'caracteristique'] as const);
    if (kind === 'periode') {
      return qcm({
        topicId,
        prompt: `À quelle période correspond le mouvement **${item.name}** ?`,
        correct: item.period,
        distractors: Array.from(new Set(LITERARY_MOVEMENTS.filter((m) => m.period !== item.period).map((m) => m.period))).slice(0, 3),
        explanation: `${item.name} : ${item.period}. Caractéristiques : ${item.features}.`,
        difficulty: 'facile',
        skill: 'Histoire littéraire',
        rng,
      });
    }
    if (kind === 'auteur') {
      const author = rng.pick(item.authors);
      return qcm({
        topicId,
        prompt: `Lequel de ces auteurs appartient au mouvement **${item.name}** ?`,
        correct: author,
        distractors: rng.pickMany(LITERARY_MOVEMENTS.filter((m) => m.name !== item.name), 4).flatMap((m) => m.authors).filter((a) => a !== author).slice(0, 3),
        explanation: `${author} est une figure du ${item.name} (${item.period}) : ${item.features}.`,
        difficulty: 'moyen',
        skill: 'Histoire littéraire',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quelle caractéristique définit le mouvement **${item.name}** ?`,
      correct: item.features,
      distractors: rng.pickMany(LITERARY_MOVEMENTS.filter((m) => m.name !== item.name), 3).map((m) => m.features),
      explanation: `${item.name} (${item.period}) : ${item.features}. Auteurs : ${item.authors.join(', ')}.`,
      difficulty: 'moyen',
      skill: 'Histoire littéraire',
      rng,
    });
  },
};

const frOeuvres: QuestionFamily = {
  id: 'fr.oeuvres',
  label: 'Œuvres et auteurs',
  pool: () => LITERARY_WORKS.length * 4,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(LITERARY_WORKS);
    const kind = rng.pick(['auteur', 'siecle', 'genre', 'mouvement'] as const);
    if (kind === 'auteur') {
      return qcm({
        topicId,
        prompt: `Qui a écrit **${item.work}** ?`,
        correct: item.author,
        distractors: rng.pickMany(LITERARY_WORKS.filter((w) => w.author !== item.author), 8).map((w) => w.author).filter((a, i, arr) => arr.indexOf(a) === i).slice(0, 3),
        explanation: `${item.work} (${item.century} siècle) est de ${item.author}, ${item.genre} relevant du ${item.movement}. ${item.note}.`,
        difficulty: 'facile',
        skill: 'Culture littéraire',
        rng,
      });
    }
    if (kind === 'siecle') {
      return qcm({
        topicId,
        prompt: `De quel siècle date **${item.work}** de ${item.author} ?`,
        correct: `${item.century} siècle`,
        distractors: ['XVIᵉ siècle', 'XVIIᵉ siècle', 'XVIIIᵉ siècle', 'XIXᵉ siècle', 'XXᵉ siècle'].filter((s) => s !== `${item.century} siècle`).slice(0, 3),
        explanation: `${item.work} appartient au ${item.century} siècle (${item.movement}). ${item.note}.`,
        difficulty: 'facile',
        skill: 'Chronologie littéraire',
        rng,
      });
    }
    if (kind === 'genre') {
      return qcm({
        topicId,
        prompt: `À quel genre appartient **${item.work}** de ${item.author} ?`,
        correct: item.genre,
        distractors: rng.pickMany(GENRES, 4).map((g) => g.name).filter((g) => !item.genre.toLowerCase().includes(g.toLowerCase())).slice(0, 3),
        explanation: `${item.work} est une/un ${item.genre} : ${item.note}.`,
        difficulty: 'moyen',
        skill: 'Genres littéraires',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `De quel mouvement littéraire relève **${item.work}** de ${item.author} ?`,
      correct: item.movement,
      distractors: rng.pickMany(LITERARY_MOVEMENTS, 5).map((m) => m.name).filter((m) => !item.movement.includes(m)).slice(0, 3),
      explanation: `${item.author}, ${item.work} (${item.century} siècle) : ${item.movement}. ${item.note}.`,
      difficulty: 'moyen',
      skill: 'Mouvements littéraires',
      rng,
    });
  },
};

const frGenres: QuestionFamily = {
  id: 'fr.genres',
  label: 'Genres littéraires',
  pool: () => GENRES.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(GENRES);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quel genre littéraire est défini ainsi : « ${item.definition} » ?`,
        correct: item.name,
        distractors: rng.pickMany(GENRES.filter((g) => g.name !== item.name), 3).map((g) => g.name),
        explanation: `${item.name} : ${item.definition}. Exemples : ${item.examples}.`,
        difficulty: 'facile',
        skill: 'Genres littéraires',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quels sont les exemples typiques du genre **${item.name}** ?`,
      correct: item.examples,
      distractors: rng.pickMany(GENRES.filter((g) => g.examples !== item.examples), 3).map((g) => g.examples),
      explanation: `${item.name} (${item.definition}) : par exemple ${item.examples}.`,
      difficulty: 'moyen',
      skill: 'Genres littéraires',
      rng,
    });
  },
};

const frRegistres: QuestionFamily = {
  id: 'fr.registres',
  label: 'Registres',
  pool: () => REGISTERS.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(REGISTERS);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quel registre littéraire correspond à : « ${item.definition} » ?`,
        correct: item.name,
        distractors: rng.pickMany(REGISTERS.filter((r) => r.name !== item.name), 3).map((r) => r.name),
        explanation: `Registre ${item.name} : ${item.definition}. Effet recherché : ${item.effect}.`,
        difficulty: 'facile',
        skill: 'Registres littéraires',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quel effet produit le registre **${item.name}** ?`,
      correct: item.effect,
      distractors: rng.pickMany(REGISTERS.filter((r) => r.effect !== item.effect), 3).map((r) => r.effect),
      explanation: `${item.name} : ${item.definition} → ${item.effect}.`,
      difficulty: 'moyen',
      skill: 'Registres littéraires',
      rng,
    });
  },
};

const frSynonymes: QuestionFamily = {
  id: 'fr.synonymes',
  label: 'Synonymes',
  pool: () => SYNONYMS.length * 4,
  make(ctx) {
    const { rng, topicId } = ctx;
    const [word, syns] = rng.pick(SYNONYMS);
    const target = rng.pick(syns);
    const distractors = rng.pickMany(ANTONYMS, 3).map((pair) => pair[rng.int(0, 1)]);
    return qcm({
      topicId,
      prompt: `Quel mot est un synonyme de « **${word}** » ?`,
      correct: target,
      distractors: [...new Set([...distractors, ...rng.pickMany(SYNONYMS.filter((s) => s[0] !== word), 3).map((s) => s[0])])].filter((d) => d !== target && !syns.includes(d)).slice(0, 3),
      explanation: `Synonymes de « ${word} » : ${syns.join(', ')}.`,
      difficulty: 'facile',
      skill: 'Champ lexical et synonymes',
      rng,
    });
  },
};

const frAntonymes: QuestionFamily = {
  id: 'fr.antonymes',
  label: 'Antonymes',
  pool: () => ANTONYMS.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const [a, b] = rng.pick(ANTONYMS);
    return qcm({
      topicId,
      prompt: `Quel est l'antonyme (contraire) de « **${a}** » ?`,
      correct: b,
      distractors: rng.pickMany(SYNONYMS, 4).map((s) => s[0]).filter((d) => d !== b && d !== a).slice(0, 3),
      explanation: `« ${a} » et « ${b} » sont des antonymes : ils expriment des idées opposées.`,
      difficulty: 'facile',
      skill: 'Antonymes',
      rng,
    });
  },
};

const frFamilles: QuestionFamily = {
  id: 'fr.familles',
  label: 'Familles de mots',
  pool: () => WORD_FAMILIES.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(WORD_FAMILIES);
    const member = rng.pick(item.family);
    const outsider = rng.pickMany(WORD_FAMILIES.filter((w) => w.root !== item.root), 3)
      .map((w) => w.family[0]);
    return qcm({
      topicId,
      prompt: `Quel mot appartient à la famille de « **${item.root}** » ?`,
      correct: member,
      distractors: outsider,
      explanation: `Famille de « ${item.root} » : ${item.family.join(', ')} (même radical, sens apparenté).`,
      difficulty: 'facile',
      skill: 'Formation des mots',
      rng,
    });
  },
};

const frDictee: QuestionFamily = {
  id: 'fr.dictee',
  label: 'Orthographe',
  pool: () => AGREEMENTS.length + HOMOPHONES.length,
  make(ctx) {
    const { rng, topicId } = ctx;
    if (rng.chance(0.5)) {
      const item = rng.pick(AGREEMENTS);
      return shortAnswer(topicId, `${item.question} — écrivez le mot correctement orthographié.`, [item.correct], item.rule, 'moyen', 'Orthographe grammaticale');
    }
    const item = rng.pick(HOMOPHONES);
    return shortAnswer(topicId, `Complétez et écrivez le mot manquant : « ${item.sentence} »`, [item.correct], item.rule, 'moyen', 'Orthographe lexicale');
  },
};

/* ------------------------------------------------------------------ */
/*  ANGLAIS                                                            */
/* ------------------------------------------------------------------ */

const enIrregular: QuestionFamily = {
  id: 'en.irregular',
  label: 'Verbes irréguliers anglais',
  pool: () => ENGLISH_VERBS.filter((v) => !v.regular).length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const irregular = ENGLISH_VERBS.filter((v) => !v.regular);
    const verb = rng.pick(irregular);
    const kind = rng.pick(['past', 'participle', 'meaning'] as const);
    const others = rng.pickMany(irregular.filter((v) => v.base !== verb.base), 8);
    if (kind === 'past') {
      return qcm({
        topicId,
        prompt: `What is the **preterit** (past simple) of "${verb.base}"?`,
        correct: verb.past,
        distractors: Array.from(new Set(others.map((v) => v.past).filter((f) => f !== verb.past))).slice(0, 3),
        explanation: `${verb.base} → ${verb.past} → ${verb.participle} (« ${verb.fr} »).`,
        difficulty: 'facile',
        skill: 'Irregular verbs — preterit',
        rng,
      });
    }
    if (kind === 'participle') {
      return qcm({
        topicId,
        prompt: `What is the **past participle** of "${verb.base}"?`,
        correct: verb.participle,
        distractors: Array.from(new Set(others.map((v) => v.participle).filter((f) => f !== verb.participle))).slice(0, 3),
        explanation: `${verb.base} → ${verb.past} → ${verb.participle} (« ${verb.fr} »).`,
        difficulty: 'moyen',
        skill: 'Irregular verbs — past participle',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Que signifie le verbe anglais **« ${verb.base} »** ?`,
      correct: verb.fr,
      distractors: Array.from(new Set(others.map((v) => v.fr).filter((f) => f !== verb.fr))).slice(0, 3),
      explanation: `${verb.base} = ${verb.fr} (${verb.base} / ${verb.past} / ${verb.participle}).`,
      difficulty: 'facile',
      skill: 'Vocabulaire — verbes',
      rng,
    });
  },
};

const enRegular: QuestionFamily = {
  id: 'en.regular',
  label: 'Verbes réguliers anglais',
  pool: () => ENGLISH_VERBS.filter((v) => v.regular).length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const regular = ENGLISH_VERBS.filter((v) => v.regular);
    const verb = rng.pick(regular);
    const kind = rng.pick(['preterit', 'ing', 'third'] as const);
    const ingRules = (base: string): string => {
      if (base.endsWith('e') && !base.endsWith('ee')) return `${base.slice(0, -1)}ing`;
      if (/[^aeiou][aeiou][^aeiouwxy]$/.test(base)) return `${base}${base[base.length - 1]}ing`;
      return `${base}ing`;
    };
    const thirdPerson = (base: string): string => {
      if (/(s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
      if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
      return `${base}s`;
    };
    if (kind === 'preterit') {
      return qcm({
        topicId,
        prompt: `What is the **preterit** of "${verb.base}"?`,
        correct: verb.past,
        distractors: Array.from(new Set(regular.filter((v) => v.base !== verb.base).map((v) => v.past))).slice(0, 3),
        explanation: `Verbe régulier : on ajoute -ed → ${verb.past}. ${verb.base} = « ${verb.fr} ».`,
        difficulty: 'facile',
        skill: 'Preterit régulier',
        rng,
      });
    }
    if (kind === 'ing') {
      const correct = ingRules(verb.base);
      return qcm({
        topicId,
        prompt: `What is the **-ing form** (base + ing) of "${verb.base}"?`,
        correct,
        distractors: [`${verb.base}ing`, `${verb.base.slice(0, -1)}ying`, `${verb.base}${verb.base[verb.base.length - 1]}ing`].filter((d) => d !== correct),
        explanation: `${verb.base} → ${correct}. On retire le -e final muet (ou on double la consonne finale) avant d'ajouter -ing.`,
        difficulty: 'facile',
        skill: 'Forme en -ing',
        rng,
      });
    }
    const correct = thirdPerson(verb.base);
    return qcm({
      topicId,
      prompt: `Conjugate at the **present simple**, 3rd person singular: "He ___ (${verb.base})"`,
      correct,
      distractors: [verb.base, `${verb.base}es`, `${verb.base}ing`].filter((d) => d !== correct),
      explanation: `Au présent simple, on ajoute -s à la 3ᵉ personne du singulier : he/she/it ${correct}.`,
      difficulty: 'facile',
      skill: 'Present simple',
      rng,
    });
  },
};

const enVocab: QuestionFamily = {
  id: 'en.vocab',
  label: 'Vocabulaire anglais',
  pool: () => ENGLISH_VOCAB.reduce((n, t) => n + t.items.length, 0) * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const themeParam = ctx.params.theme as string | undefined;
    const themes = themeParam ? ENGLISH_VOCAB.filter((t) => t.theme === themeParam) : ENGLISH_VOCAB;
    const theme = rng.pick(themes.length ? themes : ENGLISH_VOCAB);
    const [en, fr] = rng.pick(theme.items);
    const others = rng.pickMany(ENGLISH_VOCAB.flatMap((t) => t.items).filter((i) => i[0] !== en), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Que signifie **« ${en} »** ?`,
        correct: fr,
        distractors: others.map((i) => i[1]).filter((v) => v !== fr).slice(0, 3),
        explanation: `« ${en} » se traduit par « ${fr} » (thème : ${theme.theme}).`,
        difficulty: 'facile',
        skill: `Vocabulaire — ${theme.theme}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Comment dit-on **« ${fr} »** en anglais ?`,
      correct: en,
      distractors: others.map((i) => i[0]).filter((v) => v !== en).slice(0, 3),
      explanation: `« ${fr} » = "${en}" (thème : ${theme.theme}).`,
      difficulty: 'moyen',
      skill: `Vocabulaire — ${theme.theme}`,
      rng,
    });
  },
};

const enPhrasal: QuestionFamily = {
  id: 'en.phrasal',
  label: 'Phrasal verbs',
  pool: () => PHRASAL_VERBS.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const [verb, meaning] = rng.pick(PHRASAL_VERBS);
    const others = rng.pickMany(PHRASAL_VERBS.filter((p) => p[0] !== verb), 5);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Que signifie le phrasal verb **« ${verb} »** ?`,
        correct: meaning,
        distractors: others.map((o) => o[1]).filter((m) => m !== meaning).slice(0, 3),
        explanation: `« ${verb} » = ${meaning}. Le sens d'un phrasal verb ne se déduit pas toujours du verbe seul.`,
        difficulty: 'moyen',
        skill: 'Phrasal verbs',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quel phrasal verb signifie **« ${meaning} »** ?`,
      correct: verb,
      distractors: others.map((o) => o[0]).slice(0, 3),
      explanation: `« ${meaning} » se dit "${verb}".`,
      difficulty: 'moyen',
      skill: 'Phrasal verbs',
      rng,
    });
  },
};

const enFalseFriends: QuestionFamily = {
  id: 'en.falseFriends',
  label: 'Faux amis',
  pool: () => FALSE_FRIENDS.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const [en, real, trap] = rng.pick(FALSE_FRIENDS);
    const others = rng.pickMany(FALSE_FRIENDS.filter((f) => f[0] !== en), 4);
    return qcm({
      topicId,
      prompt: `Attention, faux ami ! Que signifie réellement **« ${en} »** en anglais ?`,
      correct: real,
      distractors: [trap, ...others.map((o) => o[1])].filter((d) => d !== real).slice(0, 3),
      explanation: `« ${en} » signifie « ${real} », et non « ${trap} » (le piège vient de la ressemblance avec le français).`,
      difficulty: 'moyen',
      skill: 'Faux amis',
      rng,
    });
  },
};

const enGrammar: QuestionFamily = {
  id: 'en.grammar',
  label: 'Grammaire anglaise',
  pool: 60,
  make(ctx) {
    const { rng, topicId } = ctx;
    const items: { prompt: string; correct: string; distractors: string[]; explanation: string }[] = [
      {
        prompt: 'Choose the correct sentence:',
        correct: 'She doesn’t like coffee.',
        distractors: ['She don’t like coffee.', 'She not like coffee.', 'She doesn’t likes coffee.'],
        explanation: 'Au présent simple, la négation à la 3ᵉ personne du singulier utilise does + not, et le verbe reprend sa base verbale.',
      },
      {
        prompt: 'Complete: "I ___ to school every day."',
        correct: 'go',
        distractors: ['goes', 'am going', 'went'],
        explanation: '« every day » exprime une habitude → present simple. Avec I, la base verbale reste go.',
      },
      {
        prompt: 'Complete: "Look! It ___ outside."',
        correct: 'is raining',
        distractors: ['rains', 'rained', 'rain'],
        explanation: '« Look! » indique une action en cours → present continuous (be + -ing).',
      },
      {
        prompt: 'Complete: "If I ___ rich, I would travel."',
        correct: 'were',
        distractors: ['am', 'will be', 'would be'],
        explanation: 'Conditionnel de type 2 (irréel du présent) : if + preterit, would + base verbale. « were » est la forme attendue.',
      },
      {
        prompt: 'Complete: "She has lived here ___ 2010."',
        correct: 'since',
        distractors: ['for', 'during', 'ago'],
        explanation: '« since » + point de départ ; « for » + durée (for ten years).',
      },
      {
        prompt: 'Complete: "This book is ___ than that one."',
        correct: 'more interesting',
        distractors: ['interestinger', 'most interesting', 'more interest'],
        explanation: 'Comparatif de supériorité d’un adjectif long : more + adjectif + than.',
      },
      {
        prompt: 'Complete: "He asked me where I ___."',
        correct: 'lived',
        distractors: ['live', 'do live', 'am living'],
        explanation: 'Discours indirect : concordance des temps → le présent devient prétérit.',
      },
      {
        prompt: 'Choose the correct sentence:',
        correct: 'There are many people in the room.',
        distractors: ['There is many people in the room.', 'They are many people in the room.', 'There has many people in the room.'],
        explanation: '« There is / there are » introduit l’existence ; people est pluriel → there are.',
      },
      {
        prompt: 'Complete: "I have ___ my keys, I can’t open the door."',
        correct: 'lost',
        distractors: ['lose', 'loosed', 'losing'],
        explanation: 'Present perfect : have + participe passé. lose → lost → lost.',
      },
      {
        prompt: 'Complete: "You ___ smoke here, it’s forbidden."',
        correct: 'mustn’t',
        distractors: ['don’t have to', 'shouldn’t have', 'needn’t'],
        explanation: '« mustn’t » exprime l’interdiction ; « don’t have to » exprime l’absence d’obligation.',
      },
      {
        prompt: 'Complete: "___ you ever ___ sushi?"',
        correct: 'Have … eaten',
        distractors: ['Did … ate', 'Do … eat', 'Are … eating'],
        explanation: 'Present perfect avec « ever » pour une expérience de vie : have + participe passé.',
      },
      {
        prompt: 'Which sentence uses the passive voice correctly?',
        correct: 'The window was broken by the children.',
        distractors: ['The children broke by the window.', 'The window broke by the children.', 'Was broken the window by children.'],
        explanation: 'Passif : be (conjugué) + participe passé + by + agent.',
      },
      {
        prompt: 'Complete: "I wish I ___ taller."',
        correct: 'were',
        distractors: ['am', 'will be', 'would be'],
        explanation: 'Après « wish » exprimant un regret sur le présent, on utilise le prétérit (were).',
      },
      {
        prompt: 'Complete: "She is used ___ up early."',
        correct: 'to getting',
        distractors: ['to get', 'get', 'for getting'],
        explanation: '« be used to » est suivi d’un gérondif (-ing) : être habitué à faire quelque chose.',
      },
      {
        prompt: 'Complete: "The film ___ by millions of people last year."',
        correct: 'was watched',
        distractors: ['watched', 'is watched', 'has watched'],
        explanation: 'Passif au prétérit : was + participe passé, avec « last year ».',
      },
      {
        prompt: 'Choose the correct quantifier: "How ___ sugar do you want?"',
        correct: 'much',
        distractors: ['many', 'few', 'a lot'],
        explanation: '« much » avec un nom indénombrable (sugar) ; « many » avec un dénombrable pluriel.',
      },
      {
        prompt: 'Complete: "If it rains, we ___ at home."',
        correct: 'will stay',
        distractors: ['would stay', 'stayed', 'will staying'],
        explanation: 'Conditionnel de type 1 : if + present simple, will + base verbale.',
      },
      {
        prompt: 'Complete: "He told me that he ___ tired."',
        correct: 'was',
        distractors: ['is', 'has been', 'will be'],
        explanation: 'Discours indirect au passé : is → was (concordance des temps).',
      },
      {
        prompt: 'Which word is a linking word expressing contrast?',
        correct: 'however',
        distractors: ['therefore', 'moreover', 'because'],
        explanation: '« however » = cependant (opposition) ; « therefore » = donc (conséquence) ; « moreover » = de plus (addition).',
      },
      {
        prompt: 'Complete: "By the time we arrived, the film ___."',
        correct: 'had already started',
        distractors: ['already started', 'has already started', 'was already start'],
        explanation: 'Past perfect pour une action antérieure à un autre moment du passé.',
      },
    ];
    const item = rng.pick(items);
    return qcm({ topicId, prompt: item.prompt, correct: item.correct, distractors: item.distractors, explanation: item.explanation, difficulty: 'moyen', skill: 'Grammaire anglaise', rng });
  },
};

/* ------------------------------------------------------------------ */
/*  ESPAGNOL                                                           */
/* ------------------------------------------------------------------ */

const esConjugaison: QuestionFamily = {
  id: 'es.conjugaison',
  label: 'Conjugaison espagnole',
  pool: () => SPANISH_VERBS.length * 6,
  make(ctx) {
    const { rng, topicId } = ctx;
    const regulars = SPANISH_VERBS.filter((v) => !v.irregular);
    const verb = rng.pick(regulars);
    const person = rng.int(0, 5) as 0 | 1 | 2 | 3 | 4 | 5;
    const pronouns = ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'];
    const endings = SPANISH_PRESENT[verb.group as 'ar' | 'er' | 'ir'];
    const correct = `${verb.stem}${endings[person]}`;
    const distractors = new Set<string>();
    endings.forEach((e, i) => {
      const f = `${verb.stem}${e}`;
      if (f !== correct) distractors.add(f);
    });
    while (distractors.size < 3) {
      const other = rng.pick(regulars);
      distractors.add(`${other.stem}${endings[rng.int(0, 5) as 0 | 1 | 2 | 3 | 4 | 5]}`);
      distractors.delete(correct);
    }
    return qcm({
      topicId,
      prompt: `Conjugue **${verb.infinitive}** au présent de l'indicatif : ${pronouns[person]} ___`,
      correct,
      distractors: [...distractors].slice(0, 3),
      explanation: `${verb.infinitive} (« ${verb.fr} »), verbe en -${verb.group} : ${pronouns
        .map((pr, i) => `${pr} ${verb.stem}${endings[i]}`)
        .join(', ')}.`,
      difficulty: 'facile',
      skill: 'Présent de l’indicatif (espagnol)',
      rng,
    });
  },
};

const esIrregular: QuestionFamily = {
  id: 'es.irregular',
  label: 'Verbes irréguliers espagnols',
  pool: () => SPANISH_VERBS.filter((v) => v.irregular).length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const irregulars = SPANISH_VERBS.filter((v) => v.irregular);
    const verb: SpanishVerb = rng.pick(irregulars);
    const others = rng.pickMany(irregulars.filter((v) => v.infinitive !== verb.infinitive), 6);
    const kind = rng.pick(['present', 'preterite', 'meaning'] as const);
    if (kind === 'present') {
      return qcm({
        topicId,
        prompt: `Conjugue **${verb.infinitive}** au présent : yo ___`,
        correct: verb.stem,
        distractors: others.map((v) => v.stem).filter((s) => s !== verb.stem).slice(0, 3),
        explanation: `${verb.infinitive} (« ${verb.fr} ») est irrégulier : yo ${verb.stem}. Prétérit : ${verb.past}.`,
        difficulty: 'moyen',
        skill: 'Présent irrégulier (espagnol)',
        rng,
      });
    }
    if (kind === 'preterite') {
      return qcm({
        topicId,
        prompt: `Quel est le prétérit (passé simple espagnol) de **${verb.infinitive}** à la 1ʳᵉ personne : yo ___`,
        correct: verb.past,
        distractors: others.map((v) => v.past).filter((s) => s !== verb.past).slice(0, 3),
        explanation: `${verb.infinitive} → yo ${verb.past} au prétérit (« ${verb.fr} »).`,
        difficulty: 'difficile',
        skill: 'Prétérit (espagnol)',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Que signifie le verbe espagnol **« ${verb.infinitive} »** ?`,
      correct: verb.fr,
      distractors: Array.from(new Set(others.map((v) => v.fr))).slice(0, 3),
      explanation: `${verb.infinitive} = « ${verb.fr} » (yo ${verb.stem} au présent, yo ${verb.past} au prétérit).`,
      difficulty: 'facile',
      skill: 'Vocabulaire espagnol',
      rng,
    });
  },
};

const esVocab: QuestionFamily = {
  id: 'es.vocab',
  label: 'Vocabulaire espagnol',
  pool: () => SPANISH_VOCAB.reduce((n, t) => n + t.items.length, 0) * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const theme = rng.pick(SPANISH_VOCAB);
    const [es, fr] = rng.pick(theme.items);
    const others = rng.pickMany(SPANISH_VOCAB.flatMap((t) => t.items).filter((i) => i[0] !== es), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Que signifie **« ${es} »** ?`,
        correct: fr,
        distractors: others.map((i) => i[1]).filter((v) => v !== fr).slice(0, 3),
        explanation: `« ${es} » = « ${fr} » (thème : ${theme.theme}).`,
        difficulty: 'facile',
        skill: `Vocabulaire espagnol — ${theme.theme}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Comment dit-on **« ${fr} »** en espagnol ?`,
      correct: es,
      distractors: others.map((i) => i[0]).filter((v) => v !== es).slice(0, 3),
      explanation: `« ${fr} » = « ${es} » (thème : ${theme.theme}).`,
      difficulty: 'moyen',
      skill: `Vocabulaire espagnol — ${theme.theme}`,
      rng,
    });
  },
};

export const LANGUAGE_FAMILIES: QuestionFamily[] = [
  frConjugaison,
  frParticipe,
  frPasseCompose,
  frHomophones,
  frAccords,
  frReglesConjugaison,
  frNatures,
  frFigures,
  frVersification,
  frMouvements,
  frOeuvres,
  frGenres,
  frRegistres,
  frSynonymes,
  frAntonymes,
  frFamilles,
  frDictee,
  enIrregular,
  enRegular,
  enVocab,
  enPhrasal,
  enFalseFriends,
  enGrammar,
  esConjugaison,
  esIrregular,
  esVocab,
];
