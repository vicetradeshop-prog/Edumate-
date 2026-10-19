/**
 * EduMate — CATALOGUE DES SUJETS DE QUIZ.
 *
 * ══════════════════════════════════════════════════════════════════
 *  COMMENT AJOUTER UN SUJET ?
 * ══════════════════════════════════════════════════════════════════
 *  Une seule ligne suffit :
 *
 *    T('mathematiques', 'seconde', 'Fonctions', 'Image et antécédent',
 *      'math.function.value', 'facile')
 *
 *  T(matière, niveau, thème, nom du sujet, famille de questions, difficulté,
 *    paramètres optionnels)
 *
 *  - La famille (`source`) est définie dans src/server/content/families/*.ts
 *  - Les `params` sont transmis au générateur (ex : { tense: 'present' })
 *  - L'identifiant du sujet est calculé automatiquement (slug unique)
 *
 *  Puis relancer : npm run build:data
 * ══════════════════════════════════════════════════════════════════
 */
import type { Difficulty, LevelId, SubjectId } from '../../shared/types.js';
import { slugify } from './meta.js';

export interface TopicDefinition {
  subjectId: SubjectId;
  levelId: LevelId;
  theme: string;
  name: string;
  source: string;
  params?: Record<string, unknown>;
  difficulty?: Difficulty;
  keywords?: string[];
}

const usedIds = new Set<string>();

/** Calcule un identifiant unique et stable pour un sujet de quiz. */
export function makeId(def: TopicDefinition): string {
  const base = `${slugify(def.subjectId)}-${slugify(def.levelId)}-${slugify(def.theme)}-${slugify(def.name)}`;
  let id = base;
  let counter = 2;
  while (usedIds.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  usedIds.add(id);
  return id;
}

/** Fabrique une définition de sujet avec un identifiant unique garanti. */
function T(
  subjectId: SubjectId,
  levelId: LevelId,
  theme: string,
  name: string,
  source: string,
  difficulty: Difficulty = 'moyen',
  params?: Record<string, unknown>,
  keywords?: string[],
): TopicDefinition & { id: string } {
  const def: TopicDefinition = { subjectId, levelId, theme, name, source, difficulty, params, keywords };
  return { ...def, id: makeId(def) };
}

/* ================================================================== */
/*  MATHÉMATIQUES                                                      */
/* ================================================================== */

const MATH_TROISIEME = [
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Additions et soustractions', 'math.arithmetic', 'facile', { op: '+', max: 100 }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Tables de multiplication', 'math.arithmetic', 'facile', { op: '×', max: 12 }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Divisions euclidiennes', 'math.arithmetic', 'facile', { op: '÷', max: 12 }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Calculs sur les nombres relatifs', 'math.relative', 'moyen'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Addition de relatifs', 'math.relative', 'facile', { op: 'add' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Règle des signes', 'math.relative', 'facile', { op: 'sign' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Opérations sur les décimaux', 'math.decimals', 'facile'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Fractions : addition et soustraction', 'math.fractions', 'moyen', { op: '+' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Fractions : multiplication', 'math.fractions', 'moyen', { op: '×' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Fractions : division', 'math.fractions', 'difficile', { op: '÷' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Fractions irréductibles', 'math.fraction.simplify', 'moyen'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Puissances de 10', 'math.powers', 'moyen'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Écriture scientifique', 'math.scientific', 'moyen'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Racines carrées', 'math.roots', 'moyen'),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'Simplifier une racine carrée', 'math.roots', 'difficile', { kind: 'simplify' }),
  T('mathematiques', 'troisieme', 'Nombres et calculs', 'PGCD et fractions irréductibles', 'math.fraction.simplify', 'difficile'),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Pourcentages : appliquer un taux', 'math.percentages', 'facile', { variant: 'appliquer' }),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Pourcentages : évolution', 'math.percentages', 'moyen', { variant: 'evolution' }),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Calculer un pourcentage', 'math.percentages', 'moyen', { variant: 'recherche' }),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Proportionnalité', 'math.proportionality', 'facile'),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Moyenne d’une série', 'math.statistics', 'facile', { kind: 'moyenne' }),
  T('mathematiques', 'troisieme', 'Organisation de données', 'Médiane et étendue', 'math.statistics', 'moyen', { kind: 'mediane' }),
  T('mathematiques', 'troisieme', 'Algèbre', 'Résoudre une équation du premier degré', 'math.equation.linear', 'moyen'),
  T('mathematiques', 'troisieme', 'Algèbre', 'Équations produit nul', 'math.equation.product', 'moyen'),
  T('mathematiques', 'troisieme', 'Algèbre', 'Développer et factoriser', 'math.function.value', 'difficile'),
  T('mathematiques', 'troisieme', 'Géométrie', 'Théorème de Pythagore', 'math.pythagore', 'moyen'),
  T('mathematiques', 'troisieme', 'Géométrie', 'Trigonométrie dans le triangle rectangle', 'math.trigonometrie', 'moyen'),
  T('mathematiques', 'troisieme', 'Géométrie', 'Aires et périmètres', 'math.aires.volumes', 'facile'),
  T('mathematiques', 'troisieme', 'Géométrie', 'Volumes des solides', 'math.aires.volumes', 'moyen', { kind: 'pave' }),
  T('mathematiques', 'troisieme', 'Géométrie', 'Théorème de Thalès', 'math.proportionality', 'difficile'),
  T('mathematiques', 'troisieme', 'Probabilités', 'Probabilités simples', 'math.probability.dice', 'facile'),
  T('mathematiques', 'troisieme', 'Probabilités', 'Probabilités avec deux dés', 'math.probability.dice', 'moyen', { kind: 'somme' }),
  T('mathematiques', 'troisieme', 'Algorithmique', 'Boucles et affectations', 'math.algorithme', 'moyen'),
  T('mathematiques', 'troisieme', 'Fonctions', 'Notion de fonction : image', 'math.function.value', 'moyen'),
  T('mathematiques', 'troisieme', 'Fonctions', 'Fonction linéaire', 'math.function.affine', 'moyen'),
];

const MATH_SECONDE = [
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Calcul littéral et développements', 'math.arithmetic', 'moyen', { op: '×', max: 30 }),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Fractions et opérations', 'math.fractions', 'moyen'),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Puissances et règles de calcul', 'math.powers', 'moyen'),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Racines carrées et simplification', 'math.roots', 'moyen'),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Valeur absolue et distance', 'math.distance', 'difficile'),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Intervalles et ensembles de nombres', 'math.intervalles', 'facile'),
  T('mathematiques', 'seconde', 'Nombres et calculs', 'Écriture scientifique et ordres de grandeur', 'math.scientific', 'moyen'),
  T('mathematiques', 'seconde', 'Pourcentages', 'Taux d’évolution', 'math.percentages', 'moyen', { variant: 'evolution' }),
  T('mathematiques', 'seconde', 'Pourcentages', 'Évolutions successives', 'math.percentages.successive', 'difficile'),
  T('mathematiques', 'seconde', 'Pourcentages', 'Coefficient multiplicateur', 'math.percentages', 'moyen', { variant: 'appliquer' }),
  T('mathematiques', 'seconde', 'Fonctions', 'Image et antécédent', 'math.function.value', 'facile'),
  T('mathematiques', 'seconde', 'Fonctions', 'Déterminer un antécédent', 'math.function.antecedent', 'moyen'),
  T('mathematiques', 'seconde', 'Fonctions', 'Fonctions affines', 'math.function.affine', 'moyen'),
  T('mathematiques', 'seconde', 'Fonctions', 'Sens de variation d’une fonction', 'math.function.variation', 'facile'),
  T('mathematiques', 'seconde', 'Fonctions', 'Fonction carré', 'math.function.reference', 'facile', { kind: 'carre' }),
  T('mathematiques', 'seconde', 'Fonctions', 'Fonction inverse', 'math.function.reference', 'moyen', { kind: 'inverse' }),
  T('mathematiques', 'seconde', 'Fonctions', 'Fonction racine carrée', 'math.function.reference', 'moyen', { kind: 'racine' }),
  T('mathematiques', 'seconde', 'Fonctions', 'Ensembles de définition', 'math.function.reference', 'difficile', { kind: 'racine' }),
  T('mathematiques', 'seconde', 'Équations', 'Équations du premier degré', 'math.equation.linear', 'facile'),
  T('mathematiques', 'seconde', 'Équations', 'Équations produit', 'math.equation.product', 'moyen'),
  T('mathematiques', 'seconde', 'Équations', 'Inéquations et sens de l’inégalité', 'math.inequations', 'moyen'),
  T('mathematiques', 'seconde', 'Polynômes', 'Développer une identité remarquable', 'math.function.value', 'moyen'),
  T('mathematiques', 'seconde', 'Polynômes', 'Factoriser un trinôme simple', 'math.equation.product', 'difficile'),
  T('mathematiques', 'seconde', 'Géométrie', 'Vecteurs et coordonnées', 'math.vecteurs', 'moyen', { kind: 'somme' }),
  T('mathematiques', 'seconde', 'Géométrie', 'Norme d’un vecteur', 'math.vecteurs', 'moyen', { kind: 'norme' }),
  T('mathematiques', 'seconde', 'Géométrie', 'Colinéarité de deux vecteurs', 'math.vecteurs', 'difficile', { kind: 'colineaire' }),
  T('mathematiques', 'seconde', 'Géométrie', 'Distance entre deux points', 'math.distance', 'moyen'),
  T('mathematiques', 'seconde', 'Géométrie', 'Équations de droites', 'math.droites', 'moyen'),
  T('mathematiques', 'seconde', 'Statistiques', 'Moyenne et médiane', 'math.statistics', 'facile'),
  T('mathematiques', 'seconde', 'Statistiques', 'Étendue et dispersion', 'math.statistics', 'moyen', { kind: 'etendue' }),
  T('mathematiques', 'seconde', 'Probabilités', 'Probabilités et issues', 'math.probability.dice', 'facile'),
  T('mathematiques', 'seconde', 'Probabilités', 'Probabilités conditionnelles', 'math.probability.conditional', 'difficile'),
  T('mathematiques', 'seconde', 'Algorithmique', 'Algorithmes et boucles', 'math.algorithme', 'moyen'),
];

