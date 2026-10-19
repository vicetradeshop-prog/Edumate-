/**
 * EduMate — Familles de générateurs : connaissances (histoire-géographie,
 * philosophie, SVT, SES, NSI).
 *
 * Ces familles transforment un corpus de faits vérifiés en plusieurs types
 * de questions (définition → terme, terme → définition, QCM de culture).
 * Les distracteurs sont tirés du même corpus : ils sont donc plausibles
 * et toujours exacts dans leur formulation.
 */
import type { Question } from '../../../shared/types.js';
import type { GeneratorContext, QuestionFamily } from '../types.js';
import { qcm, trueFalse } from '../lib.js';
import { BIOLOGY, GEOGRAPHY, HISTORY, METHODOLOGY, NSI, PHILOSOPHY, SES } from '../data/knowledge.js';


/* ------------------------------------------------------------------ */
/*  Filtres par paramètres                                             */
/* ------------------------------------------------------------------ */

const matchPeriod = (period: string, params: Record<string, unknown>): boolean =>
  params.period === undefined || params.period === period;

const matchCategory = (category: string, params: Record<string, unknown>): boolean =>
  params.category === undefined || params.category === category;

const matchTheme = (theme: string, params: Record<string, unknown>): boolean =>
  params.theme === undefined || params.theme === theme;

const countHistory = (params: Record<string, unknown>): number =>
  HISTORY.filter((h) => matchPeriod(h.period, params)).length;

/** Périodes historiques réellement présentes dans le corpus. */
export const HISTORY_PERIODS: string[] = Array.from(new Set(HISTORY.map((h) => h.period)));
/** Thèmes géographiques présents dans le corpus. */
export const GEO_CATEGORIES: string[] = Array.from(new Set(GEOGRAPHY.map((g) => g.category)));

/* ------------------------------------------------------------------ */
/*  Histoire                                                           */
/* ------------------------------------------------------------------ */

const historyDates: QuestionFamily = {
  id: 'hg.histoire.dates',
  label: 'Dates historiques',
  pool: (params) => countHistory(params),
  make(ctx) {
    const { rng, topicId } = ctx;
    const period = ctx.params.period as string | undefined;
    const pool = period ? HISTORY.filter((h) => h.period === period) : HISTORY;
    if (period && pool.length === 0) return null;
    const item = rng.pick(pool.length ? pool : HISTORY);
    const others = rng.pickMany(HISTORY.filter((h) => h.date !== item.date), 6);
    return qcm({
      topicId,
      prompt: `À quelle date se situe **${item.event}** ?`,
      correct: item.date,
      distractors: others.map((o) => o.date).filter((d) => d !== item.date).slice(0, 3),
      explanation: `${item.date} : ${item.event}${item.actor ? ` (${item.actor})` : ''}${item.place ? ` à ${item.place}` : ''}. ${item.consequence ?? ''}`,
      difficulty: 'moyen',
      skill: `Chronologie — ${item.period}`,
      rng,
    });
  },
};

const historyEvents: QuestionFamily = {
  id: 'hg.histoire.evenements',
  label: 'Événements historiques',
  pool: (params) => countHistory(params),
  make(ctx) {
    const { rng, topicId } = ctx;
    const period = ctx.params.period as string | undefined;
    const pool = period ? HISTORY.filter((h) => h.period === period) : HISTORY;
    if (period && pool.length === 0) return null;
    const item = rng.pick(pool);
    const others = rng.pickMany(HISTORY.filter((h) => h.event !== item.event), 6);
    return qcm({
      topicId,
      prompt: `Quel événement correspond à cette description : « ${item.consequence ?? item.event} » (${item.date}) ?`,
      correct: item.event,
      distractors: others.map((o) => o.event).filter((e) => e !== item.event).slice(0, 3),
      explanation: `${item.date} : ${item.event}. ${item.consequence ?? ''} ${item.actor ? `Acteurs : ${item.actor}.` : ''}`,
      difficulty: 'moyen',
      skill: `Repères — ${item.period}`,
      rng,
    });
  },
};

const historyActors: QuestionFamily = {
  id: 'hg.histoire.acteurs',
  label: 'Acteurs historiques',
  pool: (params) => HISTORY.filter((h) => h.actor && matchPeriod(h.period, params)).length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const period = ctx.params.period as string | undefined;
    const withActor = HISTORY.filter((h) => h.actor && (!period || h.period === period));
    if (withActor.length === 0) return null;
    const item = rng.pick(withActor);
    const others = rng.pickMany(withActor.filter((h) => h.actor !== item.actor), 8);
    return qcm({
      topicId,
      prompt: `Qui est associé à **${item.event}** (${item.date}) ?`,
      correct: item.actor as string,
      distractors: Array.from(new Set(others.map((o) => o.actor as string))).filter((a) => a !== item.actor).slice(0, 3),
      explanation: `${item.date} — ${item.event} : ${item.actor}. ${item.consequence ?? ''}`,
      difficulty: 'moyen',
      skill: `Acteurs — ${item.period}`,
      rng,
    });
  },
};

