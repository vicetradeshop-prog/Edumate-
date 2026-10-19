/**
 * EduMate — Familles de générateurs : MATHÉMATIQUES (collège / lycée).
 * Toutes les réponses sont calculées, jamais saisies à la main :
 * les questions sont donc exactes et varient à l'infini.
 */
import type { Question } from '../../../shared/types.js';
import type { GeneratorContext, QuestionFamily } from '../types.js';
import {
  fr,
  fractionLatex,
  gcd,
  lcm,
  numericDistractors,
  qcm,
  round,
  shortAnswer,
  simplifyFraction,
  trueFalse,
} from '../lib.js';
import { add, derivative, div, evaluate, fn, mul, neg, num, pow, simplify, toLatex, variable } from '../symbolic.js';

const x = variable('x');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const p = (ctx: GeneratorContext, key: string, fallback: number): number => {
  const v = ctx.params[key];
  return typeof v === 'number' ? v : fallback;
};

function numQuestion(topicId: string, prompt: string, answer: number, rng: GeneratorContext['rng'], opts: { digits?: number; unit?: string; explanation: string; difficulty?: Question['difficulty']; skill?: string; extras?: number[] }): Question | null {
  const { digits = 0, unit = '', explanation, difficulty = 'moyen', skill, extras = [] } = opts;
  const correct = `${fr(round(answer, digits), digits)}${unit ? ` ${unit}` : ''}`;
  const distractors = numericDistractors(answer, rng, { digits, extras }).map((d) => `${d}${unit ? ` ${unit}` : ''}`);
  return qcm({ topicId, prompt, correct, distractors, explanation, difficulty, skill, rng });
}

/* ------------------------------------------------------------------ */
/*  Calcul mental / opérations                                         */
/* ------------------------------------------------------------------ */

const arithmetic: QuestionFamily = {
  id: 'math.arithmetic',
  label: 'Calcul numérique',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const op = (ctx.params.op as string) ?? rng.pick(['+', '-', '×', '÷'] as const);
    const max = p(ctx, 'max', 20);
    let a = rng.int(2, max);
    let b = rng.int(2, max);
    let result = 0;
    let prompt = '';
    if (op === '+') {
      result = a + b;
      prompt = `Calculer : $${a} + ${b}$`;
    } else if (op === '-') {
      if (b > a) [a, b] = [b, a];
      result = a - b;
      prompt = `Calculer : $${a} - ${b}$`;
    } else if (op === '×') {
      result = a * b;
      prompt = `Calculer : $${a} \\times ${b}$`;
    } else {
      b = rng.int(2, Math.max(3, Math.floor(max / 2)));
      a = b * rng.int(2, Math.max(3, Math.floor(max / 2)));
      result = a / b;
      prompt = `Calculer : $${a} \\div ${b}$`;
    }
    return numQuestion(topicId, prompt, result, rng, {
      explanation: `On effectue l'opération : $${prompt.slice(prompt.indexOf('$') + 1, prompt.lastIndexOf('$'))} = ${result}$.`,
      difficulty: 'facile',
      skill: 'Calcul numérique',
      extras: [result + 1, result - 1, Math.abs(a) + Math.abs(b)],
    });
  },
};

const decimals: QuestionFamily = {
  id: 'math.decimals',
  label: 'Nombres décimaux',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const op = (ctx.params.op as string) ?? rng.pick(['+', '-', '×']);
    const a = rng.float(1, p(ctx, 'max', 20), 1);
    const b = rng.float(1, p(ctx, 'max', 20), 1);
    let result = op === '+' ? a + b : op === '-' ? Math.abs(a - b) : a * b;
    if (op === '-') result = a > b ? a - b : b - a;
    const left = op === '-' && a < b ? b : a;
    const right = op === '-' && a < b ? a : b;
    const symbol = op === '×' ? '\\times' : op;
    return numQuestion(topicId, `Calculer et arrondir au centième : $${fr(left, 1).replace(',', '.')} ${symbol} ${fr(right, 1).replace(',', '.')}$`, round(result, 2), rng, {
      digits: 2,
      explanation: `On pose l'opération avec les décimaux puis on arrondit au centième : résultat ${fr(round(result, 2), 2)}.`,
      skill: 'Opérations sur les décimaux',
    });
  },
};

