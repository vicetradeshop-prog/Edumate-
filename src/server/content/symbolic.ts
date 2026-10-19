/**
 * EduMate — Moteur symbolique minimal (AST) :
 * évaluation numérique, dérivation, rendu LaTeX, simplification.
 *
 * Sert aux familles de générateurs de mathématiques (dérivées, limites,
 * primitives, équations) afin de produire des questions *exactes* et
 * automatiquement vérifiables, sans aucune donnée inventée.
 */

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'add'; args: Expr[] }
  | { t: 'mul'; args: Expr[] }
  | { t: 'neg'; a: Expr }
  | { t: 'pow'; a: Expr; b: Expr }
  | { t: 'div'; a: Expr; b: Expr }
  | { t: 'fn'; name: string; a: Expr };

export const num = (v: number): Expr => ({ t: 'num', v });
export const variable = (name = 'x'): Expr => ({ t: 'var', name });
export const add = (...args: Expr[]): Expr => ({ t: 'add', args });
export const mul = (...args: Expr[]): Expr => ({ t: 'mul', args });
export const div = (a: Expr, b: Expr): Expr => ({ t: 'div', a, b });
export const pow = (a: Expr, b: Expr): Expr => ({ t: 'pow', a, b });
export const neg = (a: Expr): Expr => ({ t: 'neg', a });
export const fn = (name: string, a: Expr): Expr => ({ t: 'fn', name, a });

export const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
};

/* ------------------------------------------------------------------ */
/*  Évaluation                                                         */
/* ------------------------------------------------------------------ */

export function evaluate(e: Expr, env: Record<string, number> = {}): number {
  switch (e.t) {
    case 'num':
      return e.v;
    case 'var': {
      const v = env[e.name];
      if (v === undefined) throw new Error(`Variable inconnue : ${e.name}`);
      return v;
    }
    case 'add':
      return e.args.reduce((acc, a) => acc + evaluate(a, env), 0);
    case 'mul':
      return e.args.reduce((acc, a) => acc * evaluate(a, env), 1);
    case 'neg':
      return -evaluate(e.a, env);
    case 'div':
      return evaluate(e.a, env) / evaluate(e.b, env);
    case 'pow':
      return evaluate(e.a, env) ** evaluate(e.b, env);
    case 'fn': {
      const f = FUNCS[e.name];
      if (!f) throw new Error(`Fonction inconnue : ${e.name}`);
      return f(evaluate(e.a, env));
    }
    default:
      throw new Error('Expression invalide');
  }
}

/* ------------------------------------------------------------------ */
/*  Simplification                                                     */
/* ------------------------------------------------------------------ */

const isNum = (e: Expr): e is { t: 'num'; v: number } => e.t === 'num';

export function simplify(e: Expr): Expr {
  switch (e.t) {
    case 'num':
    case 'var':
      return e;
    case 'neg': {
      const a = simplify(e.a);
      if (isNum(a)) return num(-a.v);
      if (a.t === 'neg') return a.a;
      return neg(a);
    }
    case 'add': {
      const args = e.args.map(simplify);
      const flat: Expr[] = [];
      let constant = 0;
      for (const a of args) {
        if (isNum(a)) constant += a.v;
        else if (a.t === 'add') flat.push(...a.args);
        else flat.push(a);
      }
      if (constant !== 0 || flat.length === 0) flat.push(num(constant));
      if (flat.length === 1) return flat[0];
      return add(...flat);
    }
    case 'mul': {
      const args = e.args.map(simplify);
      const flat: Expr[] = [];
      let constant = 1;
      for (const a of args) {
        if (isNum(a)) constant *= a.v;
        else if (a.t === 'mul') flat.push(...a.args);
        else flat.push(a);
      }
      if (constant === 0) return num(0);
      if (constant !== 1 || flat.length === 0) flat.unshift(num(constant));
      if (flat.length === 1) return flat[0];
      return mul(...flat);
    }
    case 'div': {
      const a = simplify(e.a);
      const b = simplify(e.b);
      if (isNum(a) && isNum(b) && b.v !== 0) return num(a.v / b.v);
      if (isNum(b) && b.v === 1) return a;
      if (isNum(a) && a.v === 0) return num(0);
      // (a / k) -> (1/k) * a  pour rendre l'affichage plus lisible
      if (isNum(b) && b.v !== 0) return simplify(mul(num(1 / b.v), a));
      return div(a, b);
    }
    case 'pow': {
      const a = simplify(e.a);
      const b = simplify(e.b);
      if (isNum(b) && b.v === 0) return num(1);
      if (isNum(b) && b.v === 1) return a;
      if (isNum(a) && isNum(b)) return num(a.v ** b.v);
      return pow(a, b);
    }
    case 'fn': {
      const a = simplify(e.a);
      return fn(e.name, a);
    }
    default:
      return e;
  }
}