const historyChronology: QuestionFamily = {
  id: 'hg.histoire.chronologie',
  label: 'Chronologie',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const numeric = (d: string): number => {
      const m = d.match(/(-?\d+)/);
      return m ? Number(m[1]) : 0;
    };
    const period = ctx.params.period as string | undefined;
    const pool = period ? HISTORY.filter((h) => h.period === period) : HISTORY;
    if (pool.length < 3) return null;
    const three = rng.pickMany(pool, 3);
    const sorted = [...three].sort((a, b) => numeric(a.date) - numeric(b.date));
    const correct = sorted.map((h) => `${h.date} — ${h.event}`).join(' ; ');
    const wrongOrder = [...sorted].reverse().map((h) => `${h.date} — ${h.event}`).join(' ; ');
    const shuffled = rng.shuffle(sorted).map((h) => `${h.date} — ${h.event}`).join(' ; ');
    const distractors = [wrongOrder, shuffled, `${sorted[1].date} — ${sorted[1].event} ; ${sorted[0].date} — ${sorted[0].event} ; ${sorted[2].date} — ${sorted[2].event}`];
    return qcm({
      topicId,
      prompt: 'Rangez ces événements dans l’ordre chronologique :',
      correct,
      distractors: distractors.filter((d) => d !== correct),
      explanation: `Ordre chronologique : ${sorted.map((h) => `${h.date} (${h.event})`).join(' → ')}.`,
      difficulty: 'difficile',
      skill: 'Ordre chronologique',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Géographie                                                         */
/* ------------------------------------------------------------------ */

const geoFacts: QuestionFamily = {
  id: 'hg.geo.repères',
  label: 'Repères géographiques',
  pool: (params) => GEOGRAPHY.filter((g) => matchCategory(g.category, params)).length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const category = ctx.params.category as string | undefined;
    const list = category ? GEOGRAPHY.filter((g) => g.category === category) : GEOGRAPHY;
    if (list.length === 0) return null;
    const item = rng.pick(list);
    if (item.category === 'capitale') {
      const capital = item.info.replace(/^capitale[s]?\s*:\s*/i, '');
      const others = rng.pickMany(GEOGRAPHY.filter((g) => g.category === 'capitale' && g.place !== item.place), 6);
      return qcm({
        topicId,
        prompt: `Quelle est la capitale de **${item.place}** ?`,
        correct: capital,
        distractors: others.map((o) => o.info.replace(/^capitale[s]?\s*:\s*/i, '')).filter((c) => c !== capital).slice(0, 3),
        explanation: `${item.place} : ${item.info}.`,
        difficulty: 'facile',
        skill: 'Capitales',
        rng,
      });
    }
    const others = rng.pickMany(GEOGRAPHY.filter((g) => g.info !== item.info), 6);
    return qcm({
      topicId,
      prompt: `Quel repère géographique correspond à cette information : « ${item.info} » ?`,
      correct: item.place,
      distractors: others.map((o) => o.place).filter((p) => p !== item.place).slice(0, 3),
      explanation: `${item.place} — ${item.info}.`,
      difficulty: 'moyen',
      skill: `Repères — ${item.category}`,
      rng,
    });
  },
};

const geoCapitals: QuestionFamily = {
  id: 'hg.geo.capitales',
  label: 'Capitales du monde',
  pool: () => GEOGRAPHY.filter((g) => g.category === 'capitale').length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const capitals = GEOGRAPHY.filter((g) => g.category === 'capitale');
    const item = rng.pick(capitals);
    const capital = item.info.replace(/^capitale[s]?\s*:\s*/i, '');
    const others = rng.pickMany(capitals.filter((g) => g.place !== item.place), 6);
    return qcm({
      topicId,
      prompt: `Quelle ville est la capitale de **${item.place}** ?`,
      correct: capital,
      distractors: others.map((o) => o.info.replace(/^capitale[s]?\s*:\s*/i, '')).filter((c) => c !== capital).slice(0, 3),
      explanation: `${item.place} → ${capital}.`,
      difficulty: 'facile',
      skill: 'Capitales',
      rng,
    });
  },
};

const geoTrueFalse: QuestionFamily = {
  id: 'hg.geo.vraifaux',
  label: 'Vrai ou faux (géographie)',
  pool: () => GEOGRAPHY.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const category = ctx.params.category as string | undefined;
    const pool = category ? GEOGRAPHY.filter((g) => g.category === category) : GEOGRAPHY;
    if (category && pool.length < 2) return null;
    const list = pool.length ? pool : GEOGRAPHY;
    const item = rng.pick(list);
    const isTrue = rng.chance(0.5);
    if (isTrue) {
      return trueFalse(topicId, `${item.place} : ${item.info}.`, true, `Vrai. ${item.place} — ${item.info}.`, 'facile', 'Culture géographique');
    }
    const other = rng.pick(list.filter((g) => g.info !== item.info && g.category === item.category));
    if (!other) return null;
    return trueFalse(
      topicId,
      `${item.place} : ${other.info}.`,
      false,
      `Faux. ${other.place} correspond à « ${other.info} ». Pour ${item.place}, la bonne information est : ${item.info}.`,
      'moyen',
      'Culture géographique',
    );
  },
};

/* ------------------------------------------------------------------ */
/*  Philosophie                                                        */
/* ------------------------------------------------------------------ */

const philoConcepts: QuestionFamily = {
  id: 'philo.concepts',
  label: 'Notions philosophiques',
  pool: () => PHILOSOPHY.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(PHILOSOPHY);
    const others = rng.pickMany(PHILOSOPHY.filter((p) => p.concept !== item.concept), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quelle notion philosophique correspond à cette idée : « ${item.definition} » ?`,
        correct: item.concept,
        distractors: others.map((o) => o.concept).filter((c) => c !== item.concept).slice(0, 3),
        explanation: `${item.concept} — ${item.definition}.${item.author ? ` (${item.author}${item.work ? `, ${item.work}` : ''})` : ''}`,
        difficulty: 'moyen',
        skill: 'Notions philosophiques',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Comment définir **${item.concept}** ?`,
      correct: item.definition,
      distractors: others.map((o) => o.definition).filter((d) => d !== item.definition).slice(0, 3),
      explanation: `${item.concept} : ${item.definition}.`,
      difficulty: 'moyen',
      skill: 'Définitions philosophiques',
      rng,
    });
  },
};