const relativeNumbers: QuestionFamily = {
  id: 'math.relative',
  label: 'Nombres relatifs',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(-20, 20);
    const b = rng.int(-20, 20);
    const kind = rng.pick(['add', 'sub', 'mul', 'sign'] as const);
    if (kind === 'sign') {
      const product = a * b;
      return trueFalse(
        topicId,
        `Le produit $(${a}) \\times (${b})$ est ${product > 0 ? 'positif' : product < 0 ? 'négatif' : 'nul'}.`,
        true,
        `Règle des signes : deux facteurs de même signe donnent un produit positif, deux facteurs de signes contraires donnent un produit négatif. Ici $(${a}) \\times (${b}) = ${product}$.`,
        'facile',
        'Règle des signes',
      );
    }
    const result = kind === 'add' ? a + b : kind === 'sub' ? a - b : a * b;
    const symbol = kind === 'add' ? '+' : kind === 'sub' ? '-' : '\\times';
    return numQuestion(topicId, `Calculer : $(${a}) ${symbol} (${b})$`, result, rng, {
      explanation: `On applique la règle des signes puis on calcule : $(${a}) ${symbol} (${b}) = ${result}$.`,
      difficulty: 'facile',
      skill: 'Calcul sur les relatifs',
      extras: [Math.abs(result), -result, a + Math.abs(b)],
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Fractions                                                          */
/* ------------------------------------------------------------------ */

const fractions: QuestionFamily = {
  id: 'math.fractions',
  label: 'Fractions',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const op = (ctx.params.op as string) ?? rng.pick(['+', '-', '×', '÷'] as const);
    const max = p(ctx, 'max', 9);
    const n1 = rng.int(1, max);
    const d1 = rng.int(2, max);
    const n2 = rng.int(1, max);
    const d2 = rng.int(2, max);
    let n = 0;
    let d = 1;
    let symbol = '';
    if (op === '+') {
      n = n1 * d2 + n2 * d1;
      d = d1 * d2;
      symbol = '+';
    } else if (op === '-') {
      n = n1 * d2 - n2 * d1;
      d = d1 * d2;
      symbol = '-';
    } else if (op === '×') {
      n = n1 * n2;
      d = d1 * d2;
      symbol = '\\times';
    } else {
      n = n1 * d2;
      d = d1 * n2;
      symbol = '\\div';
    }
    if (d === 0 || n === 0) return null;
    const [sn, sd] = simplifyFraction(n, d);
    const prompt = `Calculer et donner le résultat sous forme de fraction irréductible : $\\dfrac{${n1}}{${d1}} ${symbol} \\dfrac{${n2}}{${d2}}$`;
    const correct = fractionLatex(sn, sd);
    const distractors: string[] = [];
    const wrongs: [number, number][] = [
      [n1 + n2, d1 + d2],
      [n1 * d2 + n2 * d1, d1 * d2 + 1],
      [sn + 1, sd],
      [sn, sd + 1],
      [n1 * n2 + 1, d1 * d2],
    ];
    for (const [wn, wd] of wrongs) {
      if (wd <= 0) continue;
      const value = fractionLatex(wn, wd);
      if (value !== correct && !distractors.includes(value)) distractors.push(value);
    }
    const explain =
      op === '+' || op === '-'
        ? `On met au même dénominateur ($${d1 * d2}$) puis on additionne/soustrait les numérateurs, enfin on simplifie par PGCD = ${gcd(n, d)}.`
        : op === '×'
          ? `On multiplie numérateurs entre eux et dénominateurs entre eux, puis on simplifie par PGCD = ${gcd(n, d)}.`
          : `Diviser par une fraction revient à multiplier par son inverse : $\\dfrac{${n1}}{${d1}} \\times \\dfrac{${d2}}{${n2}}$, puis on simplifie.`;
    return qcm({ topicId, prompt, correct, distractors: distractors.slice(0, 3), explanation: explain, difficulty: ctx.difficulty, skill: 'Calcul fractionnaire', rng });
  },
};

const fractionSimplify: QuestionFamily = {
  id: 'math.fraction.simplify',
  label: 'Simplification de fractions',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const d = rng.int(2, 9);
    const k = rng.int(2, 12);
    const n = d * k;
    const [sn, sd] = simplifyFraction(n, d);
    return qcm({
      topicId,
      prompt: `Écrire la fraction $\\dfrac{${n}}{${d}}$ sous forme irréductible.`,
      correct: fractionLatex(sn, sd),
      distractors: [fractionLatex(sn + 1, sd), fractionLatex(n, d + 1), fractionLatex(sn, sd + 1)].filter((v) => v !== fractionLatex(sn, sd)),
      explanation: `On divise le numérateur et le dénominateur par leur PGCD, ici $${gcd(n, d)}$ : $\\dfrac{${n}}{${d}} = ${fractionLatex(sn, sd)}$.`,
      difficulty: 'facile',
      skill: 'Fractions irréductibles',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Pourcentages & proportionnalité                                    */
/* ------------------------------------------------------------------ */

const percentages: QuestionFamily = {
  id: 'math.percentages',
  label: 'Pourcentages',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const variant = (ctx.params.variant as string) ?? rng.pick(['appliquer', 'evolution', 'recherche'] as const);
    if (variant === 'appliquer') {
      const base = rng.int(2, 40) * 25;
      const rate = rng.pick([5, 10, 15, 20, 25, 30, 40, 75]);
      const result = (base * rate) / 100;
      return numQuestion(topicId, `Calculer $${rate}\\,\\%$ de $${base}$.`, result, rng, {
        explanation: `$${rate}\\,\\%$ de $${base}$ = $${base} \\times \\dfrac{${rate}}{100} = ${fr(result)}$.`,
        difficulty: 'facile',
        skill: 'Appliquer un pourcentage',
        extras: [(base * (rate + 10)) / 100, base - result],
      });
    }
    if (variant === 'evolution') {
      const start = rng.int(2, 20) * 50;
      const rate = rng.int(-40, 60);
      const end = start * (1 + rate / 100);
      return numQuestion(topicId, `Un article coûte $${start}$ €. Son prix ${rate >= 0 ? `augmente de $${rate}\\,\\%$` : `diminue de $${-rate}\\,\\%$`}. Quel est le nouveau prix ?`, round(end, 2), rng, {
        digits: 2,
        unit: '€',
        explanation: `Coefficient multiplicateur : $1 ${rate >= 0 ? '+' : '-'} \\dfrac{${Math.abs(rate)}}{100} = ${round(1 + rate / 100, 3)}$. Donc $${start} \\times ${round(1 + rate / 100, 3)} = ${fr(round(end, 2), 2)}$ €.`,
        skill: 'Taux d’évolution',
        extras: [start + rate, start * (1 - rate / 100)],
      });
    }
    const total = rng.int(4, 40) * 5;
    const part = rng.int(1, total - 1);
    const rate = round((part / total) * 100, 1);
    return numQuestion(topicId, `Dans une classe de $${total}$ élèves, $${part}$ sont demi-pensionnaires. Quel pourcentage cela représente-t-il (au dixième près) ?`, rate, rng, {
      digits: 1,
      unit: '%',
      explanation: `On calcule $\\dfrac{${part}}{${total}} \\times 100 = ${fr(rate, 1)}\\,\\%$.`,
      skill: 'Pourcentage d’une partie',
    });
  },
};

const successiveRates: QuestionFamily = {
  id: 'math.percentages.successive',
  label: 'Évolutions successives',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const r1 = rng.pick([10, 20, 25, -10, -20]);
    const r2 = rng.pick([10, 20, 30, -10, -25]);
    const global = round(((1 + r1 / 100) * (1 + r2 / 100) - 1) * 100, 2);
    return numQuestion(topicId, `Une quantité subit une hausse de $${r1}\\,\\%$ puis une ${r2 >= 0 ? 'hausse' : 'baisse'} de $${Math.abs(r2)}\\,\\%$. Quel est le taux d'évolution global (en %, au centième) ?`, global, rng, {
      digits: 2,
      unit: '%',
      explanation: `Les taux ne s'additionnent pas : on multiplie les coefficients. $(1{,}${String(Math.abs(r1)).padStart(2, '0')} \\times 1{,}${r2 >= 0 ? '' : '-'}${String(Math.abs(r2)).padStart(2, '0')})$ donne $1 ${global >= 0 ? '+' : '-'} ${fr(Math.abs(global), 2)}$, soit un taux global de $${fr(global, 2)}\\,\\%$.`,
      skill: 'Évolutions successives',
      extras: [r1 + r2, global + 1],
    });
  },
};

const proportionality: QuestionFamily = {
  id: 'math.proportionality',
  label: 'Proportionnalité',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const k = rng.int(2, 12);
    const a = rng.int(2, 15);
    const b = rng.int(2, 15);
    const contexts = [
      { unit: '€', label: 'Des cahiers identiques coûtent' },
      { unit: 'km', label: 'Une voiture parcourt' },
      { unit: 'g', label: 'Une recette demande' },
    ];
    const c = rng.pick(contexts);
    return numQuestion(
      topicId,
      `${c.label} $${fr(a * k)} ${c.unit}$ pour $${a}$ unités. Combien pour $${b}$ unités (en ${c.unit}) ?`,
      b * k,
      rng,
      {
        unit: c.unit,
        explanation: `Coefficient de proportionnalité : $\\dfrac{${fr(a * k)}}{${a}} = ${k}$. Donc $${b} \\times ${k} = ${fr(b * k)} ${c.unit}$.`,
        difficulty: 'facile',
        skill: 'Quatrième proportionnelle',
        extras: [b * k + k, Math.round((a * k) / b)],
      },
    );
  },
};

/* ------------------------------------------------------------------ */
/*  Puissances, racines, écriture scientifique                          */
/* ------------------------------------------------------------------ */

const powers: QuestionFamily = {
  id: 'math.powers',
  label: 'Puissances',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const rule = rng.pick(['produit', 'quotient', 'puissance', 'negatif'] as const);
    const base = rng.int(2, 9);
    const n = rng.int(2, 6);
    const m = rng.int(2, 6);
    if (rule === 'produit') {
      return qcm({
        topicId,
        prompt: `Écrire sous la forme d'une seule puissance : $${base}^{${n}} \\times ${base}^{${m}}$`,
        correct: `$${base}^{${n + m}}$`,
        distractors: [`$${base}^{${n * m}}$`, `$${base * 2}^{${n + m}}$`, `$${base}^{${Math.abs(n - m)}}$`],
        explanation: `On additionne les exposants : $a^n \\times a^m = a^{n+m}$, donc $${base}^{${n + m}}$.`,
        difficulty: 'facile',
        skill: 'Règles des puissances',
        rng,
      });
    }
    if (rule === 'quotient') {
      const exp = n > m ? n - m : m - n;
      const form = n > m ? `$${base}^{${exp}}$` : `$\\dfrac{1}{${base}^{${exp}}}$`;
      return qcm({
        topicId,
        prompt: `Écrire sous la forme d'une puissance de $${base}$ : $\\dfrac{${base}^{${n}}}{${base}^{${m}}}$`,
        correct: form,
        distractors: [`$${base}^{${n + m}}$`, `$${base}^{${n * m}}$`, `$\\dfrac{1}{${base}^{${n + m}}}$`].filter((d) => d !== form),
        explanation: `On soustrait les exposants : $\\dfrac{a^n}{a^m} = a^{n-m}$. Ici $${n} - ${m} = ${n - m}$.`,
        skill: 'Règles des puissances',
        rng,
      });
    }
    if (rule === 'puissance') {
      return qcm({
        topicId,
        prompt: `Écrire sous la forme d'une seule puissance : $\\left(${base}^{${n}}\\right)^{${m}}$`,
        correct: `$${base}^{${n * m}}$`,
        distractors: [`$${base}^{${n + m}}$`, `$${base * m}^{${n}}$`, `$${base}^{${n ** m}}$`].filter((d) => d !== `$${base}^{${n * m}}$`),
        explanation: `On multiplie les exposants : $(a^n)^m = a^{n \\times m} = ${base}^{${n * m}}$.`,
        skill: 'Puissance de puissance',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quelle est la valeur de $${base}^{-${n}}$ ?`,
      correct: `$\\dfrac{1}{${base}^{${n}}}$`,
      distractors: [`$-${base}^{${n}}$`, `$\\dfrac{1}{${base}^{-${n}}}$`, `$-${n} \\times ${base}$`],
      explanation: `Un exposant négatif donne l'inverse : $a^{-n} = \\dfrac{1}{a^{n}}$.`,
      difficulty: 'facile',
      skill: 'Exposant négatif',
      rng,
    });
  },
};

const scientificNotation: QuestionFamily = {
  id: 'math.scientific',
  label: 'Écriture scientifique',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const mantissa = rng.float(1, 9.9, 2);
    const exp = rng.int(-6, 8);
    const value = mantissa * 10 ** exp;
    const formatted = `${fr(mantissa, 2).replace(',', '.')} \\times 10^{${exp}}`;
    const wrongExp = exp + rng.pick([1, -1, 2]);
    const written = value >= 1
      ? value.toLocaleString('fr-FR', { maximumFractionDigits: 10 }).replace(/\u202f|\u00a0/g, ' ')
      : String(value);
    return qcm({
      topicId,
      prompt: `Quelle est l'écriture scientifique de $${written}$ ?`,
      correct: `$${formatted}$`,
      distractors: [
        `$${fr(mantissa * 10, 2).replace(',', '.')} \\times 10^{${exp}}$`,
        `$${fr(mantissa, 2).replace(',', '.')} \\times 10^{${wrongExp}}$`,
        `$${fr(mantissa / 10, 3).replace(',', '.')} \\times 10^{${exp}}$`,
      ],
      explanation: `L'écriture scientifique s'écrit $a \\times 10^{n}$ avec $1 \\le a < 10$. Ici $a = ${fr(mantissa, 2)}$ et $n = ${exp}$.`,
      difficulty: 'facile',
      skill: 'Écriture scientifique',
      rng,
    });
  },
};

const squareRoots: QuestionFamily = {
  id: 'math.roots',
  label: 'Racines carrées',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const root = rng.int(2, 12);
    const square = root * root;
    const kind = rng.pick(['exact', 'simplify', 'product'] as const);
    if (kind === 'exact') {
      return numQuestion(topicId, `Calculer $\\sqrt{${square}}$.`, root, rng, {
        explanation: `$\\sqrt{${square}} = ${root}$ car $${root}^{2} = ${square}$.`,
        difficulty: 'facile',
        skill: 'Racine carrée exacte',
        extras: [root + 1, square / 2],
      });
    }
    if (kind === 'simplify') {
      const k = rng.int(2, 6);
      const under = k * k * square;
      return qcm({
        topicId,
        prompt: `Écrire $\\sqrt{${under}}$ sous la forme $a\\sqrt{b}$ avec $b$ le plus petit possible.`,
        correct: `$${k * root}\\sqrt{1}$`.replace('\\sqrt{1}', '') === `$${k * root}` ? `$${k * root}$` : `$${k}\\sqrt{${square}}$`,
        distractors: [`$${k + root}\\sqrt{${square}}$`, `$${k * square}$`, `$\\sqrt{${k * root}}$`],
        explanation: `$\\sqrt{${under}} = \\sqrt{${k * k} \\times ${square}} = ${k} \\times ${root} = ${k * root}$.`,
        skill: 'Simplifier une racine',
        rng,
      });
    }
    const a = rng.int(2, 9);
    const b = rng.int(2, 9);
    return qcm({
      topicId,
      prompt: `Simplifier $\\sqrt{${a * a * b * b}}$.`,
      correct: `$${a * b}$`,
      distractors: [`$${a + b}$`, `$${a * b * b}$`, `$\\sqrt{${a * b}}$`],
      explanation: `$\\sqrt{a^{2}b^{2}} = ab$ : donc $\\sqrt{${a * a * b * b}} = ${a * b}$.`,
      difficulty: 'facile',
      skill: 'Produit de racines',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Équations & inéquations                                            */
/* ------------------------------------------------------------------ */

const linearEquation: QuestionFamily = {
  id: 'math.equation.linear',
  label: 'Équations du premier degré',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(2, 9) * rng.sign();
    const sol = rng.int(-9, 9);
    const b = rng.int(-20, 20);
    const c = a * sol + b;
    return shortAnswer(
      topicId,
      `Résoudre l'équation : $${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${c}$. Donner la valeur de $x$.`,
      [String(sol), fr(sol)],
      `On isole $x$ : $${a}x = ${c} ${b >= 0 ? '-' : '+'} ${Math.abs(b)} = ${c - b}$, puis $x = \\dfrac{${c - b}}{${a}} = ${sol}$.`,
      'moyen',
      'Résoudre ax + b = c',
    );
  },
};

const productEquation: QuestionFamily = {
  id: 'math.equation.product',
  label: 'Équations produit',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const r1 = rng.int(-8, 8);
    const r2 = rng.int(-8, 8);
    const distinct = r1 !== r2;
    const correct = distinct ? `$x = ${r1}$ ou $x = ${r2}$` : `$x = ${r1}$`;
    return qcm({
      topicId,
      prompt: `Résoudre : $(x ${r1 >= 0 ? '-' : '+'} ${Math.abs(r1)})(x ${r2 >= 0 ? '-' : '+'} ${Math.abs(r2)}) = 0$.`,
      correct,
      distractors: [
        `$x = ${-r1}$ ou $x = ${-r2}$`,
        `$x = ${r1 + r2}$`,
        `$x = ${r1} \\times ${r2}$`,
      ].filter((d) => d !== correct),
      explanation: `Un produit de facteurs est nul si et seulement si l'un des facteurs est nul : $x ${r1 >= 0 ? '-' : '+'} ${Math.abs(r1)} = 0$ ou $x ${r2 >= 0 ? '-' : '+'} ${Math.abs(r2)} = 0$.`,
      difficulty: 'facile',
      skill: 'Équation produit nul',
      rng,
    });
  },
};

const quadraticEquation: QuestionFamily = {
  id: 'math.equation.quadratic',
  label: 'Équations du second degré',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([1, 1, 2, -1]);
    const r1 = rng.int(-6, 6);
    const r2 = rng.int(-6, 6);
    const b = -(r1 + r2) * a;
    const c = r1 * r2 * a;
    const delta = b * b - 4 * a * c;
    const fmt = (coef: number, suffix: string, first = false): string => {
      if (coef === 0) return '';
      const sign = coef < 0 ? '-' : first ? '' : '+';
      const abs = Math.abs(coef);
      const val = abs === 1 && suffix ? '' : String(abs);
      return `${first ? sign : ` ${sign} `}${val}${suffix}`;
    };
    const expr = `${fmt(a, 'x^{2}', true)}${fmt(b, 'x')}${fmt(c, '')}`;
    return qcm({
      topicId,
      prompt: `Pour l'équation $${expr} = 0$, quelle est la valeur du discriminant $\\Delta$ ?`,
      correct: `$\\Delta = ${delta}$`,
      distractors: [`$\\Delta = ${-delta}$`, `$\\Delta = ${b * b + 4 * a * c}$`, `$\\Delta = ${b + 4 * a * c}$`],
      explanation: `$\\Delta = b^{2} - 4ac = (${b})^{2} - 4 \\times (${a}) \\times (${c}) = ${delta}$. ${delta > 0 ? 'Deux solutions distinctes.' : delta === 0 ? 'Une solution double.' : 'Aucune solution réelle.'}`,
      skill: 'Discriminant',
      rng,
    });
  },
};

const quadraticRoots: QuestionFamily = {
  id: 'math.equation.quadratic.roots',
  label: 'Solutions du second degré',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const r1 = rng.int(-7, 7);
    let r2 = rng.int(-7, 7);
    if (r2 === r1) r2 += 1;
    const b = -(r1 + r2);
    const c = r1 * r2;
    const sum = r1 + r2;
    const prod = r1 * r2;
    return qcm({
      topicId,
      prompt: `L'équation $x^{2} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)} = 0$ a deux solutions. Quelle est leur somme ?`,
      correct: `$${sum}$`,
      distractors: [`$${prod}$`, `$${-sum}$`, `$${-b * c}$`].filter((d) => d !== `$${sum}$`),
      explanation: `Somme des racines $= -\\dfrac{b}{a} = ${sum}$ et produit $= \\dfrac{c}{a} = ${prod}$. Les solutions sont $x = ${r1}$ et $x = ${r2}$.`,
      skill: 'Somme et produit des racines',
      rng,
    });
  },
};

