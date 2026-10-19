/**
 * EduMate — Extension systématique du catalogue : connaissances.
 *
 * Histoire (par période), géographie (par catégorie), SVT / SES / NSI
 * (par thème du corpus), philosophie (par notion du programme).
 * Chaque déclinaison est un sujet de quiz distinct et rejouable.
 */
import type { TopicDefinition } from '../topics.js';
import { HISTORY, GEOGRAPHY, BIOLOGY, SES, NSI, PHILOSOPHY } from '../data/knowledge.js';

/* ------------------------------------------------------------------ */
/*  HISTOIRE — par période                                             */
/* ------------------------------------------------------------------ */

const HISTORY_LEVELS = ['troisieme', 'seconde', 'premiere', 'terminale'] as const;

const PERIODS = Array.from(new Set(HISTORY.map((h) => h.period)));

const PERIOD_LEVELS: Record<string, (typeof HISTORY_LEVELS)[number][]> = {
  Antiquité: ['troisieme', 'seconde'],
  'Moyen Âge': ['troisieme', 'seconde'],
  'XVe siècle': ['troisieme', 'seconde'],
  'Époque moderne': ['seconde'],
  'Révolution française': ['seconde', 'premiere'],
  Empire: ['seconde', 'premiere'],
  'XIXe siècle': ['seconde', 'premiere'],
  'IIIe République': ['seconde', 'premiere'],
  Colonisation: ['premiere', 'terminale'],
  'Guerres mondiales': ['troisieme', 'premiere'],
  'Seconde Guerre mondiale': ['troisieme', 'premiere', 'terminale'],
  'Entre-deux-guerres': ['premiere', 'terminale'],
  'Guerre froide': ['premiere', 'terminale'],
  'Fin de la guerre froide': ['premiere', 'terminale'],
  Décolonisation: ['premiere', 'terminale'],
  'Construction européenne': ['premiere', 'terminale'],
  'Ve République': ['troisieme', 'premiere'],
  'Après-guerre': ['seconde', 'premiere'],
  'Crises économiques': ['premiere', 'terminale'],
  'Après guerre froide': ['terminale'],
  'Monde contemporain': ['terminale'],
};

