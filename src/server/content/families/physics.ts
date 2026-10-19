/**
 * EduMate — Familles de générateurs : PHYSIQUE-CHIMIE.
 * Chaque question est calculée à partir des formules du programme,
 * les valeurs numériques sont tirées au sort : rien n'est inventé.
 */
import type { Question } from '../../../shared/types.js';
import type { GeneratorContext, QuestionFamily } from '../types.js';
import { fr, numericDistractors, qcm, round, shortAnswer, trueFalse } from '../lib.js';
import { CONSTANTS, CONVERSIONS, ELEMENTS, MOLECULES } from '../data/chemistry.js';

const p = (ctx: GeneratorContext, key: string, fallback: number): number => {
  const v = ctx.params[key];
  return typeof v === 'number' ? v : fallback;
};

function numeric(topicId: string, prompt: string, answer: number, ctx: GeneratorContext, opts: { digits?: number; unit?: string; explanation: string; difficulty?: Question['difficulty']; skill?: string; extras?: number[] }): Question | null {
  const { digits = 2, unit = '', explanation, difficulty = 'moyen', skill, extras = [] } = opts;
  const correct = `${fr(round(answer, digits), digits)}${unit ? ` ${unit}` : ''}`;
  const distractors = numericDistractors(answer, ctx.rng, { digits, extras }).map((d) => `${d}${unit ? ` ${unit}` : ''}`);
  return qcm({ topicId, prompt, correct, distractors, explanation, difficulty, skill, rng: ctx.rng });
}

/* ------------------------------------------------------------------ */
/*  Mécanique                                                          */
/* ------------------------------------------------------------------ */

const speed: QuestionFamily = {
  id: 'phys.speed',
  label: 'Vitesse et mouvement',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const variant = rng.pick(['v', 'd', 't', 'convert'] as const);
    if (variant === 'convert') {
      const kmh = rng.int(3, 40) * 5;
      const ms = round(kmh / 3.6, 2);
      return numeric(topicId, `Convertir $${kmh}$ km/h en m/s.`, ms, ctx, {
        unit: 'm/s',
        explanation: `On divise par 3,6 : $${kmh} \\div 3{,}6 = ${fr(ms, 2)}$ m/s.`,
        difficulty: 'facile',
        skill: 'Conversion d’unités de vitesse',
      });
    }
    const d = rng.int(2, 30) * 10;
    const t = rng.int(2, 20);
    if (variant === 'v') {
      return numeric(topicId, `Un cycliste parcourt $${d}$ m en $${t}$ s à vitesse constante. Quelle est sa vitesse (en m/s) ?`, d / t, ctx, {
        unit: 'm/s',
        explanation: `$v = \\dfrac{d}{t} = \\dfrac{${d}}{${t}} = ${fr(d / t, 2)}$ m/s.`,
        difficulty: 'facile',
        skill: 'Relation distance-vitesse-temps',
        extras: [d * t, t / d],
      });
    }
    if (variant === 'd') {
      const v = rng.int(2, 30);
      return numeric(topicId, `Un véhicule roule à $${v}$ m/s pendant $${t}$ s. Quelle distance parcourt-il (en m) ?`, v * t, ctx, {
        unit: 'm',
        explanation: `$d = v \\times t = ${v} \\times ${t} = ${v * t}$ m.`,
        difficulty: 'facile',
        skill: 'Distance parcourue',
        extras: [v + t, v / t],
      });
    }
    const v = rng.int(2, 30);
    return numeric(topicId, `Un mobile parcourt $${d}$ m à la vitesse de $${v}$ m/s. Quelle est la durée du trajet (en s) ?`, d / v, ctx, {
      unit: 's',
      explanation: `$t = \\dfrac{d}{v} = \\dfrac{${d}}{${v}} = ${fr(d / v, 2)}$ s.`,
      skill: 'Durée d’un trajet',
    });
  },
};

