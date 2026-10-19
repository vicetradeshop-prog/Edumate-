/**
 * EduMate — Extension systématique du catalogue : LANGUES.
 *
 * La conjugaison se décline naturellement en une grille
 * (temps × groupe × niveau) : chaque cellule est un sujet de quiz distinct,
 * avec des questions générées à partir de tables exactes.
 */
import type { TopicDefinition } from '../topics.js';
import { FRENCH_TENSES, type FrenchTense } from '../data/french.js';
import { ENGLISH_VOCAB, SPANISH_VOCAB } from '../data/languages.js';

/* ------------------------------------------------------------------ */
/*  FRANÇAIS — conjugaison                                             */
/* ------------------------------------------------------------------ */

const TENSE_BY_GROUP: Record<FrenchTense, (1 | 2 | 3)[]> = {
  present: [1, 2, 3],
  imparfait: [1, 2, 3],
  futur: [1, 2, 3],
  conditionnel: [1, 2, 3],
  subjonctif: [1, 3],
};

const GROUP_LABEL: Record<1 | 2 | 3, string> = {
  1: '1ᵉʳ groupe (-er)',
  2: '2ᵉ groupe (-ir)',
  3: '3ᵉ groupe (irréguliers)',
};

const CONJUG_LEVELS = ['troisieme', 'seconde', 'premiere'] as const;
const conjugationTopics: TopicDefinition[] = [];

for (const level of CONJUG_LEVELS) {
  for (const [tenseKey, label] of Object.entries(FRENCH_TENSES) as [FrenchTense, string][]) {
    for (const group of TENSE_BY_GROUP[tenseKey]) {
      const difficulty: 'facile' | 'moyen' | 'difficile' = group === 1 ? 'facile' : group === 2 ? 'moyen' : 'difficile';
      conjugationTopics.push({
        subjectId: 'francais',
        levelId: level,
        theme: 'Conjugaison',
        name: `${label.charAt(0).toUpperCase()}${label.slice(1)} — ${GROUP_LABEL[group]}`,
        source: 'fr.conjugaison',
        difficulty,
        params: { tense: tenseKey, group },
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  FRANÇAIS — grammaire, orthographe, littérature (par notion)        */
/* ------------------------------------------------------------------ */

const GRAMMAR_LEVELS = ['troisieme', 'seconde', 'premiere'] as const;
const grammarTopics: TopicDefinition[] = [];

const GRAMMAR_NOTIONS = [
  'Nom et déterminant',
  'Adjectif qualificatif',
  'Pronoms et reprises',
  'Verbe et temps',
  'Adverbe et négation',
  'Complément d’objet direct',
  'Complément d’objet indirect',
  'Compléments circonstanciels',
  'Attribut du sujet',
  'Proposition subordonnée relative',
  'Proposition subordonnée conjonctive',
  'Discours rapporté',
  'Voix active et voix passive',
];

for (const level of GRAMMAR_LEVELS) {
  for (const notion of GRAMMAR_NOTIONS) {
    grammarTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Grammaire',
      name: notion,
      source: 'fr.natures',
      difficulty: level === 'premiere' ? 'difficile' : 'moyen',
    });
  }
}

const ORTHO_NOTIONS = [
  'Homophones : a / à',
  'Homophones : et / est',
  'Homophones : son / sont',
  'Homophones : ou / où',
  'Homophones : ce / se',
  'Homophones : la / l’a / là',
  'Accord du participe passé avec avoir',
  'Accord du participe passé avec être',
  'Accord de l’adjectif qualificatif',
  'Pluriel des noms',
  'Pluriel des noms composés',
  'Orthographe lexicale courante',
];

const orthoTopics: TopicDefinition[] = [];
for (const level of GRAMMAR_LEVELS) {
  for (const notion of ORTHO_NOTIONS) {
    orthoTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Orthographe',
      name: notion,
      source: notion.startsWith('Homophones') ? 'fr.homophones' : 'fr.accords',
      difficulty: 'moyen',
    });
  }
}

const LITERATURE_LEVELS = ['seconde', 'premiere', 'terminale'] as const;
const literatureTopics: TopicDefinition[] = [];

const FIGURES = [
  'Comparaison et métaphore',
  'Personnification',
  'Hyperbole',
  'Litote et euphémisme',
  'Antithèse et oxymore',
  'Anaphore et répétition',
  'Gradation',
  'Allitération et assonance',
  'Chiasme et parallélisme',
  'Ironie',
  'Périphrase',
  'Accumulation et énumération',
];

for (const level of LITERATURE_LEVELS) {
  for (const figure of FIGURES) {
    literatureTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Figures de style',
      name: figure,
      source: 'fr.figures',
      difficulty: level === 'terminale' ? 'difficile' : 'moyen',
    });
  }
}