const historyTopics: TopicDefinition[] = [];
for (const period of PERIODS) {
  const levels = PERIOD_LEVELS[period] ?? ['premiere', 'terminale'];
  const facts = HISTORY.filter((h) => h.period === period);
  if (facts.length < 4) continue; // pas assez de données pour un sujet fiable
  for (const level of levels) {
    historyTopics.push(
      {
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Histoire',
        name: `${period} — dates clés`,
        source: 'hg.histoire.dates',
        difficulty: 'moyen',
        params: { period },
      },
      {
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Histoire',
        name: `${period} — événements`,
        source: 'hg.histoire.evenements',
        difficulty: 'moyen',
        params: { period },
      },
    );
    if (facts.filter((f) => f.actor).length >= 7) {
      historyTopics.push({
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Histoire',
        name: `${period} — acteurs`,
        source: 'hg.histoire.acteurs',
        difficulty: 'difficile',
        params: { period },
      });
    }
    if (facts.length >= 8) {
      historyTopics.push({
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Histoire',
        name: `${period} — chronologie`,
        source: 'hg.histoire.chronologie',
        difficulty: 'difficile',
        params: { period },
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  GÉOGRAPHIE — par catégorie                                         */
/* ------------------------------------------------------------------ */

const GEO_LABELS: Record<string, string> = {
  capitale: 'Capitales du monde',
  fleuve: 'Fleuves et cours d’eau',
  relief: 'Reliefs et espaces naturels',
  population: 'Population et peuplement',
  économie: 'Économie et échanges',
  environnement: 'Environnement et climat',
  union: 'Organisations internationales',
  ville: 'Villes et métropoles',
};

const geoTopics: TopicDefinition[] = [];
const CATEGORIES = Array.from(new Set(GEOGRAPHY.map((g) => g.category)));
for (const category of CATEGORIES) {
  const facts = GEOGRAPHY.filter((g) => g.category === category);
  if (facts.length < 4) continue;
  const label = GEO_LABELS[category] ?? category;
  for (const level of ['seconde', 'premiere', 'terminale'] as const) {
    geoTopics.push(
      {
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Géographie',
        name: label,
        source: 'hg.geo.repères',
        difficulty: category === 'capitale' ? 'facile' : 'moyen',
        params: { category },
      },
      {
        subjectId: 'histoire-geographie',
        levelId: level,
        theme: 'Géographie',
        name: `${label} — vrai ou faux`,
        source: 'hg.geo.vraifaux',
        difficulty: 'moyen',
        params: { category },
      },
    );
  }
  if (category === 'capitale') {
    geoTopics.push({
      subjectId: 'histoire-geographie',
      levelId: 'troisieme',
      theme: 'Géographie',
      name: label,
      source: 'hg.geo.capitales',
      difficulty: 'facile',
      params: { category },
    });
  }
}

/* ------------------------------------------------------------------ */
/*  PHILOSOPHIE — par notion du programme                              */
/* ------------------------------------------------------------------ */

const PHILO_NOTIONS = [
  'La vérité',
  'La raison',
  'La démonstration',
  'L’interprétation',
  'La conscience',
  'L’inconscient',
  'Autrui',
  'Le désir',
  'Le bonheur',
  'La liberté',
  'Le devoir',
  'La morale',
  'La justice',
  'Le droit',
  'L’État',
  'La société',
  'Les échanges',
  'L’art',
  'La technique',
  'Le travail',
  'La religion',
  'L’histoire',
  'Le temps',
  'La nature',
  'La culture',
  'Le langage',
  'La science',
  'La vie',
];

const philoTopics: TopicDefinition[] = [];
for (const notion of PHILO_NOTIONS) {
  philoTopics.push(
    {
      subjectId: 'philosophie',
      levelId: 'terminale',
      theme: 'Notions du programme',
      name: notion,
      source: 'philo.concepts',
      difficulty: 'moyen',
    },
    {
      subjectId: 'philosophie',
      levelId: 'terminale',
      theme: 'Auteurs',
      name: `${notion} — auteurs et thèses`,
      source: 'philo.auteurs',
      difficulty: 'difficile',
    },
  );
}
philoTopics.push({
  subjectId: 'philosophie',
  levelId: 'premiere',
  theme: 'Notions du programme',
  name: 'Découverte des notions philosophiques',
  source: 'philo.concepts',
  difficulty: 'facile',
});

/* ------------------------------------------------------------------ */
/*  SVT / SES / NSI — par thème du corpus                              */
/* ------------------------------------------------------------------ */

const themeTopics = <T extends { theme: string; level: string[] }>(
  subjectId: 'svt' | 'ses' | 'nsi',
  corpus: T[],
  source: string,
  themeLabel: string,
): TopicDefinition[] => {
  const themes = Array.from(new Set(corpus.map((entry) => entry.theme)));
  const out: TopicDefinition[] = [];
  for (const theme of themes) {
    const entries = corpus.filter((e) => e.theme === theme);
    if (entries.length < 4) continue;
    const levels = Array.from(new Set(entries.flatMap((e) => e.level))) as string[];
    for (const level of levels) {
      if (!['seconde', 'premiere', 'terminale', 'troisieme'].includes(level)) continue;
      out.push({
        subjectId,
        levelId: level as 'seconde' | 'premiere' | 'terminale' | 'troisieme',
        theme: themeLabel,
        name: theme,
        source,
        difficulty: level === 'terminale' ? 'difficile' : 'moyen',
        params: { theme },
      });
    }
  }
  return out;
};

const bioTopics = themeTopics('svt', BIOLOGY, 'svt.termes', 'Notions scientifiques');
const sesTopics = themeTopics('ses', SES, 'ses.concepts', 'Notions de SES');
const nsiTopics = themeTopics('nsi', NSI, 'nsi.termes', 'Notions d’informatique');

/* ------------------------------------------------------------------ */
/*  Croisement philosophie : doctrines                                 */
/* ------------------------------------------------------------------ */

const doctrineTopics: TopicDefinition[] = [];
const DOCTRINES = Array.from(new Set(PHILOSOPHY.map((p) => p.doctrine).filter(Boolean))) as string[];
for (const doctrine of DOCTRINES) {
  doctrineTopics.push({
    subjectId: 'philosophie',
    levelId: 'terminale',
    theme: 'Courants',
    name: `${doctrine.charAt(0).toUpperCase()}${doctrine.slice(1)}`,
    source: 'philo.doctrines',
    difficulty: 'difficile',
  });
}

export const EXPANDED_KNOWLEDGE: TopicDefinition[] = [
  ...historyTopics,
  ...geoTopics,
  ...philoTopics,
  ...bioTopics,
  ...sesTopics,
  ...nsiTopics,
  ...doctrineTopics,
];

export const KNOWLEDGE_EXPANDED_COUNT = EXPANDED_KNOWLEDGE.length;
export const PHILO_NOTION_COUNT = PHILO_NOTIONS.length;