const newton: QuestionFamily = {
  id: 'phys.newton',
  label: 'Lois de Newton',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const m = rng.int(2, 40);
    const a = rng.float(0.5, 8, 1);
    const f = round(m * a, 2);
    const variant = rng.pick(['f', 'a', 'concept'] as const);
    if (variant === 'f') {
      return numeric(topicId, `Un solide de masse $${m}$ kg subit une accélération de $${fr(a, 1)}$ m/s². Quelle est la valeur de la force résultante (en N) ?`, f, ctx, {
        unit: 'N',
        explanation: `Deuxième loi de Newton : $\\sum \\vec{F} = m \\vec{a}$, donc $F = ${m} \\times ${fr(a, 1)} = ${fr(f, 2)}$ N.`,
        skill: 'F = m × a',
      });
    }
    if (variant === 'a') {
      const force = rng.int(5, 200);
      return numeric(topicId, `Une force de $${force}$ N est appliquée à un solide de masse $${m}$ kg. Quelle accélération subit-il (en m/s²) ?`, force / m, ctx, {
        unit: 'm/s²',
        explanation: `$a = \\dfrac{F}{m} = \\dfrac{${force}}{${m}} = ${fr(force / m, 2)}$ m/s².`,
        skill: 'Accélération',
      });
    }
    return trueFalse(
      topicId,
      `Dans un référentiel galiléen, un système soumis à des forces qui se compensent est nécessairement immobile.`,
      false,
      `Faux : d'après le principe d'inertie (1ʳᵉ loi de Newton), si les forces se compensent, le système est soit au repos, soit en mouvement rectiligne uniforme.`,
      'facile',
      'Principe d’inertie',
    );
  },
};

const weight: QuestionFamily = {
  id: 'phys.weight',
  label: 'Poids et masse',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const m = rng.float(0.5, 90, 1);
    const g = p(ctx, 'g', CONSTANTS.g);
    const w = round(m * g, 2);
    return numeric(topicId, `Calculer le poids d'un objet de masse $${fr(m, 1)}$ kg sur Terre ($g = ${fr(g, 2)}$ N/kg).`, w, ctx, {
      unit: 'N',
      explanation: `$P = m \\times g = ${fr(m, 1)} \\times ${fr(g, 2)} = ${fr(w, 2)}$ N. Le poids est une force (en newtons), la masse s'exprime en kilogrammes.`,
      difficulty: 'facile',
      skill: 'Relation P = m g',
    });
  },
};

const energy: QuestionFamily = {
  id: 'phys.energy',
  label: 'Énergies',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['cinetique', 'potentielle', 'puissance'] as const);
    const m = rng.int(1, 60);
    if (kind === 'cinetique') {
      const v = rng.int(2, 30);
      const ec = round(0.5 * m * v * v, 1);
      return numeric(topicId, `Calculer l'énergie cinétique d'un solide de masse $${m}$ kg se déplaçant à $${v}$ m/s (en J).`, ec, ctx, {
        digits: 0,
        unit: 'J',
        explanation: `$E_c = \\dfrac{1}{2} m v^{2} = 0{,}5 \\times ${m} \\times ${v}^{2} = ${fr(ec, 0)}$ J.`,
        skill: 'Énergie cinétique',
        extras: [m * v * v, m * v],
      });
    }
    if (kind === 'potentielle') {
      const h = rng.float(1, 40, 1);
      const ep = round(m * CONSTANTS.g * h, 1);
      return numeric(topicId, `Calculer l'énergie potentielle de pesanteur d'un objet de masse $${m}$ kg à $${fr(h, 1)}$ m de hauteur ($g = 9{,}81$ N/kg).`, ep, ctx, {
        digits: 0,
        unit: 'J',
        explanation: `$E_p = m g h = ${m} \\times 9{,}81 \\times ${fr(h, 1)} = ${fr(ep, 0)}$ J.`,
        skill: 'Énergie potentielle',
        extras: [m * h, m * 10 * h],
      });
    }
    const e = rng.int(200, 20000);
    const t = rng.int(2, 60);
    return numeric(topicId, `Un appareil transfère $${e}$ J en $${t}$ s. Quelle est sa puissance (en W) ?`, e / t, ctx, {
      unit: 'W',
      explanation: `$P = \\dfrac{E}{\\Delta t} = \\dfrac{${e}}{${t}} = ${fr(e / t, 2)}$ W.`,
      skill: 'Puissance',
    });
  },
};