/* ------------------------------------------------------------------ */
/*  Dérivation                                                         */
/* ------------------------------------------------------------------ */

export function derivative(e: Expr, v = 'x'): Expr {
  switch (e.t) {
    case 'num':
      return num(0);
    case 'var':
      return num(e.name === v ? 1 : 0);
    case 'add':
      return simplify(add(...e.args.map((a) => derivative(a, v))));
    case 'neg':
      return simplify(neg(derivative(e.a, v)));
    case 'mul': {
      // Règle du produit généralisée : somme des produits partiels
      const terms: Expr[] = [];
      for (let i = 0; i < e.args.length; i += 1) {
        const parts = e.args.map((a, j) => (i === j ? derivative(a, v) : a));
        terms.push(mul(...parts));
      }
      return simplify(add(...terms));
    }
    case 'div': {
      const u = e.a;
      const w = e.b;
      const du = derivative(u, v);
      const dw = derivative(w, v);
      return simplify(div(add(mul(du, w), neg(mul(u, dw))), pow(w, num(2))));
    }
    case 'pow': {
      const { a, b } = e;
      const aHasVar = containsVar(a, v);
      const bHasVar = containsVar(b, v);
      if (!aHasVar && !bHasVar) return num(0);
      if (!bHasVar) {
        // a^n -> n * a^(n-1) * a'
        return simplify(mul(b, pow(a, add(b, num(-1))), derivative(a, v)));
      }
      if (!aHasVar) {
        // k^u -> k^u * ln(k) * u'
        return simplify(mul(a, fn('ln', a), derivative(b, v)));
      }
      // Cas général (rare au lycée) : dérivée logarithmique
      return simplify(mul(pow(a, b), add(mul(derivative(b, v), fn('ln', a)), mul(b, div(derivative(a, v), a)))));
    }
    case 'fn': {
      const u = e.a;
      const du = derivative(u, v);
      switch (e.name) {
        case 'sin':
          return simplify(mul(fn('cos', u), du));
        case 'cos':
          return simplify(mul(neg(fn('sin', u)), du));
        case 'tan':
          return simplify(div(du, pow(fn('cos', u), num(2))));
        case 'exp':
          return simplify(mul(fn('exp', u), du));
        case 'ln':
          return simplify(div(du, u));
        case 'log':
          return simplify(div(du, mul(u, fn('ln', num(10)))));
        case 'sqrt':
          return simplify(div(du, mul(num(2), fn('sqrt', u))));
        default:
          return num(0);
      }
    }
    default:
      return num(0);
  }
}