const inequalities: QuestionFamily = {
  id: 'math.inequations',
  label: 'Inéquations',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([-5, -4, -3, -2, 2, 3, 4, 5]);
    const sol = rng.int(-6, 6);
    const b = rng.int(-15, 15);
    const c = a * sol + b;
    const flip = a < 0;
    const correct = flip ? `$x \\le ${sol}$` : `$x \\ge ${sol}$`;
    return qcm({
      topicId,
      prompt: `Résoudre l'inéquation : $${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} \\ge ${c}$.`,
      correct,
      distractors: [flip ? `$x \\ge ${sol}$` : `$x \\le ${sol}$`, `$x \\ge ${-sol}$`, `$x \\le ${-sol}$`].filter((d) => d !== correct),
      explanation: `On isole $x$ : $${a}x \\ge ${c - b}$, puis on divise par $${a}$. ${flip ? 'Comme on divise par un nombre négatif, **on inverse le sens de l’inégalité**.' : 'Le sens de l’inégalité est conservé.'} D'où ${correct.replace(/\$/g, '')}.`,
      skill: 'Sens d’une inégalité',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Fonctions                                                          */
/* ------------------------------------------------------------------ */

const functionValue: QuestionFamily = {
  id: 'math.function.value',
  label: 'Image par une fonction',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(-4, 4) || 2;
    const b = rng.int(-9, 9);
    const c = rng.int(-9, 9);
    const v = rng.int(-5, 5);
    const image = a * v * v + b * v + c;
    const f = `$f(x) = ${a === 1 ? '' : a === -1 ? '-' : a}x^{2} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$`;
    return numQuestion(topicId, `Soit ${f}. Calculer $f(${v})$.`, image, rng, {
      explanation: `On remplace $x$ par $${v}$ : $f(${v}) = ${a} \\times (${v})^{2} ${b >= 0 ? '+' : '-'} ${Math.abs(b)} \\times (${v}) ${c >= 0 ? '+' : '-'} ${Math.abs(c)} = ${image}$.`,
      skill: 'Calculer une image',
      extras: [a * v + b * v + c, image + b],
    });
  },
};

const antecedent: QuestionFamily = {
  id: 'math.function.antecedent',
  label: 'Antécédent',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([2, 3, 4, 5, -2, -3]);
    const b = rng.int(-10, 10);
    const ant = rng.int(-8, 8);
    const image = a * ant + b;
    return shortAnswer(
      topicId,
      `Soit $f(x) = ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$. Déterminer l'antécédent de $${image}$ par $f$.`,
      [String(ant), fr(ant)],
      `On résout $${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${image}$, soit $${a}x = ${image - b}$ et $x = ${ant}$.`,
      'moyen',
      'Résoudre f(x) = k',
    );
  },
};

const affineFunction: QuestionFamily = {
  id: 'math.function.affine',
  label: 'Fonctions affines',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const x1 = rng.int(-6, 0);
    const x2 = rng.int(1, 6);
    const a = rng.pick([-3, -2, -1, 1, 2, 3, 4]);
    const b = rng.int(-8, 8);
    const y1 = a * x1 + b;
    const y2 = a * x2 + b;
    return qcm({
      topicId,
      prompt: `La fonction affine $f$ vérifie $f(${x1}) = ${y1}$ et $f(${x2}) = ${y2}$. Quelle est son expression ?`,
      correct: `$f(x) = ${a === 1 ? '' : a === -1 ? '-' : a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`,
      distractors: [
        `$f(x) = ${a + 1}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`,
        `$f(x) = ${a === -1 ? '' : a}x ${b + 1 >= 0 ? '+' : '-'} ${Math.abs(b + 1)}$`,
        `$f(x) = ${-a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`,
      ],
      explanation: `Le coefficient directeur vaut $a = \\dfrac{f(${x2}) - f(${x1})}{${x2} - (${x1})} = \\dfrac{${y2 - y1}}{${x2 - x1}} = ${a}$, puis $b = f(${x1}) - a \\times (${x1}) = ${b}$.`,
      skill: 'Coefficient directeur et ordonnée à l’origine',
      rng,
    });
  },
};