const philoAuthors: QuestionFamily = {
  id: 'philo.auteurs',
  label: 'Auteurs et doctrines',
  pool: () => PHILOSOPHY.filter((p) => p.author).length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const withAuthor = PHILOSOPHY.filter((p) => p.author);
    const item = rng.pick(withAuthor);
    const others = rng.pickMany(withAuthor.filter((p) => p.author !== item.author), 8);
    if (item.work && rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Qui est l’auteur de **${item.work}** ?`,
        correct: item.author as string,
        distractors: Array.from(new Set(others.map((o) => o.author as string))).filter((a) => a !== item.author).slice(0, 3),
        explanation: `${item.work} est de ${item.author}. On y trouve notamment ${item.concept} : ${item.definition}.`,
        difficulty: 'moyen',
        skill: 'Œuvres philosophiques',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quel philosophe défend la thèse suivante : « ${item.definition} » ?`,
      correct: item.author as string,
      distractors: Array.from(new Set(others.map((o) => o.author as string))).filter((a) => a !== item.author).slice(0, 3),
      explanation: `${item.author} (${item.doctrine ?? 'philosophe'}) : ${item.concept} — ${item.definition}.`,
      difficulty: 'difficile',
      skill: 'Doctrines philosophiques',
      rng,
    });
  },
};