export function containsVar(e: Expr, v = 'x'): boolean {
  switch (e.t) {
    case 'var':
      return e.name === v;
    case 'num':
      return false;
    case 'add':
      return e.args.some((a) => containsVar(a, v));
    case 'mul':
      return e.args.some((a) => containsVar(a, v));
    case 'neg':
    case 'fn':
      return containsVar(e.a, v);
    case 'div':
      return containsVar(e.a, v) || containsVar(e.b, v);
    case 'pow':
      return containsVar(e.a, v) || containsVar(e.b, v);
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Rendus                                                             */
/* ------------------------------------------------------------------ */

const needsParens = (e: Expr, parent: Expr): boolean => {
  if (parent.t === 'mul') return e.t === 'add' || e.t === 'neg';
  if (parent.t === 'add') return e.t === 'neg';
  if (parent.t === 'div') return e.t === 'mul' || e.t === 'add';
  if (parent.t === 'pow') return e.t === 'mul' || e.t === 'add' || e.t === 'neg';
  return false;
};

function wrap(s: string, e: Expr, parent: Expr): string {
  return needsParens(e, parent) ? `(${s})` : s;
}

/** Rendu texte simple (sans LaTeX), lisible dans une console ou un input. */
export function toText(e: Expr): string {
  const s = simplify(e);
  return render(s, s);
}

function render(e: Expr, parent: Expr): string {
  switch (e.t) {
    case 'num': {
      const v = e.v;
      if (Number.isInteger(v)) return String(v);
      return String(Number(v.toFixed(4)));
    }
    case 'var':
      return e.name;
    case 'neg':
      return wrap(`-${render(e.a, e)}`, e, parent);
    case 'add':
      return wrap(
        e.args
          .map((a, i) => {
            const r = render(a, e);
            return i === 0 ? r : r.startsWith('-') ? `- ${r.slice(1)}` : `+ ${r}`;
          })
          .join(' '),
        e,
        parent,
      );
    case 'mul': {
      const parts = e.args.map((a) => render(a, e));
      // 3 * x  ->  3x
      if (parts.length === 2 && /^-?\d+(\.\d+)?$/.test(parts[0])) {
        const coef = Number(parts[0]);
        const rest = parts[1];
        if (rest.match(/^[a-z]/) || rest.startsWith('\\') || rest.startsWith('(')) {
          if (coef === 1) return rest;
          if (coef === -1) return `-${rest}`;
          return `${parts[0]}${rest}`;
        }
      }
      return wrap(parts.join(' × ').replace(/× -/g, '× -'), e, parent);
    }
    case 'div':
      return wrap(`${render(e.a, e)} / ${render(e.b, e)}`, e, parent);
    case 'pow':
      return wrap(`${render(e.a, { t: 'mul', args: [] })}^${render(e.b, { t: 'mul', args: [] })}`, e, parent);
    case 'fn':
      if (e.name === 'sqrt') return `√(${render(e.a, e)})`;
      if (e.name === 'exp') return `exp(${render(e.a, e)})`;
      return `${e.name}(${render(e.a, e)})`;
    default:
      return '?';
  }
}

/** Rendu LaTeX (utilisé avec KaTeX côté client). */
export function toLatex(e: Expr): string {
  return renderLatex(simplify(e), null);
}

function renderLatex(e: Expr, parent: Expr | null): string {
  const paren = (s: string, cond: boolean): string => (cond ? `\\left(${s}\\right)` : s);
  switch (e.t) {
    case 'num': {
      const v = e.v;
      if (Number.isInteger(v)) return String(v);
      const approx = Number(v.toFixed(3));
      return String(approx);
    }
    case 'var':
      return e.name;
    case 'neg':
      return paren(`-${renderLatex(e.a, e)}`, parent?.t === 'add' || parent?.t === 'mul');
    case 'add':
      return paren(
        e.args
          .map((a, i) => {
            const r = renderLatex(a, e);
            return i === 0 ? r : r.startsWith('-') ? `- ${r.slice(1)}` : `+ ${r}`;
          })
          .join(' '),
        parent?.t === 'mul' || parent?.t === 'div' || parent?.t === 'pow',
      );
    case 'mul': {
      const parts = e.args.map((a, i) => renderLatex(a, e));
      if (parts.length >= 2 && /^-?\d+(\.\d+)?$/.test(parts[0])) {
        const coef = Number(parts[0]);
        const rest = parts.slice(1).join(' ');
        if (Math.abs(coef) === 1) return `${coef < 0 ? '-' : ''}${paren(rest, rest.includes('+') || rest.includes('-'))}`;
        return `${parts[0]} ${paren(rest, rest.includes('+') || rest.includes('-'))}`;
      }
      const joined = parts.join(' \\times ');
      return paren(joined, parent?.t === 'pow' || parent?.t === 'div');
    }
    case 'div':
      return `\\dfrac{${renderLatex(e.a, null)}}{${renderLatex(e.b, null)}}`;
    case 'pow':
      return `${paren(renderLatex(e.a, e), e.a.t === 'add' || e.a.t === 'mul' || e.a.t === 'neg' || e.a.t === 'div')}^{${renderLatex(e.b, null)}}`;
    case 'fn': {
      const inner = renderLatex(e.a, null);
      if (e.name === 'sqrt') return `\\sqrt{${inner}}`;
      if (e.name === 'exp') return `e^{${inner}}`;
      if (e.name === 'ln') return `\\ln\\left(${inner}\\right)`;
      if (e.name === 'log') return `\\log\\left(${inner}\\right)`;
      return `\\${e.name}\\left(${inner}\\right)`;
    }
    default:
      return '?';
  }
}

/** Affiche f(x) = ... en LaTeX, prêt à être inséré entre $...$ */
export function functionLatex(e: Expr, v = 'x'): string {
  return `f(${v}) = ${toLatex(e)}`;
}