const MATH_PREMIERE = [
  T('mathematiques', 'premiere', 'Second degré', 'Discriminant', 'math.equation.quadratic', 'moyen'),
  T('mathematiques', 'premiere', 'Second degré', 'Solutions d’une équation du second degré', 'math.equation.quadratic.roots', 'moyen'),
  T('mathematiques', 'premiere', 'Second degré', 'Somme et produit des racines', 'math.equation.quadratic.roots', 'difficile'),
  T('mathematiques', 'premiere', 'Second degré', 'Sommet d’une parabole', 'math.function.quadratic.vertex', 'moyen'),
  T('mathematiques', 'premiere', 'Second degré', 'Signe d’un trinôme', 'math.inequations', 'difficile'),
  T('mathematiques', 'premiere', 'Fonctions', 'Dérivée d’un polynôme', 'math.derivative', 'moyen', { degree: 3 }),
  T('mathematiques', 'premiere', 'Fonctions', 'Dérivée et opérations', 'math.derivative.advanced', 'difficile', { kind: 'rac' }),
  T('mathematiques', 'premiere', 'Fonctions', 'Nombre dérivé en un point', 'math.derivative.value', 'moyen'),
  T('mathematiques', 'premiere', 'Fonctions', 'Équation de la tangente', 'math.tangent', 'difficile'),
  T('mathematiques', 'premiere', 'Fonctions', 'Tableau de variations', 'math.function.variation', 'moyen'),
  T('mathematiques', 'premiere', 'Suites', 'Suites arithmétiques', 'math.sequences', 'facile', { kind: 'arithmetique' }),
  T('mathematiques', 'premiere', 'Suites', 'Suites géométriques', 'math.sequences', 'moyen', { kind: 'geometrique' }),
  T('mathematiques', 'premiere', 'Suites', 'Somme des termes d’une suite', 'math.sequences.sum', 'difficile'),
  T('mathematiques', 'premiere', 'Suites', 'Sens de variation d’une suite', 'math.sequences', 'moyen'),
  T('mathematiques', 'premiere', 'Probabilités', 'Probabilités conditionnelles', 'math.probability.conditional', 'moyen'),
  T('mathematiques', 'premiere', 'Probabilités', 'Dénombrement et combinaisons', 'math.combinaison', 'difficile'),
  T('mathematiques', 'premiere', 'Probabilités', 'Arrangements et factorielles', 'math.arrangement', 'moyen'),
  T('mathematiques', 'premiere', 'Statistiques', 'Moyenne, médiane, étendue', 'math.statistics', 'moyen'),
  T('mathematiques', 'premiere', 'Géométrie', 'Produit scalaire', 'math.vecteurs', 'moyen', { kind: 'produit' }),
  T('mathematiques', 'premiere', 'Géométrie', 'Vecteurs et orthogonalité', 'math.vecteurs', 'difficile', { kind: 'produit' }),
  T('mathematiques', 'premiere', 'Trigonométrie', 'Valeurs remarquables', 'math.trigonometrie', 'moyen'),
  T('mathematiques', 'premiere', 'Trigonométrie', 'Cercle trigonométrique', 'math.trigonometrie', 'difficile'),
];

const MATH_TERMINALE = [
  T('mathematiques', 'terminale', 'Analyse', 'Dérivée de fonctions usuelles', 'math.derivative.advanced', 'moyen'),
  T('mathematiques', 'terminale', 'Analyse', 'Dérivée et composée', 'math.derivative.advanced', 'difficile', { kind: 'exp' }),
  T('mathematiques', 'terminale', 'Analyse', 'Tangente et approximation affine', 'math.tangent', 'difficile'),
  T('mathematiques', 'terminale', 'Analyse', 'Convexité et point d’inflexion', 'math.derivative.value', 'difficile'),
  T('mathematiques', 'terminale', 'Exponentielle', 'Propriétés algébriques de exp', 'math.exp.ln', 'moyen', { kind: 'propre' }),
  T('mathematiques', 'terminale', 'Exponentielle', 'Équations avec exponentielle', 'math.exp.ln', 'difficile', { kind: 'equation' }),
  T('mathematiques', 'terminale', 'Exponentielle', 'Signe et variations de exp', 'math.exp.ln', 'facile', { kind: 'signe' }),
  T('mathematiques', 'terminale', 'Logarithme', 'Propriétés du logarithme népérien', 'math.exp.ln', 'moyen', { kind: 'propre' }),
  T('mathematiques', 'terminale', 'Logarithme', 'Équations avec ln', 'math.exp.ln', 'difficile', { kind: 'equation' }),
  T('mathematiques', 'terminale', 'Suites', 'Limite d’une suite géométrique', 'math.sequences.limit', 'moyen'),
  T('mathematiques', 'terminale', 'Suites', 'Raisonnement par récurrence', 'math.sequences', 'difficile'),
  T('mathematiques', 'terminale', 'Suites', 'Somme de termes', 'math.sequences.sum', 'moyen'),
  T('mathematiques', 'terminale', 'Intégration', 'Intégrale d’un monôme', 'math.integrales', 'moyen'),
  T('mathematiques', 'terminale', 'Intégration', 'Primitives usuelles', 'math.integrales', 'difficile'),
  T('mathematiques', 'terminale', 'Probabilités', 'Loi binomiale', 'math.probability.conditional', 'difficile'),
  T('mathematiques', 'terminale', 'Probabilités', 'Coefficients binomiaux', 'math.combinaison', 'moyen'),
  T('mathematiques', 'terminale', 'Probabilités', 'Indépendance et conditionnement', 'math.probability.conditional', 'difficile'),
  T('mathematiques', 'terminale', 'Géométrie', 'Nombres complexes : module', 'math.complexes', 'moyen', { kind: 'module' }),
  T('mathematiques', 'terminale', 'Géométrie', 'Opérations sur les complexes', 'math.complexes', 'facile', { kind: 'somme' }),
  T('mathematiques', 'terminale', 'Géométrie', 'Produit de nombres complexes', 'math.complexes', 'difficile', { kind: 'produit' }),
  T('mathematiques', 'terminale', 'Géométrie', 'Droites et plans de l’espace', 'math.vecteurs', 'difficile', { kind: 'produit' }),
];

/* ================================================================== */
/*  PHYSIQUE-CHIMIE                                                    */
/* ================================================================== */

