#!/usr/bin/env node
/**
 * EduMate — Détecteur de secrets (pré-publication).
 *
 * Pourquoi cet outil ?
 *   GitHub « Push Protection » analyse CHAQUE commit d'un push et bloque
 *   l'envoi dès qu'une clé d'API est détectée :
 *       remote: error: GH013: Repository rule violations found
 *       remote: Push cannot proceed. The following commits contain new or
 *       updated secrets: ... xAI API Key
 *   Le piège : même si la clé a été SUPPRIMÉE du dernier commit, elle reste
 *   visible dans l'historique — donc le push continue d'être refusé.
 *   Et `publier.bat` ne vérifie que la présence d'un fichier `.env`, jamais le
 *   contenu du code. D'où cet outil.
 *
 * Il contrôle deux choses :
 *   1. l'arbre de travail (les fichiers tels qu'ils sont maintenant),
 *   2. TOUT l'historique git (chaque blob de chaque commit).
 *
 * Usage :
 *   node scripts/scan-secrets.mjs            # arbre de travail + historique
 *   node scripts/scan-secrets.mjs --tree     # arbre de travail seulement
 *   node scripts/scan-secrets.mjs --history  # historique seulement
 *   node scripts/scan-secrets.mjs --json     # sortie machine
 *   node scripts/scan-secrets.mjs --ignored  # inclut les fichiers ignorés par git
 *   node scripts/scan-secrets.mjs --env-check # contrôle rapide des .env (publier.bat)
 *
 * Code de sortie : 0 = rien trouvé, 1 = au moins un secret.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ONLY_TREE = argv.includes('--tree');
const ONLY_HISTORY = argv.includes('--history');
const AS_JSON = argv.includes('--json');
/** `--ignored` : analyse AUSSI les fichiers ignorés par git (.env, catalogues…). */
const SCAN_IGNORED = argv.includes('--ignored');
/**
 * `--env-check` : contrôle ciblé et rapide des fichiers `.env` uniquement.
 * Utilisé par `publier.bat` à l'étape [4/9].
 *
 * Pourquoi déléguer ce contrôle à Node plutôt qu'à cmd.exe ?
 *   Le batch échouait à tort sur des projets dont le `.gitignore` était
 *   parfaitement correct. Deux causes, difficiles à diagnostiquer :
 *     - `git check-ignore` renvoie 128 hors dépôt, et **1** (non ignoré) dès que
 *       le fichier est déjà suivi dans l'index, même si une règle l'ignore ;
 *     - un `REM` contenant des parenthèses à l'intérieur d'un bloc `if (…)`
 *       ferme ce bloc prématurément — les `set` suivants ne s'exécutent jamais.
 *   Node permet une logique exacte, lisible et testable sur les trois OS.
 */
const ENV_CHECK_ONLY = argv.includes('--env-check');
const SCAN_TREE = !ONLY_HISTORY;
const SCAN_HISTORY = !ONLY_TREE;

/* ------------------------------------------------------------------ */
/*  Motifs de secrets                                                  */
/* ------------------------------------------------------------------ */

/**
 * Chaque règle : nom affiché, expression rationnelle, et `entropy` (facultatif)
 * pour éviter les faux positifs sur des exemples de documentation.
 */
