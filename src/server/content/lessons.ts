/**
 * EduMate — Moteur de leçons interactives.
 *
 * Fabrique, pour N'IMPORTE QUEL sujet du catalogue, une leçon jouable étape par
 * étape : mission d'ouverture → méthode pas à pas → exemples guidés → exercices
 * intégrés (corrigés immédiatement) → piège classique → récapitulatif.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE CONTENU ?
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Trois sources se combinent, dans cet ordre de priorité :
 *
 *   1. **L'IA** (si un fournisseur est configuré ET qu'un contenu a déjà été
 *      généré/mis en cache) : accroche, objectifs, méthode, piège et points
 *      clés rédigés sur mesure pour le sujet précis.
 *   2. **La bibliothèque de leçons** ci-dessous : une fiche pédagogique par
 *      famille de questions (134 familles couvrent les 1 316 sujets).
 *   3. **Le repli par matière** : fiche générique mais cohérente, pour toute
 *      famille future qui n'aurait pas encore sa fiche.
 *
 * Les exemples et exercices, eux, viennent TOUJOURS des générateurs de
 * questions du catalogue (`buildQuestions`) : même contenu que les quiz, donc
 * même qualité et mêmes explications détaillées. Tout est déterministe à
 * graine fixée : la même leçon est rejouable à l'identique.
 *
 * Ce module est **pur** (aucun accès réseau ni stockage) : la route
 * `routes/lessons.ts` se charge de l'IA et du cache.
 */
import type {
  AiLessonContent,
  CatalogTopic,
  Lesson,
  LessonExercise,
  LessonStep,
  Question,
  SubjectId,
} from '../../shared/types.js';
import { buildQuestions } from './index.js';
import { hashString } from './lib.js';
import { answerLabel, splitSolution } from '../../shared/lessonText.js';

/*
 * `answerLabel` et `splitSolution` vivent dans `src/shared/lessonText.ts` :
 * le client (page de révision) découpe les explications EXACTEMENT comme le
 * serveur. Ré-export ici pour les tests et les usages internes.
 */
export { answerLabel, splitSolution };

/* ------------------------------------------------------------------ */
/*  Types de la bibliothèque                                           */
/* ------------------------------------------------------------------ */

/** Fiche pédagogique rédigée à la main pour une famille de questions. */
export interface LessonSeed {
  /** Accroche ludique affichée sur l'écran de mission. */
  hook: string;
  /** Objectifs d'apprentissage (2 à 3 phrases courtes). */
  goals: string[];
  /** Méthode pas à pas (3 à 5 gestes). */
  method: string[];
  /** Le piège classique des élèves sur cette notion. */
  trap: string;
  /** Astuce / moyen mnémotechnique. */
  tip: string;
}

/** Fabrique une fiche (écriture compacte dans la bibliothèque). */
function L(hook: string, goals: string[], method: string[], trap: string, tip: string): LessonSeed {
  return { hook, goals, method, trap, tip };
}

/* ------------------------------------------------------------------ */
/*  Interpolation et sélection de la fiche                             */
/* ------------------------------------------------------------------ */

/** Remplace `{sujet}`, `{matiere}` et `{theme}` dans un texte. */
export function fillTemplate(text: string, topic: CatalogTopic): string {
  return String(text ?? '')
    .replaceAll('{sujet}', topic.name)
    .replaceAll('{matiere}', topic.subjectName)
    .replaceAll('{theme}', topic.themeName);
}

/** Fiche d'une matière : repli lorsque la famille n'a pas encore la sienne. */
export function lessonSeedFor(topic: CatalogTopic): LessonSeed {
  return LESSON_LIBRARY[topic.source] ?? SUBJECT_LESSONS[topic.subjectId] ?? DEFAULT_LESSON;
}

/* ------------------------------------------------------------------ */
/*  Mise en forme des questions générées                               */
/* ------------------------------------------------------------------ */

/** Convertit une question du catalogue en exercice de leçon (correction incluse). */
export function toExercise(question: Question, id: string): LessonExercise {
  return {
    id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options ?? [],
    answer: question.kind === 'texte' ? null : (question.answer ?? null),
    accept: question.kind === 'texte' ? (question.accept ?? []) : null,
    explanation: question.explanation ?? '',
    skill: question.skill ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Construction de la leçon                                           */
/* ------------------------------------------------------------------ */

export interface BuildLessonOptions {
  topic: CatalogTopic;
  /** Graine de génération (défaut : graine stable dérivée de l'identifiant). */
  seed?: number;
  /** Contenu IA en cache, fusionné en priorité. */
  ai?: AiLessonContent | null;
  /** true si le serveur peut générer un contenu IA à la demande. */
  aiAvailable?: boolean;
}

/** Nombre d'exercices visés (la leçon reste valide s'il y en a moins). */
const EXERCISES_WANTED = 3;
/** Nombre d'exemples guidés visés. */
const EXAMPLES_WANTED = 2;

/**
 * Construit la leçon complète d'un sujet.
 *
 * Structure (quand le générateur fournit assez de questions) :
 *   mission → méthode → exemple 1 → exercice 1 → piège →
 *   exemple 2 → exercice 2 → exercice 3 → récapitulatif
 *
 * Dégradation gracieuse : moins de questions générées → moins d'exemples et
 * d'exercices ; aucune question → leçon « concept » pure (toujours jouable).
 */
export function buildLesson(options: BuildLessonOptions): Lesson {
  const { topic } = options;
  const ai = options.ai ?? null;
  const aiAvailable = Boolean(options.aiAvailable);
  const seed = Number.isInteger(options.seed) && Number.isFinite(options.seed)
    ? Math.abs(Math.trunc(options.seed as number)) % 1_000_000
    : hashString(topic.id) % 1_000_000;

  const lib = lessonSeedFor(topic);
  const goals = ai?.goals?.length ? ai.goals : lib.goals;
  const method = ai?.method?.length ? ai.method : lib.method;
  const hook = ai?.hook?.trim() ? ai.hook : lib.hook;
  const trap = ai?.trap?.trim() ? ai.trap : lib.trap;
  const tip = ai?.tip?.trim() ? ai.tip : lib.tip;
  const chips = ai?.chips?.length ? ai.chips : lib.goals;

  /* -------- Exemples et exercices : issus du générateur du sujet -------- */
  let practice: Question[] = [];
  try {
    practice = buildQuestions({
      topicId: topic.id,
      source: topic.source,
      params: topic.params ?? {},
      difficulty: topic.difficulty,
      count: EXAMPLES_WANTED + EXERCISES_WANTED + 1,
      seed: `${topic.id}#lesson#${seed}`,
    });
  } catch {
    practice = [];
  }

  // Répartition exemples/exercices : on privilégie TOUJOURS au moins un
  // exercice (c'est le cœur interactif), puis les exemples, puis le reste.
  let exemples = practice.slice(0, EXAMPLES_WANTED);
  let exercices = practice.slice(exemples.length, exemples.length + EXERCISES_WANTED);
  if (!exercices.length && exemples.length > 1) {
    exercices = exemples.slice(-1);
    exemples = exemples.slice(0, -1);
  }
  const restant = practice.slice(exemples.length + exercices.length);
  if (exercices.length < EXERCISES_WANTED && restant.length) {
    exercices = [...exercices, ...restant].slice(0, EXERCISES_WANTED);
  }

  /* ------------------------------ Étapes ------------------------------- */
  const steps: LessonStep[] = [];

  steps.push({
    id: 'mission',
    kind: 'mission',
    emoji: topic.emoji || '🎯',
    title: `Mission : ${topic.name}`,
    intro: fillTemplate(hook, topic),
    goals: goals.map((goal) => fillTemplate(goal, topic)),
  });

  steps.push({
    id: 'methode',
    kind: 'concept',
    emoji: '🧭',
    title: 'Ta méthode, geste par geste',
    points: method.map((point) => fillTemplate(point, topic)),
    ai: aiAvailable && !ai,
  });

  const pushExemple = (question: Question | undefined, slot: number): void => {
    if (!question) return;
    steps.push({
      id: `exemple-${slot}`,
      kind: 'exemple',
      emoji: '🔎',
      title: `Exemple guidé ${slot} — on décortique ensemble`,
      prompt: question.prompt,
      answerLabel: answerLabel(question),
      solution: splitSolution(question.explanation),
    });
  };
  const pushExercice = (question: Question | undefined, slot: number): void => {
    if (!question) return;
    steps.push({
      id: `exercice-${slot}`,
      kind: 'exercice',
      emoji: '🎯',
      title: `À toi de jouer ! Exercice ${slot}`,
      question: toExercise(question, `exercice-${slot}`),
    });
  };

  pushExemple(exemples[0], 1);
  pushExercice(exercices[0], 1);

  steps.push({
    id: 'piege',
    kind: 'piege',
    emoji: '⚠️',
    title: 'Le piège classique',
    text: fillTemplate(trap, topic),
  });

  pushExemple(exemples[1], 2);
  pushExercice(exercices[1], 2);
  pushExercice(exercices[2], 3);

  steps.push({
    id: 'recap',
    kind: 'recap',
    emoji: '🧠',
    title: 'Ce qu’il faut retenir',
    chips: chips.map((chip) => fillTemplate(chip, topic)),
    tip: fillTemplate(tip, topic),
  });

  return {
    topicId: topic.id,
    topicName: topic.name,
    subjectName: topic.subjectName,
    themeName: topic.themeName,
    levelName: topic.levelName,
    emoji: topic.emoji,
    color: topic.color,
    accent: topic.accent,
    difficulty: topic.difficulty,
    seed,
    steps,
    aiAvailable,
    ai,
  };
}

/* ------------------------------------------------------------------ */
/*  Enrichissement IA                                                  */
/* ------------------------------------------------------------------ */

/** Invite système demandant un JSON strict pour enrichir une leçon. */
export function buildAiLessonPrompt(topic: CatalogTopic): string {
  return [
    'Tu rédiges le contenu pédagogique d’une leçon interactive pour un élève de collège/lycée (plateforme EduMate).',
    `Sujet exact : « ${topic.name} » — matière : ${topic.subjectName}, classe : ${topic.levelName}, thème : ${topic.themeName}.`,
    'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec EXACTEMENT ces clés :',
    '{"hook": string, "goals": string[3], "method": string[4], "trap": string, "tip": string, "chips": string[4]}',
    'Contraintes de contenu :',
    '- hook : UNE phrase d’accroche ludique et motivante (max 180 caractères), tutoiement, sans emoji.',
    '- goals : 3 objectifs d’apprentissage concrets (max 110 caractères chacun), commençant par un verbe.',
    '- method : 4 étapes de méthode dans l’ordre (max 150 caractères chacune), spécifiques à CE sujet.',
    '- trap : l’erreur la plus classique des élèves sur ce sujet, en une phrase (max 180 caractères).',
    '- tip : une astuce ou un moyen mnémotechnique (max 150 caractères).',
    '- chips : 4 points clés ultra-courts à retenir (max 45 caractères chacun).',
    `- Tout en français, adapté au niveau ${topic.levelName}. Pas de HTML. Formules mathématiques éventuelles : $...$ uniquement.`,
  ].join('\n');
}

/** Nettoyage d'un texte fourni par l'IA : contrôle, espaces, longueur. */
function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Liste de textes validée : nombre d'éléments borné, éléments trop courts écartés. */
function sanitizeList(value: unknown, min: number, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map((entry) => sanitizeText(entry, itemMax))
    .filter((entry) => entry.length >= 2)
    .slice(0, max);
  return items.length >= min ? items : [];
}

/**
 * Valide la réponse JSON de l'IA. Retourne `null` si le contenu est
 * inexploitable (JSON invalide, clés manquantes, textes trop courts) : la
 * leçon locale reste alors intacte — JAMAIS de contenu IA partiel.
 */
export function parseAiLesson(raw: string): AiLessonContent | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const hook = sanitizeText(obj.hook, 240);
  const goals = sanitizeList(obj.goals, 2, 4, 140);
  const method = sanitizeList(obj.method, 3, 6, 200);
  const trap = sanitizeText(obj.trap, 240);
  const tip = sanitizeText(obj.tip, 200);
  const chips = sanitizeList(obj.chips, 3, 6, 60);

  if (!hook || !goals.length || !method.length || !trap || !tip || !chips.length) return null;
  return { hook, goals, method, trap, tip, chips };
}

/* ------------------------------------------------------------------ */
/*  Couverture de la bibliothèque (vérifiée par les tests)             */
/* ------------------------------------------------------------------ */

/**
 * Liste les familles de questions couvertes par la bibliothèque.
 * Une famille absente retombe sur la fiche de sa matière (toujours valable).
 */
export function lessonLibraryCoverage(sources: Iterable<string>): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const source of new Set(sources)) {
    if (LESSON_LIBRARY[source]) covered.push(source);
    else missing.push(source);
  }
  return { covered, missing };
}