const variationTable: QuestionFamily = {
  id: 'math.function.variation',
  label: 'Sens de variation',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([-4, -3, -2, 2, 3, 4]);
    const b = rng.int(-10, 10);
    const increasing = a > 0;
    return trueFalse(
      topicId,
      `La fonction $f(x) = ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$ est ${increasing ? 'croissante' : 'décroissante'} sur $\\mathbb{R}$.`,
      true,
      `Une fonction affine $ax + b$ est croissante si $a > 0$ et décroissante si $a < 0$. Ici $a = ${a}$, elle est donc bien ${increasing ? 'croissante' : 'décroissante'}.`,
      'facile',
      'Sens de variation d’une affine',
    );
  },
};

const quadraticVertex: QuestionFamily = {
  id: 'math.function.quadratic.vertex',
  label: 'Sommet d’une parabole',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([-2, -1, 1, 2, 3]);
    const h = rng.int(-4, 4);
    const k = rng.int(-9, 9);
    const b = -2 * a * h;
    const c = a * h * h + k;
    return qcm({
      topicId,
      prompt: `Soit $f(x) = ${a === 1 ? '' : a === -1 ? '-' : a}x^{2} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$. Quelles sont les coordonnées du sommet $S$ ?`,
      correct: `$S(${h}\\,;\\,${k})$`,
      distractors: [`$S(${-h}\\,;\\,${k})$`, `$S(${h}\\,;\\,${-k})$`, `$S(${k}\\,;\\,${h})$`].filter((d) => d !== `$S(${h}\\,;\\,${k})$`),
      explanation: `L'abscisse du sommet est $\\alpha = -\\dfrac{b}{2a} = \\dfrac{${-b}}{${2 * a}} = ${h}$, puis $\\beta = f(${h}) = ${k}$. ${a > 0 ? 'La parabole est orientée vers le haut : le sommet est un minimum.' : 'La parabole est orientée vers le bas : le sommet est un maximum.'}`,
      skill: 'Forme canonique',
      rng,
    });
  },
};

const referenceFunctions: QuestionFamily = {
  id: 'math.function.reference',
  label: 'Fonctions de référence',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const v = rng.int(2, 12);
    const kind = rng.pick(['carre', 'inverse', 'racine', 'cube'] as const);
    if (kind === 'cube') {
      const c = rng.int(-5, 5);
      return numQuestion(topicId, `Soit $f(x) = x^{3}$. Calculer $f(${c})$.`, c ** 3, rng, {
        explanation: `$f(${c}) = (${c})^{3} = ${c ** 3}$.`,
        difficulty: 'facile',
        skill: 'Fonction cube',
        extras: [c * 3, Math.abs(c) ** 3],
      });
    }
    if (kind === 'carre') {
      return numQuestion(topicId, `Soit $f(x) = x^{2}$. Calculer $f(${v})$.`, v * v, rng, {
        explanation: `$f(${v}) = ${v}^{2} = ${v * v}$.`,
        difficulty: 'facile',
        skill: 'Fonction carré',
      });
    }
    if (kind === 'inverse') {
      const value = round(1 / v, 4);
      return qcm({
        topicId,
        prompt: `Soit $f(x) = \\dfrac{1}{x}$. Que vaut $f(${v})$ ?`,
        correct: `$\\dfrac{1}{${v}}$`,
        distractors: [`$${v}$`, `$-${v}$`, `$\\dfrac{1}{${v + 1}}$`],
        explanation: `La fonction inverse associe à $x$ son inverse : $f(${v}) = \\dfrac{1}{${v}} \\approx ${value}$.`,
        difficulty: 'facile',
        skill: 'Fonction inverse',
        rng,
      });
    }
    if (kind === 'racine') {
      return qcm({
        topicId,
        prompt: `Quel est l'ensemble de définition de la fonction $f(x) = \\sqrt{x ${v >= 0 ? '-' : '+'} ${Math.abs(v)}}$ ?`,
        correct: `$[${v}\\,;\\,+\\infty[$`,
        distractors: [`$]-\\infty\\,;\\,${v}]$`, `$\\mathbb{R}$`, `$]${v}\\,;\\,+\\infty[$`],
        explanation: `Il faut $x - ${v} \\ge 0$, soit $x \\ge ${v}$ : l'ensemble de définition est $[${v}\\,;\\,+\\infty[$.`,
        skill: 'Ensemble de définition',
        rng,
      });
    }
    return null;
  },
};

/* ------------------------------------------------------------------ */
/*  Dérivation                                                         */
/* ------------------------------------------------------------------ */

/** Construit un polynôme aléatoire de degré donné, à coefficients non nuls. */
function randomPolynomial(rng: GeneratorContext['rng'], degree: number): ReturnType<typeof simplify> {
  const terms = [num(rng.int(-9, 9))];
  for (let i = 1; i <= degree; i += 1) {
    let c = rng.int(1, 5) * rng.sign();
    if (i === degree && c === 0) c = 1;
    terms.push(c === 1 ? pow(x, num(i)) : mul(num(c), pow(x, num(i))));
  }
  return simplify(add(...terms));
}

const derivativeFamily: QuestionFamily = {
  id: 'math.derivative',
  label: 'Dérivation',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const degree = p(ctx, 'degree', rng.int(2, 3));
    const expr = randomPolynomial(rng, degree);
    const d = simplify(derivative(expr));
    const correct = `$f'(x) = ${toLatex(d)}$`;
    // Distracteurs : erreurs classiques (exposant non diminué, coefficient oublié)
    const wrongA = simplify(derivative(mul(expr, num(1))));
    const wrong1 = simplify(add(d, num(rng.int(1, 3))));
    const wrong2 = simplify(mul(d, num(2)));
    const wrong3 = simplify(derivative(simplify(add(expr, x))));
    const distractors = Array.from(new Set([toLatex(wrong1), toLatex(wrong2), toLatex(wrong3), toLatex(wrongA)]))
      .filter((t) => `$f'(x) = ${t}$` !== correct)
      .slice(0, 3)
      .map((t) => `$f'(x) = ${t}$`);
    return qcm({
      topicId,
      prompt: `Soit $f(x) = ${toLatex(expr)}$. Déterminer $f'(x)$.`,
      correct,
      distractors,
      explanation: `On dérive terme à terme avec $(x^{n})' = n x^{n-1}$ : $f'(x) = ${toLatex(d)}$.`,
      difficulty: ctx.difficulty,
      skill: 'Dérivée d’un polynôme',
      rng,
    });
  },
};

const derivativeAdvanced: QuestionFamily = {
  id: 'math.derivative.advanced',
  label: 'Dérivation composée',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(1, 5);
    const b = rng.int(-6, 6);
    const kind = rng.pick(['exp', 'ln', 'rac', 'sin'] as const);
    let expr;
    let d;
    if (kind === 'exp') {
      expr = fn('exp', add(mul(num(a), x), num(b)));
      d = simplify(mul(num(a), fn('exp', add(mul(num(a), x), num(b)))));
    } else if (kind === 'ln') {
      expr = fn('ln', add(mul(num(a), x), num(Math.abs(b) + 1)));
      d = simplify(div(num(a), add(mul(num(a), x), num(Math.abs(b) + 1))));
    } else if (kind === 'rac') {
      expr = div(add(mul(num(a), x), num(b)), add(x, num(rng.int(1, 5))));
      d = simplify(derivative(expr));
    } else {
      expr = fn('sin', mul(num(a), x));
      d = simplify(mul(num(a), fn('cos', mul(num(a), x))));
    }
    const correct = `$f'(x) = ${toLatex(d)}$`;
    const distractors = [
      `$f'(x) = ${toLatex(simplify(add(d, num(1))))}$`,
      `$f'(x) = ${toLatex(simplify(mul(d, num(-1))))}$`,
      `$f'(x) = ${toLatex(simplify(mul(d, num(2))))}$`,
    ].filter((v) => v !== correct);
    return qcm({
      topicId,
      prompt: `Soit $f(x) = ${toLatex(expr)}$. Déterminer $f'(x)$.`,
      correct,
      distractors: Array.from(new Set(distractors)).slice(0, 3),
      explanation: `On applique $(e^{u})' = u'e^{u}$, $(\\ln u)' = \\dfrac{u'}{u}$, $\\left(\\dfrac{u}{v}\\right)' = \\dfrac{u'v - uv'}{v^{2}}$ ou $(\\sin u)' = u'\\cos u$ selon le cas. Résultat : $f'(x) = ${toLatex(d)}$.`,
      skill: 'Dérivée composée',
      rng,
    });
  },
};