const work: QuestionFamily = {
  id: 'phys.work',
  label: 'Travail d’une force',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const f = rng.int(5, 200);
    const d = rng.int(2, 40);
    const angle = rng.pick([0, 0, 60, 90]);
    const w = round(f * d * Math.cos((angle * Math.PI) / 180), 2);
    return numeric(topicId, `Une force constante de $${f}$ N déplace son point d'application de $${d}$ m, en formant un angle de $${angle}°$ avec le déplacement. Calculer son travail (en J).`, w, ctx, {
      unit: 'J',
      explanation: `$W = F \\times d \\times \\cos(\\theta) = ${f} \\times ${d} \\times \\cos(${angle}°) = ${fr(w, 2)}$ J. ${angle === 90 ? 'Le travail est nul car la force est perpendiculaire au déplacement.' : ''}`,
      skill: 'Travail d’une force constante',
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Électricité                                                        */
/* ------------------------------------------------------------------ */

const ohm: QuestionFamily = {
  id: 'phys.ohm',
  label: 'Loi d’Ohm',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const variant = rng.pick(['u', 'i', 'r'] as const);
    const r = rng.int(5, 220);
    const i = rng.float(0.05, 3, 2);
    if (variant === 'u') {
      const u = round(r * i, 2);
      return numeric(topicId, `Un conducteur ohmique de résistance $${r}$ Ω est traversé par un courant de $${fr(i, 2)}$ A. Quelle tension existe à ses bornes (en V) ?`, u, ctx, {
        unit: 'V',
        explanation: `Loi d'Ohm : $U = R \\times I = ${r} \\times ${fr(i, 2)} = ${fr(u, 2)}$ V.`,
        skill: 'U = R I',
      });
    }
    if (variant === 'i') {
      const u = rng.int(3, 240);
      return numeric(topicId, `Une tension de $${u}$ V est appliquée aux bornes d'un conducteur de résistance $${r}$ Ω. Quelle est l'intensité du courant (en A) ?`, u / r, ctx, {
        digits: 3,
        unit: 'A',
        explanation: `$I = \\dfrac{U}{R} = \\dfrac{${u}}{${r}} = ${fr(u / r, 3)}$ A.`,
        skill: 'Intensité du courant',
      });
    }
    const u = rng.int(3, 240);
    const intensity = rng.float(0.05, 3, 2);
    return numeric(topicId, `Un dipôle soumis à $${u}$ V est traversé par $${fr(intensity, 2)}$ A. Quelle est sa résistance (en Ω) ?`, u / intensity, ctx, {
      digits: 1,
      unit: 'Ω',
      explanation: `$R = \\dfrac{U}{I} = \\dfrac{${u}}{${fr(intensity, 2)}} = ${fr(u / intensity, 1)}$ Ω.`,
      skill: 'Résistance',
    });
  },
};

const electricPower: QuestionFamily = {
  id: 'phys.electric.power',
  label: 'Puissance électrique',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const u = rng.pick([12, 24, 120, 230]);
    const i = rng.float(0.1, 8, 2);
    const pw = round(u * i, 1);
    const e = rng.pick(['puissance', 'energie'] as const);
    if (e === 'puissance') {
      return numeric(topicId, `Un appareil fonctionne sous $${u}$ V et est traversé par un courant de $${fr(i, 2)}$ A. Quelle puissance consomme-t-il (en W) ?`, pw, ctx, {
        unit: 'W',
        explanation: `$P = U \\times I = ${u} \\times ${fr(i, 2)} = ${fr(pw, 1)}$ W.`,
        difficulty: 'facile',
        skill: 'P = U I',
      });
    }
    const h = rng.int(1, 12);
    return numeric(topicId, `Un appareil de puissance $${pw}$ W fonctionne pendant $${h}$ h. Quelle énergie consomme-t-il (en Wh) ?`, pw * h, ctx, {
      unit: 'Wh',
      explanation: `$E = P \\times \\Delta t = ${pw} \\times ${h} = ${fr(pw * h, 1)}$ Wh (soit ${fr((pw * h) / 1000, 3)} kWh).`,
      skill: 'Énergie consommée',
    });
  },
};

const circuits: QuestionFamily = {
  id: 'phys.circuits',
  label: 'Circuits série / dérivation',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const r1 = rng.int(5, 100);
    const r2 = rng.int(5, 100);
    const kind = rng.pick(['serie', 'derivation', 'concept'] as const);
    if (kind === 'serie') {
      return numeric(topicId, `Deux résistances $R_1 = ${r1}$ Ω et $R_2 = ${r2}$ Ω sont montées en série. Quelle est la résistance équivalente (en Ω) ?`, r1 + r2, ctx, {
        digits: 0,
        unit: 'Ω',
        explanation: `En série, les résistances s'additionnent : $R_{eq} = R_1 + R_2 = ${r1 + r2}$ Ω.`,
        difficulty: 'facile',
        skill: 'Association série',
        extras: [r1 * r2, Math.abs(r1 - r2)],
      });
    }
    if (kind === 'derivation') {
      const eq = round((r1 * r2) / (r1 + r2), 2);
      return numeric(topicId, `Deux résistances $R_1 = ${r1}$ Ω et $R_2 = ${r2}$ Ω sont montées en dérivation (parallèle). Quelle est la résistance équivalente (en Ω) ?`, eq, ctx, {
        unit: 'Ω',
        explanation: `En dérivation : $\\dfrac{1}{R_{eq}} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2}$, donc $R_{eq} = \\dfrac{R_1 R_2}{R_1 + R_2} = ${fr(eq, 2)}$ Ω (toujours inférieure à la plus petite des deux).`,
        skill: 'Association parallèle',
      });
    }
    return trueFalse(topicId, `Dans un circuit en série, l'intensité du courant est la même en tout point.`, true, `Vrai : c'est la loi d'unicité de l'intensité en série. En dérivation, c'est la tension qui est la même aux bornes de chaque branche.`, 'facile', 'Lois des circuits');
  },
};