const PHYS_TROISIEME = [
  T('physique-chimie', 'troisieme', 'Mouvement et énergie', 'Vitesse et durée', 'phys.speed', 'facile', { variant: 'v' }),
  T('physique-chimie', 'troisieme', 'Mouvement et énergie', 'Distance parcourue', 'phys.speed', 'facile', { variant: 'd' }),
  T('physique-chimie', 'troisieme', 'Mouvement et énergie', 'Convertir km/h en m/s', 'phys.speed', 'facile', { variant: 'convert' }),
  T('physique-chimie', 'troisieme', 'Mouvement et énergie', 'Poids et masse', 'phys.weight', 'moyen'),
  T('physique-chimie', 'troisieme', 'Mouvement et énergie', 'Énergie cinétique', 'phys.energy', 'moyen', { kind: 'cinetique' }),
  T('physique-chimie', 'troisieme', 'Électricité', 'Loi d’Ohm', 'phys.ohm', 'moyen', { variant: 'u' }),
  T('physique-chimie', 'troisieme', 'Électricité', 'Puissance électrique', 'phys.electric.power', 'moyen', { kind: 'puissance' }),
  T('physique-chimie', 'troisieme', 'Électricité', 'Énergie consommée', 'phys.electric.power', 'difficile', { kind: 'energie' }),
  T('physique-chimie', 'troisieme', 'Électricité', 'Circuits série et dérivation', 'phys.circuits', 'facile', { kind: 'concept' }),
  T('physique-chimie', 'troisieme', 'Chimie', 'Conversions d’unités', 'phys.conversion', 'facile'),
  T('physique-chimie', 'troisieme', 'Chimie', 'L’atome et sa structure', 'chim.atoms', 'moyen', { kind: 'neutrons' }),
  T('physique-chimie', 'troisieme', 'Chimie', 'Masse molaire de l’eau et du CO₂', 'chim.molarMass', 'difficile'),
  T('physique-chimie', 'troisieme', 'Chimie', 'pH et acidité', 'chim.ph', 'facile', { kind: 'nature' }),
];

const PHYS_SECONDE = [
  T('physique-chimie', 'seconde', 'Mécanique', 'Vitesse et mouvement uniforme', 'phys.speed', 'facile'),
  T('physique-chimie', 'seconde', 'Mécanique', 'Durée d’un trajet', 'phys.speed', 'moyen', { variant: 't' }),
  T('physique-chimie', 'seconde', 'Mécanique', 'Poids et intensité de pesanteur', 'phys.weight', 'moyen'),
  T('physique-chimie', 'seconde', 'Énergie', 'Énergie cinétique', 'phys.energy', 'moyen', { kind: 'cinetique' }),
  T('physique-chimie', 'seconde', 'Énergie', 'Énergie potentielle de pesanteur', 'phys.energy', 'moyen', { kind: 'potentielle' }),
  T('physique-chimie', 'seconde', 'Énergie', 'Puissance et énergie', 'phys.energy', 'difficile', { kind: 'puissance' }),
  T('physique-chimie', 'seconde', 'Électricité', 'Résistance et loi d’Ohm', 'phys.ohm', 'moyen', { variant: 'r' }),
  T('physique-chimie', 'seconde', 'Électricité', 'Association de résistances', 'phys.circuits', 'difficile', { kind: 'derivation' }),
  T('physique-chimie', 'seconde', 'Ondes', 'Période et fréquence', 'phys.waves', 'moyen', { kind: 'periode' }),
  T('physique-chimie', 'seconde', 'Ondes', 'Longueur d’onde', 'phys.waves', 'difficile', { kind: 'lambda' }),
  T('physique-chimie', 'seconde', 'Optique', 'Réflexion de la lumière', 'phys.optics', 'facile', { kind: 'reflexion' }),
  T('physique-chimie', 'seconde', 'Optique', 'Réfraction et indice de milieu', 'phys.optics', 'difficile', { kind: 'refraction' }),
  T('physique-chimie', 'seconde', 'Chimie', 'Structure de l’atome', 'chim.atoms', 'moyen'),
  T('physique-chimie', 'seconde', 'Chimie', 'Classification périodique', 'chim.atoms', 'moyen', { kind: 'composition' }),
  T('physique-chimie', 'seconde', 'Chimie', 'Masse molaire moléculaire', 'chim.molarMass', 'moyen'),
  T('physique-chimie', 'seconde', 'Chimie', 'Quantité de matière', 'chim.mole', 'moyen', { variant: 'n' }),
  T('physique-chimie', 'seconde', 'Chimie', 'Concentration molaire', 'chim.concentration', 'difficile'),
  T('physique-chimie', 'seconde', 'Chimie', 'Volume molaire des gaz', 'chim.molarVolume', 'moyen'),
  T('physique-chimie', 'seconde', 'Chimie', 'Échelle de pH', 'chim.ph', 'facile'),
  T('physique-chimie', 'seconde', 'Chimie', 'Conversions d’unités', 'phys.conversion', 'facile'),
];

const PHYS_PREMIERE = [
  T('physique-chimie', 'premiere', 'Mécanique', 'Deuxième loi de Newton', 'phys.newton', 'moyen', { variant: 'f' }),
  T('physique-chimie', 'premiere', 'Mécanique', 'Principe d’inertie', 'phys.newton', 'facile', { variant: 'concept' }),
  T('physique-chimie', 'premiere', 'Mécanique', 'Accélération et force', 'phys.newton', 'difficile', { variant: 'a' }),
  T('physique-chimie', 'premiere', 'Énergie', 'Travail d’une force', 'phys.work', 'moyen'),
  T('physique-chimie', 'premiere', 'Énergie', 'Conservation de l’énergie mécanique', 'phys.energy', 'difficile'),
  T('physique-chimie', 'premiere', 'Ondes', 'Ondes progressives et célérité', 'phys.waves', 'moyen'),
  T('physique-chimie', 'premiere', 'Ondes', 'Longueur d’onde et fréquence', 'phys.waves', 'difficile', { kind: 'lambda' }),
  T('physique-chimie', 'premiere', 'Optique', 'Lentilles et vergence', 'phys.optics', 'moyen', { kind: 'lentille' }),
  T('physique-chimie', 'premiere', 'Optique', 'Lois de Snell-Descartes', 'phys.optics', 'difficile', { kind: 'refraction' }),
  T('physique-chimie', 'premiere', 'Chimie', 'Réactions et stœchiométrie', 'chim.stoechiometrie', 'moyen'),
  T('physique-chimie', 'premiere', 'Chimie', 'Dilution et facteur de dilution', 'chim.dilution', 'moyen'),
  T('physique-chimie', 'premiere', 'Chimie', 'Concentration et quantité de matière', 'chim.concentration', 'difficile'),
  T('physique-chimie', 'premiere', 'Chimie', 'pH et concentration en H₃O⁺', 'chim.ph', 'moyen', { kind: 'h3o' }),
  T('physique-chimie', 'premiere', 'Chimie', 'Oxydoréduction', 'bank:physique-chimie-premiere-chimie-oxydoreduction', 'difficile'),
  T('physique-chimie', 'premiere', 'Chimie', 'Structure des molécules organiques', 'bank:physique-chimie-premiere-chimie-organique', 'moyen'),
  T('physique-chimie', 'premiere', 'Thermodynamique', 'Gaz parfaits : PV = nRT', 'chim.gas', 'difficile'),
  T('physique-chimie', 'premiere', 'Thermodynamique', 'Énergie interne et transferts', 'phys.energy', 'difficile'),
];