const derivativeValue: QuestionFamily = {
  id: 'math.derivative.value',
  label: 'Nombre dérivé',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const expr = randomPolynomial(rng, rng.int(2, 3));
    const d = simplify(derivative(expr));
    const at = rng.int(-3, 3);
    const value = round(evaluate(d, { x: at }), 2);
    return numQuestion(topicId, `Soit $f(x) = ${toLatex(expr)}$. Calculer le nombre dérivé $f'(${at})$.`, value, rng, {
      digits: Number.isInteger(value) ? 0 : 2,
      explanation: `On calcule d'abord $f'(x) = ${toLatex(d)}$, puis on remplace $x$ par $${at}$ : $f'(${at}) = ${fr(value, 2)}$.`,
      skill: 'Nombre dérivé',
    });
  },
};

const tangentLine: QuestionFamily = {
  id: 'math.tangent',
  label: 'Tangente',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const expr = randomPolynomial(rng, 2);
    const d = simplify(derivative(expr));
    const at = rng.int(-3, 3);
    const slope = round(evaluate(d, { x: at }), 2);
    const y0 = round(evaluate(expr, { x: at }), 2);
    const b = round(y0 - slope * at, 2);
    return qcm({
      topicId,
      prompt: `Soit $f(x) = ${toLatex(expr)}$. Quelle est l'équation de la tangente $T$ au point d'abscisse $${at}$ ?`,
      correct: `$y = ${fr(slope, 2)}x ${b >= 0 ? '+' : '-'} ${fr(Math.abs(b), 2)}$`,
      distractors: [
        `$y = ${fr(slope + 1, 2)}x ${b >= 0 ? '+' : '-'} ${fr(Math.abs(b), 2)}$`,
        `$y = ${fr(slope, 2)}x ${b + 1 >= 0 ? '+' : '-'} ${fr(Math.abs(b + 1), 2)}$`,
        `$y = ${fr(y0, 2)}x ${b >= 0 ? '+' : '-'} ${fr(Math.abs(b), 2)}$`,
      ],
      explanation: `La tangente en $a$ a pour équation $y = f'(a)(x - a) + f(a)$. Ici $f'(${at}) = ${fr(slope, 2)}$ et $f(${at}) = ${fr(y0, 2)}$, d'où $y = ${fr(slope, 2)}x ${b >= 0 ? '+' : '-'} ${fr(Math.abs(b), 2)}$.`,
      skill: 'Équation de tangente',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Suites                                                             */
/* ------------------------------------------------------------------ */

const sequences: QuestionFamily = {
  id: 'math.sequences',
  label: 'Suites numériques',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = (ctx.params.kind as string) ?? rng.pick(['arithmetique', 'geometrique'] as const);
    const u0 = rng.int(1, 12);
    const n = rng.int(4, 15);
    if (kind === 'arithmetique') {
      const r = rng.int(-5, 8) || 3;
      const un = u0 + n * r;
      return numQuestion(topicId, `La suite arithmétique $(u_n)$ a pour premier terme $u_0 = ${u0}$ et pour raison $r = ${r}$. Calculer $u_{${n}}$.`, un, rng, {
        explanation: `Formule explicite : $u_n = u_0 + n r = ${u0} + ${n} \\times (${r}) = ${un}$.`,
        skill: 'Suite arithmétique',
        extras: [u0 * r * n, un + r],
      });
    }
    const q = rng.pick([2, 3, -2, 0.5, 1.5]);
    const un = round(u0 * q ** n, 4);
    return numQuestion(topicId, `La suite géométrique $(u_n)$ a pour premier terme $u_0 = ${u0}$ et pour raison $q = ${fr(q, 2).replace(',', '.')}$. Calculer $u_{${n}}$.`, un, rng, {
      digits: Number.isInteger(un) ? 0 : 2,
      explanation: `Formule explicite : $u_n = u_0 \\times q^{n} = ${u0} \\times (${fr(q, 2).replace(',', '.')})^{${n}} = ${fr(un, 4)}$.`,
      skill: 'Suite géométrique',
    });
  },
};

const sequenceSum: QuestionFamily = {
  id: 'math.sequences.sum',
  label: 'Somme de termes',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['arithmetique', 'geometrique'] as const);
    if (kind === 'arithmetique') {
      const u0 = rng.int(1, 10);
      const r = rng.int(1, 6);
      const n = rng.int(5, 20);
      const sum = ((n + 1) * (2 * u0 + n * r)) / 2;
      return numQuestion(topicId, `Calculer $S = u_0 + u_1 + \\dots + u_{${n}}$ pour la suite arithmétique de premier terme $u_0 = ${u0}$ et de raison $r = ${r}$.`, round(sum, 2), rng, {
        explanation: `Somme d'une suite arithmique : $S = (\\text{nombre de termes}) \\times \\dfrac{\\text{premier} + \\text{dernier}}{2}$, soit $(${n + 1}) \\times \\dfrac{${u0} + ${u0 + n * r}}{2} = ${fr(sum, 2)}$.`,
        skill: 'Somme arithmétique',
      });
    }
    const u0 = rng.int(1, 6);
    const q = rng.pick([2, 3, 0.5]);
    const n = rng.int(4, 10);
    const sum = round(u0 * (1 - q ** (n + 1)) / (1 - q), 4);
    return numQuestion(topicId, `Calculer $S = u_0 + u_1 + \\dots + u_{${n}}$ pour la suite géométrique de premier terme $u_0 = ${u0}$ et de raison $q = ${fr(q, 2).replace(',', '.')}$.`, sum, rng, {
      digits: 2,
      explanation: `Somme géométrique : $S = u_0 \\times \\dfrac{1 - q^{${n + 1}}}{1 - q} = ${fr(sum, 2)}$.`,
      skill: 'Somme géométrique',
    });
  },
};

const sequenceLimit: QuestionFamily = {
  id: 'math.sequences.limit',
  label: 'Limite d’une suite',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const q = rng.pick([0.2, 0.5, 0.8, 1.2, 2, -0.5, -1.5]);
    const converges = Math.abs(q) < 1;
    return qcm({
      topicId,
      prompt: `La suite géométrique $(u_n)$ de raison $q = ${fr(q, 2).replace(',', '.')}$. Que vaut $\\lim\\limits_{n \\to +\\infty} u_n$ (avec $u_0 \\ne 0$) ?`,
      correct: converges ? '$0$' : q > 1 ? '$+\\infty$' : 'Elle ne converge pas (divergence)',
      distractors: converges ? ['$+\\infty$', '$1$', 'Elle ne converge pas (divergence)'] : ['$0$', '$1$', '$-\\infty$'],
      explanation: `Si $|q| < 1$, la suite converge vers $0$. Si $q > 1$, elle diverge vers $+\\infty$. Si $q \\le -1$, elle diverge (pas de limite). Ici $q = ${fr(q, 2).replace(',', '.')}$ donc ${converges ? 'convergence vers 0' : 'divergence'}.`,
      skill: 'Limite d’une suite géométrique',
      rng,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Probabilités, dénombrement, statistiques                           */
/* ------------------------------------------------------------------ */

const binomialCoeff: QuestionFamily = {
  id: 'math.combinaison',
  label: 'Dénombrement',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const n = rng.int(4, 10);
    const k = rng.int(2, n - 1);
    const fact = (v: number): number => (v <= 1 ? 1 : v * fact(v - 1));
    const c = fact(n) / (fact(k) * fact(n - k));
    return numQuestion(topicId, `Calculer le coefficient binomial $\\binom{${n}}{${k}}$.`, c, rng, {
      explanation: `$\\binom{${n}}{${k}} = \\dfrac{${n}!}{${k}!\\,(${n - k})!} = ${c}$.`,
      skill: 'Combinaisons',
      extras: [fact(n) / fact(k), n * k, c + k],
    });
  },
};

const arrangements: QuestionFamily = {
  id: 'math.arrangement',
  label: 'Arrangements et factorielles',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const n = rng.int(4, 8);
    const fact = (v: number): number => (v <= 1 ? 1 : v * fact(v - 1));
    return numQuestion(topicId, `De combien de façons peut-on ranger $${n}$ livres distincts sur une étagère ?`, fact(n), rng, {
      explanation: `Il s'agit d'une permutation : $${n}! = ${fact(n)}$ rangements possibles.`,
      skill: 'Factorielle',
      extras: [n * n, fact(n) / 2, fact(n - 1)],
    });
  },
};

const probabilityDice: QuestionFamily = {
  id: 'math.probability.dice',
  label: 'Probabilités',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['pair', 'multiple', 'superieur', 'somme'] as const);
    if (kind === 'somme') {
      const target = rng.int(5, 9);
      let count = 0;
      for (let i = 1; i <= 6; i += 1) for (let j = 1; j <= 6; j += 1) if (i + j === target) count += 1;
      return qcm({
        topicId,
        prompt: `On lance deux dés équilibrés à 6 faces. Quelle est la probabilité d'obtenir une somme de $${target}$ ?`,
        correct: `$\\dfrac{${count}}{36}$`,
        distractors: [`$\\dfrac{${Math.max(1, count - 1)}}{36}$`, `$\\dfrac{1}{6}$`, `$\\dfrac{${count}}{12}$`].filter((d) => d !== `$\\dfrac{${count}}{36}$`),
        explanation: `Il y a $36$ issues équiprobables et $${count}$ donnent la somme $${target}$. La probabilité est donc $\\dfrac{${count}}{36}$.`,
        skill: 'Probabilité avec deux dés',
        rng,
      });
    }
    const faces = [1, 2, 3, 4, 5, 6];
    const favourable =
      kind === 'pair' ? faces.filter((v) => v % 2 === 0) : kind === 'multiple' ? faces.filter((v) => v % 3 === 0) : faces.filter((v) => v >= 5);
    const label = kind === 'pair' ? 'un numéro pair' : kind === 'multiple' ? 'un multiple de 3' : 'un numéro supérieur ou égal à 5';
    return qcm({
      topicId,
      prompt: `On lance un dé équilibré à 6 faces. Quelle est la probabilité d'obtenir ${label} ?`,
      correct: fractionLatex(favourable.length, 6),
      distractors: [fractionLatex(6 - favourable.length, 6), fractionLatex(favourable.length, 5), fractionLatex(favourable.length + 1, 6)].filter((d) => d !== fractionLatex(favourable.length, 6)),
      explanation: `Cas favorables : $\\{${favourable.join('; ')}\\}$, soit $${favourable.length}$ issues sur $6$. Probabilité $= ${fractionLatex(favourable.length, 6)}$.`,
      difficulty: 'facile',
      skill: 'Probabilité simple',
      rng,
    });
  },
};