const VERSIFICATION_NOTIONS = [
  'Alexandrin et césure',
  'Décasyllabe et octosyllabe',
  'Rimes plates, croisées, embrassées',
  'Sonnet et formes fixes',
  'Vers libre et prose poétique',
  'Diérèse, synérèse et e muet',
];
for (const level of LITERATURE_LEVELS) {
  for (const notion of VERSIFICATION_NOTIONS) {
    literatureTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Versification',
      name: notion,
      source: 'fr.versification',
      difficulty: 'difficile',
    });
  }
}

const MOVEMENTS = [
  'Humanisme et Pléiade',
  'Baroque',
  'Classicisme',
  'Lumières',
  'Romantisme',
  'Réalisme',
  'Naturalisme',
  'Parnasse et Symbolisme',
  'Surréalisme et Dadaïsme',
  'Existentialisme et absurde',
  'Nouveau Roman et Oulipo',
  'Négritude',
];
const movementTopics: TopicDefinition[] = [];
for (const level of LITERATURE_LEVELS) {
  for (const movement of MOVEMENTS) {
    movementTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Mouvements littéraires',
      name: movement,
      source: 'fr.mouvements',
      difficulty: 'moyen',
    });
  }
}

const GENRES_LIST = [
  'Tragédie et comédie',
  'Drame romantique',
  'Roman et ses formes',
  'Apologue et conte philosophique',
  'Poésie lyrique et engagée',
  'Autobiographie et mémoires',
  'Essai et pamphplet',
  'Théâtre contemporain',
];
const genreTopics: TopicDefinition[] = [];
for (const level of LITERATURE_LEVELS) {
  for (const genre of GENRES_LIST) {
    genreTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Genres littéraires',
      name: genre,
      source: 'fr.genres',
      difficulty: 'moyen',
    });
    genreTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Registres',
      name: `Registre : ${genre.split(' et ')[0].toLowerCase()}`,
      source: 'fr.registres',
      difficulty: 'difficile',
    });
  }
}

const VOCAB_LEVELS = ['troisieme', 'seconde'] as const;
const vocabTopics: TopicDefinition[] = [];
const VOCAB_NOTIONS = ['Synonymes et nuances', 'Antonymes et contraires', 'Familles de mots et radicaux', 'Préfixes et suffixes'];
for (const level of VOCAB_LEVELS) {
  for (const notion of VOCAB_NOTIONS) {
    vocabTopics.push({
      subjectId: 'francais',
      levelId: level,
      theme: 'Vocabulaire',
      name: notion,
      source: notion.startsWith('Synonymes') ? 'fr.synonymes' : notion.startsWith('Antonymes') ? 'fr.antonymes' : 'fr.familles',
      difficulty: 'facile',
    });
  }
}

/* ------------------------------------------------------------------ */
/*  ANGLAIS                                                            */
/* ------------------------------------------------------------------ */

const EN_LEVELS = ['seconde', 'premiere', 'terminale'] as const;
const englishTopics: TopicDefinition[] = [];

