/**
 * EduMate — Extension systématique du catalogue : MATHÉMATIQUES.
 *
 * Les générateurs mathématiques sont paramétrables : on peut donc décliner
 * chaque notion par niveau, par opération et par difficulté. Ce fichier
 * produit ces déclinaisons de façon *déclarative* (des tableaux de données),
 * ce qui garantit des sujets réellement distincts et faciles à étendre.
 */
import type { TopicDefinition } from '../topics.js';

const COLLEGE = ['troisieme'] as const;
const LYCEE = ['seconde', 'premiere', 'terminale'] as const;

/* ------------------------------------------------------------------ */
/*  Calcul numérique                                                   */
/* ------------------------------------------------------------------ */

const ARITH_OPS = [
  { op: '+', name: 'Additions', scale: [20, 100, 1000] as const },
  { op: '-', name: 'Soustractions', scale: [20, 100, 1000] as const },
  { op: '×', name: 'Multiplications', scale: [10, 20, 50] as const },
  { op: '÷', name: 'Divisions', scale: [10, 20, 50] as const },
] as const;

const arithTopics: TopicDefinition[] = [];
for (const level of COLLEGE) {
  for (const op of ARITH_OPS) {
    op.scale.forEach((max, index) => {
      const difficulty = index === 0 ? 'facile' : index === 1 ? 'moyen' : 'difficile';
      arithTopics.push({
        subjectId: 'mathematiques',
        levelId: level,
        theme: 'Nombres et calculs',
        name: `${op.name} (jusqu’à ${max})`,
        source: 'math.arithmetic',
        difficulty,
        params: { op: op.op, max },
      });
    });
  }
}

const decimalTopics: TopicDefinition[] = [];
for (const level of COLLEGE) {
  for (const op of [
    { op: '+', name: 'Additions de décimaux' },
    { op: '-', name: 'Soustractions de décimaux' },
    { op: '×', name: 'Multiplications de décimaux' },
  ]) {
    decimalTopics.push({
      subjectId: 'mathematiques',
      levelId: level,
      theme: 'Nombres et calculs',
      name: op.name,
      source: 'math.decimals',
      difficulty: 'moyen',
      params: { op: op.op, max: 20 },
    });
  }
}

