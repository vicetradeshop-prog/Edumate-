/**
 * EduMate — Résolution des binaires locaux (node_modules).
 *
 * ⚠️ Spécificité Windows : depuis le correctif de sécurité Node.js
 * (CVE-2024-27980), `child_process.spawn()` refuse d'exécuter un fichier
 * `.cmd`/`.bat` sans l'option `shell: true`, et lève `EINVAL`.
 *
 * Plutôt que d'activer `shell: true` (fragile : quoting des arguments,
 * injection de caractères spéciaux), on exécute directement avec `node` le
 * point d'entrée JavaScript déclaré dans le champ `bin` du paquet.
 * Comportement identique sur Windows, macOS et Linux.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

/** Retourne `[process.execPath, [script, ...args]]` pour un outil local. */
export function tool(name, args = []) {
  const pkgPath = path.join(projectRoot, 'node_modules', name, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Dépendance manquante : « ${name} ». Lance d'abord « npm install ».`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const bin = pkg.bin;
  let entry = null;
  if (typeof bin === 'string') {
    entry = bin;
  } else if (bin && typeof bin === 'object') {
    entry = bin[name] ?? Object.values(bin)[0];
  }
  if (!entry) {
    throw new Error(`Le paquet « ${name} » ne déclare aucun exécutable (champ bin).`);
  }
  const script = path.join(projectRoot, 'node_modules', name, entry);
  if (!fs.existsSync(script)) {
    throw new Error(`Exécutable introuvable : ${path.relative(projectRoot, script)}`);
  }
  return { command: process.execPath, args: [script, ...args] };
}

/** tsx : exécuteur TypeScript sans étape de build. */
export const tsx = (args = []) => tool('tsx', args);

/** vite : bundler du frontend. */
export const vite = (args = []) => tool('vite', args);

/**
 * Arrête proprement un processus enfant et toute sa descendance.
 * Sur Windows, `kill()` ne suffit pas quand l'enfant a lui-même lancé des
 * processus : on passe par `taskkill /T /F`.
 */
export function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      // `/T` termine aussi les processus enfants (tsx lance node, vite lance esbuild…).
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* processus déjà terminé */
  }
}