const philoDoctrines: QuestionFamily = {
  id: 'philo.doctrines',
  label: 'Doctrines philosophiques',
  pool: () => PHILOSOPHY.filter((p) => p.doctrine).length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const withDoctrine = PHILOSOPHY.filter((p) => p.doctrine && p.author);
    const item = rng.pick(withDoctrine);
    const others = rng.pickMany(withDoctrine.filter((p) => p.doctrine !== item.doctrine), 6);
    return qcm({
      topicId,
      prompt: `À quel courant philosophique rattache-t-on **${item.author}** ?`,
      correct: item.doctrine as string,
      distractors: Array.from(new Set(others.map((o) => o.doctrine as string))).filter((d) => d !== item.doctrine).slice(0, 3),
      explanation: `${item.author} est associé au ${item.doctrine}. Exemple : ${item.concept} — ${item.definition}.`,
      difficulty: 'difficile',
      skill: 'Courants philosophiques',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  SVT                                                                */
/* ------------------------------------------------------------------ */

const bioTerms: QuestionFamily = {
  id: 'svt.termes',
  label: 'Vocabulaire scientifique',
  pool: (params) => BIOLOGY.filter((b) => matchTheme(b.theme, params)).length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const theme = ctx.params.theme as string | undefined;
    const list = theme ? BIOLOGY.filter((b) => b.theme === theme) : BIOLOGY;
    if (list.length === 0) return null;
    const item = rng.pick(list);
    const others = rng.pickMany(BIOLOGY.filter((b) => b.term !== item.term), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quel terme correspond à cette définition : « ${item.definition} » ?`,
        correct: item.term,
        distractors: others.map((o) => o.term).filter((t) => t !== item.term).slice(0, 3),
        explanation: `${item.term} : ${item.definition}.`,
        difficulty: 'facile',
        skill: `SVT — ${item.theme}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quelle est la définition de **${item.term}** ?`,
      correct: item.definition,
      distractors: others.map((o) => o.definition).filter((d) => d !== item.definition).slice(0, 3),
      explanation: `${item.term} : ${item.definition}.`,
      difficulty: 'moyen',
      skill: `SVT — ${item.theme}`,
      rng,
    });
  },
};

const bioProcesses: QuestionFamily = {
  id: 'svt.processus',
  label: 'Mécanismes du vivant',
  pool: () => BIOLOGY.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(BIOLOGY);
    const other = rng.pick(BIOLOGY.filter((b) => b.term !== item.term));
    const keepTrue = rng.chance(0.5);
    const statement = keepTrue ? item.definition : other.definition;
    return trueFalse(
      topicId,
      `**${item.term}** : ${statement}.`,
      keepTrue,
      keepTrue
        ? `Vrai. ${item.term} : ${item.definition}.`
        : `Faux. Cette définition correspond à « ${other.term} ». ${item.term} : ${item.definition}.`,
      'moyen',
      `SVT — ${item.theme}`,
    );
  },
};

/* ------------------------------------------------------------------ */
/*  SES                                                                */
/* ------------------------------------------------------------------ */

const sesConcepts: QuestionFamily = {
  id: 'ses.concepts',
  label: 'Notions de SES',
  pool: (params) => SES.filter((s) => matchTheme(s.theme, params)).length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const theme = ctx.params.theme as string | undefined;
    const list = theme ? SES.filter((s) => s.theme === theme) : SES;
    if (list.length === 0) return null;
    const item = rng.pick(list);
    const others = rng.pickMany(SES.filter((s) => s.concept !== item.concept), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quelle notion de SES correspond à : « ${item.definition} » ?`,
        correct: item.concept,
        distractors: others.map((o) => o.concept).filter((c) => c !== item.concept).slice(0, 3),
        explanation: `${item.concept} : ${item.definition}.${item.author ? ` (${item.author})` : ''}`,
        difficulty: 'moyen',
        skill: `SES — ${item.theme}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Comment définit-on **${item.concept}** ?`,
      correct: item.definition,
      distractors: others.map((o) => o.definition).filter((d) => d !== item.definition).slice(0, 3),
      explanation: `${item.concept} : ${item.definition}.`,
      difficulty: 'moyen',
      skill: `SES — ${item.theme}`,
      rng,
    });
  },
};

const sesAuthors: QuestionFamily = {
  id: 'ses.auteurs',
  label: 'Auteurs en SES',
  pool: () => SES.filter((s) => s.author).length,
  make(ctx) {
    const { rng, topicId } = ctx;
    const withAuthor = SES.filter((s) => s.author);
    const item = rng.pick(withAuthor);
    const others = rng.pickMany(withAuthor.filter((s) => s.author !== item.author), 6);
    return qcm({
      topicId,
      prompt: `Quel auteur est associé à la notion de **${item.concept}** (${item.definition.slice(0, 60)}…) ?`,
      correct: item.author as string,
      distractors: Array.from(new Set(others.map((o) => o.author as string))).filter((a) => a !== item.author).slice(0, 3),
      explanation: `${item.author} : ${item.concept} — ${item.definition}.`,
      difficulty: 'difficile',
      skill: 'Pensée économique et sociale',
      rng,
    });
  },
};

const sesCalc: QuestionFamily = {
  id: 'ses.calculs',
  label: 'Calculs en SES',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['taux', 'evolution', 'coef', 'part'] as const);
    const digits = 1;
    const fmt = (v: number, unit: string): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
    const distract = (v: number, unit: string): string[] => [
      fmt(v + rng.float(0.5, 4, 1), unit),
      fmt(Math.max(0.1, v - rng.float(0.5, 4, 1)), unit),
      fmt(v * 2, unit),
    ];
    if (kind === 'taux') {
      const total = rng.int(20, 200) * 10;
      const part = rng.int(5, total - 5);
      const rate = (part / total) * 100;
      return qcm({
        topicId,
        prompt: `Dans une population de ${total} personnes, ${part} sont actives. Quel est le taux d’activité (en %) ?`,
        correct: fmt(rate, '%'),
        distractors: distract(rate, '%'),
        explanation: `Taux = (partie / total) × 100 = (${part} / ${total}) × 100 = ${fmt(rate, '%')}.`,
        difficulty: 'facile',
        skill: 'Taux et pourcentages',
        rng,
      });
    }
    if (kind === 'evolution') {
      const v0 = rng.int(10, 500) * 10;
      const rate = rng.int(-25, 45);
      const v1 = v0 * (1 + rate / 100);
      return qcm({
        topicId,
        prompt: `Le PIB passe de ${v0} à ${Math.round(v1)} milliards d’euros. Quel est le taux de variation (en %) ?`,
        correct: fmt(rate, '%'),
        distractors: distract(rate, '%'),
        explanation: `Taux de variation = ((valeur finale − valeur initiale) / valeur initiale) × 100 = ${fmt(rate, '%')}.`,
        difficulty: 'moyen',
        skill: 'Taux de variation',
        rng,
      });
    }
    if (kind === 'coef') {
      const v0 = rng.int(10, 300);
      const factor = rng.pick([2, 2.5, 3, 4]);
      const v1 = v0 * factor;
      return qcm({
        topicId,
        prompt: `Une grandeur passe de ${v0} à ${v1}. Quel est le coefficient multiplicateur ?`,
        correct: fmt(factor, ''),
        distractors: distract(factor, ''),
        explanation: `Coefficient = valeur finale / valeur initiale = ${v1} / ${v0} = ${fmt(factor, '')}.`,
        difficulty: 'facile',
        skill: 'Coefficient multiplicateur',
        rng,
      });
    }
    const total = rng.int(100, 1000);
    const part = rng.int(10, total - 10);
    const share = (part / total) * 100;
    return qcm({
      topicId,
      prompt: `Sur un revenu disponible de ${total} €, un ménage en consomme ${part} €. Quelle est sa part consommée (en %) ?`,
      correct: fmt(share, '%'),
      distractors: distract(share, '%'),
      explanation: `Part = (${part} / ${total}) × 100 = ${fmt(share, '%')}. Le reste (${fmt(100 - share, '%')}) est épargné.`,
      difficulty: 'facile',
      skill: 'Parts et proportions',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  NSI                                                                */
/* ------------------------------------------------------------------ */

const nsiTerms: QuestionFamily = {
  id: 'nsi.termes',
  label: 'Vocabulaire informatique',
  pool: (params) => NSI.filter((n) => matchTheme(n.theme, params)).length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const theme = ctx.params.theme as string | undefined;
    const list = theme ? NSI.filter((n) => n.theme === theme) : NSI;
    if (list.length === 0) return null;
    const item = rng.pick(list);
    const others = rng.pickMany(NSI.filter((n) => n.term !== item.term), 6);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `Quel terme d’informatique correspond à : « ${item.definition} » ?`,
        correct: item.term,
        distractors: others.map((o) => o.term).filter((t) => t !== item.term).slice(0, 3),
        explanation: `${item.term} : ${item.definition}.`,
        difficulty: 'facile',
        skill: `NSI — ${item.theme}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quelle est la définition de **${item.term}** ?`,
      correct: item.definition,
      distractors: others.map((o) => o.definition).filter((d) => d !== item.definition).slice(0, 3),
      explanation: `${item.term} : ${item.definition}.`,
      difficulty: 'moyen',
      skill: `NSI — ${item.theme}`,
      rng,
    });
  },
};