const PHYS_TERMINALE = [
  T('physique-chimie', 'terminale', 'Mécanique', 'Lois de Newton et mouvement', 'phys.newton', 'difficile'),
  T('physique-chimie', 'terminale', 'Mécanique', 'Travail et énergie cinétique', 'phys.work', 'difficile'),
  T('physique-chimie', 'terminale', 'Ondes', 'Ondes mécaniques progressives', 'phys.waves', 'moyen'),
  T('physique-chimie', 'terminale', 'Nucléaire', 'Décroissance radioactive et demi-vie', 'phys.radioactivity', 'moyen'),
  T('physique-chimie', 'terminale', 'Nucléaire', 'Activité et constante radioactive', 'phys.radioactivity', 'difficile'),
  T('physique-chimie', 'terminale', 'Chimie', 'Cinétique et vitesse de réaction', 'chim.stoechiometrie', 'difficile'),
  T('physique-chimie', 'terminale', 'Chimie', 'Équilibres chimiques et quotient de réaction', 'chim.concentration', 'difficile'),
  T('physique-chimie', 'terminale', 'Chimie', 'Titrages et dosage', 'chim.dilution', 'difficile'),
  T('physique-chimie', 'terminale', 'Chimie', 'Acides, bases et pH', 'chim.ph', 'moyen'),
  T('physique-chimie', 'terminale', 'Électricité', 'Condensateur et dipôle RC', 'phys.circuits', 'difficile'),
  T('physique-chimie', 'terminale', 'Thermodynamique', 'Premier principe de la thermodynamique', 'phys.energy', 'difficile'),
  T('physique-chimie', 'terminale', 'Thermodynamique', 'Bilans d’énergie thermique', 'phys.work', 'difficile'),
];

/* ================================================================== */
/*  FRANÇAIS                                                           */
/* ================================================================== */

const FR_TROISIEME = [
  T('francais', 'troisieme', 'Grammaire', 'Natures et fonctions grammaticales', 'fr.natures', 'facile'),
  T('francais', 'troisieme', 'Grammaire', 'Compléments d’objet (COD, COI)', 'fr.natures', 'moyen'),
  T('francais', 'troisieme', 'Grammaire', 'Propositions subordonnées', 'fr.natures', 'difficile'),
  T('francais', 'troisieme', 'Grammaire', 'Classes grammaticales', 'fr.natures', 'facile'),
  T('francais', 'troisieme', 'Orthographe', 'Homophones grammaticaux', 'fr.homophones', 'moyen'),
  T('francais', 'troisieme', 'Orthographe', 'Accords du participe passé', 'fr.accords', 'difficile'),
  T('francais', 'troisieme', 'Orthographe', 'Orthographe lexicale', 'fr.dictee', 'moyen'),
  T('francais', 'troisieme', 'Orthographe', 'Accords dans le groupe nominal', 'fr.accords', 'moyen'),
  T('francais', 'troisieme', 'Conjugaison', 'Présent de l’indicatif (1er groupe)', 'fr.conjugaison', 'facile', { tense: 'present', group: 1 }),
  T('francais', 'troisieme', 'Conjugaison', 'Présent de l’indicatif (2e groupe)', 'fr.conjugaison', 'facile', { tense: 'present', group: 2 }),
  T('francais', 'troisieme', 'Conjugaison', 'Présent de l’indicatif (3e groupe)', 'fr.conjugaison', 'moyen', { tense: 'present', group: 3 }),
  T('francais', 'troisieme', 'Conjugaison', 'Imparfait de l’indicatif', 'fr.conjugaison', 'facile', { tense: 'imparfait' }),
  T('francais', 'troisieme', 'Conjugaison', 'Futur simple', 'fr.conjugaison', 'moyen', { tense: 'futur' }),
  T('francais', 'troisieme', 'Conjugaison', 'Passé composé', 'fr.passeCompose', 'moyen'),
  T('francais', 'troisieme', 'Conjugaison', 'Participes passés irréguliers', 'fr.participe', 'moyen'),
  T('francais', 'troisieme', 'Vocabulaire', 'Synonymes', 'fr.synonymes', 'facile'),
  T('francais', 'troisieme', 'Vocabulaire', 'Antonymes', 'fr.antonymes', 'facile'),
  T('francais', 'troisieme', 'Vocabulaire', 'Familles de mots', 'fr.familles', 'facile'),
  T('francais', 'troisieme', 'Littérature', 'Figures de style', 'fr.figures', 'moyen'),
  T('francais', 'troisieme', 'Littérature', 'Genres littéraires', 'fr.genres', 'moyen'),
  T('francais', 'troisieme', 'Littérature', 'Registres littéraires', 'fr.registres', 'difficile'),
  T('francais', 'troisieme', 'Littérature', 'Œuvres et auteurs du programme', 'fr.oeuvres', 'moyen'),
  T('francais', 'troisieme', 'Méthode', 'Rédiger une introduction', 'bank:francais-troisieme-methode-redaction', 'moyen'),
  T('francais', 'troisieme', 'Méthode', 'Réussir le brevet de français', 'bank:francais-troisieme-methode-brevet', 'moyen'),
];

const FR_SECONDE = [
  T('francais', 'seconde', 'Grammaire', 'Analyse des propositions subordonnées', 'fr.natures', 'moyen'),
  T('francais', 'seconde', 'Grammaire', 'Discours direct et indirect', 'fr.natures', 'difficile'),
  T('francais', 'seconde', 'Grammaire', 'Voix active et voix passive', 'fr.natures', 'moyen'),
  T('francais', 'seconde', 'Grammaire', 'Connecteurs logiques', 'fr.natures', 'facile'),
  T('francais', 'seconde', 'Orthographe', 'Homophones grammaticaux avancés', 'fr.homophones', 'difficile'),
  T('francais', 'seconde', 'Orthographe', 'Accords complexes', 'fr.accords', 'difficile'),
  T('francais', 'seconde', 'Orthographe', 'Pluriel des noms composés', 'fr.accords', 'difficile'),
  T('francais', 'seconde', 'Conjugaison', 'Conditionnel présent', 'fr.conjugaison', 'moyen', { tense: 'conditionnel' }),
  T('francais', 'seconde', 'Conjugaison', 'Subjonctif présent', 'fr.conjugaison', 'difficile', { tense: 'subjonctif' }),
  T('francais', 'seconde', 'Conjugaison', 'Règles de conjugaison du 3e groupe', 'fr.regles', 'difficile'),
  T('francais', 'seconde', 'Conjugaison', 'Temps composés et auxiliaires', 'fr.regles', 'moyen'),
  T('francais', 'seconde', 'Littérature', 'Mouvements littéraires', 'fr.mouvements', 'moyen'),
  T('francais', 'seconde', 'Littérature', 'Œuvres du XVIe au XVIIIe siècle', 'fr.oeuvres', 'moyen'),
  T('francais', 'seconde', 'Littérature', 'Figures de style et effets', 'fr.figures', 'difficile'),
  T('francais', 'seconde', 'Littérature', 'Versification', 'fr.versification', 'moyen'),
  T('francais', 'seconde', 'Littérature', 'Genres et formes de l’argumentation', 'fr.genres', 'moyen'),
  T('francais', 'seconde', 'Vocabulaire', 'Champ lexical et synonymes', 'fr.synonymes', 'moyen'),
  T('francais', 'seconde', 'Vocabulaire', 'Formation des mots', 'fr.familles', 'facile'),
  T('francais', 'seconde', 'Méthode', 'Commentaire littéraire', 'bank:francais-seconde-methode-commentaire', 'moyen'),
  T('francais', 'seconde', 'Méthode', 'Rédiger une dissertation', 'bank:francais-seconde-methode-dissertation', 'difficile'),
];

const FR_PREMIERE = [
  T('francais', 'premiere', 'Littérature', 'Théâtre : tragédie et comédie', 'fr.genres', 'moyen'),
  T('francais', 'premiere', 'Littérature', 'Le roman et ses personnages', 'fr.genres', 'moyen'),
  T('francais', 'premiere', 'Littérature', 'La poésie : formes et registres', 'fr.versification', 'difficile'),
  T('francais', 'premiere', 'Littérature', 'Littérature d’idées et argumentation', 'fr.genres', 'difficile'),
  T('francais', 'premiere', 'Littérature', 'Mouvements littéraires du XIXe siècle', 'fr.mouvements', 'moyen'),
  T('francais', 'premiere', 'Littérature', 'Mouvements littéraires du XXe siècle', 'fr.mouvements', 'difficile'),
  T('francais', 'premiere', 'Littérature', 'Œuvres intégrales du programme', 'fr.oeuvres', 'moyen'),
  T('francais', 'premiere', 'Littérature', 'Registres et effets sur le lecteur', 'fr.registres', 'moyen'),
  T('francais', 'premiere', 'Grammaire', 'Syntaxe de la phrase complexe', 'fr.natures', 'difficile'),
  T('francais', 'premiere', 'Grammaire', 'Négation, interrogation, emphase', 'fr.natures', 'moyen'),
  T('francais', 'premiere', 'Orthographe', 'Accord du participe passé (cas complexes)', 'fr.accords', 'difficile'),
  T('francais', 'premiere', 'Méthode', 'Commentaire composé', 'bank:francais-seconde-methode-commentaire', 'difficile'),
  T('francais', 'premiere', 'Méthode', 'Dissertation littéraire', 'bank:francais-seconde-methode-dissertation', 'difficile'),
  T('francais', 'premiere', 'Méthode', 'Contraction de texte', 'bank:francais-premiere-methode-contraction', 'difficile'),
  T('francais', 'premiere', 'Méthode', 'Préparer l’oral de français', 'bank:francais-premiere-methode-oral', 'moyen'),
];

