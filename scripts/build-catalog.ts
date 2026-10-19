/**
 * EduMate — Génération du catalogue pédagogique.
 *
 * Exécuté par `npm run build:data` (et automatiquement par `npm run build`).
 * Il assemble matières / niveaux / thèmes / sujets, calcule la taille du
 * vivier de questions de chaque sujet et écrit le résultat dans
 * `data/generated/catalog.json`, lu ensuite par l'API.
 *
 * Avantages :
 *  - le serveur ne recalcule rien au démarrage (catalogue statique),
 *  - le fichier JSON permet d'inspecter et de vérifier le contenu,
 *  - une erreur de configuration (famille inconnue, banque manquante)
 *    est détectée au build, pas en production.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogTopic, Difficulty, Theme, Topic } from '../src/shared/types.js';
import { LEVELS, SUBJECTS, SUBJECT_BY_ID, LEVEL_BY_ID, buildThemes } from '../src/server/content/meta.js';
import { TOPIC_DEFINITIONS, makeId, type TopicDefinition } from '../src/server/content/topics.js';
import { EXPANDED_TOPICS } from '../src/server/content/expansions/index.js';
import { familyPool } from '../src/server/content/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
const outDir = path.join(root, 'data', 'generated');
const outFile = path.join(outDir, 'catalog.json');

interface Definition extends TopicDefinition {
  id: string;
}

/** Sujets écrits à la main + sujets générés par les tables de données. */
const definitions: Definition[] = [
  ...(TOPIC_DEFINITIONS as Definition[]),
  ...EXPANDED_TOPICS.map((def) => ({ ...def, id: makeId(def) })),
];

/* ----------------------------- Validation ----------------------------- */

const errors: string[] = [];
const ids = new Set<string>();

for (const def of definitions) {
  if (ids.has(def.id)) errors.push(`Identifiant de sujet en double : ${def.id}`);
  ids.add(def.id);
  if (!SUBJECT_BY_ID[def.subjectId]) errors.push(`Matière inconnue : ${def.subjectId} (${def.id})`);
  if (!LEVEL_BY_ID[def.levelId]) errors.push(`Niveau inconnu : ${def.levelId} (${def.id})`);
}

/* ------------------------------- Themes -------------------------------- */

const themes: Theme[] = buildThemes(definitions);
const themeNameById = new Map(themes.map((t) => [t.id, t.name]));

/* ------------------------------- Sujets -------------------------------- */

let totalPool = 0;
let playable = 0;

const topics: CatalogTopic[] = definitions.map((def) => {
  const subject = SUBJECT_BY_ID[def.subjectId];
  const level = LEVEL_BY_ID[def.levelId];
  const themeId = `${def.subjectId}:${def.levelId}:${themeSlug(def.theme)}`;
  const themeName = themeNameById.get(themeId) ?? def.theme;

  let pool = familyPool(def.source, def.params ?? {});
  if (def.source.startsWith('bank:') && pool === 0) {
    errors.push(`Banque de questions introuvable pour le sujet ${def.id} (${def.source})`);
  }
  if (!def.source.startsWith('bank:') && pool === 0) {
    errors.push(`Famille de questions inconnue : ${def.source} (sujet ${def.id})`);
  }
  const generated = !Number.isFinite(pool) || pool === 9999;
  if (!Number.isFinite(pool) || pool > 9999) pool = 9999;

  totalPool += pool;
  if (pool >= 4) playable += 1;

  return {
    id: def.id,
    subjectId: def.subjectId,
    levelId: def.levelId,
    themeId,
    name: def.name,
    source: def.source,
    params: def.params ?? {},
    pool,
    generated,
    difficulty: (def.difficulty ?? 'moyen') as Difficulty,
    keywords: def.keywords ?? [],
    subjectName: subject?.name ?? def.subjectId,
    levelName: level?.name ?? def.levelId,
    themeName,
    emoji: subject?.emoji ?? '📘',
    color: subject?.color ?? '#4f6df5',
    accent: subject?.accent ?? '#22d3ee',
  };
});

function themeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/* ------------------------------- Écriture ------------------------------ */

const catalog = {
  version: 3,
  generatedAt: new Date().toISOString(),
  subjects: SUBJECTS,
  levels: LEVELS,
  themes,
  topics,
  stats: {
    subjects: SUBJECTS.length,
    levels: LEVELS.length,
    themes: themes.length,
    topics: topics.length,
    playable,
    questionPool: totalPool,
  },
};

if (errors.length) {
  console.error('\n❌ Erreurs dans le catalogue pédagogique :');
  for (const error of errors) console.error(`   • ${error}`);
  process.exitCode = 1;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(catalog), 'utf-8');

/* ------------------------------- Rapport ------------------------------- */

const bySubject = new Map<string, { topics: number; playable: number; pool: number }>();
for (const topic of topics) {
  const entry = bySubject.get(topic.subjectName) ?? { topics: 0, playable: 0, pool: 0 };
  entry.topics += 1;
  entry.pool += topic.pool;
  if (topic.pool >= 4) entry.playable += 1;
  bySubject.set(topic.subjectName, entry);
}

console.log('\n✅ Catalogue EduMate généré : data/generated/catalog.json');
console.log(`   Matières : ${SUBJECTS.length} | Niveaux : ${LEVELS.length} | Thèmes : ${themes.length}`);
console.log(`   Sujets de quiz : ${topics.length} (jouables : ${playable})`);
console.log(`   Vivier de questions : ${totalPool.toLocaleString('fr-FR')} (les familles algorithmiques varient à l’infini)\n`);
for (const [subject, entry] of [...bySubject.entries()].sort((a, b) => b[1].topics - a[1].topics)) {
  console.log(
    `   ${subject.padEnd(20, ' ')} ${String(entry.topics).padStart(4)} sujets   ${String(entry.playable).padStart(4)} jouables   ${entry.pool.toLocaleString('fr-FR').padStart(9)} questions`,
  );
}
console.log('');

if (errors.length) {
  console.error(`⚠️  ${errors.length} erreur(s) à corriger avant déploiement.`);
}

export type { Topic };