const nsiComplexity: QuestionFamily = {
  id: 'nsi.complexite',
  label: 'Complexité algorithmique',
  pool: 40,
  make(ctx) {
    const { rng, topicId } = ctx;
    const items = [
      { algo: 'la recherche dichotomique dans un tableau trié de taille n', correct: 'O(log n)', distractors: ['O(n)', 'O(n log n)', 'O(n²)'], explanation: 'À chaque étape, l’espace de recherche est divisé par deux : la complexité est logarithmique.' },
      { algo: 'le tri par sélection sur un tableau de taille n', correct: 'O(n²)', distractors: ['O(n)', 'O(n log n)', 'O(log n)'], explanation: 'Deux boucles imbriquées parcourant n éléments → n × n opérations.' },
      { algo: 'le tri fusion sur un tableau de taille n', correct: 'O(n log n)', distractors: ['O(n²)', 'O(n)', 'O(log n)'], explanation: 'On divise en log n niveaux, chaque niveau coûtant O(n) : O(n log n).' },
      { algo: 'le parcours séquentiel d’une liste de taille n', correct: 'O(n)', distractors: ['O(log n)', 'O(n²)', 'O(1)'], explanation: 'On visite chaque élément une fois : complexité linéaire.' },
      { algo: 'l’accès à la valeur d’une clé dans un dictionnaire (table de hachage)', correct: 'O(1)', distractors: ['O(n)', 'O(log n)', 'O(n²)'], explanation: 'Le hachage donne directement l’emplacement : coût constant en moyenne.' },
      { algo: 'la comparaison de deux tableaux de taille n élément par élément', correct: 'O(n)', distractors: ['O(n²)', 'O(1)', 'O(log n)'], explanation: 'Une seule boucle sur n éléments → O(n).' },
      { algo: 'le calcul de la factorielle de n par une boucle simple', correct: 'O(n)', distractors: ['O(n²)', 'O(log n)', 'O(1)'], explanation: 'n multiplications successives : complexité linéaire.' },
      { algo: 'la recherche naïve d’un mot dans toutes les paires d’un tableau de taille n', correct: 'O(n²)', distractors: ['O(n)', 'O(log n)', 'O(n log n)'], explanation: 'Deux boucles imbriquées sur n éléments.' },
      { algo: 'l’insertion en tête d’une pile', correct: 'O(1)', distractors: ['O(n)', 'O(log n)', 'O(n²)'], explanation: 'Une pile (LIFO) insère et retire en tête : coût constant.' },
      { algo: 'la recherche dans un arbre binaire de recherche équilibré', correct: 'O(log n)', distractors: ['O(n)', 'O(n²)', 'O(1)'], explanation: 'La hauteur d’un ABR équilibré est logarithmique.' },
    ];
    const item = rng.pick(items);
    return qcm({
      topicId,
      prompt: `Quelle est la complexité temporelle de ${item.algo} ?`,
      correct: item.correct,
      distractors: item.distractors,
      explanation: item.explanation,
      difficulty: 'moyen',
      skill: 'Complexité algorithmique',
      rng,
    });
  },
};

const nsiLogic: QuestionFamily = {
  id: 'nsi.logique',
  label: 'Logique booléenne',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.chance(0.5);
    const b = rng.chance(0.5);
    const op = rng.pick(['ET', 'OU', 'XOR', 'NON-ET'] as const);
    const label = (v: boolean): string => (v ? '1 (vrai)' : '0 (faux)');
    let result: boolean;
    switch (op) {
      case 'ET':
        result = a && b;
        break;
      case 'OU':
        result = a || b;
        break;
      case 'XOR':
        result = a !== b;
        break;
      default:
        result = !(a && b);
    }
    return qcm({
      topicId,
      prompt: `En logique booléenne, que vaut **${label(a)} ${op} ${label(b)}** ?`,
      correct: label(result),
      distractors: [label(!result)],
      explanation: `Table de vérité de l’opérateur ${op} : ${op === 'ET' ? 'vrai seulement si les deux entrées sont vraies' : op === 'OU' ? 'vrai si au moins une entrée est vraie' : op === 'XOR' ? 'vrai si exactement une entrée est vraie' : 'négation du ET (loi de De Morgan)'}. Donc ${label(a)} ${op} ${label(b)} = ${label(result)}.`,
      difficulty: 'facile',
      skill: 'Opérateurs booléens',
      rng,
    });
  },
};

const nsiTruthTable: QuestionFamily = {
  id: 'nsi.tableverite',
  label: 'Tables de vérité',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const expressions = [
      { expr: 'NON (A ET B)', fn: (a: boolean, b: boolean) => !(a && b), rule: 'loi de De Morgan : NON(A ET B) = NON A OU NON B' },
      { expr: 'A OU (NON B)', fn: (a: boolean, b: boolean) => a || !b, rule: 'le OU est vrai si au moins une entrée est vraie' },
      { expr: '(A ET B) OU (NON A)', fn: (a: boolean, b: boolean) => (a && b) || !a, rule: 'on évalue d’abord les parenthèses' },
      { expr: 'A XOR B', fn: (a: boolean, b: boolean) => a !== b, rule: 'XOR est vrai si exactement une des deux entrées est vraie' },
      { expr: 'NON A ET B', fn: (a: boolean, b: boolean) => !a && b, rule: 'priorité au NON, puis au ET' },
    ];
    const item = rng.pick(expressions);
    const a = rng.chance(0.5);
    const b = rng.chance(0.5);
    const result = item.fn(a, b);
    return qcm({
      topicId,
      prompt: `Complétez la table de vérité : pour A = ${a ? 1 : 0} et B = ${b ? 1 : 0}, que vaut **${item.expr}** ?`,
      correct: result ? '1' : '0',
      distractors: [result ? '0' : '1', 'indéterminé'],
      explanation: `${item.expr} avec A = ${a ? 1 : 0}, B = ${b ? 1 : 0} donne ${result ? 1 : 0} (${item.rule}).`,
      difficulty: 'moyen',
      skill: 'Tables de vérité',
      rng,
    });
  },
};

