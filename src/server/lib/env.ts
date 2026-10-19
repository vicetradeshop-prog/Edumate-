/**
 * EduMate — Chargement du fichier `.env` (zéro dépendance).
 *
 * ⚠️ Ce module doit être importé EN PREMIER dans `src/server/index.ts` :
 *    `lib/config.ts` lit `process.env` dès son évaluation, donc le `.env` doit
 *    être injecté avant. En ESM, les imports sont évalués dans l'ordre où ils
 *    sont déclarés — la position de l'import est donc significative.
 *
 * Pourquoi un chargeur maison plutôt que `dotenv` ou `node --env-file` ?
 *   - `dotenv` ajouterait une dépendance à un projet qui n'en a aucune
 *     pour son fonctionnement serveur ;
 *   - `--env-file` exige de modifier chaque commande de démarrage et **échoue
 *     brutalement si le fichier est absent** (Node 20), ce qui casserait
 *     Render et les suites de tests ;
 *   - ce chargeur est tolérant : pas de `.env` = aucun effet, aucun message.
 *
 * Règle de sécurité essentielle : **une variable déjà présente dans
 * `process.env` n'est JAMAIS écrasée.** Les variables posées par Render (ou par
 * un script de test) priment donc toujours sur le fichier local.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Racine du projet, déterminée sans supposer de profondeur fixe.
 *
 * Ce module vit dans `src/server/lib/`, mais il est exécuté depuis DEUX
 * emplacements différents après build :
 *   - développement (tsx)  : `<racine>/src/server/lib/env.ts`  → 3 niveaux
 *   - production (bundle)  : `<racine>/dist/server/index.js`   → 2 niveaux
 * Une liste figée de `..` serait donc fausse dans l'un des deux cas (elle
 * pointait sur `<racine>/src` en développement, et seul `process.cwd()` — par
 * chance correct — sauvait la mise).
 *
 * On remonte donc jusqu'au premier dossier contenant `package.json`, ce qui est
 * exact quelle que soit la profondeur, puis on complète avec `process.cwd()`.
 */
function candidateRoots(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (candidate: string): void => {
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  };

  // 1) Remontée depuis ce module jusqu'au package.json le plus proche.
  let current = dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, 'package.json'))) {
      push(current);
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 2) Repli : répertoire de lancement (correct quand npm exécute les scripts).
  push(process.cwd());
  return out;
}

/** Supprime les guillemets entourant une valeur, sans toucher au contenu. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Analyse le contenu d'un fichier `.env`.
 *
 * Sont acceptés : commentaires `#`, lignes vides, préfixe `export `,
 * valeurs entre guillemets simples ou doubles, fins de ligne CRLF ou LF.
 * Un `#` à l'intérieur d'une valeur guillemetée fait partie de la valeur.
 */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.replace(/^export\s+/, '');
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separator + 1);
    const isQuoted = /^\s*["']/.test(value);
    if (!isQuoted) {
      // Hors guillemets, un `#` introduit un commentaire de fin de ligne.
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash);
    }
    result[key] = unquote(value);
  }
  return result;
}

/** Chemins `.env` chargés, du plus prioritaire au moins prioritaire. */
const ENV_FILES = ['.env.local', '.env'];

export interface EnvLoadResult {
  files: string[];
  keys: string[];
  skipped: string[];
}

/**
 * Charge les fichiers `.env` trouvés dans la première racine candidate qui en
 * contient. Silencieux en l'absence de fichier : c'est le cas normal sur Render.
 */
export function loadEnvFiles(): EnvLoadResult {
  const result: EnvLoadResult = { files: [], keys: [], skipped: [] };

  let root: string | null = null;
  for (const candidate of candidateRoots()) {
    if (ENV_FILES.some((name) => existsSync(path.join(candidate, name)))) {
      root = candidate;
      break;
    }
  }
  if (!root) return result;

  // `.env.local` d'abord : il permet de surcharger `.env` sans le modifier.
  // Mais comme on n'écrase jamais `process.env`, le premier fichier lu gagne :
  // on charge donc `.env` en premier, puis `.env.local` par-dessus.
  for (const name of [...ENV_FILES].reverse()) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch (error) {
      console.warn(`[EduMate] ${name} illisible, ignoré : ${(error as Error).message}`);
      continue;
    }
    result.files.push(name);
    for (const [key, value] of Object.entries(parseEnv(content))) {
      if (process.env[key] !== undefined && process.env[key] !== '') {
        result.skipped.push(key);
        continue;
      }
      process.env[key] = value;
      result.keys.push(key);
    }
  }

  const unique = [...new Set(result.keys)];
  result.keys = unique;
  if (unique.length) {
    console.log(
      `[EduMate] ${result.files.join(' + ')} chargé(s) : ${unique.length} variable(s) ` +
        `(${unique.slice(0, 6).join(', ')}${unique.length > 6 ? '…' : ''})`,
    );
  }
  return result;
}

// Chargement immédiat à l'import : c'est ce qui garantit que `config.ts`
// voit les valeurs du `.env`.
loadEnvFiles();