/* ------------------------------------------------------------------ */
/*  Ondes & optique                                                    */
/* ------------------------------------------------------------------ */

const waves: QuestionFamily = {
  id: 'phys.waves',
  label: 'Ondes périodiques',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['lambda', 'periode', 'concept'] as const);
    if (kind === 'concept') {
      return trueFalse(topicId, `Une onde progressive transporte de l'énergie sans transporter de matière.`, true, `Vrai : une onde transporte de l'énergie (et de l'information), mais pas de matière — les oscillations se propagent de proche en proche.`, 'facile', 'Nature d’une onde');
    }
    if (kind === 'periode') {
      const f = rng.pick([50, 100, 250, 500, 1000, 440]);
      const T = round(1 / f, 6);
      return numeric(topicId, `Une onde périodique a une fréquence de $${f}$ Hz. Quelle est sa période (en s) ?`, T, ctx, {
        digits: 5,
        unit: 's',
        explanation: `$T = \\dfrac{1}{f} = \\dfrac{1}{${f}} = ${fr(T, 5)}$ s (soit ${fr(T * 1000, 2)} ms).`,
        skill: 'Période et fréquence',
      });
    }
    const f = rng.int(2, 20) * 100;
    const v = rng.pick([340, 1500, 3.0e8]);
    const lambda = v / f;
    const medium = v === 340 ? 'dans l’air (v = 340 m/s)' : v === 1500 ? 'dans l’eau (v = 1500 m/s)' : 'dans le vide (c = 3,0 × 10⁸ m/s)';
    return numeric(topicId, `Une onde de fréquence $${f}$ Hz se propage ${medium}. Quelle est sa longueur d'onde (en m) ?`, lambda, ctx, {
      digits: lambda < 0.001 ? 9 : 4,
      unit: 'm',
      explanation: `$\\lambda = \\dfrac{v}{f} = \\dfrac{${v}}{${f}} = ${lambda.toExponential(3)}$ m.`,
      skill: 'Longueur d’onde',
    });
  },
};