const nsiBases: QuestionFamily = {
  id: 'nsi.bases',
  label: 'Représentation des nombres',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['bin2dec', 'dec2bin', 'hex2dec', 'dec2hex', 'bits'] as const);
    if (kind === 'bits') {
      const n = rng.pick([4, 8, 16, 32]);
      const max = 2 ** n - 1;
      return qcm({
        topicId,
        prompt: `Quel est le plus grand entier positif représentable sur **${n} bits** (non signé) ?`,
        correct: String(max),
        distractors: [String(2 ** n), String(max - 1), String(n * 2)],
        explanation: `Sur ${n} bits, on représente $2^{${n}} = ${2 ** n}$ valeurs, de 0 à ${max}.`,
        difficulty: 'facile',
        skill: 'Codage binaire',
        rng,
      });
    }
    const value = rng.int(1, 255);
    if (kind === 'bin2dec') {
      return qcm({
        topicId,
        prompt: `Quelle est la valeur décimale du nombre binaire **${value.toString(2)}** ?`,
        correct: String(value),
        distractors: [String(value + 1), String(Math.max(0, value - 1)), value.toString(2).split('').reverse().join('')].filter((d) => d !== String(value)).slice(0, 3),
        explanation: `${value.toString(2)}₂ = ${value.toString(2)
          .split('')
          .map((bit, i, arr) => (bit === '1' ? `2^${arr.length - 1 - i}` : null))
          .filter(Boolean)
          .join(' + ')} = ${value}.`,
        difficulty: 'facile',
        skill: 'Binaire → décimal',
        rng,
      });
    }
    if (kind === 'dec2bin') {
      return qcm({
        topicId,
        prompt: `Quelle est l’écriture binaire de **${value}** ?`,
        correct: value.toString(2),
        distractors: [value.toString(8), value.toString(16), (value + 1).toString(2)].filter((d) => d !== value.toString(2)).slice(0, 3),
        explanation: `${value} en base 10 s’écrit ${value.toString(2)} en base 2 (divisions successives par 2).`,
        difficulty: 'moyen',
        skill: 'Décimal → binaire',
        rng,
      });
    }
    if (kind === 'hex2dec') {
      const hex = value.toString(16).toUpperCase();
      return qcm({
        topicId,
        prompt: `Quelle est la valeur décimale du nombre hexadécimal **${hex}** ?`,
        correct: String(value),
        distractors: [String(value + 16), String(value * 2), String(Math.max(0, value - 16))],
        explanation: `${hex}₁₆ = ${value} en décimal (chaque chiffre hexadécimal vaut 4 bits).`,
        difficulty: 'moyen',
        skill: 'Hexadécimal → décimal',
        rng,
      });
    }
    const hex = value.toString(16).toUpperCase();
    return qcm({
      topicId,
      prompt: `Quelle est l’écriture hexadécimale de **${value}** ?`,
      correct: hex,
      distractors: [value.toString(2), value.toString(8), (value + 1).toString(16).toUpperCase()].filter((d) => d !== hex).slice(0, 3),
      explanation: `${value}₁₀ = ${hex}₁₆. En hexadécimal, on groupe les bits par 4.`,
      difficulty: 'moyen',
      skill: 'Décimal → hexadécimal',
      rng,
    });
  },
};

const nsiColors: QuestionFamily = {
  id: 'nsi.couleurs',
  label: 'Codage des images',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['rgb', 'taille', 'nuances'] as const);
    if (kind === 'rgb') {
      const colors = [
        { name: 'rouge', code: '(255, 0, 0)' },
        { name: 'vert', code: '(0, 255, 0)' },
        { name: 'bleu', code: '(0, 0, 255)' },
        { name: 'blanc', code: '(255, 255, 255)' },
        { name: 'noir', code: '(0, 0, 0)' },
        { name: 'jaune', code: '(255, 255, 0)' },
        { name: 'cyan', code: '(0, 255, 255)' },
        { name: 'magenta', code: '(255, 0, 255)' },
        { name: 'gris', code: '(128, 128, 128)' },
      ];
      const item = rng.pick(colors);
      return qcm({
        topicId,
        prompt: `En synthèse additive RVB, quelle triple correspond à la couleur **${item.name}** ?`,
        correct: item.code,
        distractors: rng.pickMany(colors.filter((c) => c.code !== item.code), 3).map((c) => c.code),
        explanation: `RVB : chaque canal varie de 0 à 255. ${item.name} = ${item.code}. (0,0,0) = noir, (255,255,255) = blanc.`,
        difficulty: 'facile',
        skill: 'Codage RVB',
        rng,
      });
    }
    if (kind === 'nuances') {
      const bits = rng.pick([1, 4, 8]);
      const n = 2 ** bits;
      return qcm({
        topicId,
        prompt: `Combien de niveaux de gris peut-on représenter avec **${bits} bit${bits > 1 ? 's' : ''}** par pixel ?`,
        correct: String(n),
        distractors: [String(bits * 2), String(n * 2), String(bits)],
        explanation: `Avec ${bits} bit(s), on dispose de 2^${bits} = ${n} valeurs distinctes, donc ${n} niveaux.`,
        difficulty: 'facile',
        skill: 'Quantification',
        rng,
      });
    }
    const w = rng.pick([640, 800, 1024, 1920]);
    const h = rng.pick([480, 600, 768, 1080]);
    const bytes = (w * h * 3) / 1024;
    return qcm({
      topicId,
      prompt: `Quelle est la taille approximative d’une image **${w} × ${h}** codée en RVB 24 bits (sans compression) ?`,
      correct: `${Math.round(bytes)} Kio`,
      distractors: [`${Math.round(bytes / 3)} Kio`, `${Math.round(bytes * 3)} Kio`, `${Math.round((w * h) / 1024)} Kio`],
      explanation: `Nombre de pixels = ${w} × ${h} = ${(w * h).toLocaleString('fr-FR')} ; chaque pixel occupe 3 octets → ${(w * h * 3).toLocaleString('fr-FR')} octets ≈ ${Math.round(bytes)} Kio.`,
      difficulty: 'moyen',
      skill: 'Taille d’une image',
      rng,
    });
  },
};

