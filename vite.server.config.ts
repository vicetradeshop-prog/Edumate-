import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build du serveur Express (API + fichiers statiques) en un seul fichier ESM.
 * Les dépendances npm restent externes : elles sont résolues depuis node_modules
 * au moment du démarrage (node dist/server/index.js).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(dirname, 'src/shared'),
      '@server': path.resolve(dirname, 'src/server'),
    },
  },
  build: {
    ssr: true,
    target: 'node20',
    outDir: path.resolve(dirname, 'dist/server'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(dirname, 'src/server/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'express',
        'cookie-parser',
        'compression',
        /^node:/,
      ],
      output: { inlineDynamicImports: true },
    },
  },
});