const relativeTopics: TopicDefinition[] = [];
for (const level of COLLEGE) {
  for (const kind of [
    { kind: 'add', name: 'Addition de nombres relatifs', difficulty: 'facile' as const },
    { kind: 'sub', name: 'Soustraction de nombres relatifs', difficulty: 'moyen' as const },
    { kind: 'mul', name: 'Produit de nombres relatifs', difficulty: 'moyen' as const },
    { kind: 'sign', name: 'Règle des signes', difficulty: 'facile' as const },
  ]) {
    relativeTopics.push({
      subjectId: 'mathematiques',
      levelId: level,
      theme: 'Nombres et calculs',
      name: kind.name,
      source: 'math.relative',
      difficulty: kind.difficulty,
      params: { op: kind.kind },
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Fractions                                                          */
/* ------------------------------------------------------------------ */

const fractionTopics: TopicDefinition[] = [];
for (const level of COLLEGE) {
  for (const op of [
    { op: '+', name: 'Addition de fractions', difficulty: 'moyen' as const },
    { op: '-', name: 'Soustraction de fractions', difficulty: 'moyen' as const },
    { op: '×', name: 'Multiplication de fractions', difficulty: 'moyen' as const },
    { op: '÷', name: 'Division de fractions', difficulty: 'difficile' as const },
  ]) {
    fractionTopics.push({
      subjectId: 'mathematiques',
      levelId: level,
      theme: 'Fractions',
      name: op.name,
      source: 'math.fractions',
      difficulty: op.difficulty,
      params: { op: op.op, max: 9 },
    });
    fractionTopics.push({
      subjectId: 'mathematiques',
      levelId: level,
      theme: 'Fractions',
      name: `${op.name} (grands dénominateurs)`,
      source: 'math.fractions',
      difficulty: 'difficile',
      params: { op: op.op, max: 15 },
    });
  }
  fractionTopics.push({
    subjectId: 'mathematiques',
    levelId: level,
    theme: 'Fractions',
    name: 'Fractions irréductibles et PGCD',
    source: 'math.fraction.simplify',
    difficulty: 'moyen',
  });
}

/* ------------------------------------------------------------------ */
/*  Pourcentages & proportionnalité                                    */
/* ------------------------------------------------------------------ */

const percentTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, 'seconde'] as const) {
  for (const variant of [
    { variant: 'appliquer', name: 'Appliquer un pourcentage', difficulty: 'facile' as const },
    { variant: 'evolution', name: 'Évolution en pourcentage', difficulty: 'moyen' as const },
    { variant: 'recherche', name: 'Retrouver un pourcentage', difficulty: 'difficile' as const },
  ]) {
    percentTopics.push({
      subjectId: 'mathematiques',
      levelId: level,
      theme: 'Pourcentages',
      name: variant.name,
      source: 'math.percentages',
      difficulty: variant.difficulty,
      params: { variant: variant.variant },
    });
  }
  percentTopics.push({
    subjectId: 'mathematiques',
    levelId: level,
    theme: 'Pourcentages',
    name: 'Évolutions successives',
    source: 'math.percentages.successive',
    difficulty: 'difficile',
  });
  percentTopics.push({
    subjectId: 'mathematiques',
    levelId: level,
    theme: 'Proportionnalité',
    name: 'Quatrième proportionnelle',
    source: 'math.proportionality',
    difficulty: 'moyen',
  });
}

/* ------------------------------------------------------------------ */
/*  Puissances, racines, écriture scientifique                         */
/* ------------------------------------------------------------------ */

const powerTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, 'seconde'] as const) {
  powerTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Puissances', name: 'Produit de puissances', source: 'math.powers', difficulty: 'facile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Puissances', name: 'Quotient de puissances', source: 'math.powers', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Puissances', name: 'Puissance d’une puissance', source: 'math.powers', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Puissances', name: 'Exposants négatifs', source: 'math.powers', difficulty: 'difficile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Écriture scientifique', name: 'Convertir en écriture scientifique', source: 'math.scientific', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Racines carrées', name: 'Racines carrées exactes', source: 'math.roots', difficulty: 'facile', params: { kind: 'exact' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Racines carrées', name: 'Simplifier une racine carrée', source: 'math.roots', difficulty: 'difficile', params: { kind: 'simplify' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Racines carrées', name: 'Produit de racines carrées', source: 'math.roots', difficulty: 'moyen', params: { kind: 'product' } },
  );
}

/* ------------------------------------------------------------------ */
/*  Équations & inéquations                                            */
/* ------------------------------------------------------------------ */

const equationTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, ...LYCEE] as const) {
  equationTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Équations', name: 'Équations du premier degré', source: 'math.equation.linear', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Équations', name: 'Équations produit nul', source: 'math.equation.product', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Inéquations', name: 'Inéquations et sens de l’inégalité', source: 'math.inequations', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Inéquations', name: 'Inéquations à coefficient négatif', source: 'math.inequations', difficulty: 'difficile' },
  );
}
for (const level of ['premiere', 'terminale'] as const) {
  equationTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Second degré', name: 'Calcul du discriminant', source: 'math.equation.quadratic', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Second degré', name: 'Somme et produit des racines', source: 'math.equation.quadratic.roots', difficulty: 'difficile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Second degré', name: 'Sommet de la parabole', source: 'math.function.quadratic.vertex', difficulty: 'moyen' },
  );
}

/* ------------------------------------------------------------------ */
/*  Fonctions                                                          */
/* ------------------------------------------------------------------ */

const functionTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, ...LYCEE] as const) {
  functionTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Calculer une image', source: 'math.function.value', difficulty: 'facile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Déterminer un antécédent', source: 'math.function.antecedent', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Fonctions affines', source: 'math.function.affine', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Sens de variation', source: 'math.function.variation', difficulty: 'facile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Fonction carré', source: 'math.function.reference', difficulty: 'facile', params: { kind: 'carre' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Fonction inverse', source: 'math.function.reference', difficulty: 'moyen', params: { kind: 'inverse' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Fonction racine carrée', source: 'math.function.reference', difficulty: 'moyen', params: { kind: 'racine' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Fonction cube', source: 'math.function.reference', difficulty: 'moyen', params: { kind: 'cube' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Fonctions', name: 'Ensemble de définition', source: 'math.function.reference', difficulty: 'difficile', params: { kind: 'racine' } },
  );
}

/* ------------------------------------------------------------------ */
/*  Dérivation                                                         */
/* ------------------------------------------------------------------ */

const derivativeTopics: TopicDefinition[] = [];
for (const level of ['premiere', 'terminale'] as const) {
  derivativeTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’un polynôme de degré 2', source: 'math.derivative', difficulty: 'facile', params: { degree: 2 } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’un polynôme de degré 3', source: 'math.derivative', difficulty: 'moyen', params: { degree: 3 } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’un polynôme de degré 4', source: 'math.derivative', difficulty: 'difficile', params: { degree: 4 } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Nombre dérivé en un point', source: 'math.derivative.value', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Équation de la tangente', source: 'math.tangent', difficulty: 'difficile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’une exponentielle', source: 'math.derivative.advanced', difficulty: 'difficile', params: { kind: 'exp' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’un logarithme', source: 'math.derivative.advanced', difficulty: 'difficile', params: { kind: 'ln' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’un quotient', source: 'math.derivative.advanced', difficulty: 'difficile', params: { kind: 'rac' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dérivation', name: 'Dérivée d’une fonction trigonométrique', source: 'math.derivative.advanced', difficulty: 'difficile', params: { kind: 'sin' } },
  );
}

/* ------------------------------------------------------------------ */
/*  Suites                                                             */
/* ------------------------------------------------------------------ */

const sequenceTopics: TopicDefinition[] = [];
for (const level of ['premiere', 'terminale'] as const) {
  sequenceTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Suites', name: 'Terme d’une suite arithmétique', source: 'math.sequences', difficulty: 'facile', params: { kind: 'arithmetique' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Suites', name: 'Terme d’une suite géométrique', source: 'math.sequences', difficulty: 'moyen', params: { kind: 'geometrique' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Suites', name: 'Somme d’une suite arithmétique', source: 'math.sequences.sum', difficulty: 'difficile', params: { kind: 'arithmetique' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Suites', name: 'Somme d’une suite géométrique', source: 'math.sequences.sum', difficulty: 'difficile', params: { kind: 'geometrique' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Suites', name: 'Limite d’une suite géométrique', source: 'math.sequences.limit', difficulty: 'difficile' },
  );
}

/* ------------------------------------------------------------------ */
/*  Probabilités, statistiques, dénombrement                           */
/* ------------------------------------------------------------------ */

const probabilityTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, ...LYCEE] as const) {
  probabilityTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Probabilités', name: 'Probabilités avec un dé', source: 'math.probability.dice', difficulty: 'facile', params: { kind: 'pair' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Probabilités', name: 'Probabilités avec deux dés', source: 'math.probability.dice', difficulty: 'moyen', params: { kind: 'somme' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Statistiques', name: 'Moyenne d’une série', source: 'math.statistics', difficulty: 'facile', params: { kind: 'moyenne' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Statistiques', name: 'Médiane d’une série', source: 'math.statistics', difficulty: 'moyen', params: { kind: 'mediane' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Statistiques', name: 'Étendue d’une série', source: 'math.statistics', difficulty: 'facile', params: { kind: 'etendue' } },
  );
}
for (const level of ['premiere', 'terminale'] as const) {
  probabilityTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Probabilités', name: 'Probabilités conditionnelles', source: 'math.probability.conditional', difficulty: 'difficile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dénombrement', name: 'Coefficients binomiaux', source: 'math.combinaison', difficulty: 'difficile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Dénombrement', name: 'Factorielles et arrangements', source: 'math.arrangement', difficulty: 'moyen' },
  );
}

/* ------------------------------------------------------------------ */
/*  Géométrie & vecteurs                                               */
/* ------------------------------------------------------------------ */