const RULES = [
  { name: 'xAI / Grok API Key', re: /\bxai-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'OpenAI API Key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Groq API Key', re: /\bgsk_[A-Za-z0-9]{20,}\b/g },
  { name: 'Mistral API Key', re: /\b[A-Za-z0-9]{32}\b/g, onlyNear: /mistral/i },
  { name: 'Anthropic API Key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Hugging Face Token', re: /\bhf_[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API Key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'AWS Access Key ID', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub Token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'GitHub Fine-grained Token', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g },
  { name: 'Slack Token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Stripe Secret Key', re: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'SendGrid API Key', re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Upstash Redis REST Token', re: /\bA[A-Za-z0-9]{6,12}AA[A-Za-z0-9+/=]{80,}\b/g },
  { name: 'JWT signé (HS256)', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'Clé privée PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  {
    name: 'Variable d’environnement sensible en dur',
    re: /\b(?:AI_API_KEY|SESSION_SECRET|UPSTASH_REDIS_REST_TOKEN|ADMIN_PASSWORD|OPENAI_API_KEY|GROQ_API_KEY|XAI_API_KEY)\b\s*[:=]\s*(['"`])(?!\$|\{|%)[^'"`\n]{16,}\1/g,
    srcOnly: true,
  },
];

/** Faux positifs connus : exemples de documentation, gabarits, valeurs de test. */
const PLACEHOLDERS = [
  /^xai-xxxx+$/i, /^sk-xxxx+$/i, /^gsk_xxxxx+/i, new RegExp('^' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE$'),  // exemple officiel de la doc AWS
  /xxxxx/i, /votre-cle/i, /ta-cle/i, /your[_-]?api[_-]?key/i, /change-moi/i,
  /placeholder/i, /example/i, /^sk-test/i,
  // Fixtures des suites de tests du projet (smoke-test-secret-0123456789, …) :
  // ce ne sont pas des secrets et GitHub ne les signale pas.
  /(?:^|[-_])(?:test|tests|e2e|smoke|render|dummy|fake|fixture|sample|demo|local|dev|staging)(?:[-_]|$)/i,
  /0123456789/, /abcdef$/,
];

/**
 * La règle « variable d'environnement sensible en dur » est la plus utile mais
 * aussi la plus bavarde : les suites de tests définissent légitimement un
 * SESSION_SECRET factice. On ne l'applique donc qu'au code livré, pas aux
 * scripts de test ni aux exemples documentés.
 */
const ENV_RULE_ONLY_IN = /^(?:src|public)\//;
const ENV_RULE_SKIP = /^(?:scripts|tests|docs)\//;

/** Fichiers/dossiers jamais analysés. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'dist-test', 'build', 'coverage', 'out',
  '.vite', '.cache', '.next', '__pycache__', '.venv', 'target',
]);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.wav', '.zip', '.pdf', '.webmanifest']);
const MAX_BYTES = 2 * 1024 * 1024;

/** `.env.example` est volontairement un gabarit : on le signale à part. */
const TEMPLATE_OK = new Set(['.env.example']);

/**
 * Moteur de motifs `.gitignore`, SANS dépendre de git.
 *
 * `git check-ignore` et `git ls-files --ignored` exigent un dépôt initialisé ;
 * or `publier.bat` contrôle les secrets AVANT le `git init`. Sans ce repli, un
 * dossier fraîchement extrait (ZIP) contenant un `.env` était déclaré à tort
 * « non ignoré » et bloquait la publication — alors que le `.gitignore` était
 * parfaitement correct.
 */
function escapeRegExp(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Transforme un motif .gitignore en expression rationnelle (`*` = hors `/`). */
function patternToRegExp(pattern) {
  return new RegExp('^' + pattern.split('*').map(escapeRegExp).join('[^/]*') + '$');
}

let cachedPatterns = null;

function gitignorePatterns() {
  if (cachedPatterns) return cachedPatterns;
  const file = path.join(root, '.gitignore');
  cachedPatterns = [];
  if (!fs.existsSync(file)) return cachedPatterns;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) continue; // négation : n'assure pas l'oubli
    cachedPatterns.push(line.replace(/\/+$/, '').replace(/^\//, ''));
  }
  return cachedPatterns;
}

/** Vrai si le chemin relatif est couvert par `.gitignore` (dossier ou fichier). */
function matchesGitignore(relative) {
  const patterns = gitignorePatterns();
  if (!patterns.length) return false;
  const parts = relative.split('/');
  for (const pattern of patterns) {
    const re = patternToRegExp(pattern);
    // Motif sans barre oblique (ex. `dist`, `*.log`) : valable à tout niveau.
    if (!pattern.includes('/') && re.test(parts[parts.length - 1])) return true;
    // Le motif peut viser un ancêtre : tout le sous-arbre est alors ignoré.
    for (let i = 1; i <= parts.length; i += 1) {
      if (re.test(parts.slice(0, i).join('/'))) return true;
    }
  }
  return false;
}

/** `.env` et consorts sont-ils bien oubliés par git ? */
function gitignoreCovers(fileName) {
  return matchesGitignore(String(fileName).replace(/^\.\//, ''));
}

/* ------------------------------------------------------------------ */
/*  Analyse d'un texte                                                 */
/* ------------------------------------------------------------------ */

/** Extrait le chemin de fichier d'une étiquette (« src/x.ts » ou « src/x.ts @ 7fd0deb »). */
function fileOf(label) {
  return String(label).split(' @ ')[0];
}

function scanText(text, label) {
  const hits = [];
  const filePath = fileOf(label);
  for (const rule of RULES) {
    if (rule.srcOnly) {
      if (ENV_RULE_SKIP.test(filePath)) continue;
      if (!ENV_RULE_ONLY_IN.test(filePath)) continue;
    }
    rule.re.lastIndex = 0;
    let match;
    while ((match = rule.re.exec(text)) !== null) {
      const value = match[0];
      const secret = value.replace(/^['"`]|['"`]$/g, '');
      if (PLACEHOLDERS.some((p) => p.test(secret))) continue;
      if (rule.onlyNear) {
        const around = text.slice(Math.max(0, match.index - 120), match.index + 120);
        if (!rule.onlyNear.test(around)) continue;
      }
      const line = text.slice(0, match.index).split('\n').length;
      hits.push({
        rule: rule.name,
        label,
        line,
        preview: maskSecret(secret),
      });
      if (hits.length > 200) return hits;
    }
  }
  return hits;
}

/** N'affiche jamais un secret en entier : 6 premiers + 4 derniers caractères. */
function maskSecret(secret) {
  if (secret.length <= 14) return `${secret.slice(0, 3)}…${secret.slice(-2)}`;
  return `${secret.slice(0, 8)}…${secret.slice(-4)} (${secret.length} car.)`;
}

/* ------------------------------------------------------------------ */
/*  Utilitaires git                                                    */
/* ------------------------------------------------------------------ */

function git(args, options = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  } catch {
    return null;
  }
}

function hasRepo() {
  return git(['rev-parse', '--git-dir']) !== null;
}

/**
 * Détermine si un fichier est ignoré par git.
 *
 * Indispensable pour éviter un blocage illégitime : le `.env` local contient
 * NORMALEMENT de vraies clés, et `data/generated/catalog.json` n'est jamais
 * poussé. Un secret dans un fichier correctement ignoré n'atteindra pas GitHub
 * et ne doit donc pas empêcher la publication — il est signalé à part.
 *
 * Deux sources, dans l'ordre : la liste authoritative de git quand un dépôt
 * existe, sinon l'analyse directe du `.gitignore`.
 */
let ignoredCache = null;
let ignoredPrefixes = [];

function isIgnoredPath(relative) {
  if (ignoredCache === null) {
    ignoredCache = hasRepo() ? new Set() : false;
    if (ignoredCache instanceof Set) {
      const out = git(['ls-files', '--others', '--ignored', '--exclude-standard']);
      for (const line of (out ?? '').split('\n')) {
        const trimmed = line.trim();
        if (trimmed) ignoredCache.add(trimmed);
      }
      // git liste les dossiers entiers (« node_modules/ ») : on retient les préfixes.
      ignoredPrefixes = [...ignoredCache].filter((e) => e.endsWith('/'));
    }
  }
  if (ignoredCache instanceof Set) {
    if (ignoredCache.has(relative)) return true;
    return ignoredPrefixes.some((prefix) => relative.startsWith(prefix));
  }
  return matchesGitignore(relative);
}

/* ------------------------------------------------------------------ */
/*  1. Arbre de travail                                                */
/* ------------------------------------------------------------------ */

function* walk(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full, relative);
    } else if (entry.isFile()) {
      yield { full, relative };
    }
  }
}

function scanTree() {
  const found = [];
  for (const { full, relative } of walk(root)) {
    if (!SCAN_IGNORED && isIgnoredPath(relative)) continue;
    if (SKIP_FILES.has(path.basename(relative))) continue;
    if (SKIP_EXT.has(path.extname(relative).toLowerCase())) continue;
    if (TEMPLATE_OK.has(path.basename(relative))) continue;
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.size > MAX_BYTES) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // binaire
    found.push(...scanText(text, relative));
  }
  return found;
}

/** Un fichier `.env` réel (non ignoré) est déjà un problème en soi. */
/**
 * État des fichiers `.env` vis-à-vis de git.
 *
 * Trois questions distinctes, auxquelles il ne faut surtout pas mélanger les
 * réponses :
 *   1. `tracked`  : le fichier est-il déjà dans l'index ? → il PART sur GitHub,
 *                   quelle que soit la présence d'une règle d'oubli.
 *   2. `ignored`  : une règle du `.gitignore` le couvre-t-elle ?
 *                   `git check-ignore --no-index` répond à cette question sans
 *                   être faussée par le suivi dans l'index.
 *   3. `gitignoreExists` : le fichier de règles est-il présent ?
 */
function scanEnvFiles() {
  const gitignoreExists = fs.existsSync(path.join(root, '.gitignore'));
  const repo = hasRepo();
  const problems = [];

  for (const name of ['.env', '.env.local', '.env.production', '.env.development']) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;

    // 1) Suivi dans l'index ?
    let tracked = false;
    if (repo) {
      const out = git(['ls-files', '--error-unmatch', '--', name]);
      tracked = Boolean(out && out.trim());
    }

    // 2) Couvert par une règle d'oubli ?
    let ignored = false;
    let ignoredBy = null;
    if (repo) {
      // --no-index : la règle est évaluée même si le fichier est déjà suivi,
      // ce qui permet de distinguer « règle absente » de « fichier suivi ».
      const hit = git(['check-ignore', '--no-index', '--verbose', '--', name]);
      if (hit && hit.trim()) {
        ignored = true;
        ignoredBy = hit.trim().split('\n')[0];
      }
    }
    if (!ignored) {
      // Hors dépôt (ZIP fraîchement extrait) ou règle non résolue par git :
      // on applique nous-mêmes les motifs du .gitignore.
      ignored = matchesGitignore(name);
      if (ignored) ignoredBy = '.gitignore (analyse directe)';
    }

    problems.push({ name, ignored, ignoredBy, tracked, repo });
  }
  return { files: problems, gitignoreExists, repo };
}

/** Un fichier `.env` est-il correctement protégé ? */
function envFileIsSafe(entry) {
  return entry.ignored && !entry.tracked;
}

/** Contrôle `.env` détaillé, avec diagnostic exploitable. */
function runEnvCheck() {
  const { files, gitignoreExists, repo } = scanEnvFiles();
  const unsafe = files.filter((entry) => !envFileIsSafe(entry));

  console.log('\n🔎 EduMate — Contrôle des fichiers .env');
  console.log(`   Dépôt git : ${repo ? 'présent' : 'absent (contrôle sur .gitignore seul)'}`);
  console.log(`   .gitignore : ${gitignoreExists ? 'présent' : 'ABSENT'}\n`);

  if (!files.length) {
    console.log('  ✅ Aucun fichier .env présent : rien ne peut fuiter.');
    return true;
  }

  for (const entry of files) {
    if (envFileIsSafe(entry)) {
      console.log(`  ✅ ${entry.name} — présent et correctement ignoré`);
      console.log(`       règle appliquée : ${entry.ignoredBy}`);
    } else if (entry.tracked) {
      console.log(`  ❌ ${entry.name} — SUIVI PAR GIT : il partirait sur GitHub !`);
      console.log(`       ${entry.ignored ? 'une règle d’oubli existe, mais le fichier est déjà dans l’index.' : 'aucune règle d’oubli ne le couvre.'}`);
      console.log(`       corriger : git rm --cached ${entry.name}`);
    } else {
      console.log(`  ❌ ${entry.name} — présent mais AUCUNE règle ne l'ignore`);
      console.log(`       corriger : ajouter la ligne  ${entry.name}  dans .gitignore`);
    }
  }

  if (!gitignoreExists) {
    console.log('\n  ❌ .gitignore absent à la racine du projet.');
    console.log('       Le contenu minimal attendu figure dans .env.example et README.md.');
  }

  if (unsafe.length) {
    console.log(`\n${'='.repeat(62)}`);
    console.log(`  ⛔ ${unsafe.length} fichier(s) sensible(s) non protégé(s) : publication arrêtée.`);
    console.log('='.repeat(62));
    console.log(`
  Ces fichiers contiennent des clés réelles. S'ils partent sur GitHub :
    - le push sera refusé (erreur GH013),
    - les clés seront compromises et devront être révoquées.

  Correction la plus courante, à la racine du projet :
    1. ouvre .gitignore et vérifie la présence de ces lignes :
         .env
         .env.local
         .env.*.local
         !.env.example
    2. si un fichier est déjà suivi par git :
         git rm --cached .env
    3. relance ce contrôle :
         node scripts/scan-secrets.mjs --env-check
`);
    return false;
  }

  console.log(`\n${'='.repeat(62)}`);
  console.log('  ✅ Fichiers .env correctement protégés.');
  console.log('='.repeat(62) + '\n');
  return true;
}

/* ------------------------------------------------------------------ */
/*  2. Historique git                                                  */
/* ------------------------------------------------------------------ */

function scanHistory() {
  const found = [];
  const commits = (git(['rev-list', '--all']) ?? '').split('\n').filter(Boolean);
  if (!commits.length) return { found, commits: 0, note: 'Aucun commit (dépôt vide ou absent).' };

  // Un blob = un contenu unique : on ne l'analyse qu'une fois.
  const seenBlobs = new Set();
  let blobs = 0;

  for (const commit of commits) {
    const tree = git(['ls-tree', '-r', '--format=%(objectname)\t%(path)', commit]) ?? '';
    for (const line of tree.split('\n')) {
      if (!line.trim()) continue;
      const [sha, filePath] = line.split('\t');
      if (!sha || !filePath) continue;
      if (SKIP_FILES.has(path.basename(filePath))) continue;
      if (SKIP_EXT.has(path.extname(filePath).toLowerCase())) continue;
      if (seenBlobs.has(sha)) continue;
      seenBlobs.add(sha);
      blobs += 1;
      const content = git(['cat-file', 'blob', sha]);
      if (content === null || content.includes('\u0000')) continue;
      if (content.length > MAX_BYTES) continue;
      for (const hit of scanText(content, `${filePath} @ ${commit.slice(0, 7)}`)) {
        found.push({ ...hit, commit: commit.slice(0, 7), filePath });
      }
    }
  }
  return { found, commits: commits.length, blobs };
}

/* ------------------------------------------------------------------ */
/*  Restitution                                                        */
/* ------------------------------------------------------------------ */

if (ENV_CHECK_ONLY) {
  process.exit(runEnvCheck() ? 0 : 1);
}

const treeHits = SCAN_TREE ? scanTree() : [];
const envReport = SCAN_TREE ? scanEnvFiles() : { files: [], gitignoreExists: true, repo: false };
const envFiles = envReport.files;
const history = SCAN_HISTORY ? scanHistory() : { found: [], commits: 0 };
const historyHits = history.found ?? [];

const dangerousEnv = envFiles.filter((e) => !envFileIsSafe(e));
const missingGitignore = SCAN_TREE && envFiles.length > 0 && !envReport.gitignoreExists;
if (missingGitignore) dangerousEnv.push({ name: '.gitignore (absent)', tracked: false, ignored: false });
const blocked = treeHits.length > 0 || historyHits.length > 0 || dangerousEnv.length > 0;

if (AS_JSON) {
  console.log(JSON.stringify({ blocked, tree: treeHits, history: historyHits, envFiles, gitignoreExists: envReport.gitignoreExists, commits: history.commits }, null, 2));
  process.exit(blocked ? 1 : 0);
}

console.log('\n🔎 EduMate — Détection de secrets avant publication');
console.log('   (même contrôle que GitHub Push Protection, mais en local)\n');

if (SCAN_TREE) {
  console.log('── Arbre de travail ──');
  if (!treeHits.length) console.log('  ✅ Aucune clé détectée dans les fichiers du projet.');
  for (const hit of treeHits) console.log(`  ❌ ${hit.rule} — ${hit.label}:${hit.line}  ${hit.preview}`);

  console.log('\n── Fichiers .env ──');
  if (!envFiles.length) console.log('  ✅ Aucun fichier .env présent.');
  for (const e of envFiles) {
    const state = e.tracked ? '❌ SUIVI PAR GIT (sera publié !)' : e.ignored ? '✅ présent et correctement ignoré' : '❌ présent mais PAS ignoré';
    console.log(`  ${state} — ${e.name}`);
  }
}

if (SCAN_HISTORY) {
  console.log(`\n── Historique git (${history.commits ?? 0} commit(s), ${history.blobs ?? 0} contenu(s) analysé(s)) ──`);
  if (history.note) console.log(`  ℹ️  ${history.note}`);
  else if (!historyHits.length) console.log('  ✅ Aucune clé dans l’historique.');
  for (const hit of historyHits) console.log(`  ❌ ${hit.rule} — ${hit.label}:${hit.line}  ${hit.preview}`);
}

console.log('\n' + '='.repeat(62));
if (!blocked) {
  console.log('  ✅ RIEN À SIGNALER : le push ne sera pas bloqué par GitHub.');
  console.log('='.repeat(62) + '\n');
  process.exit(0);
}

console.log('  ⛔ SECRET(S) DÉTECTÉ(S) : GitHub refusera le push (GH013).');
console.log('='.repeat(62));
console.log(`
  Que faire, dans l'ordre :

  1. RÉVOQUER la clé compromise.
     Elle a déjà été lue par Git/GitHub : considère-la comme publique.
     → console xAI/Grok : supprime la clé et génère-en une nouvelle.

  2. RETIRER la clé du code.
     Elle ne doit JAMAIS apparaître dans un fichier du dépôt.
     Le projet lit déjà la bonne variable :
        src/server/lib/config.ts → apiKey: process.env.AI_API_KEY ?? ''
     Donc : supprime la valeur en dur, et mets la clé dans
        - ton .env local (déjà gitignoré),
        - Render → Environment → AI_API_KEY.

  3. PURGER l'historique si la clé apparaît dans un commit.
     C'est le point qui bloque même après suppression du fichier :
     GitHub analyse TOUS les commits du push, pas seulement le dernier.
     Deux options :
        a) dépôt récent, 1 ou 2 commits, rien de partagé :
             git checkout --orphan propre
             git add -A
             git commit -m "feat: EduMate"
             git branch -M main
             git push --force -u origin main
        b) conserver l'historique :
             npx git-filter-repo --replace-text expressions.txt
           (expressions.txt : une ligne par secret à remplacer)

  4. RELANCER ce contrôle, puis publier :
        node scripts/scan-secrets.mjs
        publier.bat
`);
process.exit(1);