const nsiSql: QuestionFamily = {
  id: 'nsi.sql',
  label: 'Bases de données et SQL',
  pool: 30,
  make(ctx) {
    const { rng, topicId } = ctx;
    const items = [
      { q: 'Quelle requête SQL sélectionne tous les élèves de la table `eleves` habitant à Lyon ?', correct: 'SELECT * FROM eleves WHERE ville = "Lyon";', wrong: ['SELECT eleves WHERE ville = "Lyon";', 'GET * FROM eleves WHERE ville = Lyon;', 'SELECT * WHERE eleves.ville = "Lyon";'], e: 'SELECT colonnes FROM table WHERE condition : la syntaxe standard exige FROM et des guillemets pour la chaîne.' },
      { q: 'Quelle clause SQL sert à trier les résultats ?', correct: 'ORDER BY', wrong: ['GROUP BY', 'SORT BY', 'FILTER BY'], e: 'ORDER BY colonne [ASC|DESC] trie les lignes ; GROUP BY sert à agréger.' },
      { q: 'Quelle fonction SQL compte le nombre de lignes ?', correct: 'COUNT(*)', wrong: ['SUM(*)', 'TOTAL()', 'NB()'], e: 'COUNT(*) compte toutes les lignes ; COUNT(colonne) ignore les valeurs NULL.' },
      { q: 'Quel mot-clé élimine les doublons dans un SELECT ?', correct: 'DISTINCT', wrong: ['UNIQUE', 'ONLY', 'SINGLE'], e: 'SELECT DISTINCT colonne FROM table renvoie les valeurs sans répétition.' },
      { q: 'Quelle clause regroupe les lignes avant une agrégation ?', correct: 'GROUP BY', wrong: ['ORDER BY', 'HAVING', 'WHERE'], e: 'GROUP BY crée des groupes ; HAVING filtre ensuite ces groupes.' },
      { q: 'Quelle clause filtre les groupes après un GROUP BY ?', correct: 'HAVING', wrong: ['WHERE', 'FILTER', 'GROUP FILTER'], e: 'WHERE filtre les lignes avant agrégation, HAVING filtre les groupes après.' },
      { q: 'Quel type SQL stocke un texte de longueur variable ?', correct: 'VARCHAR', wrong: ['INT', 'DATE', 'BOOLEAN'], e: 'VARCHAR(n) stocke jusqu’à n caractères ; TEXT pour les textes longs.' },
      { q: 'Qu’est-ce qu’une clé primaire ?', correct: 'Un attribut identifiant de façon unique chaque enregistrement', wrong: ['Un attribut obligatoire mais non unique', 'Une colonne calculée', 'Un index de performance uniquement'], e: 'La clé primaire est unique et non nulle ; elle identifie chaque ligne.' },
      { q: 'Qu’est-ce qu’une clé étrangère ?', correct: 'Un attribut qui référence la clé primaire d’une autre table', wrong: ['Une clé secrète de connexion', 'Un attribut calculé automatiquement', 'Un doublon autorisé'], e: 'Elle assure l’intégrité référentielle entre deux tables.' },
      { q: 'Quelle jointure conserve les lignes de la table de gauche même sans correspondance ?', correct: 'LEFT JOIN', wrong: ['INNER JOIN', 'RIGHT JOIN', 'CROSS JOIN'], e: 'LEFT JOIN garde toutes les lignes de gauche ; INNER JOIN ne garde que les correspondances.' },
      { q: 'Quelle commande supprime une table et son contenu ?', correct: 'DROP TABLE nom;', wrong: ['DELETE TABLE nom;', 'REMOVE TABLE nom;', 'ERASE TABLE nom;'], e: 'DROP TABLE supprime la structure ; DELETE FROM supprime des lignes ; TRUNCATE vide la table.' },
      { q: 'Quelle commande insère une ligne dans une table ?', correct: 'INSERT INTO table (colonnes) VALUES (valeurs);', wrong: ['ADD ROW table VALUES (…);', 'UPDATE table SET ROW (…);', 'PUT INTO table VALUES (…);'], e: 'INSERT INTO est la commande standard d’ajout de données.' },
    ];
    const item = rng.pick(items);
    return qcm({ topicId, prompt: item.q, correct: item.correct, distractors: item.wrong, explanation: item.e, difficulty: 'moyen', skill: 'SQL et bases de données', rng });
  },
};