/* ================================================================== */
/*  SVT                                                                */
/* ================================================================== */

const SVT_SECONDE = [
  T('svt', 'seconde', 'Le vivant', 'La cellule, unité du vivant', 'svt.termes', 'facile', { theme: 'Le vivant' }),
  T('svt', 'seconde', 'Le vivant', 'Organites et fonctions cellulaires', 'svt.termes', 'moyen', { theme: 'Le vivant' }),
  T('svt', 'seconde', 'Le vivant', 'Photosynthèse et respiration', 'svt.termes', 'moyen'),
  T('svt', 'seconde', 'Le vivant', 'Enzymes et catalyse', 'svt.termes', 'difficile'),
  T('svt', 'seconde', 'Génétique', 'ADN et information génétique', 'svt.termes', 'moyen', { theme: 'Génétique' }),
  T('svt', 'seconde', 'Génétique', 'Mitose et méiose', 'svt.termes', 'difficile', { theme: 'Génétique' }),
  T('svt', 'seconde', 'Génétique', 'Mutations et diversité génétique', 'svt.termes', 'moyen'),
  T('svt', 'seconde', 'Écologie', 'Écosystèmes et chaînes alimentaires', 'svt.termes', 'facile', { theme: 'Écologie' }),
  T('svt', 'seconde', 'Écologie', 'Biodiversité et cycles biogéochimiques', 'svt.termes', 'moyen', { theme: 'Écologie' }),
  T('svt', 'seconde', 'Écologie', 'Effet de serre et climat', 'svt.termes', 'moyen'),
  T('svt', 'seconde', 'Géologie', 'Tectonique des plaques', 'svt.termes', 'moyen', { theme: 'Géologie' }),
  T('svt', 'seconde', 'Géologie', 'Séismes et volcans', 'svt.termes', 'facile', { theme: 'Géologie' }),
  T('svt', 'seconde', 'Santé', 'Microbiote et antibiotiques', 'svt.termes', 'moyen', { theme: 'Santé' }),
  T('svt', 'seconde', 'Corps humain', 'Homéostasie et régulation', 'svt.termes', 'difficile', { theme: 'Physiologie' }),
  T('svt', 'seconde', 'Méthode', 'Raisonner avec un document scientifique', 'svt.processus', 'moyen'),
];

const SVT_PREMIERE = [
  T('svt', 'premiere', 'Génétique', 'De l’ADN à la protéine', 'svt.termes', 'moyen', { theme: 'Génétique' }),
  T('svt', 'premiere', 'Génétique', 'Transcription et traduction', 'svt.termes', 'difficile'),
  T('svt', 'premiere', 'Génétique', 'Code génétique et mutations', 'svt.termes', 'difficile'),
  T('svt', 'premiere', 'Génétique', 'Brassage génétique et méiose', 'svt.termes', 'difficile'),
  T('svt', 'premiere', 'Évolution', 'Sélection naturelle', 'svt.termes', 'moyen', { theme: 'Évolution' }),
  T('svt', 'premiere', 'Évolution', 'Dérive génétique', 'svt.termes', 'difficile', { theme: 'Évolution' }),
  T('svt', 'premiere', 'Évolution', 'Homologies et parenté', 'svt.termes', 'moyen'),
  T('svt', 'premiere', 'Immunologie', 'Immunité innée', 'svt.termes', 'moyen', { theme: 'Immunologie' }),
  T('svt', 'premiere', 'Immunologie', 'Immunité adaptative', 'svt.termes', 'difficile', { theme: 'Immunologie' }),
  T('svt', 'premiere', 'Immunologie', 'Vaccination et mémoire immunitaire', 'svt.termes', 'moyen'),
  T('svt', 'premiere', 'Physiologie', 'Régulation de la glycémie', 'svt.termes', 'moyen', { theme: 'Physiologie' }),
  T('svt', 'premiere', 'Physiologie', 'Communication nerveuse', 'svt.termes', 'difficile', { theme: 'Physiologie' }),
  T('svt', 'premiere', 'Géologie', 'Subduction et magmatisme', 'svt.termes', 'difficile', { theme: 'Géologie' }),
  T('svt', 'premiere', 'Géologie', 'Dorsales océaniques', 'svt.termes', 'moyen', { theme: 'Géologie' }),
  T('svt', 'premiere', 'Écologie', 'Écosystèmes et flux d’énergie', 'svt.termes', 'moyen', { theme: 'Écologie' }),
];

const SVT_TERMINALE = [
  T('svt', 'terminale', 'Génétique', 'Expression du patrimoine génétique', 'svt.termes', 'difficile', { theme: 'Génétique' }),
  T('svt', 'terminale', 'Génétique', 'Mutations et évolution', 'svt.termes', 'difficile'),
  T('svt', 'terminale', 'Évolution', 'Mécanismes de l’évolution', 'svt.termes', 'difficile', { theme: 'Évolution' }),
  T('svt', 'terminale', 'Évolution', 'Spéciation et biodiversité', 'svt.termes', 'difficile'),
  T('svt', 'terminale', 'Immunologie', 'Réponse immunitaire adaptative', 'svt.termes', 'difficile', { theme: 'Immunologie' }),
  T('svt', 'terminale', 'Immunologie', 'Dysfonctionnements immunitaires', 'svt.termes', 'difficile'),
  T('svt', 'terminale', 'Physiologie', 'Homéostasie et boucles de régulation', 'svt.termes', 'difficile', { theme: 'Physiologie' }),
  T('svt', 'terminale', 'Physiologie', 'Potentiel d’action et synapses', 'svt.termes', 'difficile'),
  T('svt', 'terminale', 'Géologie', 'Géothermie et propriétés thermiques', 'svt.termes', 'difficile', { theme: 'Géologie' }),
  T('svt', 'terminale', 'Écologie', 'Écologie et développement durable', 'svt.termes', 'moyen', { theme: 'Écologie' }),
];

/* ================================================================== */
/*  HISTOIRE-GÉOGRAPHIE                                                */
/* ================================================================== */