const conditionalProbability: QuestionFamily = {
  id: 'math.probability.conditional',
  label: 'Probabilités conditionnelles',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const total = 100;
    const a = rng.int(20, 60);
    const b = rng.int(20, 60);
    const both = rng.int(5, Math.min(a, b) - 1);
    const pA = a / total;
    const pAB = both / total;
    const result = round(pAB / pA, 4);
    return numQuestion(topicId, `Dans un lycée de $${total}$ élèves, $${a}$ pratiquent un sport (événement $A$), $${b}$ font de la musique et $${both}$ pratiquent les deux. Calculer $P_A(B)$ (probabilité de faire de la musique sachant qu'on pratique un sport).`, result, rng, {
      digits: 3,
      explanation: `$P_A(B) = \\dfrac{P(A \\cap B)}{P(A)} = \\dfrac{${both}/${total}}{${a}/${total}} = \\dfrac{${both}}{${a}} \\approx ${fr(result, 3)}$.`,
      skill: 'Probabilité conditionnelle',
    });
  },
};

const statisticsFamily: QuestionFamily = {
  id: 'math.statistics',
  label: 'Statistiques',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['moyenne', 'mediane', 'etendue'] as const);
    const values = Array.from({ length: rng.pick([5, 7, 9]) }, () => rng.int(2, 20));
    const sorted = [...values].sort((a, b) => a - b);
    const list = values.join(' ; ');
    if (kind === 'moyenne') {
      const mean = round(values.reduce((s, v) => s + v, 0) / values.length, 2);
      return numQuestion(topicId, `Voici une série de notes : $${list}$. Calculer la moyenne (au centième).`, mean, rng, {
        digits: 2,
        explanation: `Moyenne $= \\dfrac{\\text{somme}}{\\text{effectif}} = \\dfrac{${values.reduce((s, v) => s + v, 0)}}{${values.length}} = ${fr(mean, 2)}$.`,
        skill: 'Moyenne',
      });
    }
    if (kind === 'mediane') {
      const median = values.length % 2 === 1 ? sorted[(values.length - 1) / 2] : round((sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2, 1);
      return numQuestion(topicId, `Voici une série : $${list}$. Déterminer la médiane.`, median, rng, {
        digits: Number.isInteger(median) ? 0 : 1,
        explanation: `On range la série dans l'ordre croissant : $${sorted.join(' ; ')}$. La médiane partage la série en deux effectifs égaux : $${fr(median, 1)}$.`,
        skill: 'Médiane',
      });
    }
    const range = sorted[sorted.length - 1] - sorted[0];
    return numQuestion(topicId, `Voici une série : $${list}$. Quelle est son étendue ?`, range, rng, {
      explanation: `Étendue $= \\text{max} - \\text{min} = ${sorted[sorted.length - 1]} - ${sorted[0]} = ${range}$.`,
      difficulty: 'facile',
      skill: 'Étendue',
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Géométrie & vecteurs                                               */
/* ------------------------------------------------------------------ */

const pythagore: QuestionFamily = {
  id: 'math.pythagore',
  label: 'Théorème de Pythagore',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const triples: [number, number, number][] = [
      [3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15], [20, 21, 29], [12, 16, 20],
    ];
    const [a, b, c] = rng.pick(triples);
    const k = rng.pick([1, 1, 2]);
    const A = a * k;
    const B = b * k;
    const C = c * k;
    return numQuestion(topicId, `Un triangle rectangle a des côtés de l'angle droit de $${A}$ cm et $${B}$ cm. Quelle est la longueur de l'hypoténuse (en cm) ?`, C, rng, {
      unit: 'cm',
      explanation: `Théorème de Pythagore : $c^{2} = a^{2} + b^{2} = ${A}^{2} + ${B}^{2} = ${A * A + B * B}$, donc $c = \\sqrt{${A * A + B * B}} = ${C}$ cm.`,
      skill: 'Pythagore',
      extras: [A + B, Math.round(Math.sqrt(A * A + B * B) + 1)],
    });
  },
};

const trigonometry: QuestionFamily = {
  id: 'math.trigonometrie',
  label: 'Trigonométrie',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const angles = [
      { deg: 30, cos: '\\dfrac{\\sqrt{3}}{2}', sin: '\\dfrac{1}{2}', tan: '\\dfrac{\\sqrt{3}}{3}' },
      { deg: 45, cos: '\\dfrac{\\sqrt{2}}{2}', sin: '\\dfrac{\\sqrt{2}}{2}', tan: '1' },
      { deg: 60, cos: '\\dfrac{1}{2}', sin: '\\dfrac{\\sqrt{3}}{2}', tan: '\\sqrt{3}' },
    ];
    const a = rng.pick(angles);
    const which = rng.pick(['cos', 'sin', 'tan'] as const);
    const correct = a[which];
    const others = ['cos', 'sin', 'tan'].filter((k) => k !== which) as ('cos' | 'sin' | 'tan')[];
    return qcm({
      topicId,
      prompt: `Quelle est la valeur exacte de $\\${which}(${a.deg}^{\\circ})$ ?`,
      correct: `$${correct}$`,
      distractors: [`$${a[others[0]]}$`, `$${a[others[1]]}$`, `$${a.deg}$`].filter((d) => d !== `$${correct}$`),
      explanation: `Valeurs remarquables : $\\cos 30° = \\dfrac{\\sqrt{3}}{2}$, $\\sin 30° = \\dfrac{1}{2}$, $\\cos 45° = \\sin 45° = \\dfrac{\\sqrt{2}}{2}$, $\\cos 60° = \\dfrac{1}{2}$, $\\sin 60° = \\dfrac{\\sqrt{3}}{2}$. Ici $\\${which}(${a.deg}°) = ${correct}$.`,
      skill: 'Valeurs trigonométriques remarquables',
      rng,
    });
  },
};

const vectors: QuestionFamily = {
  id: 'math.vecteurs',
  label: 'Vecteurs',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['somme', 'norme', 'produit', 'colineaire'] as const);
    const ax = rng.int(-8, 8);
    const ay = rng.int(-8, 8);
    const bx = rng.int(-8, 8);
    const by = rng.int(-8, 8);
    if (kind === 'somme') {
      return qcm({
        topicId,
        prompt: `Soient $\\vec{u}(${ax}\\,;\\,${ay})$ et $\\vec{v}(${bx}\\,;\\,${by})$. Quelles sont les coordonnées de $\\vec{u} + \\vec{v}$ ?`,
        correct: `$(${ax + bx}\\,;\\,${ay + by})$`,
        distractors: [`$(${ax - bx}\\,;\\,${ay - by})$`, `$(${ax * bx}\\,;\\,${ay * by})$`, `$(${ay + bx}\\,;\\,${ax + by})$`],
        explanation: `On additionne coordonnée par coordonnée : $\\vec{u} + \\vec{v} = (${ax} + ${bx}\\,;\\,${ay} + ${by}) = (${ax + bx}\\,;\\,${ay + by})$.`,
        difficulty: 'facile',
        skill: 'Somme de vecteurs',
        rng,
      });
    }
    if (kind === 'produit') {
      const dot = ax * bx + ay * by;
      return numQuestion(topicId, `Soient $\\vec{u}(${ax}\\,;\\,${ay})$ et $\\vec{v}(${bx}\\,;\\,${by})$. Calculer le produit scalaire $\\vec{u} \\cdot \\vec{v}$.`, dot, rng, {
        explanation: `$\\vec{u} \\cdot \\vec{v} = x x' + y y' = ${ax} \\times (${bx}) + ${ay} \\times (${by}) = ${dot}$. ${dot === 0 ? 'Le produit est nul : les vecteurs sont orthogonaux.' : ''}`,
        skill: 'Produit scalaire',
        extras: [ax * bx - ay * by, dot + 1],
      });
    }
    if (kind === 'norme') {
      const norm = round(Math.sqrt(ax * ax + ay * ay), 3);
      const perfect = Number.isInteger(norm);
      return perfect
        ? numQuestion(topicId, `Calculer la norme du vecteur $\\vec{u}(${ax}\\,;\\,${ay})$.`, norm, rng, {
            explanation: `$\\|\\vec{u}\\| = \\sqrt{x^{2} + y^{2}} = \\sqrt{${ax * ax + ay * ay}} = ${norm}$.`,
            skill: 'Norme d’un vecteur',
          })
        : qcm({
            topicId,
            prompt: `Quelle est la norme exacte de $\\vec{u}(${ax}\\,;\\,${ay})$ ?`,
            correct: `$\\sqrt{${ax * ax + ay * ay}}$`,
            distractors: [`$${ax * ax + ay * ay}$`, `$${Math.abs(ax) + Math.abs(ay)}$`, `$\\sqrt{${Math.abs(ax * ax + ay * ay) + 1}}$`],
            explanation: `$\\|\\vec{u}\\| = \\sqrt{${ax}^{2} + ${ay}^{2}} = \\sqrt{${ax * ax + ay * ay}} \\approx ${fr(norm, 2)}$.`,
            skill: 'Norme d’un vecteur',
            rng,
          });
    }
    const det = ax * by - ay * bx;
    return trueFalse(
      topicId,
      `Les vecteurs $\\vec{u}(${ax}\\,;\\,${ay})$ et $\\vec{v}(${bx}\\,;\\,${by})$ sont colinéaires.`,
      det === 0,
      `Deux vecteurs sont colinéaires si leur déterminant $xy' - yx'$ est nul. Ici : $${ax} \\times (${by}) - ${ay} \\times (${bx}) = ${det}$, ils ${det === 0 ? 'sont donc colinéaires' : 'ne sont pas colinéaires'}.`,
      'moyen',
      'Colinéarité',
    );
  },
};

