/**
 * EduMate — Bundle de test de rendu.
 *
 * Compile l'application React en un seul fichier IIFE (`dist-test/render.js`)
 * qui peut être injecté dans un DOM simulé (jsdom). Cela permet de vérifier
 * que les pages se montent réellement et affichent leur contenu — sans
 * navigateur — en plus des tests API et unitaires.
 *
 * Les feuilles de style sont neutralisées (elles n'apportent rien à la
 * vérification du rendu) afin d'éviter toute dépendance à un moteur CSS.
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Remplace les imports de CSS par un module vide. */
function ignoreStyles(): Plugin {
  return {
    name: 'edumate-ignore-styles',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('.css')) return '\0virtual:empty-css';
      return null;
    },
    load(id) {
      if (id === '\0virtual:empty-css') return 'export default {}';
      return null;
    },
  };
}

/**
 * Remplace le moteur 3D (`glassScene.js`) par son stub de test.
 *
 * jsdom n'a pas de WebGL2 : `LiquidGlassBackground` ne déclenche JAMAIS
 * l'import dynamique du moteur pendant les tests de rendu. Sans ce stub,
 * `inlineDynamicImports` incorporerait three.js (~1 Mo de sources) au bundle
 * monolithique — trop lourd pour la machine de test (OOM).
 */
function stubGlassScene(): Plugin {
  const stubPath = path.resolve(projectRoot, 'tests/glass-scene-stub.ts');
  return {
    name: 'edumate-stub-glass-scene',
    enforce: 'pre',
    resolveId(source, importer) {
      if (/(^|\/)glassScene\.js$/.test(source) && importer?.includes('LiquidGlassBackground')) {
        return stubPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: projectRoot,
  plugins: [react(), ignoreStyles(), stubGlassScene()],
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  resolve: {
    alias: {
      '@client': path.resolve(projectRoot, 'src/client'),
      '@shared': path.resolve(projectRoot, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist-test'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(projectRoot, 'tests/render-entry.tsx'),
      name: 'EduMateRenderTest',
      formats: ['iife'],
      fileName: () => 'render.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
