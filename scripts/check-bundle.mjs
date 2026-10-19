#!/usr/bin/env node
/**
 * EduMate — Contrôle du bundle de production (`dist/client`).
 *
 * Pourquoi ce script existe : un `manualChunks` mal calibré avait séparé
 * `react-smooth` (dépendance de Recharts) du chunk `react`. Dans le navigateur,
 * le chunk vendor s'évaluait AVANT React → `extends React.PureComponent` sur
 * `undefined` → écran de démarrage bloqué. Bug invisible côté serveur et non
 * couvert par les tests API : ce contrôle le rend impossible à réintroduire.
 *
 * Vérifications :
 *   1. `vite.config.ts` ne redéfinit PAS le découpage des paquets,
 *   2. tous les fichiers référencés par index.html existent,
 *   3. le graphe d'imports **statiques** entre chunks est acyclique
 *      (condition qui garantit l'ordre d'évaluation des modules),
 *   4. le chargement initial reste maîtrisé et les bibliothèques lourdes des
 *      pages secondaires (Recharts) sont bien en chargement paresseux,
 *   5. l'écran de diagnostic (watchdog) est présent dans index.html.
 *
 * Lancement : npm run test:bundle   (après npm run build:client)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = path.join(root, 'dist', 'client');
const assetsDir = path.join(clientDist, 'assets');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('❌ dist/client/index.html est absent : lance d’abord « npm run build:client ».');
  process.exit(1);
}

const html = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
const jsFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];

/* ------------------------------------------------------------------ */
/*  1. Configuration du découpage                                      */
/* ------------------------------------------------------------------ */

console.log('\n── Configuration du build');
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
check(
  'Découpage des paquets laissé à Rollup (pas de manualChunks)',
  !/manualChunks\s*:/.test(viteConfig),
  'manualChunks présent dans vite.config.ts : risque d’ordre d’évaluation invalide',
);

/* ------------------------------------------------------------------ */
/*  2. Références de index.html                                        */
/* ------------------------------------------------------------------ */

console.log('\n── Intégrité des fichiers');
const referenced = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
  .map((match) => match[1])
  // Les liens vers l'API et les ancres ne sont pas des fichiers statiques.
  .filter((ref) => !ref.startsWith('/api'));
const missing = referenced.filter((ref) => !fs.existsSync(path.join(clientDist, ref)));
check(`Assets référencés présents (${referenced.length})`, missing.length === 0, missing.join(', '));
check('Point d’entrée en module ES', /<script[^>]+type="module"[^>]+src="\/assets\/index-[^"]+\.js"/.test(html));
check('Conteneur #root présent', html.includes('id="root"'));
check(
  'Écran de diagnostic présent (watchdog + erreurs visibles)',
  html.includes('boot-help') && html.includes('boot-error'),
);

/* ------------------------------------------------------------------ */
/*  3. Graphe d'imports statiques                                      */
/* ------------------------------------------------------------------ */

console.log('\n── Ordre d’évaluation des modules');
const staticGraph = new Map();
for (const file of jsFiles) {
  const code = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  const deps = new Set();
  // Retire les imports dynamiques : ils ne créent pas de cycle d'évaluation.
  const withoutDynamic = code.replace(/import\(\s*["'][^"']+["']\s*\)/g, 'null');
  for (const match of withoutDynamic.matchAll(/\bfrom\s*["']\.\/([^"']+)["']/g)) deps.add(match[1]);
  for (const match of withoutDynamic.matchAll(/^import\s*["']\.\/([^"']+)["']/gm)) deps.add(match[1]);
  staticGraph.set(file, [...deps].filter((dep) => jsFiles.includes(dep)));
}

function findCycle() {
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of staticGraph.get(node) ?? []) {
      const color = state.get(next) ?? 0;
      if (color === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (color === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of staticGraph.keys()) {
    if ((state.get(node) ?? 0) === 0) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

check(`Graphe analysé (${jsFiles.length} chunks)`, jsFiles.length > 10, `${jsFiles.length} chunks`);
const cycle = findCycle();
check('Aucun cycle d’imports statiques (ordre d’évaluation garanti)', cycle === null, cycle ? cycle.join(' → ') : '');

// Garde-fou ciblé : tout chunk qui accède à React au niveau racine doit être
// autonome (React inclus) ou importer au moins un autre chunk.
const orphans = [];
for (const file of jsFiles) {
  const code = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  const usesReactAtRoot = /extends\s+[\w$]+\.PureComponent/.test(code);
  const importsChunks = (staticGraph.get(file) ?? []).length > 0;
  const embedsReact = code.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED');
  if (usesReactAtRoot && !importsChunks && !embedsReact) orphans.push(file);
}
check('Aucun chunk n’accède à React sans dépendance résolue', orphans.length === 0, orphans.join(', '));

/* ------------------------------------------------------------------ */
/*  4. Poids du chargement initial                                     */
/* ------------------------------------------------------------------ */

console.log('\n── Poids');
const gzip = (file) => gzipSync(fs.readFileSync(path.join(assetsDir, file))).length;
const initial = new Set();
for (const match of html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)) initial.add(match[1]);
for (const match of html.matchAll(/<link[^>]+modulepreload[^>]+href="\/assets\/([^"]+)"/g)) initial.add(match[1]);

let initialGzip = 0;
for (const file of initial) if (fs.existsSync(path.join(assetsDir, file))) initialGzip += gzip(file);
console.log(`   ℹ️  Chargement initial : ${initial.size} fichier(s), ${(initialGzip / 1024).toFixed(0)} Kio gzip`);
check('Chargement initial < 400 Kio gzip', initialGzip < 400 * 1024, `${(initialGzip / 1024).toFixed(0)} Kio`);

const heavy = jsFiles.find((file) => {
  const code = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  return code.includes('recharts') || code.includes('Recharts');
});
check(
  'Recharts en chargement paresseux (hors écran d’accueil)',
  !heavy || !initial.has(heavy),
  heavy ? `${heavy} chargé au démarrage` : '',
);

const totalRaw = jsFiles.reduce((sum, file) => sum + fs.statSync(path.join(assetsDir, file)).size, 0);
console.log(`   ℹ️  ${jsFiles.length} chunks JS, ${(totalRaw / 1024 / 1024).toFixed(2)} Mio non compressé`);

/* ------------------------------------------------------------------ */

console.log(`\n${'='.repeat(62)}`);
console.log(`  Résultat : ${passed} contrôles réussis, ${failures.length} échec(s)`);
if (failures.length) {
  console.log('\n  Détail :');
  for (const failure of failures) console.log(`   • ${failure}`);
}
console.log('='.repeat(62));
process.exit(failures.length ? 1 : 0);