/* ------------------------------------------------------------------ */
/*  Bibliothèque de leçons — une fiche par famille de questions        */
/* ------------------------------------------------------------------ */
export const LESSON_LIBRARY: Record<string, LessonSeed> = {
  /* ------------------------------ Mathématiques ---------------------- */
  'math.arithmetic': L(
    'Calculer vite et juste, c’est un super-pouvoir de tous les jours 🦸',
    ['Calculer mentalement avec assurance', 'Poser une opération sans erreur', 'Vérifier par un ordre de grandeur'],
    ['Repère l’opération demandée dans l’énoncé', 'Estime d’abord le résultat (ordre de grandeur)', 'Calcule posément, en gérant retenues et emprunts', 'Compare avec ton estimation : si c’est loin, recommence'],
    'Oublier une retenue en addition ou un emprunt en soustraction : l’erreur n°1 du calcul posé.',
    'Estime avant de calculer : 48 × 21, c’est « environ 50 × 20 = 1 000 ».',
  ),
  'math.decimals': L(
    'Derrière chaque nombre décimal se cache une fraction : allons la dénicher 🔍',
    ['Lire et écrire les nombres décimaux', 'Comparer et calculer avec les décimaux'],
    ['Identifie la partie entière et la partie décimale', 'Pour comparer : complète avec des zéros (0,2 = 0,20)', 'Pour additionner : aligne les virgules', 'Vérifie l’ordre de grandeur du résultat'],
    'Croire que 0,15 > 0,2 parce que « 15 est plus grand que 2 ».',
    'Les zéros à droite ne changent rien : 3,50 = 3,5 — sers-t’en pour aligner.',
  ),
  'math.relative': L(
    'Les nombres négatifs, c’est le thermomètre des maths 🌡️',
    ['Additionner et soustraire des relatifs', 'Appliquer la règle des signes'],
    ['Regarde les signes AVANT de calculer', 'Même signe : le produit est positif', 'Signes différents : le produit est négatif', 'Pour une somme : déplace-toi sur la droite graduée'],
    '−3 + 5 ne fait pas −8 : on avance de 5 vers la droite à partir de −3.',
    'Pense compte en banque : les dettes (−) et les dépôts (+) s’additionnent naturellement.',
  ),
  'math.fractions': L(
    'Les fractions, ce sont des gâteaux partagés 🍰',
    ['Additionner des fractions', 'Multiplier et diviser des fractions'],
    ['Pour additionner : même dénominateur d’abord', 'Pour multiplier : numérateurs entre eux, dénominateurs entre eux', 'Diviser = multiplier par l’inverse', 'Simplifie TOUJOURS le résultat final'],
    'Additionner les numérateurs ET les dénominateurs : 1/2 + 1/3 ≠ 2/5.',
    'Cherche le plus petit multiple commun des dénominateurs avant de te lancer.',
  ),
  'math.fraction.simplify': L(
    'Même gâteau, moins de miettes : simplifions tout ça ✂️',
    ['Reconnaître une fraction irréductible', 'Simplifier avec le PGCD'],
    ['Cherche un diviseur commun au numérateur et au dénominateur', 'Divise les DEUX par ce nombre', 'Recommence jusqu’à la fraction irréductible', 'Raccourci : divise directement par le PGCD'],
    'Diviser seulement le numérateur (ou seulement le dénominateur) : la valeur change !',
    'Teste 2, puis 3, puis 5 : la plupart des simplifications se font avec eux.',
  ),
  'math.percentages': L(
    'Les pourcentages : la langue universelle des soldes et des stats 🏷️',
    ['Calculer t % d’une quantité', 'Retrouver la valeur de départ'],
    ['t % de X = X × t / 100', 'Augmentation : multiplier par (1 + t/100)', 'Diminution : multiplier par (1 − t/100)', 'Vérifie avec un ordre de grandeur'],
    'L’oubli de la base : 10 % de 200 et 200 % de 10, ce n’est pas la même chose.',
    'Repères mentaux : 10 % = diviser par 10, 50 % = la moitié, 25 % = le quart.',
  ),
  'math.percentages.successive': L(
    '+20 % puis −20 %… et ce n’est PAS revenu au point de départ 😲',
    ['Enchaîner plusieurs évolutions', 'Calculer le taux global'],
    ['Associe un coefficient à chaque évolution', 'Multiplie les coefficients entre eux', 'Taux global = (coefficient final − 1) × 100', 'Vérifie sur un exemple simple (valeur 100)'],
    'Additionner les taux : +20 % puis −20 % ne fait PAS +0 %.',
    '1,2 × 0,8 = 0,96 : au final, une baisse de 4 %. Les coefficients, jamais les taux.',
  ),
  'math.proportionality': L(
    'Le produit en croix démêle toutes les situations ✖️',
    ['Reconnaître une situation de proportionnalité', 'Utiliser le produit en croix'],
    ['Organise les données en tableau', 'Vérifie que le quotient est constant', 'Produit en croix pour trouver la valeur manquante', 'Contrôle la vraisemblance du résultat'],
    'Supposer la proportionnalité là où elle n’existe pas (âge, aire d’un carré…).',
    'Passe toujours par l’unité (« pour 1 article, pour 1 km ») : c’est plus sûr.',
  ),
  'math.powers': L(
    'Les puissances, c’est l’écriture des très grands et des très petits ⚡',
    ['Appliquer les règles des puissances', 'Manipuler les exposants négatifs'],
    ['Produit de même base : on ADDITIONNE les exposants', 'Quotient de même base : on SOUSTRAIT', 'Puissance de puissance : on MULTIPLIE', 'Exposant négatif = inverse (a⁻ⁿ = 1/aⁿ)'],
    '(a + b)² ≠ a² + b² : le carré d’une somme se développe (a² + 2ab + b²).',
    'Tout nombre non nul à la puissance 0 vaut 1 — sans exception.',
  ),
  'math.scientific': L(
    'Des atomes aux galaxies : une seule écriture pour tout mesurer 🔬',
    ['Écrire en notation scientifique', 'Comparer des ordres de grandeur'],
    ['UN seul chiffre non nul avant la virgule', 'Multiplie par une puissance de 10', 'L’exposant = nombre de rangs dont la virgule a bougé', 'Vers la gauche : exposant positif ; vers la droite : négatif'],
    '12,5 × 10³ n’est PAS scientifique : il faut 1,25 × 10⁴.',
    'Repères : 10³ = mille, 10⁶ = un million, 10⁹ = un milliard, 10⁻⁹ = le nano.',
  ),
  'math.roots': L(
    'La racine carrée, c’est l’opération qui annule le carré √',
    ['Simplifier des racines carrées', 'Calculer avec les radicaux'],
    ['√(a × b) = √a × √b (pour a, b positifs)', 'Cherche les facteurs carrés parfaits', '√(a² × k) = a√k', 'Addition : seulement si les radicaux sont identiques'],
    '√(9 + 16) = 5, PAS √9 + √16 = 7 : jamais de racine d’une somme.',
    'Connais tes carrés parfaits : 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144.',
  ),
  'math.equation.linear': L(
    'Une équation, c’est une balance : ce qu’on fait d’un côté… ⚖️',
    ['Résoudre ax + b = cx + d', 'Vérifier une solution'],
    ['Regroupe les x d’un seul côté', 'Regroupe les nombres de l’autre', 'Divise par le coefficient de x', 'Remplace x par la valeur trouvée pour vérifier'],
    'Oublier de changer le signe de TOUS les termes quand on passe de l’autre côté.',
    'La vérification prend 10 secondes et attrape toutes les erreurs : fais-la toujours.',
  ),
  'math.equation.product': L(
    'Un produit nul, c’est au moins un facteur qui se trahit 🕵️',
    ['Appliquer la règle du produit nul', 'Résoudre (ax+b)(cx+d) = 0'],
    ['Produit nul ⇔ au moins un facteur est nul', 'Écris une petite équation par facteur', 'Résous chacune séparément', 'Réunis toutes les solutions'],
    'Diviser par x des deux côtés : tu perds la solution x = 0.',
    '« Un produit de facteurs est nul dès que l’un des facteurs est nul » — par cœur.',
  ),
  'math.equation.quadratic': L(
    'Le fameux discriminant Δ : il te dit tout avant même de calculer 🔮',
    ['Calculer le discriminant', 'En déduire le nombre de solutions'],
    ['Identifie a, b et c dans ax² + bx + c = 0', 'Δ = b² − 4ac', 'Δ > 0 : deux solutions ; Δ = 0 : une seule ; Δ < 0 : aucune', 'x = (−b ± √Δ) / 2a'],
    'Le signe de b : si b = −5, alors b² = 25 (positif) et −b = +5.',
    'Avant la formule, teste les valeurs évidentes : 0, 1 et −1 tombent souvent juste.',
  ),
  'math.equation.quadratic.roots': L(
    'Deux racines, une somme, un produit : le trinôme n’a plus de secret 📈',
    ['Calculer les racines d’un trinôme', 'Utiliser somme et produit pour vérifier'],
    ['Δ = b² − 4ac', 'x₁ = (−b − √Δ)/2a et x₂ = (−b + √Δ)/2a', 'Vérifie : x₁ + x₂ = −b/a', 'Vérifie : x₁ × x₂ = c/a'],
    'Inverser −b et b dans la formule : c’est MOINS b, toujours.',
    'Somme et produit des racines = ta calculatrice de vérification gratuite.',
  ),
  'math.inequations': L(
    'Comme une équation, mais avec un frisson quand on divise par un négatif ➗',
    ['Résoudre une inéquation', 'Représenter l’ensemble des solutions'],
    ['Isole x comme dans une équation', 'Multiplication/division par un NÉGATIF : on inverse le sens', 'Représente sur une droite graduée', 'Crochet : [ inclus, ] exclu'],
    'Oublier d’inverser le sens de l’inégalité en divisant par un nombre négatif.',
    'Teste une valeur de ta zone solution dans l’inéquation d’origine : ça valide tout.',
  ),
  'math.intervalles': L(
    'Crochets et parenthèses : le code secret des intervalles 🎫',
    ['Traduire une inégalité en intervalle', 'Comprendre borne incluse ou exclue'],
    ['[ : la borne est incluse ; ] ou ) : exclue', 'L’infini est TOUJOURS ouvert : +∞[ ou ]−∞', 'x ∈ [a;b] signifie a ≤ x ≤ b', 'Place le nombre sur une droite graduée pour trancher'],
    'Écrire [3;+∞] : +∞ n’est jamais une borne atteinte.',
    'Dessine la droite graduée : l’appartenance saute aux yeux.',
  ),
  'math.function.value': L(
    'Une fonction, c’est une machine : tu donnes x, elle crache f(x) 🏭',
    ['Calculer l’image d’un nombre', 'Lire une image sur une courbe'],
    ['Remplace x par la valeur demandée', 'Calcule étape par étape (parenthèses !) ', 'Sur un graphique : monte depuis x, lis la hauteur', 'Vérifie la cohérence avec la courbe'],
    'Avec x négatif : (−2)² = 4 mais −2² = −4. Les parenthèses changent tout.',
    'f(3) se lit « image de 3 par f » : c’est ce qui SORT de la machine.',
  ),
  'math.function.antecedent': L(
    'On remonte le temps : de f(x) vers x, à l’envers de la machine 🔄',
    ['Résoudre f(x) = k', 'Lire un antécédent sur un graphique'],
    ['Écris l’équation f(x) = k', 'Résous-la pour isoler x', 'Sur un graphique : ligne horizontale à la hauteur k', 'Il peut y avoir 0, 1 ou plusieurs antécédents'],
    'Confondre image (ce qui sort) et antécédent (ce qui entre).',
    'La question dit « tel que f(x) = 7 » ? C’est un antécédent. « f(7) » ? Une image.',
  ),
  'math.function.affine': L(
    'f(x) = ax + b : deux nombres et la droite est entièrement déterminée 📏',
    ['Identifier coefficient directeur et ordonnée à l’origine', 'Déterminer une fonction affine'],
    ['a = coefficient directeur (variation de y pour +1 en x)', 'b = ordonnée à l’origine : f(0) = b', 'Deux points suffisent : a = (yB−yA)/(xB−xA)', 'a > 0 : la fonction monte ; a < 0 : elle descend'],
    'Prendre b pour la pente (ou l’inverse) : a multiplie x, b s’ajoute.',
    'a, c’est l’escalier : combien je monte quand j’avance d’un pas.',
  ),
  'math.function.variation': L(
    'Ça monte ou ça descend ? La variation tranche une fois pour toutes 🎢',
    ['Déterminer un sens de variation', 'Comparer des valeurs grâce aux variations'],
    ['Calcule f(b) − f(a) avec a < b', 'Résultat positif : croissante ; négatif : décroissante', 'Fonction dérivable : regarde le SIGNE de f′(x)', 'Dresse le tableau de variations'],
    '« f est positive » ≠ « f est croissante » : hauteur et pente, deux choses différentes.',
    'Le signe de la dérivée EST le sens de variation : + elle monte, − elle descend.',
  ),
  'math.function.reference': L(
    'Carré, inverse, racine : les trois stars des fonctions ⭐',
    ['Connaître les courbes de référence', 'Maîtriser leurs variations'],
    ['x ↦ x² : parabole, décroît puis croît, sommet en 0', 'x ↦ 1/x : hyperbole, jamais définie en 0', 'x ↦ √x : définie seulement pour x ≥ 0', 'Compare les croissances pour x > 1'],
    '1/x n’est pas « décroissante partout » : elle n’est tout simplement pas définie en 0.',
    'Dessine les trois courbes de tête : 30 secondes qui rapportent des points.',
  ),
  'math.function.quadratic.vertex': L(
    'Le sommet, c’est le point qui résume toute la parabole ⛰️',
    ['Calculer les coordonnées du sommet', 'Utiliser l’axe de symétrie'],
    ['α = −b / (2a)', 'β = f(α)', 'a > 0 : le sommet est un MINIMUM ; a < 0 : un MAXIMUM', 'La parabole est symétrique par rapport à x = α'],
    'Le signe dans −b/(2a) : c’est MOINS b, divisé par 2a.',
    'Le sommet se trouve toujours à mi-chemin entre les deux racines (s’il y en a).',
  ),
  'math.derivative': L(
    'La dérivée mesure à quelle vitesse ça change, instant par instant ⚡',
    ['Dériver les fonctions usuelles', 'Interpréter la dérivée'],
    ['(xⁿ)′ = n·xⁿ⁻¹ — la formule reine', 'Produit : (uv)′ = u′v + uv′', 'Quotient : (u/v)′ = (u′v − uv′)/v²', 'La dérivée d’une constante vaut 0'],
    'Le numérateur du quotient : c’est u′v − uv′, dans CET ordre.',
    'Une dérivée se vérifie : au sommet d’une parabole, elle vaut 0.',
  ),
  'math.derivative.advanced': L(
    'Fonctions imbriquées : on dérive couche par couche, comme un oignon 🧅',
    ['Appliquer la dérivation en chaîne', 'Dériver une composée'],
    ['Identifie la fonction extérieure et l’intérieure', '(u(v(x)))′ = v′(x) × u′(v(x))', 'N’oublie JAMAIS de multiplier par la dérivée intérieure', 'Vérifie sur un cas simple (ex. (2x+1)³)'],
    'Oublier le facteur « dérivée de l’intérieur » : l’erreur la plus fréquente.',
    '« Dérivée du dehors × dérivée du dedans » — répète-le à voix haute.',
  ),
  'math.derivative.value': L(
    'f′(a), c’est la pente exacte de la courbe au point d’abscisse a 📐',
    ['Calculer un nombre dérivé', 'Le relier à la tangente'],
    ['Dérive d’abord la fonction f', 'Remplace ensuite x par a', 'f′(a) = coefficient directeur de la tangente en a', 'Interprète : vitesse de variation instantanée'],
    'Calculer f(a) au lieu de f′(a) : lis bien la notation, le prime change tout.',
    'f′ est une fonction ; f′(a) est un NOMBRE.',
  ),
  'math.tangent': L(
    'La tangente, c’est la droite qui frôle la courbe en un seul point 🎯',
    ['Écrire l’équation d’une tangente', 'Utiliser la formule du cours'],
    ['Calcule f(a) : le point de contact', 'Calcule f′(a) : la pente', 'Injecte dans y = f′(a)(x − a) + f(a)', 'Développe pour la forme y = mx + p'],
    'Prendre f(a) comme pente : la pente, c’est f′(a).',
    'La formule y = f′(a)(x − a) + f(a) s’apprend par cœur, elle ressert toute l’année.',
  ),
  'math.integrales': L(
    'L’intégrale calcule l’aire sous la courbe — l’addition infinie 📊',
    ['Trouver une primitive', 'Calculer une intégrale'],
    ['Cherche F telle que F′ = f (dérivation à l’envers)', '∫[a→b] f(x)dx = F(b) − F(a)', 'La constante de la primitive s’annule : pas d’inquiétude', 'f positive → aire positive'],
    'Inverser les bornes : c’est F(b) − F(a), pas l’inverse (sinon signe opposé).',
    'Vérifie en redérivant ta primitive : si tu retombes sur f, c’est gagné.',
  ),
  'math.sequences': L(
    'Arithmétique ou géométrique ? Repère le motif en trois secondes 🔢',
    ['Reconnaître le type de suite', 'Calculer n’importe quel terme'],
    ['Arithmétique : on AJOUTE r à chaque pas → uₙ = u₀ + n·r', 'Géométrique : on MULTIPLIE par q → uₙ = u₀ × qⁿ', 'Calcule deux termes consécutifs pour identifier', 'Vérifie avec un troisième terme'],
    'Mélanger les formules : n·r (arithmétique) contre qⁿ (géométrique).',
    'Arithmétique = escalier régulier ; géométrique = intérêt composé.',
  ),
  'math.sequences.sum': L(
    'Additionner mille termes en une seule ligne : la magie des formules 🪄',
    ['Sommer les termes d’une suite', 'Choisir la bonne formule'],
    ['Arithmétique : nombre de termes × (premier + dernier) / 2', 'Géométrique : u₀ × (1 − qⁿ)/(1 − q) si q ≠ 1', 'Compte BIEN le nombre de termes', 'Vérifie sur un tout petit cas'],
    'Le décalage d’un terme : de u₀ à u₁₀, il y a ONZE termes, pas dix.',
    'Teste ta formule avec n = 2 : si ça marche, elle est juste.',
  ),
  'math.sequences.limit': L(
    'Où va la suite quand n file vers l’infini ? 🚀',
    ['Déterminer la limite d’une suite géométrique', 'Reconnaître convergence et divergence'],
    ['|q| < 1 : qⁿ → 0, la suite converge', 'q > 1 : qⁿ → +∞, divergence', 'q = 1 : suite constante', 'Arithmétique de raison r ≠ 0 : divergence selon le signe de r'],
    'q = −1,5 : la suite alterne et explose en amplitude — elle ne converge PAS.',
    'Tout se joue sur |q| : strictement plus petit que 1 → convergence vers 0.',
  ),
  'math.combinaison': L(
    'Choisir sans se soucier de l’ordre : l’art des combinaisons 🎲',
    ['Calculer un nombre de combinaisons', 'Les distinguer des arrangements'],
    ['C(n,k) = n! / (k! × (n−k)!)', 'L’ordre ne compte PAS → combinaison', 'Symétrie : C(n,k) = C(n,n−k)', 'Vérifie sur un petit cas (n = 4, k = 2 → 6)'],
    'Utiliser un arrangement alors que l’ordre n’a aucune importance.',
    'Pose-toi la question : « est-ce que permuter change quelque chose ? »',
  ),
  'math.arrangement': L(
    'Premier, deuxième, troisième… ici l’ordre compte 🥇',
    ['Calculer un arrangement', 'Manipuler les factorielles'],
    ['A(n,k) = n! / (n−k)!', 'Ou directement : n × (n−1) × … (k facteurs)', 'n! = produit des entiers de 1 à n', '0! = 1 par convention'],
    'Oublier que l’ordre compte : un podium n’est pas une équipe.',
    'Podium = arrangement ; équipe = combinaison. L’image retient la règle.',
  ),
  'math.probability.dice': L(
    'Dés, cartes, urnes : le hasard sous contrôle 🎲',
    ['Calculer la probabilité d’un événement', 'Dénombrer sans oubli'],
    ['p = cas favorables / cas possibles', 'Condition : des issues équiprobables', 'Liste méthodiquement toutes les issues', 'Vérifie : 0 ≤ p ≤ 1 et somme totale = 1'],
    'Deux dés : (1;2) et (2;1) sont DEUX issues différentes.',
    'En cas de doute, dessine le tableau ou l’arbre des issues.',
  ),
  'math.probability.conditional': L(
    'Sachant que… : une info change tout 🕵️',
    ['Calculer une probabilité conditionnelle', 'Utiliser la formule des probabilités totales'],
    ['P_B(A) = P(A ∩ B) / P(B)', '« Sachant B » = on restreint l’univers à B', 'P(A ∩ B) = P(B) × P_B(A)', 'L’arbre pondéré rend tout visible'],
    'Confondre P(A ∩ B) (dans tout l’univers) et P_B(A) (dans B seulement).',
    'Dessine l’arbre : les conditionnements se lisent branche par branche.',
  ),
  'math.statistics': L(
    'Moyenne, médiane, étendue : faire parler les données 📊',
    ['Calculer les indicateurs statistiques', 'Les interpréter'],
    ['Moyenne = somme des valeurs / effectif total', 'Médiane : valeur du milieu APRÈS tri', 'Étendue = max − min', 'Avec coefficients : pondère chaque valeur'],
    'Chercher la médiane sans avoir trié les données dans l’ordre.',
    'Effectif pair : la médiane est la moyenne des DEUX valeurs centrales.',
  ),
  'math.pythagore': L(
    'Le théorème le plus célèbre du monde : a² + b² = c² 📐',
    ['Calculer l’hypoténuse', 'Calculer un côté de l’angle droit'],
    ['Vérifie : le triangle est rectangle', 'Hypoténuse² = somme des carrés des deux autres côtés', 'Pour un côté droit : hypoténuse² − autre côté²', 'Termine par la racine carrée'],
    'Mettre un côté de l’angle droit à la place de l’hypoténuse.',
    'L’hypoténuse est TOUJOURS le plus grand côté, face à l’angle droit.',
  ),
  'math.trigonometrie': L(
    'SOH CAH TOA : trois syllabes qui sauvent des vies 🧭',
    ['Calculer un côté avec un angle', 'Calculer un angle avec des côtés'],
    ['Repère angle, côté opposé, côté adjacent', 'Choisis le bon rapport : sin, cos ou tan', 'Écris l’équation puis isole l’inconnue', 'Pour un angle : cos⁻¹, sin⁻¹ ou tan⁻¹ à la calculatrice'],
    'Inverser opposé et adjacent : tout dépend de l’angle choisi.',
    'SOH CAH TOA : Sin = Opp/Hyp, Cos = Adj/Hyp, Tan = Opp/Adj.',
  ),
  'math.vecteurs': L(
    'Un sens, une direction, une longueur : le GPS des maths ➡️',
    ['Calculer les coordonnées d’un vecteur', 'Utiliser la colinéarité'],
    ['AB = (xB − xA ; yB − yA)', '« Extrémité moins origine », toujours', 'Colinéarité : x·y′ − x′·y = 0', 'Vecteurs égaux = même déplacement'],
    'Inverser la soustraction : AB n’est pas xA − xB.',
    'AB = −BA : changer l’ordre inverse le vecteur.',
  ),
  'math.droites': L(
    'Deux points, et toute la droite se révèle 📏',
    ['Trouver l’équation d’une droite', 'Calculer pente et ordonnée à l’origine'],
    ['Pente m = (yB − yA)/(xB − xA)', 'Équation réduite : y = mx + p', 'Trouve p avec un point connu', 'Droite verticale : équation x = k (pas de pente)'],
    'xB = xA : division par zéro → droite verticale, équation x = xA.',
    'Vérifie que TES DEUX POINTS satisfont l’équation finale.',
  ),
  'math.distance': L(
    'La distance entre deux points, c’est Pythagore déguisé 📍',
    ['Calculer une distance en repère', 'L’appliquer à des problèmes'],
    ['AB = √((xB−xA)² + (yB−yA)²)', 'Calcule d’abord les écarts', 'Élève au carré (les signes disparaissent)', 'Racine carrée EN DERNIER'],
    'Prendre la racine trop tôt ou oublier les carrés.',
    'Les écarts en x et en y sont les deux côtés droits d’un triangle rectangle.',
  ),
  'math.cercles': L(
    'Périmètre et aire du disque : π fait le travail à ta place ⭕',
    ['Calculer le périmètre d’un cercle', 'Calculer l’aire d’un disque'],
    ['Périmètre = 2 × π × r', 'Aire = π × r²', 'Rayon = moitié du diamètre', 'Garde la valeur exacte (avec π) si demandé'],
    'Mettre le diamètre au carré dans l’aire : c’est le RAYON au carré.',
    'Périmètre : r à la puissance 1. Aire : r à la puissance 2. Logique !',
  ),
  'math.aires.volumes': L(
    'Du plat au 3D : des formules pour mesurer le monde 📦',
    ['Connaître les formules d’aires', 'Connaître les formules de volumes'],
    ['Rectangle : L × l ; triangle : base × hauteur / 2 ; disque : πr²', 'Pavé : L × l × h ; cylindre : πr² × h', 'Pyramide et cône : base × hauteur / 3', 'Aires en unité², volumes en unité³'],
    'Oublier le « divisé par 3 » des pyramides et des cônes.',
    'Vérifie avec les unités : cm² pour une aire, cm³ pour un volume.',
  ),
  'math.algorithme': L(
    'Lis le programme, déroule-le dans ta tête, prédits l’affichage 🤖',
    ['Suivre l’exécution d’un algorithme', 'Comprendre boucles et affectations'],
    ['Liste les variables et leur valeur initiale', 'Déroule chaque instruction dans l’ordre', 'Boucle « répéter n fois » : refais le corps n fois', 'Fais un tableau : une ligne par tour de boucle'],
    'Perdre la trace d’une variable modifiée à chaque tour de boucle.',
    's ← 2 × s + 3 se lit « la NOUVELLE valeur de s vaut… » : c’est une affectation.',
  ),
  'math.exp.ln': L(
    'eˣ et ln : le duo qui se remonte mutuellement 🌿',
    ['Appliquer les propriétés de exp et ln', 'Résoudre des équations avec exp/ln'],
    ['e^(a+b) = eᵃ × eᵇ ; e^(a−b) = eᵃ / eᵇ', 'ln(a×b) = ln a + ln b ; ln(a/b) = ln a − ln b', 'ln(eˣ) = x et e^(ln x) = x', 'ln est défini SEULEMENT pour x > 0'],
    'Prendre le ln d’un nombre négatif ou nul : impossible.',
    'e et ln s’annulent : e^(ln 3) = 3, ln(e⁵) = 5.',
  ),
  'math.complexes': L(
    'Des nombres à deux dimensions : bienvenue dans ℂ 🌌',
    ['Manipuler la forme algébrique', 'Calculer avec i'],
    ['z = a + bi avec i² = −1', 'Addition : réelles avec réelles, imaginaires avec imaginaires', 'Produit : développe puis remplace i² par −1', 'Conjugué de a + bi : a − bi'],
    'i² = −1, JAMAIS +1 : c’est tout le sel des complexes.',
    'Traite i comme une lettre x, puis applique i² = −1 à la fin.',
  ),

  /* ------------------------------ Physique --------------------------- */
  'phys.speed': L(
    'Vitesse, distance, temps : le triangle magique du mouvement 🚗',
    ['Utiliser v = d / t', 'Convertir km/h et m/s'],
    ['Identifie la grandeur cherchée', 'v = d/t, donc d = v × t et t = d/v', 'km/h → m/s : divise par 3,6', 'Garde des unités homogènes dans le calcul'],
    'Mélanger km/h et m/s (ou heures et secondes) sans convertir.',
    'Cache la grandeur cherchée dans le triangle d–v–t : la formule apparaît.',
  ),
  'phys.newton': L(
    'Trois lois pour expliquer TOUS les mouvements 🍎',
    ['Énoncer les lois de Newton', 'Appliquer le principe d’inertie'],
    ['Fais le bilan des forces appliquées', '1re loi : forces qui se compensent → repos ou mouvement rectiligne uniforme', '2e loi : ΣF = m × a', '3e loi : à toute action, une réaction opposée'],
    'Oublier des forces dans le bilan (poids, frottements, réaction du support).',
    'Pas de force (ou forces compensées) = pas de changement de mouvement.',
  ),
  'phys.weight': L(
    'Ton poids sur Terre, ton poids sur la Lune : la masse, elle, ne bouge pas 🌍',
    ['Calculer P = m × g', 'Distinguer masse et poids'],
    ['P = m × g', 'g ≈ 9,81 N/kg sur Terre', 'La masse s’exprime en kg, le poids en newtons (N)', 'g change selon la planète, m jamais'],
    '« Je pèse 50 kg » : non, ta MASSE est 50 kg, ton POIDS ≈ 490 N.',
    'Sur la Lune, g est 6 fois plus faible : même masse, poids divisé par 6.',
  ),
  'phys.energy': L(
    'L’énergie ne disparaît jamais : elle change de forme 🔄',
    ['Calculer énergies cinétique et potentielle', 'Utiliser la conservation'],
    ['Énergie cinétique : Ec = ½ × m × v²', 'Énergie de pesanteur : Ep = m × g × h', 'Énergie mécanique = Ec + Ep', 'Sans frottement, Em se conserve'],
    'Oublier le carré de la vitesse : à vitesse doublée, Ec quadruple.',
    'Ce qu’on perd en hauteur, on le gagne en vitesse — et réciproquement.',
  ),
  'phys.work': L(
    'En physique, le « travail » ne se mesure pas à la sueur 💪',
    ['Calculer le travail d’une force', 'Interpréter son signe'],
    ['W = F × d × cos(θ)', 'Force parallèle au déplacement : W = F × d', 'Force perpendiculaire : W = 0', 'W > 0 moteur, W < 0 résistant'],
    'Une force perpendiculaire au déplacement ne travaille PAS.',
    'Le travail s’exprime en joules (J) : 1 J = 1 N × 1 m.',
  ),
  'phys.ohm': L(
    'U = R × I : trois lettres gouvernent tout le circuit 🧲',
    ['Appliquer la loi d’Ohm', 'Retrouver chaque grandeur'],
    ['U en volts (V), I en ampères (A), R en ohms (Ω)', 'I = U/R et R = U/I', 'Convertis les mA en A avant de calculer', 'La loi d’Ohm vaut pour les conducteurs ohmiques'],
    '20 mA = 0,020 A : l’oubli du « milli » fausse tout.',
    'Le triangle U–R–I : cache ce que tu cherches, la formule apparaît.',
  ),
  'phys.electric.power': L(
    'La puissance, c’est le débit de l’énergie 💡',
    ['Calculer P = U × I', 'Relier puissance et énergie'],
    ['P = U × I (en watts)', 'E = P × t (en joules, ou Wh avec t en heures)', 'Retrouve U ou I selon l’inconnue', 'Compare avec les valeurs nominales des appareils'],
    'kW (puissance) contre kWh (énergie) : ce n’est pas la même grandeur.',
    'La puissance, c’est « maintenant » ; l’énergie, c’est « au total ».',
  ),
  'phys.circuits': L(
    'Série ou dérivation : deux architectures, deux lois 🔌',
    ['Analyser un circuit électrique', 'Appliquer lois des tensions et des intensités'],
    ['Série : même intensité partout, les tensions s’additionnent', 'Dérivation : même tension, les intensités s’additionnent', 'Redessine le circuit au propre si besoin', 'Complète avec la loi d’Ohm'],
    'Croire que le courant « s’épuise » dans une lampe : l’intensité est identique en série.',
    'Série = un seul chemin ; dérivation = des embranchements.',
  ),
  'phys.waves': L(
    'Fréquence, période, longueur d’onde : le trio des ondes 🌊',
    ['Utiliser v = λ × f', 'Convertir période et fréquence'],
    ['f = 1/T (en hertz)', 'v = λ × f', 'T en secondes, λ en mètres', 'Son ≈ 340 m/s ; lumière ≈ 3 × 10⁸ m/s'],
    'Période (secondes) et fréquence (hertz) : des inverses, pas des synonymes.',
    'f = 1/T et T = 1/f : l’une monte, l’autre descend.',
  ),
  'phys.optics': L(
    'La lumière ne triche jamais : elle suit des lois précises 🔦',
    ['Appliquer les lois de la réflexion', 'Comprendre la réfraction'],
    ['Angle de réflexion = angle d’incidence', 'Réfraction : n₁ × sin(i₁) = n₂ × sin(i₂)', 'Mesure TOUJOURS les angles par rapport à la normale', 'Construis les rayons étape par étape'],
    'Mesurer les angles par rapport à la surface au lieu de la normale.',
    'La normale est la droite perpendiculaire à la surface, au point d’impact.',
  ),
  'phys.radioactivity': L(
    'La demi-vie : un hasard qui suit un calendrier très précis ☢️',
    ['Utiliser la demi-vie', 'Calculer une activité restante'],
    ['Après une demi-vie : il reste la moitié', 'Après n demi-vies : il reste (1/2)ⁿ', 'N(t) = N₀ × (1/2)^(t / t½)', 'Aucune action extérieure ne change la radioactivité'],
    'Croire qu’après 2 demi-vies tout a disparu : il reste encore 25 %.',
    'On divise par deux, puis par deux, puis par deux… jamais zéro.',
  ),
  'phys.conversion': L(
    'Convertir sans se tromper : la méthode bat le calcul mental 📐',
    ['Convertir entre unités', 'Utiliser un tableau de conversion'],
    ['Repère l’unité de départ et celle d’arrivée', 'Multiplie ou divise par le facteur de conversion', 'Volumes : 1 L = 1 dm³ ; 1 mL = 1 cm³', 'Vérifie l’ordre de grandeur du résultat'],
    'Surfaces et volumes : 1 m² = 10 000 cm², pas 100 cm².',
    'Demande-toi toujours : « mon résultat est-il raisonnable ? »',
  ),

  /* ------------------------------ Chimie ----------------------------- */
  'chim.atoms': L(
    'Protons, neutrons, électrons : la carte d’identité de l’atome ⚛️',
    ['Lire la notation ᴬ_Z X', 'Déterminer la composition d’un atome ou d’un ion'],
    ['Z = numéro atomique = nombre de protons', 'A = nombre de masse = protons + neutrons', 'Atome neutre : autant d’électrons que de protons', 'Ion : électrons gagnés (−) ou perdus (+)'],
    'Inverser A et Z : dans ᴬ_Z X, le grand A est EN HAUT.',
    'Z définit l’élément : même Z = même élément, quoi qu’il arrive.',
  ),
  'chim.mole': L(
    'La mole : la douzaine du chimiste, version 10²³ 🧪',
    ['Utiliser n = m / M', 'Relier quantité et nombre d’entités'],
    ['n = m / M (moles = masse / masse molaire)', 'N = n × N_A (nombre d’entités)', 'N_A ≈ 6,022 × 10²³ mol⁻¹', 'Masse en g, M en g/mol : vérifie les unités'],
    'Mélanger la masse de l’échantillon et la masse molaire.',
    'La mole est le pont entre l’invisible (atomes) et le visible (grammes).',
  ),
  'chim.molarMass': L(
    'Peser des molécules une par une, c’est possible ⚖️',
    ['Calculer une masse molaire', 'Utiliser la classification'],
    ['Lis la formule brute (ex. C₆H₁₂O₆)', 'Multiplie chaque M par le nombre d’atomes', 'Additionne le tout', 'Unité : g/mol (ou g·mol⁻¹)'],
    'Oublier l’indice : H₂O compte DEUX hydrogènes, pas un.',
    'Les classiques : C = 12, H = 1, O = 16, N = 14, Cl = 35,5 g/mol.',
  ),
  'chim.concentration': L(
    'Plus c’est concentré, plus c’est costaud — comme le sirop 🥤',
    ['Calculer C = n / V', 'Passer de mol/L à g/L'],
    ['C = n / V (en mol/L)', 'C_m = m / V (en g/L)', 'Lien : C_m = C × M', 'Le volume s’exprime en LITRES'],
    'Laisser le volume en mL : 250 mL = 0,250 L.',
    'mol/L se lit « moles par litre de SOLUTION ».',
  ),
  'chim.dilution': L(
    'Diluer : la même quantité de matière, plus de solvant 💧',
    ['Utiliser C₁V₁ = C₂V₂', 'Calculer un facteur de dilution'],
    ['La quantité de soluté ne change pas : C₁V₁ = C₂V₂', 'Facteur de dilution F = C₁/C₂ = V₂/V₁', 'Isole l’inconnue', 'Mêmes unités des deux côtés'],
    'Inverser mère et fille : c’est la solution CONCENTRÉE × le PETIT volume.',
    'Diluer 10 fois = 1 volume de solution mère + 9 volumes d’eau.',
  ),
  'chim.ph': L(
    'De 0 à 14 : l’échelle qui mesure l’acidité 🍋',
    ['Classer acide / neutre / basique', 'Relier pH et ions H₃O⁺'],
    ['pH < 7 : acide ; pH = 7 : neutre ; pH > 7 : basique', 'pH = −log[H₃O⁺]', 'Une unité de pH = un facteur 10 en concentration', 'Mesure : papier pH ou pH-mètre'],
    'pH 3 n’est pas « un peu plus acide » que pH 4 : c’est DIX fois plus acide.',
    'Petit pH = acide (citron) ; grand pH = basique (savon).',
  ),
  'chim.gas': L(
    'PV = nRT : quatre lettres pour décrire tous les gaz 💨',
    ['Appliquer la loi des gaz parfaits', 'Choisir les bonnes unités'],
    ['P en Pa, V en m³, T en kelvins', 'R = 8,314 J/(mol·K)', 'T(K) = T(°C) + 273,15', 'Isole la grandeur cherchée'],
    'Oublier de convertir °C en kelvins : l’erreur fatale.',
    '0 °C = 273 K ; une mole de gaz ≈ 22,4 L dans ces conditions.',
  ),
  'chim.molarVolume': L(
    'Une mole de gaz occupe toujours (à peu près) la même place 💨',
    ['Utiliser V = n × V_m', 'Connaître V_m selon les conditions'],
    ['V = n × V_m', 'V_m ≈ 22,4 L/mol à 0 °C et 1 atm', 'V_m ≈ 24 L/mol à température ambiante', 'n = V / V_m pour remonter à la quantité'],
    'Utiliser 22,4 L/mol quelle que soit la température.',
    'Le volume d’un gaz dépend du nombre de moles, presque pas de l’espèce.',
  ),
  'chim.stoechiometrie': L(
    'La recette exacte de la chimie : ni trop, ni trop peu ⚗️',
    ['Équilibrer une équation', 'Calculer des quantités de réactifs et produits'],
    ['Équilibre l’équation (conservation des atomes)', 'Lis les proportions dans les coefficients', 'Passe d’un nombre de moles à l’autre avec ces rapports', 'Convertis en masse si besoin (m = n × M)'],
    'Travailler avec une équation non équilibrée : tout devient faux.',
    'Les coefficients SONT la recette : 2 H₂ + O₂ → 2 H₂O.',
  ),

  /* ------------------------------ Français --------------------------- */
  'fr.conjugaison': L(
    'Chaque verbe a son caractère : apprends à les apprivoiser ✍️',
    ['Identifier temps, mode et personne', 'Conjuguer sans faute'],
    ['Repère l’infinitif et son groupe', 'Identifie le temps et la personne demandés', 'Rappelle la terminaison correspondante', 'Relis-toi : le sujet commande le verbe'],
    'Futur et conditionnel se ressemblent : « je chanterai » (futur) vs « je chanterais » (conditionnel).',
    'Prononce la phrase à voix haute : l’oreille attrape la moitié des fautes.',
  ),
  'fr.participe': L(
    '-é, -i, -u : petites terminaisons, gros pièges 😅',
    ['Former le participe passé', 'Savoir quand l’accorder'],
    ['1er groupe → -é (chanté)', '2e groupe → -i (fini)', '3e groupe → -u, -is, -it (pris, mis, écrit)', 'Avec être : accord avec le sujet'],
    'Confondre infinitif (-er) et participe passé (-é) : « j’ai mangé », pas « j’ai manger ».',
    'Remplace par « mordu » ou « vendu » : si ça sonne juste, c’est -é/-u.',
  ),
  'fr.passeCompose': L(
    'Être ou avoir ? Toute la question est là 🤔',
    ['Choisir le bon auxiliaire', 'Accorder correctement le participe passé'],
    ['La plupart des verbes → avoir', 'Verbes de mouvement/état et pronominaux → être', 'Avec être : accord avec le SUJET', 'Avec avoir : accord avec le COD placé AVANT'],
    '« Les fleurs que j’ai cueilli » : le COD est avant, donc « cueillies ».',
    'La liste « entrer, rester, sortir… » (les verbes de la maison d’être) se récite.',
  ),
  'fr.homophones': L(
    'Ils sonnent pareil mais ne s’écrivent pas pareil 🙉',
    ['Distinguer a/à, ou/où, et/est, son/sont…', 'Appliquer les astuces de remplacement'],
    ['a ou à ? Remplace par « avait »', 'ou ou où ? Remplace par « ou bien »', 'et ou est ? Remplace par « était »', 'son ou sont ? Remplace par « mon » ou « étaient »'],
    'ses (les siens) ≠ ces (ceux-là) : possessif contre démonstratif.',
    'Chaque homophone a SON test de remplacement : retiens-le comme un mot de passe.',
  ),
  'fr.accords': L(
    'La chaîne des accords : tout se tient dans la phrase 🔗',
    ['Accorder verbe et sujet', 'Accorder adjectifs et participes'],
    ['Trouve le verbe, puis pose « qui est-ce qui… ? »', 'Accorde le verbe avec son sujet (personne + nombre)', 'Accorde l’adjectif en genre et en nombre avec le nom', 'Méfie-toi du sujet éloigné du verbe'],
    '« Le groupe de musiciens joue » : c’est LE GROUPE qui joue (singulier).',
    'En cas de doute : cherche le verbe, remonte au sujet, redescends en accordant.',
  ),
  'fr.regles': L(
    'Derrière chaque terminaison se cache une règle : retrouvons-la 📜',
    ['Connaître les règles par groupe', 'Choisir la bonne terminaison'],
    ['1er groupe (-er) : régulier, sauf aller', '2e groupe (-ir → -issant) : régulier', '3e groupe : les irréguliers à connaître', 'La terminaison dépend du temps ET du groupe'],
    'Aller se conjugue au 1er groupe… mais comme un verbe du 3e (je vais).',
    'Apprends les terminaisons par blocs : je/tu/il, puis nous/vous/ils.',
  ),
  'fr.natures': L(
    'Chaque mot a une carte d’identité et un métier dans la phrase 🎭',
    ['Identifier les natures de mots', 'Distinguer nature et fonction'],
    ['Nature = ce qu’est le mot (nom, verbe, adjectif…)', 'Fonction = son rôle (sujet, COD, complément…)', 'Teste par effacement ou remplacement', 'Le COD répond à « verbe + quoi / qui ? »'],
    'La nature est permanente ; la fonction dépend de la phrase.',
    'Nature = passeport ; fonction = métier dans la phrase du jour.',
  ),
  'fr.figures': L(
    'Métaphore, hyperbole, personnification : la boîte à effets 🎨',
    ['Reconnaître les figures de style', 'Analyser leur effet'],
    ['Comparaison : outil grammatical (comme, tel que…)', 'Métaphore : comparaison SANS outil', 'Hyperbole : exagération', 'Personnification : traits humains à un non-humain'],
    'Sans mot de liaison, ce n’est plus une comparaison mais une métaphore.',
    'Cite TOUJOURS l’effet produit : c’est là que sont les points.',
  ),
  'fr.versification': L(
    'Alexandrins, hémistiches, rimes : la musique du vers 🎵',
    ['Compter les syllabes', 'Identifier les types de rimes'],
    ['Compte les syllabes (attention au e muet)', 'Alexandrin = 12, décasyllabe = 10, octosyllabe = 8', 'Rimes plates AABB, croisées ABAB, embrassées ABBA', 'Repère la césure au milieu du vers'],
    'Le e muet compte devant consonne, s’élide devant voyelle.',
    'Lis le poème à voix haute en tapant les syllabes : ça ne trompe pas.',
  ),
  'fr.mouvements': L(
    'Chaque siècle a sa tribu littéraire 📚',
    ['Dater les grands mouvements', 'Relier mouvement, valeurs et auteurs'],
    ['Construis la frise : Renaissance → Baroque → Classicisme → Lumières → Romantisme → Réalisme → Symbolisme → Absurde', 'Retiens 2 valeurs clés par mouvement', 'Associe 2 auteurs phares à chacun', 'Replace l’œuvre dans son contexte'],
    'Romantisme ≠ « romantique » : c’est l’exaltation du moi et des émotions.',
    'Un mouvement = une période + des valeurs + des auteurs : le trio gagnant.',
  ),
  'fr.oeuvres': L(
    'Auteurs et chefs-d’œuvre : le panthéon des lettres 🏛️',
    ['Associer auteurs et œuvres', 'Les situer dans leur siècle'],
    ['Regroupe par siècle et par mouvement', 'Retiens une œuvre majeure par auteur', 'Relie l’œuvre à son contexte historique', 'Fabrique-toi des fiches mémoire'],
    'Les titres proches cachent des pièges : lis-les jusqu’au bout.',
    'Un auteur = un siècle + un mouvement + une œuvre : l’ancrage à trois points.',
  ),
  'fr.genres': L(
    'Roman, théâtre, poésie : chaque genre joue sa partition 🎭',
    ['Reconnaître les genres littéraires', 'Connaître leurs caractéristiques'],
    ['Théâtre : répliques, didascalies, destinée à la scène', 'Poésie : vers ou prose, rythme et images', 'Roman : récit, narrateur, personnages', 'Argumentatif : thèse, arguments, exemples'],
    'Le genre ne dépend pas de la forme : un poème en prose reste de la poésie.',
    'Demande-toi : « ce texte est fait pour être joué, dit ou raconté ? »',
  ),
  'fr.registres': L(
    'Tragique, comique, ironique : la même histoire, toutes les musiques 🎼',
    ['Identifier le registre d’un texte', 'Justifier avec des indices'],
    ['Tragique : fatalité, mort, impasse', 'Comique : rire, quiproquo, exagération', 'Lyrique : émotions du moi', 'Pathétique : suscite la compassion'],
    'Lyrique (j’exprime) ≠ pathétique (tu pleures) : l’effet visé diffère.',
    'Le registre, c’est l’émotion que le texte veut provoquer chez toi.',
  ),
  'fr.synonymes': L(
    'Un mot, dix nuances : enrichis ta palette 🖌️',
    ['Trouver des synonymes précis', 'Respecter les nuances'],
    ['Identifie le sens exact dans le contexte', 'Vérifie le niveau de langue (soutenu/courant/familier)', 'Teste le remplacement dans la phrase', 'Chasse les faux synonymes'],
    '« Maison » et « demeure » ne passent pas partout l’un pour l’autre.',
    'Un bon synonyme garde le sens, le registre ET la nuance.',
  ),
  'fr.antonymes': L(
    'Chaque mot a son contraire ⚔️',
    ['Former des antonymes', 'Utiliser les préfixes négatifs'],
    ['Antonymes lexicaux : chaud / froid', 'Antonymes par préfixe : heureux / malheureux', 'Garde la même nature grammaticale', 'Valide en contexte'],
    'Le contraire de « gentil » est « méchant », pas « laid ».',
    'in-, im-, mal-, dé- : les préfixes sont des fabriques à contraires.',
  ),
  'fr.familles': L(
    'Les mots poussent en famille 🌳',
    ['Reconstituer une famille de mots', 'Identifier le radical'],
    ['Trouve le radical commun', 'Repère préfixes et suffixes', 'Liste les dérivés (terre → terrain, territoire, atterrir…)', 'Attention aux familles par étymologie (œil → oculaire)'],
    'Radical modifié : « cheval » donne « chevalier » mais aussi « cavalerie ».',
    'Radical + préfixe (avant) + suffixe (après) : des Lego de lettres.',
  ),
  'fr.dictee': L(
    'Le zéro faute, ça se prépare comme un sport ✏️',
    ['Écrire sans faute d’orthographe', 'Mettre en place une relecture efficace'],
    ['Première lecture : comprends le sens global', 'Pendant l’écriture : écoute les accords', 'Relecture 1 : les verbes et leurs sujets', 'Relecture 2 : pluriels, puis homophones'],
    'Les chaînes d’accord complexes : « les belles robes rouges que j’ai achetées ».',
    'La relecture en trois passes (verbes → pluriels → homophones) sauve des points.',
  ),

  /* ------------------------------ Anglais ---------------------------- */
  'en.irregular': L(
    'Ces verbes qui refusent les règles : apprivoise-les 🇬🇧',
    ['Connaître base / prétérit / participe passé', 'Les employer au bon temps'],
    ['Apprends par triplettes (go / went / gone)', 'Regroupe par familles de sons (buy / bought / brought)', 'Révise 5 verbes par jour, pas 50', 'Fabrique une phrase avec chaque verbe'],
    '« eated » n’existe pas : eat / ate / eaten.',
    'Invente des phrases absurdes : le cerveau retient ce qui le fait rire.',
  ),
  'en.regular': L(
    'Le -ed fait (presque) tout le travail 🔤',
    ['Former prétérit et participe passé', 'Prononcer correctement -ed'],
    ['Base + -ed pour le prétérit', 'Verbe en -e : ajoute seulement -d', 'Consonne + y : y devient i (study → studied)', 'Consonne doublée après voyelle courte (stop → stopped)'],
    'stop → stopped avec DEUX p ; study → studied, pas studyed.',
    '-ed se prononce /t/, /d/ ou /ɪd/ — jamais /ɛd/.',
  ),
  'en.vocab': L(
    'Un mot retenu est un mot placé en contexte 🗣️',
    ['Mémoriser le vocabulaire par thème', 'Éviter les contresens'],
    ['Apprends par champs lexicaux', 'Retiens toujours un mot DANS une phrase', 'Note la prononciation en même temps', 'Réactive : revois les listes à J+1, J+3, J+7'],
    '« library » = bibliothèque ; la librairie, c’est « bookshop ».',
    'Lis tes listes à voix haute : entendre aide autant que voir.',
  ),
  'en.phrasal': L(
    'Verbe + particule = un sens tout neuf 🧩',
    ['Comprendre les phrasal verbs', 'Choisir la bonne particule'],
    ['Le sens est souvent IDIOMATIQUE (give up = renoncer)', 'up, down, on, off changent tout', 'Retiens le bloc verbe + particule ensemble', 'Apprends avec une phrase d’exemple'],
    'look for (chercher) ≠ look after (s’occuper de) : même verbe, autres mondes.',
    'Visualise la particule au sens propre : « up » achève, « back » revient.',
  ),
  'en.falseFriends': L(
    'Ils ressemblent au français… et disent tout autre chose 🎭',
    ['Repérer les faux amis', 'Connaître leur vrai sens'],
    ['Un mot trop familier ? Méfiance', 'actually = en fait (pas « actuellement »)', 'vérifie toujours dans le contexte', 'tiens une liste personnelle de faux amis'],
    '« eventually » = finalement, pas « éventuellement ».',
    'Les classiques : actually, eventually, library, to bless, coin, injury.',
  ),
  'en.grammar': L(
    'Present perfect ou prétérit ? LA grande question anglaise ⏳',
    ['Choisir le temps qui convient', 'Construire des phrases correctes'],
    ['Repère les marqueurs de temps', 'Prétérit : passé terminé et daté (yesterday)', 'Present perfect : passé lié au présent (just, already, since)', 'Ordre des mots : sujet – verbe – complément'],
    'Depuis / pendant → present perfect, jamais prétérit avec since.',
    'Yesterday, last… → prétérit ; just, ever, since, for → perfect.',
  ),

  /* ------------------------------ Espagnol --------------------------- */
  'es.conjugaison': L(
    '-ar, -er, -ir : trois groupes, toute une langue 🇪🇸',
    ['Conjuguer les verbes réguliers', 'Repérer les diphtongues'],
    ['Identifie le groupe du verbe', 'Retire la terminaison : tu obtiens le radical', 'Ajoute les terminaisons du temps voulu', 'Attention aux diphtongues (e→ue, o→ue)'],
    'pensar → pienso (diphtongue), pas « penso ».',
    'Les verbes à diphtongue le sont à TOUTES les personnes sauf nous/vous.',
  ),
  'es.irregular': L(
    'Ser, estar, ir, tener : les VIP de l’espagnol ⭐',
    ['Connaître les irréguliers fréquents', 'Distinguer ser et estar'],
    ['Apprends ser, estar, ir, avoir (haber) en priorité', 'ser = essence, identité ; estar = état, lieu', 'Note les radicaux spéciaux (tener → tengo, ie…)', 'Pratique en contexte, pas en listes isolées'],
    '« Estoy aburrido » (je m’ennuie) ≠ « Soy aburrido » (je suis ennuyeux).',
    'ser = permanent, estar = temporaire ou localisé — le plus souvent.',
  ),
  'es.vocab': L(
    'Mot à mot, toute la langue arrive 🌞',
    ['Mémoriser le vocabulaire thématique', 'Éviter les faux amis'],
    ['Apprends par thèmes', 'Retiens le nom AVEC son article (el, la)', 'Mémorise dans une phrase', 'Liste les faux amis franco-espagnols'],
    '« embarazada » = enceinte, PAS embarrassée.',
    'El ou la devant chaque nom : le genre s’apprend avec le mot, jamais après.',
  ),

  /* --------------------------- Histoire-Géographie --------------------- */
  'hg.histoire.dates': L(
    'Les dates, c’est la colonne vertébrale de l’histoire 🦴',
    ['Mémoriser les dates clés', 'Les situer dans leur siècle'],
    ['Regroupe les dates par thème ou période', 'Construis une frise mentale', 'Associe chaque date à une image forte', 'Révise à intervalles réguliers'],
    'Siècle et année : 1789, c’est le XVIIIe siècle (retire les deux derniers chiffres, +1).',
    'Une date s’apprend avec son événement ET sa conséquence : jamais seule.',
  ),
  'hg.histoire.evenements': L(
    'Derrière chaque date, une histoire à raconter 📜',
    ['Raconter un événement', 'En dégager causes et conséquences'],
    ['Qui ? Quoi ? Où ? Quand ?', 'Identifie les causes lointaines et immédiates', 'Décris le déroulement en quelques étapes', 'Conclus sur les conséquences'],
    'Réduire l’événement à sa date : le récit rapporte les points.',
    'Explique-le comme à un ami : si ça coule, tu maîtrises.',
  ),
  'hg.histoire.acteurs': L(
    'L’histoire s’écrit aussi avec des visages 👤',
    ['Identifier les acteurs historiques', 'Relier chacun à son action'],
    ['Nom + rôle + dates de vie', 'Replace l’acteur dans son contexte', 'Retiens UNE action majeure par personnage', 'Attention aux homonymes et aux dynasties'],
    'Napoléon Ier (Empire, 1804) ≠ Napoléon III (Second Empire, 1852).',
    'Un acteur = une image + une action : l’ancrage visuel fonctionne.',
  ),
  'hg.histoire.chronologie': L(
    'Remettre les événements dans l’ordre : le réflexe de l’historien ⏱️',
    ['Construire une chronologie', 'Repérer enchaînements et ruptures'],
    ['Liste les événements avec leurs dates', 'Place-les sur une frise', 'Cherche les liens de cause à effet', 'Distingue temps court et temps long'],
    'Deux événements proches ne sont pas forcément liés : vérifie la causalité.',
    'La frise révèle ce que les listes cachent : les accélérations et les creux.',
  ),
  'hg.geo.repères': L(
    'Océans, montagnes, fleuves : la carte du monde dans la tête 🗺️',
    ['Localiser les repères majeurs', 'Les nommer précisément'],
    ['Travaille continent par continent', 'Repère les grands ensembles physiques', 'Maîtrise le vocabulaire (détroit, isthme, delta…)', 'Reproduis la carte à main levée'],
    'Mer ≠ océan, détroit ≠ canal : chaque mot a son échelle.',
    'Le fond de carte vierge est ton meilleur professeur.',
  ),
  'hg.geo.capitales': L(
    'Les capitales du monde : ton passeport mental 🛂',
    ['Associer pays et capitale', 'Les localiser'],
    ['Apprends par continent', 'Fabrique des paires pays-capitale', 'Révise avec des flashcards', 'Place chaque capitale sur une carte'],
    'La capitale de l’Australie est Canberra — ni Sydney, ni Melbourne.',
    'Commence par les capitales-surprises : elles se retiennent mieux.',
  ),
  'hg.geo.vraifaux': L(
    'Vrai ou faux ? La géographie adore les pièges 🌍',
    ['Valider ou réfuter une affirmation', 'Mobiliser ses repères'],
    ['Lis l’affirmation mot à mot', 'Mobilise le repère concerné', 'Traque les termes absolus (toujours, jamais, tous)', 'Justifie ta réponse par un exemple'],
    'Une affirmation très tranchée est presque toujours fausse en géographie.',
    '« Toujours » et « jamais » sont des drapeaux rouges.',
  ),

  /* ------------------------------ Philosophie ------------------------- */
  'philo.concepts': L(
    'Liberté, bonheur, vérité : les grandes questions t’attendent 👁️',
    ['Définir une notion avec précision', 'La mobiliser dans une argumentation'],
    ['Pars du sens courant du mot', 'Problématise : où est la tension ?', 'Confronte avec un auteur ou une thèse', 'Formule une définition travaillée'],
    'Définir par un simple synonyme : la philo exige des distinctions.',
    'Chaque notion cache un problème : c’est lui qu’on attend.',
  ),
  'philo.auteurs': L(
    'Platon, Kant, Nietzsche : ta dream team de la réflexion 🏛️',
    ['Associer un auteur à sa thèse', 'Le mobiliser à bon escient'],
    ['Auteur + notion clé + œuvre majeure', 'Comprends LA thèse centrale', 'Retiens une citation courte et sûre', 'Situe-le dans son courant'],
    'Citer un nom sans expliquer sa thèse : ça ne rapporte rien.',
    'Un auteur = une thèse + une citation + une œuvre.',
  ),
  'philo.doctrines': L(
    'Stoïcisme, existentialisme, utilitarisme : les grandes écoles 🎓',
    ['Identifier une doctrine', 'Opposer des doctrines entre elles'],
    ['Nom + fondateur + principe central', 'Relie la doctrine à ses notions clés', 'Oppose deux doctrines sur un même sujet', 'Illustre par un exemple concret'],
    'Une doctrine est un système cohérent : pas une simple opinion.',
    'Deux doctrines opposées sur un même thème = un plan de dissertation tout trouvé.',
  ),

  /* -------------------------------- SVT -------------------------------- */
  'svt.termes': L(
    'Cellule, gène, enzyme : la boîte à outils du vivant 🧬',
    ['Maîtriser le vocabulaire scientifique', 'L’employer avec précision'],
    ['Apprends la définition exacte', 'Relie chaque terme à son contexte', 'Fabrique un schéma légendé', 'Distingue les termes proches'],
    'ADN, gène, chromosome : trois mots, trois échelles — ne les mélange pas.',
    'Un terme = une définition + un schéma.',
  ),
  'svt.processus': L(
    'Le vivant est une mécanique bien huilée ⚙️',
    ['Décrire un mécanisme biologique', 'Enchaîner les étapes logiquement'],
    ['Identifie les entrées et les sorties', 'Ordonne les étapes', 'Schématise avec des flèches', 'Utilise le vocabulaire précis'],
    'Décrire sans relier : chaque étape doit expliquer la suivante.',
    'Un bon schéma légendé vaut mieux qu’un long paragraphe.',
  ),

  /* -------------------------------- SES -------------------------------- */
  'ses.concepts': L(
    'Offre, demande, PIB, socialisation : décrypter la société 📈',
    ['Définir une notion de SES', 'La mobiliser dans une analyse'],
    ['Donne la définition exacte du cours', 'Distingue des notions voisines', 'Illustre par un exemple ou une donnée', 'Relie à un auteur quand c’est pertinent'],
    'Revenu ≠ patrimoine ; croissance ≠ développement : les paires piégeuses.',
    'Chaque notion de SES a un piège de définition : apprends-la au mot près.',
  ),
  'ses.auteurs': L(
    'Smith, Keynes, Durkheim : les penseurs de la société 🧠',
    ['Associer un auteur à sa théorie', 'L’utiliser dans un raisonnement'],
    ['Auteur + notion clé + œuvre', 'Comprends la thèse en une phrase', 'Situe-le dans son courant', 'Cite-le précisément, jamais au hasard'],
    'Smith (libéralisme, main invisible) ≠ Keynes (intervention de l’État).',
    'Oppose les auteurs deux à deux : le contraste aide à mémoriser.',
  ),
  'ses.calculs': L(
    'Taux de variation, coefficients, indices : la caisse à outils des SES 🧮',
    ['Calculer un taux de variation', 'Manipuler indices et coefficients'],
    ['Taux = (valeur finale − valeur initiale) / valeur initiale × 100', 'Coefficient multiplicateur = 1 + t/100', 'Un indice se lit par rapport à sa base 100', 'Vérifie l’ordre de grandeur'],
    'Points de pourcentage ≠ pourcentage : +2 points sur 10 % donnent 12 %.',
    'Demande-toi toujours : « par rapport à QUOI ? »',
  ),

  /* -------------------------------- NSI -------------------------------- */
  'nsi.termes': L(
    'Bit, octet, algorithme : parle couramment le numérique 💻',
    ['Maîtriser le vocabulaire informatique', 'Distinguer les notions proches'],
    ['Apprends la définition exacte', 'Associe chaque terme à un exemple concret', 'Distingue bit (0/1) et octet (8 bits)', 'Révise par flashcards'],
    '1 octet = 8 bits — pas 10, pas 16.',
    'Un mot, une définition, un exemple : le trio du développeur.',
  ),
  'nsi.complexite': L(
    'O(n), O(n²), O(log n) : la course des algorithmes 🏁',
    ['Déterminer une complexité', 'Comparer des efficacités'],
    ['Compte les opérations en fonction de n', 'Boucles imbriquées : les complexités se MULTIPLIENT', 'O(1) < O(log n) < O(n) < O(n²) < O(2ⁿ)', 'Teste mentalement avec un grand n'],
    'Deux boucles imbriquées ne s’additionnent pas : elles se multiplient.',
    'Chaque boucle imbriquée ajoute une puissance de n.',
  ),
  'nsi.logique': L(
    'ET, OU, NON : la logique qui fait tourner les machines 🔀',
    ['Appliquer les opérateurs booléens', 'Simplifier une expression'],
    ['ET : vrai seulement si TOUT est vrai', 'OU : vrai si AU MOINS UN est vrai', 'NON : inverse la valeur', 'Au doute : table de vérité'],
    'En logique, le « OU » est INCLUSIF (l’un, l’autre, ou les deux).',
    'Teste les 4 combinaisons dans ta tête : 00, 01, 10, 11.',
  ),
  'nsi.tableverite': L(
    'La table de vérité : l’outil de vérification ultime 📋',
    ['Construire une table de vérité', 'La lire sans erreur'],
    ['n entrées → 2ⁿ lignes', 'Énumère les combinaisons dans l’ordre binaire', 'Calcule la sortie pour chaque ligne', 'Relis ligne par ligne'],
    'Oublier une combinaison : 2 entrées = toujours 4 lignes.',
    'Remplis toujours dans l’ordre 00, 01, 10, 11 : aucun oubli possible.',
  ),
  'nsi.bases': L(
    'Binaire, décimal, hexadécimal : les langues de la machine 🔢',
    ['Convertir entre les bases', 'Compter en binaire'],
    ['Décimal → binaire : divisions successives par 2', 'Binaire → décimal : somme des puissances de 2', 'Hexadécimal : paquets de 4 bits', 'Vérifie en reconvertissant dans l’autre sens'],
    '1011 = 8 + 0 + 2 + 1 = 11 (en lisant les bits de droite à gauche).',
    'Puissances de 2 : 1, 2, 4, 8, 16, 32, 64, 128 — à connaître par cœur.',
  ),
  'nsi.couleurs': L(
    'RVB : trois nombres, des millions de couleurs 🎨',
    ['Comprendre le codage RVB', 'Estimer la taille d’une image'],
    ['R, V, B : trois composantes de 0 à 255', 'Chaque composante tient sur 1 octet', 'Un pixel = 3 octets', 'Taille = largeur × hauteur × 3 octets'],
    'RVB(0,0,0) = NOIR ; RVB(255,255,255) = BLANC.',
    '0 = éteint, 255 = à fond : comme des gradateurs de lumière.',
  ),
  'nsi.sql': L(
    'SELECT * FROM connaissances 🗃️',
    ['Écrire une requête simple', 'Comprendre les tables relationnelles'],
    ['SELECT : les colonnes voulues ; FROM : la table', 'WHERE : filtre les lignes', 'ORDER BY : trie le résultat', 'JOIN : croise deux tables sur une clé'],
    'Oublier le WHERE et récupérer toute la table.',
    'Lis ta requête en français : « Sélectionne ceci, dans cette table, où… »',
  ),
  'nsi.python': L(
    'print("Bonjour NSI") 🐍',
    ['Lire un programme Python', 'Prédire son affichage'],
    ['Suis les variables ligne par ligne', 'L’indentation délimite les blocs', 'range(n) : de 0 à n−1', '= affecte, == compare'],
    'range(5) s’arrête AVANT 5 : 0, 1, 2, 3, 4.',
    'Joue à l’ordinateur : exécute chaque ligne dans ta tête, crayon en main.',
  ),

  /* ------------------- Banques méthodologiques (épreuves) -------------- */
  'bank:francais-troisieme-methode-brevet': L(
    'Le brevet de français : ton premier grand galop d’essai 🎓',
    ['Maîtriser les exercices du brevet', 'Gérer son temps d’épreuve'],
    ['Lis le texte deux fois, crayon en main', 'Réponds en citant le texte entre guillemets', 'Grammaire : identifie avant d’analyser', 'Rédaction : brouillon structuré, puis recopie soignée'],
    'Répondre sans citer le texte : la citation justifiée rapporte les points.',
    'Garde un œil sur la montre : chaque exercice a son budget temps.',
  ),
  'bank:francais-troisieme-methode-redaction': L(
    'Une bonne rédaction : des idées, un ordre, des exemples ✍️',
    ['Structurer un paragraphe', 'Enchaîner les idées avec fluidité'],
    ['Introduction : amorce + présentation du sujet', 'Paragraphe = une idée + un argument + un exemple', 'Connecteurs : d’abord, ensuite, cependant, enfin', 'Conclusion : bilan + ouverture'],
    'Empiler les idées sans les relier : chaque paragraphe annonce le suivant.',
    'Un paragraphe = une seule idée. Pas deux, pas zéro.',
  ),
  'bank:francais-seconde-methode-commentaire': L(
    'Le commentaire : faire parler le texte au lieu de le raconter 📖',
    ['Trouver des axes d’analyse', 'Citer et analyser sans paraphraser'],
    ['Lectures multiples : sens, forme, effets', 'Dégage 2 ou 3 axes de lecture', 'Sous-partie = citation + procédé + effet produit', 'Introduction : auteur, œuvre, situation, problématique, plan'],
    'La paraphrase : redire le texte n’est PAS l’analyser.',
    'Demande-toi « comment ? » et « pourquoi ? », jamais seulement « quoi ? ».',
  ),
  'bank:francais-seconde-methode-dissertation': L(
    'La dissertation : une pensée qui se construit brique par brique 🏗️',
    ['Problématiser un sujet', 'Construire un plan équilibré'],
    ['Analyse chaque mot du sujet', 'Trouve la tension → problématique', 'Plan : oui / non / dépassement (ou thématique)', 'Un argument = un exemple littéraire précis'],
    'Réciter le cours sans répondre à LA question posée.',
    'La problématique est une question dont deux réponses se défendent.',
  ),
  'bank:francais-premiere-methode-contraction': L(
    'Condenser sans trahir : tout l’art de la contraction 🗜️',
    ['Contracter un texte fidèlement', 'Respecter le nombre de mots'],
    ['Repère la thèse et le fil argumentatif', 'Suis la progression de l’auteur', 'Garde les arguments, coupe les exemples', 'Compte les mots (± 10 %) et ajuste'],
    'Donner ton avis : la contraction n’est pas un commentaire.',
    'Ta contraction doit être le miroir réduit du texte : même ordre, même thèse.',
  ),
  'bank:francais-premiere-methode-oral': L(
    'L’oral de français : vingt minutes pour convaincre 🎤',
    ['Présenter une analyse linéaire', 'Réussir l’entretien'],
    ['Introduction : auteur, œuvre, contexte, problématique, mouvements', 'Explique en suivant le texte, citation à l’appui', 'Conclusion : bilan + ouverture', 'Entretien : réponds posément, appuie-toi sur tes lectures'],
    'Lire ses notes sans jamais regarder l’examinateur.',
    'Répète debout, à voix haute, chronométré : comme le jour J.',
  ),
  'bank:philosophie-terminale-methode-dissertation': L(
    'La dissertation de philo : penser par écrit, pas réciter 🦉',
    ['Problématiser un sujet philosophique', 'Construire un plan dialectique'],
    ['Analyse les termes du sujet un par un', 'Fais émerger le problème (la tension)', 'Thèse / antithèse / dépassement', 'Chaque argument s’appuie sur un auteur ET un exemple'],
    'Juxtaposer des opinions sans transitions ni références.',
    'Le problème prend la forme : « Si A, alors comment B ? »',
  ),
  'bank:philosophie-terminale-methode-explication': L(
    'L’explication de texte : dérouler le fil de la pensée 🧵',
    ['Dégager thèse et structure', 'Expliquer les concepts du texte'],
    ['Introduction : thème, thèse, problème, structure', 'Suis le mouvement du texte, pas ton cours', 'Explique les notions telles que l’auteur les emploie', 'N’ajoute pas de connaissances plaquées'],
    'La paraphrase ou la récitation : le texte seul est ton objet.',
    'Expliquer = rendre explicite ce que le texte dit implicitement.',
  ),
  'bank:philosophie-terminale-methode-problematique': L(
    'L’art de la problématique : faire jaillir LA question ❓',
    ['Passer du sujet au problème', 'Formuler une problématique nette'],
    ['Identifie la réponse évidente (l’opinion commune)', 'Trouve ce qui lui résiste (objection, paradoxe)', 'Formule la tension sous forme de question', 'La problématique guidera tout ton plan'],
    '« Qu’est-ce que X ? » est une demande de définition, pas une problématique.',
    'Une bonne problématique oppose deux réponses également défendables.',
  ),
  'bank:ses-terminale-methode-dissertation': L(
    'La dissertation de SES : des arguments armés de données 📊',
    ['Problématiser un sujet de SES', 'Mobiliser des connaissances précises'],
    ['Introduction : accroche, définitions, problématique, plan', 'Paragraphe = argument + mécanisme + donnée ou auteur', 'Croise regards économique et sociologique', 'Conclusion : bilan + ouverture'],
    'Réciter le cours sans répondre à la problématique.',
    'Chaque argument appelle un exemple chiffré ou un auteur : jamais seul.',
  ),
  'bank:anglais-premiere-methode-ecrit': L(
    'Écrire en anglais : clair, riche, structuré 🇬🇧',
    ['Structurer un essai', 'Enrichir ta langue'],
    ['Introduction : reformule le sujet, annonce le plan', 'Paragraphe : idée + argument + exemple', 'Connecteurs : however, moreover, therefore', 'Relecture : -s de la 3e personne, temps, orthographe'],
    'Traduire mot à mot depuis le français : pense en anglais.',
    'Simple mais correct bat toujours compliqué mais faux.',
  ),
  'bank:anglais-terminale-methode-oral': L(
    'L’oral d’anglais : la fluidité avant la perfection 🗣️',
    ['Tenir un propos continu', 'Interagir avec l’examinateur'],
    ['Prépare un plan serré : 3 idées maximum', 'Parle lentement, articule', 'Connecteurs : first, then, actually, to conclude', 'Écoute la question AVANT de répondre'],
    'Bloquer sur un mot oublié : paraphrase et avance.',
    'Enregistre-toi et réécoute : les tics de langage disparaissent vite.',
  ),
  'bank:histoire-geographie-seconde-methode-croquis': L(
    'Le croquis : la géographie qui se dessine 🗺️',
    ['Construire une légende organisée', 'Représenter des informations'],
    ['Liste les informations à représenter', 'Regroupe-les en 2 ou 3 parties de légende', 'Choisis des figurés cohérents (couleurs, flèches, aplats)', 'N’oublie ni le titre ni la nomenclature'],
    'Des couleurs décoratives sans signification dans la légende.',
    'La légende d’abord, le coloriage ensuite : c’est le squelette du croquis.',
  ),
  'bank:histoire-geographie-seconde-methode-document': L(
    'Faire parler un document comme un historien 📄',
    ['Présenter un document', 'L’analyser avec recul critique'],
    ['Présente : nature, auteur, date, contexte', 'Cite précisément le document', 'Interprète : que révèle-t-il ?', 'Garde une distance critique (point de vue de l’auteur)'],
    'Paraphraser le document au lieu de l’interpréter.',
    'Toute citation appelle une explication : jamais l’une sans l’autre.',
  ),
  'bank:histoire-geographie-troisieme-emc-republique': L(
    'La République française : des valeurs, des symboles, des institutions 🇫🇷',
    ['Connaître les principes républicains', 'Comprendre leur histoire'],
    ['Liberté, égalité, fraternité : leur sens concret', 'Symboles : drapeau, Marianne, Marseillaise, 14 juillet', 'Repère les grandes lois (1881-1882, 1905, 1944…)', 'Distingue République et démocratie'],
    'Confondre les cinq Républiques : la Ve date de 1958.',
    'Chaque symbole a une histoire : apprends-les en binômes date + sens.',
  ),
  'bank:histoire-geographie-troisieme-emc-citoyennete': L(
    'Être citoyen : des droits, des devoirs, des engagements 🤝',
    ['Définir la citoyenneté', 'Identifier les formes d’engagement'],
    ['Distingue nationalité et citoyenneté', 'Droits civils, politiques, sociaux : les trois générations', 'Devoirs : impôts, défense, école…', 'Engagements : vote, associations, bénévolat'],
    'Réduire la citoyenneté au seul vote.',
    'Citoyen = droits + devoirs + participation à la vie de la cité.',
  ),
  'bank:physique-chimie-premiere-chimie-organique': L(
    'La chimie du carbone : celle du vivant et du quotidien 🧪',
    ['Identifier les groupes caractéristiques', 'Nommer des molécules organiques'],
    ['Repère la chaîne carbonée', 'Identifie le groupe caractéristique (-OH, -C=O, -COOH…)', 'Nomme selon la nomenclature officielle', 'Relie le groupe aux propriétés de la molécule'],
    'Confondre alcool (-OH) et acide carboxylique (-COOH).',
    'Le groupe caractéristique est la carte d’identité de la molécule.',
  ),
  'bank:physique-chimie-premiere-chimie-oxydoreduction': L(
    'Donner et capter des électrons : la danse de l’oxydoréduction ⚡',
    ['Identifier oxydant et réducteur', 'Écrire les demi-équations'],
    ['Oxydation = PERTE d’électrons', 'Réduction = GAIN d’électrons', 'L’oxydant capte, le réducteur cède', 'Équilibre chaque demi-équation (atomes puis charges)'],
    'Inverser oxydant et réducteur : l’oxydant est celui qui PREND.',
    '« Oxydant = voleur d’électrons » : l’image ne s’oublie plus.',
  ),
};