const lineEquation: QuestionFamily = {
  id: 'math.droites',
  label: 'Équations de droites',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.pick([-3, -2, -1, 1, 2, 3, 4]);
    const b = rng.int(-9, 9);
    const px = rng.int(-5, 5);
    const py = a * px + b;
    return qcm({
      topicId,
      prompt: `Quelle est l'équation réduite de la droite passant par $A(${px}\\,;\\,${py})$ et de coefficient directeur $${a}$ ?`,
      correct: `$y = ${a === 1 ? '' : a === -1 ? '-' : a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`,
      distractors: [
        `$y = ${a}x ${b + 1 >= 0 ? '+' : '-'} ${Math.abs(b + 1)}$`,
        `$y = ${a + 1}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`,
        `$y = ${a}x ${-b >= 0 ? '+' : '-'} ${Math.abs(-b)}$`,
      ].filter((d) => d !== `$y = ${a === 1 ? '' : a === -1 ? '-' : a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}$`),
      explanation: `On part de $y = ax + b$ avec $a = ${a}$, puis on utilise le point $A$ : $${py} = ${a} \\times (${px}) + b$, d'où $b = ${b}$.`,
      skill: 'Équation réduite de droite',
      rng,
    });
  },
};

const distance: QuestionFamily = {
  id: 'math.distance',
  label: 'Distance entre deux points',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const dx = rng.int(-8, 8);
    const dy = rng.int(-8, 8);
    const ax = rng.int(-6, 6);
    const ay = rng.int(-6, 6);
    const bx = ax + dx;
    const by = ay + dy;
    const d2 = dx * dx + dy * dy;
    const perfect = Number.isInteger(Math.sqrt(d2));
    return perfect
      ? numQuestion(topicId, `Calculer la distance $AB$ avec $A(${ax}\\,;\\,${ay})$ et $B(${bx}\\,;\\,${by})$.`, Math.sqrt(d2), rng, {
          explanation: `$AB = \\sqrt{(${bx} - ${ax})^{2} + (${by} - ${ay})^{2}} = \\sqrt{${d2}} = ${Math.sqrt(d2)}$.`,
          skill: 'Distance repérée',
        })
      : qcm({
          topicId,
          prompt: `Soient $A(${ax}\\,;\\,${ay})$ et $B(${bx}\\,;\\,${by})$. Quelle est la distance $AB$ ?`,
          correct: `$\\sqrt{${d2}}$`,
          distractors: [`$${d2}$`, `$${Math.abs(dx) + Math.abs(dy)}$`, `$${Math.abs(dx * dy)}$`],
          explanation: `Formule de distance : $AB = \\sqrt{(x_B - x_A)^{2} + (y_B - y_A)^{2}} = \\sqrt{${dx}^{2} + ${dy}^{2}} = \\sqrt{${d2}} \\approx ${fr(Math.sqrt(d2), 2)}$.`,
          skill: 'Distance repérée',
          rng,
        });
  },
};

const circles: QuestionFamily = {
  id: 'math.cercles',
  label: 'Cercles et disques',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const r = rng.int(2, 12);
    const kind = rng.pick(['aire', 'perimetre'] as const);
    if (kind === 'aire') {
      return qcm({
        topicId,
        prompt: `Quelle est l'aire exacte d'un disque de rayon $${r}$ cm ?`,
        correct: `$${r * r}\\pi$ cm²`,
        distractors: [`$${2 * r}\\pi$ cm²`, `$${r}\\pi$ cm²`, `$${r * r * 2}\\pi$ cm²`],
        explanation: `Aire du disque $= \\pi r^{2} = \\pi \\times ${r}^{2} = ${r * r}\\pi$ cm² (environ ${fr(Math.PI * r * r, 1)} cm²).`,
        difficulty: 'facile',
        skill: 'Aire d’un disque',
        rng,
      });
    }
    return qcm({
      topicId,
      prompt: `Quel est le périmètre exact d'un cercle de rayon $${r}$ cm ?`,
      correct: `$${2 * r}\\pi$ cm`,
      distractors: [`$${r * r}\\pi$ cm`, `$${r}\\pi$ cm`, `$${4 * r}\\pi$ cm`],
      explanation: `Périmètre $= 2\\pi r = 2 \\times \\pi \\times ${r} = ${2 * r}\\pi$ cm (environ ${fr(2 * Math.PI * r, 1)} cm).`,
      difficulty: 'facile',
      skill: 'Périmètre d’un cercle',
      rng,
    });
  },
};

const areasVolumes: QuestionFamily = {
  id: 'math.aires.volumes',
  label: 'Aires et volumes',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['rectangle', 'triangle', 'cube', 'pave', 'cylindre'] as const);
    if (kind === 'rectangle') {
      const L = rng.int(3, 20);
      const l = rng.int(2, 12);
      return numQuestion(topicId, `Un rectangle mesure $${L}$ cm de long et $${l}$ cm de large. Quelle est son aire (en cm²) ?`, L * l, rng, {
        unit: 'cm²',
        explanation: `Aire $= L \\times l = ${L} \\times ${l} = ${L * l}$ cm².`,
        difficulty: 'facile',
        skill: 'Aire d’un rectangle',
      });
    }
    if (kind === 'triangle') {
      const base = rng.int(4, 20);
      const h = rng.int(3, 15);
      return numQuestion(topicId, `Un triangle a une base de $${base}$ cm et une hauteur relative de $${h}$ cm. Quelle est son aire (en cm²) ?`, (base * h) / 2, rng, {
        unit: 'cm²',
        explanation: `Aire $= \\dfrac{\\text{base} \\times \\text{hauteur}}{2} = \\dfrac{${base} \\times ${h}}{2} = ${fr((base * h) / 2, 1)}$ cm².`,
        difficulty: 'facile',
        skill: 'Aire d’un triangle',
      });
    }
    if (kind === 'cube') {
      const c = rng.int(2, 9);
      return numQuestion(topicId, `Quel est le volume d'un cube d'arête $${c}$ cm (en cm³) ?`, c ** 3, rng, {
        unit: 'cm³',
        explanation: `Volume du cube $= c^{3} = ${c}^{3} = ${c ** 3}$ cm³.`,
        difficulty: 'facile',
        skill: 'Volume d’un cube',
      });
    }
    if (kind === 'pave') {
      const L = rng.int(3, 12);
      const l = rng.int(2, 9);
      const h = rng.int(2, 9);
      return numQuestion(topicId, `Un pavé droit mesure $${L}$ cm × $${l}$ cm × $${h}$ cm. Quel est son volume (en cm³) ?`, L * l * h, rng, {
        unit: 'cm³',
        explanation: `Volume $= L \\times l \\times h = ${L} \\times ${l} \\times ${h} = ${L * l * h}$ cm³.`,
        difficulty: 'facile',
        skill: 'Volume d’un pavé',
      });
    }
    const r = rng.int(2, 8);
    const h = rng.int(4, 15);
    return qcm({
      topicId,
      prompt: `Quel est le volume exact d'un cylindre de rayon $${r}$ cm et de hauteur $${h}$ cm ?`,
      correct: `$${r * r * h}\\pi$ cm³`,
      distractors: [`$${2 * r * h}\\pi$ cm³`, `$${r * h}\\pi$ cm³`, `$${r * r * h * 2}\\pi$ cm³`],
      explanation: `Volume du cylindre $= \\pi r^{2} h = \\pi \\times ${r}^{2} \\times ${h} = ${r * r * h}\\pi$ cm³ (≈ ${fr(Math.PI * r * r * h, 1)} cm³).`,
      skill: 'Volume d’un cylindre',
      rng,
    });
  },
};

