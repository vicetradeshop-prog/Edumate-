/**
 * EduMate — Fond « Liquid Glass ».
 *
 * Enveloppe React du moteur 3D (`glassScene.ts`, chargé paresseusement) :
 *
 *  - le canvas est créé/détruit par ce composant (jamais réutilisé) : après un
 *    `forceContextLoss`, un canvas ne peut plus accueillir de nouveau contexte
 *    WebGL — indispensable pour survivre au double-montage `StrictMode` ;
 *  - garde-fous d'environnement : pas de WebGL2 (ou jsdom/SSR) → on ne charge
 *    même pas three.js et le dégradé CSS prend le relais ;
 *  - `prefers-reduced-motion` ET le réglage « Animations » d'EduMate coupent le
 *    fond 3D (le dégradé CSS statique reste, l'interface ne bouge plus) ;
 *  - `pointer-events: none` partout : le fond ne peut JAMAIS intercepter un
 *    clic, un appui tactile ou la navigation ;
 *  - nettoyage complet au démontage (aucune fuite : écouteurs, rAF, contexte).
 *
 * Hiérarchie visuelle :
 *   body (dégradé CSS)  <  .liquid-bg__css (aurora CSS)  <  canvas WebGL
 *   <  #root (contenu de l'application, opaque là où c'est nécessaire).
 */
import { useEffect, useRef, useState } from 'react';
import { motionAllowed, onMotionPreferenceChange } from '../../lib/fx.js';
import type { LiquidGlassScene } from './glassScene.js';

/** WebGL2 est-il disponible ? (le test évite tout bruit en environnement jsdom) */
function webgl2Supported(): boolean {
  if (typeof window === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function LiquidGlassBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'webgl' | 'css'>('css');
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let starting = false; // garde « en vol » : start() est asynchrone (import du moteur)
    let scene: LiquidGlassScene | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let themeObserver: MutationObserver | null = null;

    const currentThemeIsDark = (): boolean => document.documentElement.dataset.theme !== 'clair';

    const fallbackToCss = (): void => {
      scene?.dispose();
      scene = null;
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
      canvas = null;
      // Filet : ne jamais laisser un canvas orphelin (sans scène) dans l'hôte.
      for (const orphan of host.querySelectorAll('canvas.liquid-bg__canvas')) orphan.remove();
      setMode('css');
      setRevealed(false);
      document.documentElement.dataset.fxBackground = 'css';
    };

    const start = async (): Promise<void> => {
      /*
       * Garde « en vol » : start() est asynchrone (import paresseux du moteur).
       * Sans cette garde, un changement de préférence « animations » pendant
       * l'import (l'hydratation des réglages pose data-animations au démarrage)
       * relançait start() alors que `scene` était encore null → DEUX scènes
       * WebGL simultanées, puis un canvas orphelin au repli.
       */
      if (disposed || starting || scene) return;
      if (!motionAllowed() || !webgl2Supported()) {
        document.documentElement.dataset.fxBackground = 'css';
        return;
      }
      starting = true;
      try {
        const module = await import('./glassScene.js');
        if (disposed) return;

        // Canvas neuf à chaque démarrage (voir commentaire du composant).
        canvas = document.createElement('canvas');
        canvas.className = 'liquid-bg__canvas';
        host.appendChild(canvas);

        const created = module.createLiquidGlassScene(canvas, {
          onFallback: fallbackToCss,
          onFirstFrame: () => {
            if (disposed) return;
            setMode('webgl');
            setRevealed(true);
            document.documentElement.dataset.fxBackground = 'webgl';
            /*
             * Trace diagnostique persistante : « le moteur WebGL a bien tourné
             * au moins une frame sur cette page ». Ne sert à aucun style ; elle
             * permet au contrôle visuel automatisé (et au debugging terrain) de
             * distinguer « WebGL jamais démarré » d'un repli CSS ultérieur du
             * gouverneur FPS (machine trop lente).
             */
            document.documentElement.dataset.fxWebglStarted = 'true';
          },
        });
        if (!created) {
          fallbackToCss();
          return;
        }
        if (disposed) {
          created.dispose();
          return;
        }
        scene = created;
        created.setTheme(currentThemeIsDark());
      } catch {
        // three.js indisponible (réseau, chunk manquant…) : l'application
        // continue normalement avec le dégradé CSS.
        if (!disposed) fallbackToCss();
      } finally {
        starting = false;
      }
    };

    void start();

    // Le thème clair/sombre pilote la palette du fond.
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(() => {
        scene?.setTheme(currentThemeIsDark());
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // Préférence de mouvement : système OU réglage « Animations » d'EduMate.
    const stopMotionWatch = onMotionPreferenceChange(() => {
      if (!motionAllowed()) {
        fallbackToCss();
      } else if (!scene && !disposed) {
        void start();
      }
    });

    return () => {
      disposed = true;
      stopMotionWatch();
      themeObserver?.disconnect();
      scene?.dispose();
      scene = null;
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
      canvas = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="liquid-bg"
      aria-hidden="true"
      data-mode={mode}
      data-revealed={revealed ? 'true' : 'false'}
    >
      {/* Aurora CSS : toujours présente (fond de secours + socle sous le WebGL). */}
      <div className="liquid-bg__css" />
    </div>
  );
}