/* ------------------------------------------------------------------ */
/*  Fiches de repli par matière                                        */
/* ------------------------------------------------------------------ */

/**
 * Fiche générique par matière : garantit qu'une leçon reste pertinente même
 * pour une famille de questions qui n'aurait pas encore sa fiche dédiée.
 */
export const SUBJECT_LESSONS: Record<SubjectId, LessonSeed> = {
  mathematiques: L(
    'Les maths récompensent la méthode : un pas à la fois, et tout s’éclaire 📐',
    ['Comprendre la notion du jour', 'Appliquer la méthode sans erreur', 'Vérifier chaque résultat'],
    ['Lis l’énoncé et repère les données utiles', 'Choisis la formule ou la propriété adaptée', 'Calcule étape par étape, sans sauter de ligne', 'Vérifie la cohérence du résultat'],
    'Se précipiter sur le calcul sans avoir compris ce que cherche la question.',
    'Un résultat se vérifie toujours : ordre de grandeur, unités, signe.',
  ),
  francais: L(
    'Le français, c’est de la logique autant que de la sensibilité ✒️',
    ['Maîtriser la notion étudiée', 'Justifier avec des exemples précis'],
    ['Lis attentivement la consigne et le support', 'Identifie la notion en jeu', 'Applique la règle ou le procédé', 'Justifie toujours par un exemple'],
    'Répondre « au feeling » sans revenir au texte ou à la règle.',
    'La bonne réponse s’appuie toujours sur un indice précis.',
  ),
  'physique-chimie': L(
    'Observer, mesurer, comprendre : la démarche scientifique en action 🔬',
    ['Mobiliser la bonne formule', 'Travailler avec des unités cohérentes'],
    ['Identifie les données et l’inconnue', 'Choisis la relation adaptée', 'Convertis toutes les unités AVANT de calculer', 'Écris le résultat avec son unité'],
    'Calculer avec des unités mélangées : le résultat devient absurde.',
    'Un calcul juste sans unité est un calcul à moitié faux.',
  ),
  svt: L(
    'Le vivant s’observe et s’explique : rigueur et curiosité 🧬',
    ['Maîtriser le vocabulaire scientifique', 'Relier les mécanismes entre eux'],
    ['Lis précisément la question', 'Mobilise les notions exactes du cours', 'Ordonne ton raisonnement (cause → conséquence)', 'Illustre par un exemple ou un schéma'],
    'Employer un terme vague là où le mot scientifique précis est attendu.',
    'En SVT, le vocabulaire exact rapporte des points à lui seul.',
  ),
  'histoire-geographie': L(
    'Comprendre le monde d’hier pour lire celui d’aujourd’hui 🌍',
    ['Situer dans le temps et l’espace', 'Expliquer avec des repères précis'],
    ['Identifie la période ou l’espace concerné', 'Mobilise dates, acteurs et lieux clés', 'Explique les causes et les conséquences', 'Utilise le vocabulaire de la discipline'],
    'Répondre sans situer : une date ou un lieu, c’est déjà la moitié de la réponse.',
    'Repères + explication : le duo gagnant en histoire-géo.',
  ),
  philosophie: L(
    'Penser par soi-même, avec exigence 🦉',
    ['Définir les notions précisément', 'Construire un raisonnement'],
    ['Analyse les termes du sujet', 'Dégage le problème sous-jacent', 'Confronte les thèses possibles', 'Appuie-toi sur un auteur ou un exemple'],
    'Donner son opinion sans l’argumenter.',
    'Une idée n’a de valeur philosophique que démontrée.',
  ),
  anglais: L(
    'L’anglais se pratique : ose, teste, corrige-toi 🇬🇧',
    ['Mémoriser durablement', 'Réutiliser en contexte'],
    ['Observe la règle ou le mot en contexte', 'Déduis le fonctionnement', 'Fabrique ta propre phrase d’exemple', 'Révise à intervalles rapprochés'],
    'Apprendre des listes isolées, sans jamais les réutiliser.',
    'Un mot utilisé dans TA phrase est un mot retenu pour longtemps.',
  ),
  espagnol: L(
    'L’espagnol se pratique : regularité et oral avant tout 🇪🇸',
    ['Mémoriser durablement', 'Réutiliser en contexte'],
    ['Observe la règle ou le mot en contexte', 'Déduis le fonctionnement', 'Fabrique ta propre phrase d’exemple', 'Révise à intervalles rapprochés'],
    'Apprendre des listes isolées, sans jamais les réutiliser.',
    'Un mot utilisé dans TA phrase est un mot retenu pour longtemps.',
  ),
  nsi: L(
    'Le numérique s’apprend en manipulant : trace, teste, vérifie 💻',
    ['Comprendre le mécanisme sous-jacent', 'L’appliquer sans erreur'],
    ['Observe l’exemple ou le code donné', 'Identifie le mécanisme en jeu', 'Applique-le pas à pas', 'Vérifie le résultat sur un cas simple'],
    'Vouloir deviner le résultat sans dérouler les étapes.',
    'En NSI, celui qui trace proprement a déjà trouvé la réponse.',
  ),
  ses: L(
    'Décrypter l’économie et la société avec les bons outils 📈',
    ['Maîtriser les notions du programme', 'Raisonner avec méthode'],
    ['Définis précisément les notions en jeu', 'Identifie les mécanismes (causes, effets)', 'Illustre avec une donnée ou un auteur', 'Nuance : montre les limites'],
    'Utiliser un mot du langage courant au sens de sa définition scientifique.',
    'En SES, la définition exacte d’une notion vaut déjà des points.',
  ),
};

/** Ultime repli (matière inconnue du catalogue). */
const DEFAULT_LESSON: LessonSeed = L(
  'Une notion à la fois : c’est comme ça qu’on construit du solide 🧱',
  ['Comprendre la notion du jour', 'S’entraîner jusqu’à l’automatisme'],
  ['Lis attentivement la question ou le support', 'Identifie ce qu’on te demande exactement', 'Applique la méthode vue dans la leçon', 'Vérifie ton résultat avant de valider'],
  'Répondre trop vite sans avoir compris la question.',
  'La régularité bat l’intensité : mieux vaut 10 minutes par jour.',
);