const optics: QuestionFamily = {
  id: 'phys.optics',
  label: 'Optique géométrique',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['reflexion', 'refraction', 'lentille'] as const);
    if (kind === 'reflexion') {
      const i = rng.int(5, 80);
      return qcm({
        topicId,
        prompt: `Un rayon lumineux frappe un miroir plan avec un angle d'incidence de $${i}°$. Quel est l'angle de réflexion ?`,
        correct: `$${i}°$`,
        distractors: [`$${90 - i}°$`, `$${180 - i}°$`, `$${Math.max(1, i - 10)}°$`],
        explanation: `Lois de Snell-Descartes pour la réflexion : l'angle de réflexion est égal à l'angle d'incidence, tous deux mesurés par rapport à la normale.`,
        difficulty: 'facile',
        skill: 'Réflexion',
        rng,
      });
    }
    if (kind === 'refraction') {
      const n1 = rng.pick([1.0, 1.0, 1.33, 1.5]);
      const n2 = rng.pick([1.33, 1.5, 1.0]);
      const i1 = rng.int(10, 60);
      const sinR = (n1 * Math.sin((i1 * Math.PI) / 180)) / n2;
      if (Math.abs(sinR) > 1) return null;
      const r = round((Math.asin(sinR) * 180) / Math.PI, 1);
      return numeric(topicId, `Un rayon passe d'un milieu d'indice $n_1 = ${fr(n1, 2)}$ à un milieu d'indice $n_2 = ${fr(n2, 2)}$ avec un angle d'incidence de $${i1}°$. Quel est l'angle de réfraction (en degrés) ?`, r, ctx, {
        digits: 1,
        unit: '°',
        explanation: `Loi de Snell-Descartes : $n_1 \\sin(i_1) = n_2 \\sin(i_2)$, donc $i_2 = \\arcsin\\!\\left(\\dfrac{${fr(n1, 2)} \\times \\sin(${i1}°)}{${fr(n2, 2)}}\\right) = ${fr(r, 1)}°$.`,
        skill: 'Réfraction',
      });
    }
    const f = rng.int(5, 40);
    const vergence = round(1 / (f / 100), 2);
    return numeric(topicId, `Une lentille convergente a une distance focale de $${f}$ cm. Quelle est sa vergence (en dioptries δ) ?`, vergence, ctx, {
      unit: 'δ',
      explanation: `La vergence vaut $C = \\dfrac{1}{f'}$ avec $f'$ en mètres : $C = \\dfrac{1}{${fr(f / 100, 2)}} = ${fr(vergence, 2)}$ δ.`,
      skill: 'Vergence d’une lentille',
    });
  },
};