const nsiPython: QuestionFamily = {
  id: 'nsi.python',
  label: 'Programmation Python',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['boucle', 'liste', 'fonction', 'comprehension', 'chaine'] as const);
    if (kind === 'boucle') {
      const a = rng.int(0, 5);
      const b = rng.int(a + 2, 12);
      const total = Array.from({ length: b - a }, (_, i) => a + i).reduce((s, v) => s + v, 0);
      return qcm({
        topicId,
        prompt: `Quelle valeur affiche ce programme Python ?\n\n\`\`\`python\ns = 0\nfor i in range(${a}, ${b}):\n    s = s + i\nprint(s)\n\`\`\``,
        correct: String(total),
        distractors: [String(total + b), String(total - a), String((b - a) * b)].filter((d) => d !== String(total)).slice(0, 3),
        explanation: `range(${a}, ${b}) génère ${a}, ${a + 1}, …, ${b - 1} (la borne supérieure est exclue). La somme vaut ${total}.`,
        difficulty: 'moyen',
        skill: 'Boucles en Python',
        rng,
      });
    }
    if (kind === 'liste') {
      const values = Array.from({ length: 5 }, () => rng.int(1, 20));
      const index = rng.int(0, 4);
      return qcm({
        topicId,
        prompt: `Que vaut l’expression suivante en Python ?\n\n\`\`\`python\nliste = [${values.join(', ')}]\nprint(liste[${index}])\n\`\`\``,
        correct: String(values[index]),
        distractors: [String(values[(index + 1) % 5]), String(values[(index + 2) % 5]), String(values[0])].filter((d) => d !== String(values[index])).slice(0, 3),
        explanation: `Les indices de liste commencent à 0 en Python : liste[${index}] = ${values[index]}.`,
        difficulty: 'facile',
        skill: 'Indexation des listes',
        rng,
      });
    }
    if (kind === 'fonction') {
      const a = rng.int(2, 9);
      const b = rng.int(1, 9);
      const result = a * a + b;
      return qcm({
        topicId,
        prompt: `Quel est le résultat ?\n\n\`\`\`python\ndef f(x, y):\n    return x * x + y\n\nprint(f(${a}, ${b}))\n\`\`\``,
        correct: String(result),
        distractors: [String(a * b + a), String(a + a + b), String(result + 1)].filter((d) => d !== String(result)).slice(0, 3),
        explanation: `f(${a}, ${b}) = ${a} × ${a} + ${b} = ${result}.`,
        difficulty: 'facile',
        skill: 'Fonctions et paramètres',
        rng,
      });
    }
    if (kind === 'comprehension') {
      const n = rng.int(3, 6);
      const list = Array.from({ length: n }, (_, i) => (i + 1) * 2);
      return qcm({
        topicId,
        prompt: `Que vaut cette liste en compréhension ?\n\n\`\`\`python\n[x * 2 for x in range(1, ${n + 1})]\n\`\`\``,
        correct: `[${list.join(', ')}]`,
        distractors: [`[${Array.from({ length: n }, (_, i) => i * 2).join(', ')}]`, `[${list.map((v) => v + 1).join(', ')}]`, `[${list.slice(0, -1).join(', ')}]`],
        explanation: `range(1, ${n + 1}) donne 1 à ${n}, chaque valeur est multipliée par 2 → [${list.join(', ')}].`,
        difficulty: 'moyen',
        skill: 'Listes en compréhension',
        rng,
      });
    }
    const word = rng.pick(['python', 'edumate', 'lycee', 'clavier', 'ordinateur']);
    const idx = rng.int(0, word.length - 1);
    return qcm({
      topicId,
      prompt: `Quel caractère affiche ce code ?\n\n\`\`\`python\nmot = "${word}"\nprint(mot[${idx}])\n\`\`\``,
      correct: word[idx],
      distractors: Array.from(new Set([word[(idx + 1) % word.length], word[(idx + 2) % word.length], word[word.length - 1 - idx]])).filter((c) => c !== word[idx]).slice(0, 3),
      explanation: `Les chaînes sont indicées à partir de 0 : "${word}"[${idx}] = "${word[idx]}".`,
      difficulty: 'facile',
      skill: 'Chaînes de caractères',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Méthodologie                                                       */
/* ------------------------------------------------------------------ */

const methodology: QuestionFamily = {
  id: 'methode.conseils',
  label: 'Méthodologie',
  pool: () => METHODOLOGY.length * 2,
  make(ctx) {
    const { rng, topicId } = ctx;
    const item = rng.pick(METHODOLOGY);
    const others = rng.pickMany(METHODOLOGY.filter((m) => m.advice !== item.advice), 5);
    if (rng.chance(0.5)) {
      return qcm({
        topicId,
        prompt: `En ${item.context.toLowerCase()}, quelle bonne pratique correspond à l’étape « ${item.step} » ?`,
        correct: item.advice,
        distractors: others.map((o) => o.advice).filter((a) => a !== item.advice).slice(0, 3),
        explanation: `${item.step} (${item.context}) : ${item.advice}.`,
        difficulty: 'facile',
        skill: `Méthodologie — ${item.context}`,
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `À quelle étape correspond ce conseil : « ${item.advice} » ?`,
      correct: item.step,
      distractors: others.map((o) => o.step).filter((s) => s !== item.step).slice(0, 3),
      explanation: `Il s’agit de l’étape « ${item.step} » (${item.context}) : ${item.advice}.`,
      difficulty: 'facile',
      skill: `Méthodologie — ${item.context}`,
      rng,
    });
  },
};

/** Question de culture générale transversale (réutilise tous les corpus). */
const generalKnowledge: QuestionFamily = {
  id: 'culture.generale',
  label: 'Culture générale',
  pool: () => HISTORY.length + GEOGRAPHY.length + PHILOSOPHY.length + BIOLOGY.length + SES.length + NSI.length,
  make(ctx) {
    const { rng } = ctx;
    const corpus = rng.pick(['histoire', 'geo', 'philo', 'svt', 'ses', 'nsi'] as const);
    const sub: GeneratorContext = { ...ctx };
    switch (corpus) {
      case 'histoire':
        return historyEvents.make(sub);
      case 'geo':
        return geoFacts.make(sub);
      case 'philo':
        return philoConcepts.make(sub);
      case 'svt':
        return bioTerms.make(sub);
      case 'ses':
        return sesConcepts.make(sub);
      default:
        return nsiTerms.make(sub);
    }
  },
};

export const KNOWLEDGE_FAMILIES: QuestionFamily[] = [
  historyDates,
  historyEvents,
  historyActors,
  historyChronology,
  geoFacts,
  geoCapitals,
  geoTrueFalse,
  philoConcepts,
  philoAuthors,
  philoDoctrines,
  bioTerms,
  bioProcesses,
  sesConcepts,
  sesAuthors,
  sesCalc,
  nsiTerms,
  nsiComplexity,
  nsiLogic,
  nsiTruthTable,
  nsiBases,
  nsiColors,
  nsiSql,
  nsiPython,
  methodology,
  generalKnowledge,
];