for (const level of EN_LEVELS) {
  for (const theme of ENGLISH_VOCAB) {
    englishTopics.push({
      subjectId: 'anglais',
      levelId: level,
      theme: 'Vocabulaire',
      name: `${theme.theme} (anglais → français)`,
      source: 'en.vocab',
      difficulty: level === 'terminale' ? 'difficile' : 'moyen',
      params: { theme: theme.theme },
    });
  }
  englishTopics.push(
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Verbes irréguliers : prétérit', source: 'en.irregular', difficulty: 'moyen', params: { kind: 'past' } },
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Verbes irréguliers : participe passé', source: 'en.irregular', difficulty: 'difficile', params: { kind: 'participle' } },
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Verbes irréguliers : traduction', source: 'en.irregular', difficulty: 'facile', params: { kind: 'meaning' } },
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Verbes réguliers : prétérit', source: 'en.regular', difficulty: 'facile', params: { kind: 'preterit' } },
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Verbes réguliers : forme en -ing', source: 'en.regular', difficulty: 'facile', params: { kind: 'ing' } },
    { subjectId: 'anglais', levelId: level, theme: 'Verbes', name: 'Présent simple, 3ᵉ personne', source: 'en.regular', difficulty: 'facile', params: { kind: 'third' } },
    { subjectId: 'anglais', levelId: level, theme: 'Phrasal verbs', name: 'Phrasal verbs : sens', source: 'en.phrasal', difficulty: 'moyen' },
    { subjectId: 'anglais', levelId: level, theme: 'Pièges', name: 'Faux amis', source: 'en.falseFriends', difficulty: 'difficile' },
    { subjectId: 'anglais', levelId: level, theme: 'Grammaire', name: 'Temps du récit (present / preterit / perfect)', source: 'en.grammar', difficulty: 'moyen' },
    { subjectId: 'anglais', levelId: level, theme: 'Grammaire', name: 'Modaux et conditionnel', source: 'en.grammar', difficulty: 'difficile' },
    { subjectId: 'anglais', levelId: level, theme: 'Grammaire', name: 'Voix passive et discours indirect', source: 'en.grammar', difficulty: 'difficile' },
  );
}

/* ------------------------------------------------------------------ */
/*  ESPAGNOL                                                           */
/* ------------------------------------------------------------------ */

const ES_LEVELS = ['seconde', 'premiere', 'terminale'] as const;
const spanishTopics: TopicDefinition[] = [];

for (const level of ES_LEVELS) {
  for (const theme of SPANISH_VOCAB) {
    spanishTopics.push({
      subjectId: 'espagnol',
      levelId: level,
      theme: 'Vocabulaire',
      name: `${theme.theme} (espagnol → français)`,
      source: 'es.vocab',
      difficulty: level === 'terminale' ? 'difficile' : 'moyen',
      params: { theme: theme.theme },
    });
  }
  spanishTopics.push(
    { subjectId: 'espagnol', levelId: level, theme: 'Conjugaison', name: 'Présent : verbes réguliers en -ar', source: 'es.conjugaison', difficulty: 'facile' },
    { subjectId: 'espagnol', levelId: level, theme: 'Conjugaison', name: 'Présent : verbes réguliers en -er/-ir', source: 'es.conjugaison', difficulty: 'facile' },
    { subjectId: 'espagnol', levelId: level, theme: 'Conjugaison', name: 'Présent : verbes irréguliers', source: 'es.irregular', difficulty: 'moyen', params: { kind: 'present' } },
    { subjectId: 'espagnol', levelId: level, theme: 'Conjugaison', name: 'Prétérit : verbes irréguliers', source: 'es.irregular', difficulty: 'difficile', params: { kind: 'preterite' } },
    { subjectId: 'espagnol', levelId: level, theme: 'Vocabulaire', name: 'Verbes espagnols fréquents', source: 'es.irregular', difficulty: 'facile', params: { kind: 'meaning' } },
  );
}

export const EXPANDED_LANGUAGES: TopicDefinition[] = [
  ...conjugationTopics,
  ...grammarTopics,
  ...orthoTopics,
  ...literatureTopics,
  ...movementTopics,
  ...genreTopics,
  ...vocabTopics,
  ...englishTopics,
  ...spanishTopics,
];

export const LANGUAGE_EXPANDED_COUNT = EXPANDED_LANGUAGES.length;

