/**
 * EduMate — Point d'entrée du frontend.
 *
 * Ordre des styles : fondations → composants → mise en page.
 *
 * Deux filets de sécurité pour que l'élève ne reste jamais devant un écran de
 * chargement infini sans comprendre :
 *   1. un « watchdog » qui affiche les causes probables si React n'a pas pris
 *      la main après quelques secondes (serveur en veille, cache, proxy…),
 *   2. l'affichage à l'écran des erreurs JavaScript fatales, avec le bouton de
 *      rechargement — plus besoin d'ouvrir la console pour diagnostiquer.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { useAuth } from './lib/store.js';
import { getPwaState, registerServiceWorker, startKeepAlive, startNetworkWatch } from './lib/pwa.js';

/** Le maintien éveillé est-il demandé ? (préférence locale, activée par défaut) */
const getPwaKeepAliveEnabled = (): boolean => getPwaState().keepAlive;

import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/lessons.css';
/* Identité « Liquid Glass » v3.0 — chargée EN DERNIER : elle habille les
   composants existants (cartes, boutons, sidebar…) sans toucher à base.css. */
import './styles/glass.css';

const container = document.getElementById('root');

/* ------------------------- Filet n°1 : watchdog -------------------------- */

const WATCHDOG_DELAY_MS = 12_000;
let mounted = false;

const watchdog = window.setTimeout(() => {
  if (mounted) return;
  const message = document.getElementById('boot-message');
  const help = document.getElementById('boot-help');
  if (message) message.textContent = 'EduMate met du temps à démarrer…';
  if (help) help.classList.add('is-visible');
}, WATCHDOG_DELAY_MS);

/* --------------------- Filet n°2 : erreurs visibles ---------------------- */

function showFatalError(title: string, detail?: string): void {
  const box = document.getElementById('boot-error');
  if (!box) return;
  box.textContent = detail ? `${title}\n\n${detail}` : title;
  box.classList.add('is-visible');
  const help = document.getElementById('boot-help');
  if (help) help.classList.add('is-visible');
}

window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement | null;
  // Échec de chargement d'une ressource (script, feuille de style, image…)
  if (target && target !== (window as unknown as HTMLElement) && (target as HTMLScriptElement).src) {
    const src = (target as HTMLScriptElement).src;
    showFatalError(
      `Impossible de charger un fichier de l'application :\n${src}`,
      'Le site a probablement été mis à jour entre-temps (anciens fichiers en cache).\n→ Recharge avec Ctrl + Maj + R.',
    );
    return;
  }
  if (event.message) {
    showFatalError(`Erreur JavaScript : ${event.message}`, event.filename ? `${event.filename}:${event.lineno}` : undefined);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const text = reason instanceof Error ? reason.message : String(reason ?? '');
  if (text) showFatalError(`Erreur non gérée : ${text}`);
});

/* ------------------------------ Démarrage -------------------------------- */

async function bootstrap(): Promise<void> {
  if (!container) {
    showFatalError('EduMate : conteneur racine (#root) introuvable dans index.html.');
    return;
  }
  try {
    // 1) Montage IMMÉDIAT de l'application.
    //    La session est chargée en parallèle : pendant ce temps, les
    //    garde-routes affichent l'écran de réveil EduMate (`WakeScreen`).
    //    C'est essentiel au démarrage d'un serveur froid (~30 s sur le plan
    //    gratuit) : attendre la session avant de monter laissait l'élève
    //    devant le simple écran de boot, sans animation ni explication.
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    mounted = true;
    window.clearTimeout(watchdog);

    // 2) Session en arrière-plan : les retries gèrent le réveil du serveur.
    const sessionReady = useAuth.getState().loadSession().catch(() => undefined);

    /*
     * PWA : enregistrement APRÈS le montage, et jamais bloquant.
     *
     * Un service worker n'est pas nécessaire au fonctionnement de l'application :
     * s'il n'est pas pris en charge, si le contexte n'est pas sécurisé ou si
     * l'enregistrement échoue, EduMate doit démarrer normalement. D'où le
     * `void` et le `catch` interne de `registerServiceWorker()`.
     *
     * Le maintien éveillé et le suivi réseau sont branchés au même moment : ils
     * ne dépendent pas du service worker.
     */
    startNetworkWatch();
    if (getPwaKeepAliveEnabled()) startKeepAlive();
    void registerServiceWorker().catch(() => undefined);
  } catch (error) {
    showFatalError(
      'EduMate n\u2019a pas pu d\u00e9marrer.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

void bootstrap();

// Repère de dernière visite (statistique locale, aucune donnée envoyée).
window.addEventListener('pagehide', () => {
  try {
    window.localStorage.setItem('edumate:lastVisit', new Date().toISOString());
  } catch {
    /* stockage indisponible : sans conséquence */
  }
});
