/**
 * EduMate — Test de non-régression du moteur de contenu.
 *
 * Vérifie pour CHAQUE sujet du catalogue :
 *   1. que la famille de questions existe,
 *   2. qu'au moins `MIN` questions valides peuvent être générées,
 *   3. que chaque question possède un énoncé, une bonne réponse cohérente,
 *      des propositions sans doublon et une explication non vide.
 *
 * Lancement : npm run test:content
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildQuestions } from '../src/server/content/index.js';
import { tsx } from './lib/tools.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(dirname, '..', 'data', 'generated', 'catalog.json');

/**
 * Garantit la présence du catalogue avant tout contrôle.
 *
 * `data/generated/` est volontairement ignoré par git : un clone frais ne le
 * contient donc pas, alors que l'archive ZIP de livraison le contient. Sans
 * cette étape, `npm run test:content` échouait en ENOENT sur un clone — et
 * comme `publier.bat` lance ce test AVANT `npm run build`, la publication
 * s'arrêtait sur un projet pourtant parfaitement valide.
 *
 * Le catalogue est donc régénéré à la volée (équivalent de `npm run build:data`).
 */
function ensureCatalog(): void {
  if (existsSync(catalogPath)) return;
  console.log('   ℹ️  data/generated/catalog.json absent : génération en cours…');
  const buildScript = path.resolve(dirname, 'build-catalog.ts');
  const { command, args } = tsx([buildScript]);
  try {
    execFileSync(command, args, { cwd: path.resolve(dirname, '..'), stdio: 'ignore' });
  } catch (error) {
    console.error('   ❌ Génération du catalogue impossible :', (error as Error).message);
    console.error('      Lance manuellement :  npm run build:data');
    process.exit(1);
  }
  if (!existsSync(catalogPath)) {
    console.error('   ❌ Le catalogue n’a pas été produit. Lance :  npm run build:data');
    process.exit(1);
  }
}

ensureCatalog();

interface CatalogTopic {
  id: string;
  name: string;
  source: string;
  params?: Record<string, unknown>;
  pool: number;
}

const MIN_QUESTIONS = 5;
const SAMPLE = Number(process.argv[2] ?? 0);

const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as { topics: CatalogTopic[] };
let topics = catalog.topics;
if (SAMPLE > 0) {
  // Échantillonnage régulier pour un contrôle rapide pendant le développement.
  const step = Math.max(1, Math.floor(topics.length / SAMPLE));
  topics = topics.filter((_, index) => index % step === 0);
}

let checked = 0;
let questions = 0;
const failures: string[] = [];

for (const topic of topics) {
  try {
    const produced = buildQuestions({
      topicId: topic.id,
      source: topic.source,
      params: topic.params ?? {},
      count: MIN_QUESTIONS,
      seed: `check-${topic.id}`,
    });
    checked += 1;
    questions += produced.length;

    if (produced.length < MIN_QUESTIONS) {
      failures.push(`${topic.id} (${topic.source}) : ${produced.length}/${MIN_QUESTIONS} questions`);
      continue;
    }
    for (const question of produced) {
      const problems: string[] = [];
      if (!question.prompt || question.prompt.trim().length < 3) problems.push('énoncé vide');
      if (!question.explanation || question.explanation.trim().length < 3) problems.push('explication vide');
      if ((question.kind === 'qcm' || question.kind === 'vrai-faux') && (!question.options || question.options.length < 2)) {
        problems.push('propositions manquantes');
      }
      if (question.options) {
        const unique = new Set(question.options.map((o) => o.trim().toLowerCase()));
        if (unique.size !== question.options.length) problems.push('propositions en doublon');
        question.options.forEach((option) => {
          if (!option || !option.trim()) problems.push('proposition vide');
          if (/undefined|null|NaN|\[object Object\]/.test(option)) problems.push(`proposition invalide : ${option}`);
        });
      }
      if (question.kind === 'qcm' && (question.answer === undefined || question.answer < 0 || (question.options && question.answer >= question.options.length))) {
        problems.push('index de bonne réponse invalide');
      }
      if (question.kind === 'texte' && (!question.accept || question.accept.length === 0)) problems.push('réponses acceptées manquantes');
      if (/undefined|null|NaN|\[object Object\]/.test(question.prompt)) problems.push('énoncé invalide');
      if (/undefined|NaN|\[object Object\]/.test(question.explanation)) problems.push('explication invalide');
      if (problems.length) {
        failures.push(`${topic.id} (${topic.source}) : ${problems.join(', ')} — « ${question.prompt.slice(0, 90)} »`);
      }
    }
  } catch (error) {
    failures.push(`${topic.id} (${topic.source}) : erreur — ${(error as Error).message}`);
  }
}

console.log(`\n🧪 Contrôle du contenu pédagogique`);
console.log(`   Sujets vérifiés : ${checked}/${topics.length}`);
console.log(`   Questions générées : ${questions}`);
console.log(`   Familles distinctes : ${new Set(topics.map((t) => t.source)).size}`);

if (failures.length) {
  console.error(`\n❌ ${failures.length} problème(s) détecté(s) :`);
  const shown = failures.slice(0, 40);
  for (const failure of shown) console.error(`   • ${failure}`);
  if (failures.length > shown.length) console.error(`   … et ${failures.length - shown.length} autres`);
  process.exit(1);
}

console.log('\n✅ Toutes les questions générées sont valides (énoncé, réponses uniques, explication).');