const HG_TROISIEME = [
  T('histoire-geographie', 'troisieme', 'Histoire', 'La Révolution française', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'Dates clés de la Révolution', 'hg.histoire.dates', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'Le Premier Empire', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'La Première Guerre mondiale', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'La Seconde Guerre mondiale', 'hg.histoire.dates', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'La France sous Vichy et la Résistance', 'hg.histoire.acteurs', 'difficile'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'La Ve République', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Histoire', 'Chronologie générale', 'hg.histoire.chronologie', 'difficile'),
  T('histoire-geographie', 'troisieme', 'Géographie', 'Capitales d’Europe', 'hg.geo.capitales', 'facile'),
  T('histoire-geographie', 'troisieme', 'Géographie', 'Repères du territoire français', 'hg.geo.repères', 'moyen'),
  T('histoire-geographie', 'troisieme', 'Géographie', 'Fleuves et reliefs', 'hg.geo.repères', 'moyen', { category: 'fleuve' }),
  T('histoire-geographie', 'troisieme', 'Géographie', 'Vrai ou faux géographique', 'hg.geo.vraifaux', 'moyen'),
  T('histoire-geographie', 'troisieme', 'EMC', 'Valeurs et symboles de la République', 'bank:histoire-geographie-troisieme-emc-republique', 'facile'),
  T('histoire-geographie', 'troisieme', 'EMC', 'Droits, devoirs et citoyenneté', 'bank:histoire-geographie-troisieme-emc-citoyennete', 'moyen'),
];

const HG_SECONDE = [
  T('histoire-geographie', 'seconde', 'Histoire', 'L’Europe des Lumières', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'seconde', 'Histoire', 'Révolution et Empire', 'hg.histoire.dates', 'moyen'),
  T('histoire-geographie', 'seconde', 'Histoire', 'Le XIXe siècle en France', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'seconde', 'Histoire', 'La IIIe République', 'hg.histoire.acteurs', 'difficile'),
  T('histoire-geographie', 'seconde', 'Histoire', 'Industrialisation et société', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'seconde', 'Géographie', 'Métropolisation et territoires', 'hg.geo.repères', 'moyen', { category: 'ville' }),
  T('histoire-geographie', 'seconde', 'Géographie', 'Espaces productifs français', 'hg.geo.repères', 'moyen', { category: 'économie' }),
  T('histoire-geographie', 'seconde', 'Géographie', 'Population et peuplement', 'hg.geo.repères', 'moyen', { category: 'population' }),
  T('histoire-geographie', 'seconde', 'Géographie', 'Capitales du monde', 'hg.geo.capitales', 'moyen'),
  T('histoire-geographie', 'seconde', 'Géographie', 'Enjeux environnementaux', 'hg.geo.repères', 'difficile', { category: 'environnement' }),
  T('histoire-geographie', 'seconde', 'Méthode', 'Analyser un document historique', 'bank:histoire-geographie-seconde-methode-document', 'moyen'),
  T('histoire-geographie', 'seconde', 'Méthode', 'Réaliser un croquis de géographie', 'bank:histoire-geographie-seconde-methode-croquis', 'moyen'),
];

const HG_PREMIERE = [
  T('histoire-geographie', 'premiere', 'Histoire', 'L’entre-deux-guerres', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'premiere', 'Histoire', 'La guerre froide', 'hg.histoire.dates', 'moyen'),
  T('histoire-geographie', 'premiere', 'Histoire', 'La Seconde Guerre mondiale', 'hg.histoire.acteurs', 'difficile'),
  T('histoire-geographie', 'premiere', 'Histoire', 'La France de 1945 à nos jours', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'premiere', 'Histoire', 'Chronologie du XXe siècle', 'hg.histoire.chronologie', 'difficile'),
  T('histoire-geographie', 'premiere', 'Géographie', 'Les dynamiques des espaces productifs', 'hg.geo.repères', 'moyen', { category: 'économie' }),
  T('histoire-geographie', 'premiere', 'Géographie', 'Mers et océans : enjeux géostratégiques', 'hg.geo.repères', 'difficile'),
  T('histoire-geographie', 'premiere', 'Géographie', 'L’Union européenne et ses territoires', 'hg.geo.repères', 'moyen', { category: 'union' }),
  T('histoire-geographie', 'premiere', 'Géographie', 'Métropolisation et inégalités', 'hg.geo.repères', 'difficile', { category: 'ville' }),
  T('histoire-geographie', 'premiere', 'Géographie', 'Déserts et milieux extrêmes', 'hg.geo.repères', 'moyen', { category: 'relief' }),
];

const HG_TERMINALE = [
  T('histoire-geographie', 'terminale', 'Histoire', 'Décolonisation et tiers-monde', 'hg.histoire.evenements', 'difficile'),
  T('histoire-geographie', 'terminale', 'Histoire', 'La fin de la guerre froide', 'hg.histoire.dates', 'moyen'),
  T('histoire-geographie', 'terminale', 'Histoire', 'Le monde depuis les années 1990', 'hg.histoire.evenements', 'moyen'),
  T('histoire-geographie', 'terminale', 'Histoire', 'Mémoires de la Seconde Guerre mondiale', 'hg.histoire.acteurs', 'difficile'),
  T('histoire-geographie', 'terminale', 'Histoire', 'Chronologie du monde contemporain', 'hg.histoire.chronologie', 'difficile'),
  T('histoire-geographie', 'terminale', 'Géographie', 'Mondialisation et flux', 'hg.geo.repères', 'difficile', { category: 'économie' }),
  T('histoire-geographie', 'terminale', 'Géographie', 'Puissances et organisations mondiales', 'hg.geo.repères', 'difficile', { category: 'union' }),
  T('histoire-geographie', 'terminale', 'Géographie', 'Environnement et développement durable', 'hg.geo.repères', 'moyen', { category: 'environnement' }),
  T('histoire-geographie', 'terminale', 'Géographie', 'Villes et espaces urbains mondiaux', 'hg.geo.repères', 'moyen', { category: 'ville' }),
  T('histoire-geographie', 'terminale', 'Géographie', 'Frontières et tensions géopolitiques', 'hg.geo.repères', 'difficile'),
];

/* ================================================================== */
/*  PHILOSOPHIE                                                        */
/* ================================================================== */

const PHILO = [
  T('philosophie', 'premiere', 'Introduction', 'Découvrir les notions philosophiques', 'philo.concepts', 'facile'),
  T('philosophie', 'terminale', 'La raison', 'Le doute méthodique et le cogito', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La raison', 'La vérité et ses critères', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'La raison', 'Théorie et expérience', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'La morale', 'Le devoir et l’impératif catégorique', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La morale', 'Le bonheur', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La morale', 'La liberté', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'La politique', 'L’État et la souveraineté', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La politique', 'La justice et le droit', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'La politique', 'La société et les échanges', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La métaphysique', 'La conscience et l’inconscient', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'La métaphysique', 'Autrui', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'La métaphysique', 'Le temps et la durée', 'philo.concepts', 'difficile'),
  T('philosophie', 'terminale', 'L’art', 'L’art et la technique', 'philo.concepts', 'moyen'),
  T('philosophie', 'terminale', 'Auteurs', 'Platon et l’idéalisme', 'philo.auteurs', 'moyen'),
  T('philosophie', 'terminale', 'Auteurs', 'Descartes et le rationalisme', 'philo.auteurs', 'moyen'),
  T('philosophie', 'terminale', 'Auteurs', 'Kant et la philosophie critique', 'philo.auteurs', 'difficile'),
  T('philosophie', 'terminale', 'Auteurs', 'Rousseau et le contrat social', 'philo.auteurs', 'moyen'),
  T('philosophie', 'terminale', 'Auteurs', 'Marx et le matérialisme', 'philo.auteurs', 'difficile'),
  T('philosophie', 'terminale', 'Auteurs', 'Nietzsche et la critique des valeurs', 'philo.auteurs', 'difficile'),
  T('philosophie', 'terminale', 'Auteurs', 'Sartre et l’existentialisme', 'philo.auteurs', 'difficile'),
  T('philosophie', 'terminale', 'Auteurs', 'Hannah Arendt et le politique', 'philo.auteurs', 'difficile'),
  T('philosophie', 'terminale', 'Courants', 'Courants et doctrines philosophiques', 'philo.doctrines', 'difficile'),
  T('philosophie', 'terminale', 'Courants', 'Antiquité : stoïcisme et épicurisme', 'philo.doctrines', 'moyen'),
  T('philosophie', 'terminale', 'Courants', 'Philosophies du XXe siècle', 'philo.doctrines', 'difficile'),
  T('philosophie', 'terminale', 'Méthode', 'Méthode de la dissertation', 'bank:philosophie-terminale-methode-dissertation', 'difficile'),
  T('philosophie', 'terminale', 'Méthode', 'Méthode de l’explication de texte', 'bank:philosophie-terminale-methode-explication', 'difficile'),
  T('philosophie', 'terminale', 'Méthode', 'Problématiser un sujet', 'bank:philosophie-terminale-methode-problematique', 'difficile'),
];

/* ================================================================== */
/*  ANGLAIS                                                            */
/* ================================================================== */

const EN_SECONDE = [
  T('anglais', 'seconde', 'Vocabulaire', 'Famille et relations', 'en.vocab', 'facile', { theme: 'Famille et relations' }),
  T('anglais', 'seconde', 'Vocabulaire', 'École et études', 'en.vocab', 'facile', { theme: 'École et études' }),
  T('anglais', 'seconde', 'Vocabulaire', 'Voyages et transports', 'en.vocab', 'moyen', { theme: 'Voyages et transports' }),
  T('anglais', 'seconde', 'Vocabulaire', 'Sports et loisirs', 'en.vocab', 'facile', { theme: 'Sports et loisirs' }),
  T('anglais', 'seconde', 'Grammaire', 'Present simple et present continuous', 'en.grammar', 'facile'),
  T('anglais', 'seconde', 'Grammaire', 'Preterit et present perfect', 'en.grammar', 'moyen'),
  T('anglais', 'seconde', 'Grammaire', 'Modaux et obligation', 'en.grammar', 'moyen'),
  T('anglais', 'seconde', 'Grammaire', 'Comparatif et superlatif', 'en.grammar', 'facile'),
  T('anglais', 'seconde', 'Verbes', 'Verbes réguliers', 'en.regular', 'facile'),
  T('anglais', 'seconde', 'Verbes', 'Verbes irréguliers essentiels', 'en.irregular', 'moyen'),
  T('anglais', 'seconde', 'Verbes', 'Phrasal verbs courants', 'en.phrasal', 'moyen'),
  T('anglais', 'seconde', 'Pièges', 'Faux amis anglais-français', 'en.falseFriends', 'moyen'),
];

const EN_PREMIERE = [
  T('anglais', 'premiere', 'Vocabulaire', 'Environnement et climat', 'en.vocab', 'moyen', { theme: 'Environnement' }),
  T('anglais', 'premiere', 'Vocabulaire', 'Travail et métiers', 'en.vocab', 'moyen', { theme: 'Travail et métiers' }),
  T('anglais', 'premiere', 'Vocabulaire', 'Médias et numérique', 'en.vocab', 'difficile', { theme: 'Médias et numérique' }),
  T('anglais', 'premiere', 'Vocabulaire', 'Santé et corps', 'en.vocab', 'moyen', { theme: 'Santé et corps' }),
  T('anglais', 'premiere', 'Grammaire', 'Conditionnel et hypothèse', 'en.grammar', 'difficile'),
  T('anglais', 'premiere', 'Grammaire', 'Discours indirect et concordance', 'en.grammar', 'difficile'),
  T('anglais', 'premiere', 'Grammaire', 'Voix passive', 'en.grammar', 'moyen'),
  T('anglais', 'premiere', 'Grammaire', 'Quantifieurs et déterminants', 'en.grammar', 'moyen'),
  T('anglais', 'premiere', 'Verbes', 'Verbes irréguliers avancés', 'en.irregular', 'difficile'),
  T('anglais', 'premiere', 'Verbes', 'Participes passés irréguliers', 'en.irregular', 'difficile'),
  T('anglais', 'premiere', 'Pièges', 'Faux amis fréquents', 'en.falseFriends', 'difficile'),
  T('anglais', 'premiere', 'Méthode', 'Compréhension et expression écrites', 'bank:anglais-premiere-methode-ecrit', 'moyen'),
];

const EN_TERMINALE = [
  T('anglais', 'terminale', 'Vocabulaire', 'Société et débats contemporains', 'en.vocab', 'difficile'),
  T('anglais', 'terminale', 'Grammaire', 'Structures complexes', 'en.grammar', 'difficile'),
  T('anglais', 'terminale', 'Verbes', 'Maîtrise des verbes irréguliers', 'en.irregular', 'difficile'),
  T('anglais', 'terminale', 'Méthode', 'Préparer l’oral du bac', 'bank:anglais-terminale-methode-oral', 'moyen'),
];

/* ================================================================== */
/*  ESPAGNOL                                                           */
/* ================================================================== */

const ES_TOPICS = [
  T('espagnol', 'seconde', 'Conjugaison', 'Présent de l’indicatif : verbes en -ar', 'es.conjugaison', 'facile'),
  T('espagnol', 'seconde', 'Conjugaison', 'Présent de l’indicatif : verbes en -er/-ir', 'es.conjugaison', 'facile'),
  T('espagnol', 'seconde', 'Conjugaison', 'Verbes irréguliers du présent', 'es.irregular', 'moyen'),
  T('espagnol', 'seconde', 'Vocabulaire', 'Vie quotidienne', 'es.vocab', 'facile', { theme: 'Vie quotidienne' }),
  T('espagnol', 'seconde', 'Vocabulaire', 'Scolarité', 'es.vocab', 'facile', { theme: 'Scolarité' }),
  T('espagnol', 'premiere', 'Conjugaison', 'Prétérit des verbes irréguliers', 'es.irregular', 'difficile'),
  T('espagnol', 'premiere', 'Vocabulaire', 'Voyages et déplacements', 'es.vocab', 'moyen', { theme: 'Voyages' }),
  T('espagnol', 'premiere', 'Vocabulaire', 'Sentiments et émotions', 'es.vocab', 'moyen', { theme: 'Sentiments' }),
  T('espagnol', 'terminale', 'Conjugaison', 'Verbes irréguliers : présent et prétérit', 'es.irregular', 'difficile'),
  T('espagnol', 'terminale', 'Vocabulaire', 'Vocabulaire thématique avancé', 'es.vocab', 'difficile'),
];

/* ================================================================== */
/*  NSI / INFORMATIQUE                                                 */
/* ================================================================== */

const NSI_SECONDE = [
  T('nsi', 'seconde', 'Représentation des données', 'Bits et octets', 'nsi.bases', 'facile', { kind: 'bits' }),
  T('nsi', 'seconde', 'Représentation des données', 'Binaire et décimal', 'nsi.bases', 'moyen', { kind: 'bin2dec' }),
  T('nsi', 'seconde', 'Représentation des données', 'Codage des images et couleurs', 'nsi.couleurs', 'facile', { kind: 'rgb' }),
  T('nsi', 'seconde', 'Représentation des données', 'Codage des caractères', 'nsi.termes', 'moyen', { theme: 'Représentation des données' }),
  T('nsi', 'seconde', 'Programmation', 'Variables et affectation', 'nsi.python', 'facile', { kind: 'liste' }),
  T('nsi', 'seconde', 'Programmation', 'Boucles bornées en Python', 'nsi.python', 'moyen', { kind: 'boucle' }),
  T('nsi', 'seconde', 'Programmation', 'Fonctions et paramètres', 'nsi.python', 'moyen', { kind: 'fonction' }),
  T('nsi', 'seconde', 'Programmation', 'Types et instructions Python', 'nsi.termes', 'facile', { theme: 'Programmation' }),
  T('nsi', 'seconde', 'Internet', 'Web, HTTP et DNS', 'nsi.termes', 'moyen', { theme: 'Réseaux' }),
  T('nsi', 'seconde', 'Internet', 'Sécurité et protection des données', 'nsi.termes', 'moyen', { theme: 'Sécurité' }),
  T('nsi', 'seconde', 'Matériel', 'Architecture d’un ordinateur', 'nsi.termes', 'facile', { theme: 'Architecture' }),
  T('nsi', 'seconde', 'Algorithmique', 'Notion d’algorithme', 'nsi.termes', 'facile', { theme: 'Algorithmique' }),
];

const NSI_PREMIERE = [
  T('nsi', 'premiere', 'Représentation des données', 'Entiers relatifs et complément à deux', 'nsi.termes', 'difficile', { theme: 'Représentation des données' }),
  T('nsi', 'premiere', 'Représentation des données', 'Nombres flottants', 'nsi.termes', 'difficile'),
  T('nsi', 'premiere', 'Représentation des données', 'Conversion décimal / binaire / hexadécimal', 'nsi.bases', 'moyen'),
  T('nsi', 'premiere', 'Logique', 'Opérateurs booléens', 'nsi.logique', 'facile'),
  T('nsi', 'premiere', 'Logique', 'Tables de vérité', 'nsi.tableverite', 'moyen'),
  T('nsi', 'premiere', 'Algorithmique', 'Complexité des algorithmes', 'nsi.complexite', 'moyen'),
  T('nsi', 'premiere', 'Algorithmique', 'Tris et recherche dichotomique', 'nsi.complexite', 'difficile'),
  T('nsi', 'premiere', 'Structures de données', 'Tableaux et dictionnaires', 'nsi.termes', 'moyen', { theme: 'Structures de données' }),
  T('nsi', 'premiere', 'Structures de données', 'Piles et files', 'nsi.termes', 'moyen'),
  T('nsi', 'premiere', 'Programmation', 'Listes en compréhension', 'nsi.python', 'moyen', { kind: 'comprehension' }),
  T('nsi', 'premiere', 'Programmation', 'Spécification et tests', 'nsi.termes', 'moyen', { theme: 'Programmation' }),
  T('nsi', 'premiere', 'Réseaux', 'Protocoles TCP/IP', 'nsi.termes', 'moyen', { theme: 'Réseaux' }),
  T('nsi', 'premiere', 'Bases de données', 'Modèle relationnel et clés', 'nsi.termes', 'moyen', { theme: 'Bases de données' }),
  T('nsi', 'premiere', 'Bases de données', 'Requêtes SQL', 'nsi.sql', 'moyen'),
];

const NSI_TERMINALE = [
  T('nsi', 'terminale', 'Algorithmique', 'Récursivité', 'nsi.termes', 'difficile', { theme: 'Algorithmique' }),
  T('nsi', 'terminale', 'Algorithmique', 'Diviser pour régner', 'nsi.complexite', 'difficile'),
  T('nsi', 'terminale', 'Structures de données', 'Listes chaînées', 'nsi.termes', 'difficile'),
  T('nsi', 'terminale', 'Structures de données', 'Arbres binaires', 'nsi.termes', 'difficile'),
  T('nsi', 'terminale', 'Structures de données', 'Graphes et parcours', 'nsi.termes', 'difficile'),
  T('nsi', 'terminale', 'Bases de données', 'Jointures et requêtes complexes', 'nsi.sql', 'difficile'),
  T('nsi', 'terminale', 'Programmation', 'Programmation orientée objet', 'nsi.termes', 'moyen'),
  T('nsi', 'terminale', 'Réseaux', 'Routage et sous-réseaux', 'nsi.termes', 'difficile'),
  T('nsi', 'terminale', 'Sécurité', 'Cryptographie symétrique et asymétrique', 'nsi.termes', 'difficile', { theme: 'Sécurité' }),
  T('nsi', 'terminale', 'Sécurité', 'Hachage et signature électronique', 'nsi.termes', 'difficile'),
  T('nsi', 'terminale', 'Architecture', 'Jeu d’instructions et assembleur', 'nsi.termes', 'difficile', { theme: 'Architecture' }),
];

/* ================================================================== */
/*  SES                                                                */
/* ================================================================== */

const SES_SECONDE = [
  T('ses', 'seconde', 'Économie', 'Offre, demande et prix', 'ses.concepts', 'facile', { theme: 'Marchés' }),
  T('ses', 'seconde', 'Économie', 'L’entreprise et la production', 'ses.concepts', 'moyen', { theme: 'Entreprise' }),
  T('ses', 'seconde', 'Économie', 'PIB et croissance', 'ses.concepts', 'moyen', { theme: 'Macroéconomie' }),
  T('ses', 'seconde', 'Économie', 'Monnaie et financement', 'ses.concepts', 'moyen', { theme: 'Monnaie' }),
  T('ses', 'seconde', 'Sociologie', 'Socialisation et normes', 'ses.concepts', 'facile', { theme: 'Sociologie' }),
  T('ses', 'seconde', 'Sociologie', 'Familles et liens sociaux', 'ses.concepts', 'moyen', { theme: 'Sociologie' }),
  T('ses', 'seconde', 'Science politique', 'État et action publique', 'ses.concepts', 'moyen', { theme: 'Protection sociale' }),
  T('ses', 'seconde', 'Méthode', 'Taux, parts et coefficients', 'ses.calculs', 'moyen', { kind: 'taux' }),
  T('ses', 'seconde', 'Méthode', 'Lire un tableau statistique', 'ses.calculs', 'facile', { kind: 'part' }),
];

const SES_PREMIERE = [
  T('ses', 'premiere', 'Économie', 'Marchés et concurrence', 'ses.concepts', 'moyen', { theme: 'Marchés' }),
  T('ses', 'premiere', 'Économie', 'Défaillances du marché', 'ses.concepts', 'difficile'),
  T('ses', 'premiere', 'Économie', 'Croissance et développement', 'ses.concepts', 'moyen', { theme: 'Croissance' }),
  T('ses', 'premiere', 'Économie', 'Inflation et chômage', 'ses.concepts', 'moyen', { theme: 'Macroéconomie' }),
  T('ses', 'premiere', 'Économie', 'Politiques budgétaire et monétaire', 'ses.concepts', 'difficile', { theme: 'Politiques économiques' }),
  T('ses', 'premiere', 'Économie', 'Commerce international', 'ses.concepts', 'moyen', { theme: 'Commerce international' }),
  T('ses', 'premiere', 'Sociologie', 'Structures sociales et PCS', 'ses.concepts', 'moyen'),
  T('ses', 'premiere', 'Sociologie', 'Mobilité sociale', 'ses.concepts', 'difficile', { theme: 'Sociologie' }),
  T('ses', 'premiere', 'Sociologie', 'Engagement politique et syndical', 'ses.concepts', 'moyen'),
  T('ses', 'premiere', 'Science politique', 'Opinion publique et médias', 'ses.concepts', 'moyen'),
  T('ses', 'premiere', 'Regards croisés', 'Inégalités économiques', 'ses.concepts', 'moyen', { theme: 'Inégalités' }),
  T('ses', 'premiere', 'Regards croisés', 'Protection sociale', 'ses.concepts', 'moyen', { theme: 'Protection sociale' }),
  T('ses', 'premiere', 'Méthode', 'Calculs de SES : taux et évolutions', 'ses.calculs', 'difficile'),
  T('ses', 'premiere', 'Méthode', 'Auteurs et notions clés', 'ses.auteurs', 'difficile'),
];

const SES_TERMINALE = [
  T('ses', 'terminale', 'Économie', 'Sources de la croissance', 'ses.concepts', 'difficile', { theme: 'Croissance' }),
  T('ses', 'terminale', 'Économie', 'Instabilité de la croissance', 'ses.concepts', 'difficile'),
  T('ses', 'terminale', 'Économie', 'Politiques de l’emploi', 'ses.concepts', 'difficile', { theme: 'Emploi' }),
  T('ses', 'terminale', 'Économie', 'Financement de l’économie', 'ses.concepts', 'difficile', { theme: 'Monnaie' }),
  T('ses', 'terminale', 'Économie', 'Commerce international et régulation', 'ses.concepts', 'difficile', { theme: 'Commerce international' }),
  T('ses', 'terminale', 'Sociologie', 'Classes sociales et stratification', 'ses.concepts', 'difficile'),
  T('ses', 'terminale', 'Sociologie', 'Holisme et individualisme méthodologique', 'ses.concepts', 'difficile', { theme: 'Sociologie' }),
  T('ses', 'terminale', 'Sociologie', 'Travail et intégration sociale', 'ses.concepts', 'difficile'),
  T('ses', 'terminale', 'Science politique', 'Démocratie et participation', 'ses.concepts', 'difficile'),
  T('ses', 'terminale', 'Regards croisés', 'Justice sociale et inégalités', 'ses.concepts', 'difficile', { theme: 'Inégalités' }),
  T('ses', 'terminale', 'Regards croisés', 'Environnement et développement durable', 'ses.concepts', 'difficile', { theme: 'Environnement' }),
  T('ses', 'terminale', 'Méthode', 'Épreuve composée : calculs', 'ses.calculs', 'difficile'),
  T('ses', 'terminale', 'Méthode', 'Méthode de la dissertation en SES', 'bank:ses-terminale-methode-dissertation', 'difficile'),
];

/* ================================================================== */
/*  Export du catalogue                                                */
/* ================================================================== */

export const TOPIC_DEFINITIONS: (TopicDefinition & { id: string })[] = [
  ...MATH_TROISIEME,
  ...MATH_SECONDE,
  ...MATH_PREMIERE,
  ...MATH_TERMINALE,
  ...PHYS_TROISIEME,
  ...PHYS_SECONDE,
  ...PHYS_PREMIERE,
  ...PHYS_TERMINALE,
  ...FR_TROISIEME,
  ...FR_SECONDE,
  ...FR_PREMIERE,
  ...SVT_SECONDE,
  ...SVT_PREMIERE,
  ...SVT_TERMINALE,
  ...HG_TROISIEME,
  ...HG_SECONDE,
  ...HG_PREMIERE,
  ...HG_TERMINALE,
  ...PHILO,
  ...EN_SECONDE,
  ...EN_PREMIERE,
  ...EN_TERMINALE,
  ...ES_TOPICS,
  ...NSI_SECONDE,
  ...NSI_PREMIERE,
  ...NSI_TERMINALE,
  ...SES_SECONDE,
  ...SES_PREMIERE,
  ...SES_TERMINALE,
];

export type { TopicDefinition as TopicDef };