const geometryTopics: TopicDefinition[] = [];
for (const level of [...COLLEGE, ...LYCEE] as const) {
  geometryTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Théorème de Pythagore', source: 'math.pythagore', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Aire d’un disque et périmètre d’un cercle', source: 'math.cercles', difficulty: 'facile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Aires des figures planes', source: 'math.aires.volumes', difficulty: 'facile', params: { kind: 'rectangle' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Aire d’un triangle', source: 'math.aires.volumes', difficulty: 'facile', params: { kind: 'triangle' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Volume d’un cube', source: 'math.aires.volumes', difficulty: 'facile', params: { kind: 'cube' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Volume d’un pavé droit', source: 'math.aires.volumes', difficulty: 'moyen', params: { kind: 'pave' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Géométrie', name: 'Volume d’un cylindre', source: 'math.aires.volumes', difficulty: 'moyen', params: { kind: 'cylindre' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Repérage', name: 'Distance entre deux points', source: 'math.distance', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Repérage', name: 'Équation réduite d’une droite', source: 'math.droites', difficulty: 'moyen' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Vecteurs', name: 'Somme de vecteurs', source: 'math.vecteurs', difficulty: 'facile', params: { kind: 'somme' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Vecteurs', name: 'Norme d’un vecteur', source: 'math.vecteurs', difficulty: 'moyen', params: { kind: 'norme' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Vecteurs', name: 'Colinéarité de vecteurs', source: 'math.vecteurs', difficulty: 'difficile', params: { kind: 'colineaire' } },
  );
}
for (const level of ['premiere', 'terminale'] as const) {
  geometryTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Vecteurs', name: 'Produit scalaire', source: 'math.vecteurs', difficulty: 'difficile', params: { kind: 'produit' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Trigonométrie', name: 'Valeurs trigonométriques remarquables', source: 'math.trigonometrie', difficulty: 'moyen' },
  );
}
for (const level of ['terminale'] as const) {
  geometryTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Nombres complexes', name: 'Addition de nombres complexes', source: 'math.complexes', difficulty: 'facile', params: { kind: 'somme' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Nombres complexes', name: 'Module d’un nombre complexe', source: 'math.complexes', difficulty: 'moyen', params: { kind: 'module' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Nombres complexes', name: 'Produit de nombres complexes', source: 'math.complexes', difficulty: 'difficile', params: { kind: 'produit' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Intégration', name: 'Intégrale d’un monôme', source: 'math.integrales', difficulty: 'moyen' },
  );
}

/* ------------------------------------------------------------------ */
/*  Exponentielle, logarithme, intervalles, algorithmique              */
/* ------------------------------------------------------------------ */

const analysisTopics: TopicDefinition[] = [];
for (const level of ['premiere', 'terminale'] as const) {
  analysisTopics.push(
    { subjectId: 'mathematiques', levelId: level, theme: 'Exponentielle et logarithme', name: 'Propriétés algébriques de exp et ln', source: 'math.exp.ln', difficulty: 'moyen', params: { kind: 'propre' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Exponentielle et logarithme', name: 'Résoudre une équation avec ln', source: 'math.exp.ln', difficulty: 'difficile', params: { kind: 'equation' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Exponentielle et logarithme', name: 'Signe de l’exponentielle', source: 'math.exp.ln', difficulty: 'facile', params: { kind: 'signe' } },
    { subjectId: 'mathematiques', levelId: level, theme: 'Ensembles', name: 'Appartenance à un intervalle', source: 'math.intervalles', difficulty: 'facile' },
    { subjectId: 'mathematiques', levelId: level, theme: 'Algorithmique', name: 'Boucles et affectations', source: 'math.algorithme', difficulty: 'moyen' },
  );
}

export const EXPANDED_MATH: TopicDefinition[] = [
  ...arithTopics,
  ...decimalTopics,
  ...relativeTopics,
  ...fractionTopics,
  ...percentTopics,
  ...powerTopics,
  ...equationTopics,
  ...functionTopics,
  ...derivativeTopics,
  ...sequenceTopics,
  ...probabilityTopics,
  ...geometryTopics,
  ...analysisTopics,
];

export const MATH_EXPANDED_COUNT = EXPANDED_MATH.length;

