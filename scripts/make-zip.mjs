#!/usr/bin/env node
/**
 * EduMate — Création de l'archive de livraison (100 % Node, sans dépendance).
 *
 * Produit `EduMate-projet.zip` contenant tout le projet, SANS :
 * node_modules, dist, dist-test, .env (secrets), data/local, .git, journaux.
 *
 * Usage : npm run zip
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'EduMate-projet.zip');

const EXCLUDED_DIRS = new Set([
  '.git', '.arena', '.cache', '.mypy_cache', '.next', '.nox', '.npm', '.nuxt', '.output',
  '.parcel-cache', '.pytest_cache', '.ruff_cache', '.svelte-kit', '.tox', '.turbo', '.venv',
  '.vite', '__pycache__', 'build', 'coverage', 'dist', 'dist-test', 'node_modules', 'out',
  'target', '.idea', '.vscode',
]);

const EXCLUDED_NAMES = new Set(['.env', '.env.local', '.env.production', 'EduMate-projet.zip']);
const EXCLUDED_SUFFIXES = ['.log', '.zip', '.tgz', '.db', '.sqlite', '.tsbuildinfo', '.DS_Store', '.bak'];
const EXCLUDED_PREFIXES = ['data/local/'];

const REQUIRED = [
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', '.gitignore', '.env.example',
  'render.yaml', 'tsconfig.json', 'vite.config.ts', 'vite.server.config.ts',
  'src/server/index.ts', 'src/client/main.tsx', 'src/client/App.tsx', 'src/client/index.html',
  'src/shared/types.ts', 'src/server/content/topics.ts', 'src/client/styles/base.css',
  'public/favicon.svg', 'scripts/build-catalog.ts',
];

/* ------------------------------ CRC32 --------------------------------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* --------------------------- Collecte des fichiers -------------------- */
function collect(dir, relative = '') {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      entries.push(...collect(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      if (EXCLUDED_NAMES.has(entry.name)) continue;
      if (EXCLUDED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
      if (EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
      entries.push({ rel, full: path.join(dir, entry.name) });
    }
  }
  return entries;
}

/* ------------------------------ Écriture ZIP -------------------------- */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.full);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const nameBuffer = Buffer.from(`edumate/${file.rel}`, 'utf8');
    const crc = crc32(raw);
    const { time, day } = dosDateTime(fs.statSync(file.full).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // drapeau UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/* --------------------------------- Main ------------------------------- */
if (fs.existsSync(output)) fs.rmSync(output);

const files = collect(root).sort((a, b) => a.rel.localeCompare(b.rel));
const archive = createZip(files);
fs.writeFileSync(output, archive);

const missing = REQUIRED.filter((name) => !fs.existsSync(path.join(root, name)));
const size = archive.length;

console.log(`\n📦 Archive créée : ${path.basename(output)}`);
console.log(`   Fichiers : ${files.length}`);
console.log(`   Taille   : ${(size / 1024).toFixed(1)} Kio (${(size / 1024 / 1024).toFixed(2)} Mio)`);
if (missing.length) {
  console.error('\n⚠️  Fichiers attendus mais absents :');
  for (const name of missing) console.error(`     • ${name}`);
  process.exit(1);
}
console.log('   ✅ Tous les fichiers essentiels sont présents.\n');