const radioactivity: QuestionFamily = {
  id: 'phys.radioactivity',
  label: 'Décroissance radioactive',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const half = rng.pick([2, 4, 5, 6, 10]);
    const n0 = rng.pick([100, 200, 400, 800, 1000]);
    const n = rng.int(1, 4);
    const remaining = n0 / 2 ** n;
    return numeric(topicId, `Un échantillon radioactif contient $${n0}$ noyaux à $t = 0$. Sa demi-vie est de $${half}$ jours. Combien reste-t-il de noyaux après $${half * n}$ jours ?`, remaining, ctx, {
      digits: 0,
      unit: 'noyaux',
      explanation: `Chaque demi-vie divise le nombre de noyaux par 2. Après $${half * n}$ jours, soit $${n}$ demi-vies : $\\dfrac{${n0}}{2^{${n}}} = ${remaining}$ noyaux.`,
      difficulty: 'facile',
      skill: 'Demi-vie',
      extras: [n0 - n * half, n0 / n],
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Chimie                                                             */
/* ------------------------------------------------------------------ */

const molarMass: QuestionFamily = {
  id: 'chim.molarMass',
  label: 'Masse molaire',
  pool: () => MOLECULES.length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const mol = rng.pick(MOLECULES);
    const atomicMasses = Object.keys(mol.composition)
      .map((s) => `M(${s}) = ${ELEMENTS.find((e) => e.symbol === s)?.m ?? 0} g/mol`)
      .join(', ');
    const detail = Object.entries(mol.composition)
      .map(([s, n]) => `${n} \\	imes ${ELEMENTS.find((e) => e.symbol === s)?.m ?? 0}`)
      .join(' + ');
    return numeric(topicId, `Calculer la masse molaire moléculaire de ${mol.formula} (${mol.name}). Données : ${atomicMasses}.`, mol.m, ctx, {
      digits: 1,
      unit: 'g/mol',
      explanation: `On somme les masses molaires atomiques en tenant compte des indices : $M(${mol.formula}) = ${detail} = ${fr(mol.m, 1)}$ g/mol.`,
      difficulty: 'facile',
      skill: 'Masse molaire moléculaire',
      extras: [mol.m + 2, mol.m / 2],
    });
  },
};

const mole: QuestionFamily = {
  id: 'chim.mole',
  label: 'Quantité de matière',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const mol = rng.pick(MOLECULES);
    const variant = rng.pick(['n', 'm'] as const);
    if (variant === 'n') {
      const m = rng.int(1, 20) * 5;
      const n = round(m / mol.m, 3);
      return numeric(topicId, `Quelle quantité de matière (en mol) contient $${m}$ g de ${mol.name} (${mol.formula}, $M = ${fr(mol.m, 1)}$ g/mol) ?`, n, ctx, {
        digits: 3,
        unit: 'mol',
        explanation: `$n = \\dfrac{m}{M} = \\dfrac{${m}}{${fr(mol.m, 1)}} = ${fr(n, 3)}$ mol.`,
        skill: 'n = m / M',
      });
    }
    const n = rng.float(0.2, 5, 2);
    return numeric(topicId, `Quelle masse (en g) correspond à $${fr(n, 2)}$ mol de ${mol.name} ($M = ${fr(mol.m, 1)}$ g/mol) ?`, n * mol.m, ctx, {
      digits: 2,
      unit: 'g',
      explanation: `$m = n \\times M = ${fr(n, 2)} \\times ${fr(mol.m, 1)} = ${fr(n * mol.m, 2)}$ g.`,
      skill: 'm = n × M',
    });
  },
};

const concentration: QuestionFamily = {
  id: 'chim.concentration',
  label: 'Concentration molaire',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const mol = rng.pick(MOLECULES);
    const m = rng.int(1, 40);
    const vL = rng.int(1, 10) / 10 + rng.int(0, 2);
    const n = m / mol.m;
    const c = round(n / vL, 3);
    return numeric(topicId, `On dissout $${m}$ g de ${mol.name} ($M = ${fr(mol.m, 1)}$ g/mol) dans $${fr(vL, 1)}$ L d'eau. Quelle est la concentration molaire de la solution (en mol/L) ?`, c, ctx, {
      digits: 3,
      unit: 'mol/L',
      explanation: `$n = \\dfrac{m}{M} = ${fr(n, 3)}$ mol puis $C = \\dfrac{n}{V} = \\dfrac{${fr(n, 3)}}{${fr(vL, 1)}} = ${fr(c, 3)}$ mol/L.`,
      skill: 'C = n / V',
    });
  },
};

const dilution: QuestionFamily = {
  id: 'chim.dilution',
  label: 'Dilution',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const c0 = rng.int(2, 20) / 10;
    const v0 = rng.int(5, 50);
    const v1 = v0 * rng.pick([2, 5, 10]);
    const c1 = round((c0 * v0) / v1, 4);
    return numeric(topicId, `On prélève $${v0}$ mL d'une solution mère de concentration $${fr(c0, 1)}$ mol/L et on complète jusqu'à $${v1}$ mL. Quelle est la concentration de la solution fille (en mol/L) ?`, c1, ctx, {
      digits: 3,
      unit: 'mol/L',
      explanation: `Lors d'une dilution, la quantité de matière est conservée : $C_0 V_0 = C_1 V_1$, donc $C_1 = \\dfrac{${fr(c0, 1)} \\times ${v0}}{${v1}} = ${fr(c1, 3)}$ mol/L (facteur de dilution $${v1 / v0}$).`,
      skill: 'Facteur de dilution',
    });
  },
};

