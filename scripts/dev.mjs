/**
 * EduMate — Lanceur de développement.
 *
 * Démarre simultanément :
 *   1. l'API Express (TypeScript exécuté à la volée par tsx),
 *   2. le serveur Vite (SPA React) qui proxifie /api vers l'API.
 *
 * Aucun outil externe : Node + les binaires locaux de node_modules.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stopProcess, tsx, vite } from './lib/tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = Number(process.env.PORT ?? 8787);
const webPort = Number(process.env.CLIENT_PORT ?? 5173);

/*
 * Les binaires sont résolus via scripts/lib/tools.mjs : sur Windows, les
 * wrappers .cmd de npm déclenchent `spawn EINVAL` depuis le correctif
 * CVE-2024-27980. On exécute donc node + le point d'entrée JS de chaque outil.
 */
const tsxServer = tsx([path.join(root, 'src/server/index.ts')]);
const viteDev = vite([]);

const targets = [
  {
    name: 'API',
    color: '\x1b[35m',
    command: tsxServer.command,
    args: tsxServer.args,
    env: { ...process.env, PORT: String(apiPort), EDUMATE_NO_AUTOSTART: '' },
  },
  {
    name: 'WEB',
    color: '\x1b[36m',
    command: viteDev.command,
    args: viteDev.args,
    env: { ...process.env, PORT: String(apiPort), CLIENT_PORT: String(webPort) },
  },
];

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function prefix(name, color) {
  return `${color}[${name}]\x1b[0m `;
}

function pipe(stream, name, color, target) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) target.write(`${prefix(name, color)}${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) target.write(`${prefix(name, color)}${buffer}\n`);
  });
}

for (const target of targets) {
  const child = spawn(target.command, target.args, {
    cwd: root,
    env: target.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(child.stdout, target.name, target.color, process.stdout);
  pipe(child.stderr, target.name, target.color, process.stderr);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.stdout.write(`${prefix(target.name, target.color)}processus terminé (code ${code})\n`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopProcess(child);
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.stdout.write(
  `\n  🦉 EduMate en développement\n` +
    `     Interface  : http://localhost:${webPort}\n` +
    `     API        : http://localhost:${apiPort}/api/health\n` +
    `     Arrêt      : Ctrl+C\n\n`,
);