const intervals: QuestionFamily = {
  id: 'math.intervalles',
  label: 'Intervalles et ensembles',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(-8, 0);
    const b = rng.int(1, 9);
    const c = rng.int(a + 1, b - 1);
    return trueFalse(topicId, `Le nombre $${c}$ appartient à l'intervalle $[${a}\\,;\\,${b}]$.`, c >= a && c <= b, `Un intervalle fermé $[${a}\\,;\\,${b}]$ contient tous les réels $x$ tels que ${a} \\le x \\le ${b}. Comme $${a} \\le ${c} \\le ${b}$, l'affirmation est ${c >= a && c <= b ? 'vraie' : 'fausse'}.`, 'facile', 'Appartenance à un intervalle');
  },
};

const expLn: QuestionFamily = {
  id: 'math.exp.ln',
  label: 'Exponentielle et logarithme',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['proprie', 'equation', 'signe'] as const);
    if (kind === 'proprie') {
      const a = rng.int(1, 5);
      const b = rng.int(1, 5);
      return qcm({
        topicId,
        prompt: `Simplifier : $\\dfrac{e^{${a}} \\times e^{${b}}}{e^{${a}}}$`,
        correct: `$e^{${b}}$`,
        distractors: [`$e^{${a + b}}$`, `$e^{${a * b}}$`, `$e^{${a - b}}$`],
        explanation: `$\\dfrac{e^{a} \\times e^{b}}{e^{a}} = e^{a + b - a} = e^{b} = e^{${b}}$.`,
        skill: 'Propriétés algébriques de l’exponentielle',
        rng,
      });
    }
    if (kind === 'equation') {
      const k = rng.int(1, 6);
      return shortAnswer(topicId, `Résoudre dans $\\mathbb{R}$ : $\\ln(x) = ${k}$. Donner la valeur exacte de $x$ (format exp).`, [`e^${k}`, `exp(${k})`, `e${k}`], `On utilise la bijection réciproque : $\\ln x = ${k} \\iff x = e^{${k}}$.`, 'moyen', 'Équation avec ln');
    }
    const a = rng.int(-5, 5);
    return qcm({
      topicId,
      prompt: `Quel est le signe de $e^{${a}}$ ?`,
      correct: 'Toujours strictement positif',
      distractors: ['Du signe de l’exposant', 'Toujours négatif', 'Nul si l’exposant est nul'],
      explanation: `La fonction exponentielle est strictement positive sur $\\mathbb{R}$ : pour tout réel $x$, $e^{x} > 0$. Donc $e^{${a}} > 0$.`,
      difficulty: 'facile',
      skill: 'Signe de l’exponentielle',
      rng,
    });
  },
};

const integration: QuestionFamily = {
  id: 'math.integrales',
  label: 'Intégration',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(-3, 2);
    const b = a + rng.int(2, 6);
    const k = rng.int(1, 6);
    const n = rng.pick([1, 2]);
    // Intégrale exacte de k*x^n entre a et b
    const F = (t: number): number => (k * t ** (n + 1)) / (n + 1);
    const value = round(F(b) - F(a), 3);
    return numQuestion(topicId, `Calculer $\\displaystyle\\int_{${a}}^{${b}} ${k === 1 ? '' : k}x${n === 1 ? '' : `^{${n}}`}\\,dx$.`, value, rng, {
      digits: Number.isInteger(value) ? 0 : 3,
      explanation: `Une primitive de $${k === 1 ? '' : k}x^{${n}}$ est $F(x) = \\dfrac{${k}}{${n + 1}}x^{${n + 1}}$. Donc $\\int_{${a}}^{${b}} = F(${b}) - F(${a}) = ${fr(value, 3)}$.`,
      skill: 'Intégrale d’un monôme',
    });
  },
};

const complexNumbers: QuestionFamily = {
  id: 'math.complexes',
  label: 'Nombres complexes',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(-6, 6);
    const b = rng.int(-6, 6) || 3;
    const c = rng.int(-6, 6);
    const d = rng.int(-6, 6) || 2;
    const kind = rng.pick(['somme', 'module', 'produit'] as const);
    if (kind === 'somme') {
      return qcm({
        topicId,
        prompt: `Calculer $(${a} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}i) + (${c} ${d >= 0 ? '+' : '-'} ${Math.abs(d)}i)$.`,
        correct: `$${a + c} ${b + d >= 0 ? '+' : '-'} ${Math.abs(b + d)}i$`,
        distractors: [`$${a * c} ${b * d >= 0 ? '+' : '-'} ${Math.abs(b * d)}i$`, `$${a + c} ${b - d >= 0 ? '+' : '-'} ${Math.abs(b - d)}i$`, `$${a - c} ${b + d >= 0 ? '+' : '-'} ${Math.abs(b + d)}i$`],
        explanation: `On additionne les parties réelles et les parties imaginaires séparément.`,
        difficulty: 'facile',
        skill: 'Opérations sur les complexes',
        rng,
      });
    }
    if (kind === 'module') {
      const m2 = a * a + b * b;
      const perfect = Number.isInteger(Math.sqrt(m2));
      return qcm({
        topicId,
        prompt: `Quel est le module de $z = ${a} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}i$ ?`,
        correct: perfect ? `$${Math.sqrt(m2)}$` : `$\\sqrt{${m2}}$`,
        distractors: [`$${m2}$`, `$${Math.abs(a) + Math.abs(b)}$`, `$${Math.abs(a)}$`].filter((v) => v !== (perfect ? `$${Math.sqrt(m2)}$` : `$\\sqrt{${m2}}$`)),
        explanation: `$|z| = \\sqrt{a^{2} + b^{2}} = \\sqrt{${a * a} + ${b * b}} = ${perfect ? Math.sqrt(m2) : `\\sqrt{${m2}}`} \\approx ${fr(Math.sqrt(m2), 2)}$.`,
        skill: 'Module d’un complexe',
        rng,
      });
    }
    const re = a * c - b * d;
    const im = a * d + b * c;
    return qcm({
      topicId,
      prompt: `Calculer $(${a} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}i) \\times (${c} ${d >= 0 ? '+' : '-'} ${Math.abs(d)}i)$ (rappel : $i^{2} = -1$).`,
      correct: `$${re} ${im >= 0 ? '+' : '-'} ${Math.abs(im)}i$`,
      distractors: [`$${a * c} ${b * d >= 0 ? '+' : '-'} ${Math.abs(b * d)}i$`, `$${re} ${im - 1 >= 0 ? '+' : '-'} ${Math.abs(im - 1)}i$`, `$${a * c + b * d} ${im >= 0 ? '+' : '-'} ${Math.abs(im)}i$`],
      explanation: `On développe : $(a + bi)(c + di) = ac + adi + bci + bd i^{2} = (ac - bd) + (ad + bc)i$.`,
      skill: 'Produit de complexes',
      rng,
    });
  },
};

const scratchAlgorithm: QuestionFamily = {
  id: 'math.algorithme',
  label: 'Algorithmique',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(2, 12);
    const b = rng.int(2, 12);
    const n = rng.int(2, 6);
    let value = a;
    for (let i = 1; i <= n; i += 1) value = value * 2 + b;
    return numQuestion(topicId, `On exécute l'algorithme suivant avec $a = ${a}$ et $b = ${b}$ :\n\n\`\`\`\ns ← ${a}\nRépéter ${n} fois :\n   s ← 2 × s + ${b}\nAfficher s\n\`\`\`\n\nQuelle valeur est affichée ?`, value, rng, {
      explanation: `On déroule la boucle ${n} fois en partant de $s = ${a}$ : chaque tour double la valeur puis ajoute $${b}$. Résultat final : $${value}$.`,
      skill: 'Boucle et affectation',
    });
  },
};

export const MATH_FAMILIES: QuestionFamily[] = [
  arithmetic,
  decimals,
  relativeNumbers,
  fractions,
  fractionSimplify,
  percentages,
  successiveRates,
  proportionality,
  powers,
  scientificNotation,
  squareRoots,
  linearEquation,
  productEquation,
  quadraticEquation,
  quadraticRoots,
  inequalities,
  functionValue,
  antecedent,
  affineFunction,
  variationTable,
  quadraticVertex,
  referenceFunctions,
  derivativeFamily,
  derivativeAdvanced,
  derivativeValue,
  tangentLine,
  sequences,
  sequenceSum,
  sequenceLimit,
  binomialCoeff,
  arrangements,
  probabilityDice,
  conditionalProbability,
  statisticsFamily,
  pythagore,
  trigonometry,
  vectors,
  lineEquation,
  distance,
  circles,
  areasVolumes,
  intervals,
  expLn,
  integration,
  complexNumbers,
  scratchAlgorithm,
];