const ph: QuestionFamily = {
  id: 'chim.ph',
  label: 'pH et acidité',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const kind = rng.pick(['calcul', 'nature', 'h3o'] as const);
    const ph = rng.int(1, 13);
    if (kind === 'nature') {
      return qcm({
        topicId,
        prompt: `Une solution a un pH de $${ph}$. Quelle est sa nature ?`,
        correct: ph < 7 ? 'Acide' : ph === 7 ? 'Neutre' : 'Basique',
        distractors: ['Acide', 'Neutre', 'Basique'].filter((v) => v !== (ph < 7 ? 'Acide' : ph === 7 ? 'Neutre' : 'Basique')),
        explanation: `À 25 °C : pH < 7 → acide, pH = 7 → neutre, pH > 7 → basique. Ici pH = ${ph}, la solution est donc ${ph < 7 ? 'acide' : ph === 7 ? 'neutre' : 'basique'}.`,
        difficulty: 'facile',
        skill: 'Échelle de pH',
        rng,
      });
    }
    if (kind === 'h3o') {
      const exp = -ph;
      return qcm({
        topicId,
        prompt: `Une solution a un pH de $${ph}$. Quelle est la concentration en ions oxonium $\\mathrm{H_3O^{+}}$ ?`,
        correct: `$10^{${exp}}$ mol/L`,
        distractors: [`$10^{${-exp}}$ mol/L`, `$${ph}$ mol/L`, `$10^{${exp - 1}}$ mol/L`],
        explanation: `Par définition $\\mathrm{pH} = -\\log[\\mathrm{H_3O^{+}}]$, donc $[\\mathrm{H_3O^{+}}] = 10^{-\\mathrm{pH}} = 10^{${exp}}$ mol/L.`,
        skill: 'Relation pH / [H₃O⁺]',
        rng,
      });
    }
    return trueFalse(topicId, `Quand le pH d'une solution augmente, la concentration en ions $\\mathrm{H_3O^{+}}$ diminue.`, true, `Vrai : $[\\mathrm{H_3O^{+}}] = 10^{-\\mathrm{pH}}$. La relation est décroissante : si le pH augmente de 1, la concentration est divisée par 10.`, 'facile', 'Sens de variation du pH');
  },
};

const gasLaw: QuestionFamily = {
  id: 'chim.gas',
  label: 'Gaz parfaits',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const n = rng.float(0.2, 4, 2);
    const T = rng.int(250, 500);
    const V = rng.float(1, 40, 1);
    const P = round((n * CONSTANTS.R * T) / (V / 1000), 0);
    return numeric(topicId, `Un gaz parfait occupe $${fr(V, 1)}$ L à $${T}$ K avec $n = ${fr(n, 2)}$ mol. Quelle est sa pression (en Pa) ? ($R = 8{,}314$ J·mol⁻¹·K⁻¹)`, P, ctx, {
      digits: 0,
      unit: 'Pa',
      explanation: `Équation d'état : $PV = nRT$, donc $P = \\dfrac{nRT}{V} = \\dfrac{${fr(n, 2)} \\times 8{,}314 \\times ${T}}{${fr(V / 1000, 4)}} = ${fr(P, 0)}$ Pa (V doit être en m³).`,
      skill: 'PV = nRT',
    });
  },
};

const molarVolume: QuestionFamily = {
  id: 'chim.molarVolume',
  label: 'Volume molaire',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const n = rng.float(0.1, 5, 2);
    const vm = rng.pick([22.4, 24.0]);
    const v = round(n * vm, 2);
    return numeric(topicId, `Quel volume (en L) occupe $${fr(n, 2)}$ mol de gaz dans des conditions où le volume molaire vaut $V_m = ${fr(vm, 1)}$ L/mol ?`, v, ctx, {
      unit: 'L',
      explanation: `$V = n \\times V_m = ${fr(n, 2)} \\times ${fr(vm, 1)} = ${fr(v, 2)}$ L.`,
      difficulty: 'facile',
      skill: 'V = n × Vm',
    });
  },
};

