import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuration du frontend EduMate (SPA React + Vite).
 *
 * En développement, un proxy renvoie /api vers le serveur Express local :
 * pas de CORS, et un comportement identique à la production (le même serveur
 * Express sert l'API et le build statique).
 *
 * ⚠️ Découpage des paquets : volontairement AUTOMATIQUE.
 * Un `manualChunks` manuel regroupe les modules par nom de paquet et peut
 * placer une dépendance transitoire (ex. `react-smooth`, utilisé par Recharts)
 * dans un chunk évalué AVANT le chunk `react`. Le module s'exécute alors avec
 * `React === undefined` et l'application plante au démarrage
 * (« Cannot read properties of undefined (reading 'PureComponent') »).
 * Rollup calcule l'ordre d'évaluation à partir du graphe d'imports réel :
 * c'est la seule approche sûre. Le découpage par page (`React.lazy`) reste
 * actif et suffit à garder un premier chargement léger.
 */
export default defineConfig({
  root: path.resolve(dirname, 'src/client'),
  publicDir: path.resolve(dirname, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@client': path.resolve(dirname, 'src/client'),
      '@shared': path.resolve(dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist/client'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // `modulepreload.polyfill` reste activé : les chunks sont préchargés
    // avant exécution, ce qui évite tout effet de cascade au démarrage.
  },
  server: {
    host: true,
    port: Number(process.env.CLIENT_PORT ?? 5173),
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
});