const atoms: QuestionFamily = {
  id: 'chim.atoms',
  label: 'Structure de l’atome',
  pool: () => ELEMENTS.length * 3,
  make(ctx) {
    const { rng, topicId } = ctx;
    const el = rng.pick(ELEMENTS);
    const A = el.z + rng.int(0, 12);
    const kind = rng.pick(['neutrons', 'electrons', 'composition'] as const);
    const neutrons = A - el.z;
    if (kind === 'neutrons') {
      return shortAnswer(topicId, `L'atome de ${el.name.toLowerCase()} $^{${A}}\\mathrm{${el.symbol}}$ possède $Z = ${el.z}$. Combien de neutrons contient son noyau ?`, [String(neutrons)], `Le nombre de neutrons vaut $N = A - Z = ${A} - ${el.z} = ${neutrons}$.`, 'facile', 'A, Z et N');
    }
    if (kind === 'electrons') {
      return shortAnswer(topicId, `Combien d'électrons possède l'atome neutre de ${el.name.toLowerCase()} ($Z = ${el.z}$) ?`, [String(el.z)], `Un atome est électriquement neutre : il possède autant d'électrons que de protons, soit $Z = ${el.z}$ électrons.`, 'facile', 'Neutralité de l’atome');
    }
    return qcm({
      topicId,
      prompt: `À quelle famille chimique appartient l'élément ${el.name} ($Z = ${el.z}$) ?`,
      correct: el.family,
      distractors: Array.from(new Set(ELEMENTS.map((e) => e.family).filter((f) => f !== el.family))).slice(0, 3),
      explanation: `${el.name} (${el.symbol}, $Z = ${el.z}$, période ${el.period}) appartient à la famille des ${el.family.toLowerCase()}s.`,
      skill: 'Classification périodique',
      rng,
    });
  },
};

const stoichiometry: QuestionFamily = {
  id: 'chim.stoechiometrie',
  label: 'Stœchiométrie',
  pool: Infinity,
  make(ctx) {
    const { rng, topicId } = ctx;
    const reactions = [
      { eq: '2 H₂ + O₂ → 2 H₂O', ratio: 0.5, product: 'd’eau formée', from: 'de H₂ consommés', unit: 'mol' },
      { eq: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O', ratio: 2, product: 'de O₂ nécessaires', from: 'de CH₄ brûlés', unit: 'mol' },
      { eq: 'N₂ + 3 H₂ → 2 NH₃', ratio: 3, product: 'de H₂ nécessaires', from: 'de N₂', unit: 'mol' },
      { eq: 'C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O', ratio: 5, product: 'de O₂ nécessaires', from: 'de C₃H₈', unit: 'mol' },
      { eq: '2 Al + 3 Cl₂ → 2 AlCl₃', ratio: 1.5, product: 'de Cl₂ nécessaires', from: 'de Al', unit: 'mol' },
    ];
    const r = rng.pick(reactions);
    const n = rng.int(2, 10);
    return numeric(topicId, `Pour la réaction équilibrée $${r.eq}$, combien faut-il ${r.from.replace('de ', 'de ')} $n = ${n}$ mol ? Quelle quantité ${r.product} ?`, n * r.ratio, ctx, {
      digits: 1,
      unit: r.unit,
      explanation: `Les coefficients stœchiométriques donnent les proportions : pour $${n}$ mol du premier réactif, il en faut $${n} \\times ${fr(r.ratio, 1)} = ${fr(n * r.ratio, 1)}$ mol.`,
      skill: 'Proportions stœchiométriques',
    });
  },
};

const unitConversion: QuestionFamily = {
  id: 'phys.conversion',
  label: 'Conversions d’unités',
  pool: () => CONVERSIONS.length * 4,
  make(ctx) {
    const { rng, topicId } = ctx;
    const conv = rng.pick(CONVERSIONS);
    const value = rng.int(1, 50) * (rng.chance(0.4) ? 0.5 : 1);
    const result = round(value * conv.factor, 6);
    return numeric(topicId, `Convertir $${fr(value, 2)} ${conv.from} en ${conv.to}.`, result, ctx, {
      digits: result >= 100 || Number.isInteger(result) ? 0 : 4,
      unit: conv.to,
      explanation: `Tableau de conversion (${conv.kind}) : $1\\,${conv.from} = ${fr(conv.factor, 6)}\\,${conv.to}$, donc $${fr(value, 2)}\\,${conv.from} = ${fr(result, 4)}\\,${conv.to}$.`,
      difficulty: 'facile',
      skill: 'Conversion d’unités',
    });
  },
};

export const PHYSICS_FAMILIES: QuestionFamily[] = [
  speed,
  newton,
  weight,
  energy,
  work,
  ohm,
  electricPower,
  circuits,
  waves,
  optics,
  radioactivity,
  molarMass,
  mole,
  concentration,
  dilution,
  ph,
  gasLaw,
  molarVolume,
  atoms,
  stoichiometry,
  unitConversion,
];
