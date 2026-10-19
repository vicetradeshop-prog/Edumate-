/**
 * EduMate — Utilitaires des effets « Liquid Glass ».
 *
 * Ce module centralise tout ce qui pilote les effets visuels avancés :
 *  - la détection de la puissance de l'appareil (paliers « high / medium / low »),
 *  - les préférences de mouvement (préférence système `prefers-reduced-motion`
 *    ET réglage utilisateur « animations » déjà présent dans EduMate),
 *  - la lumière qui suit le curseur sur les boutons et les cartes
 *    (un SEUL écouteur délégué pour toute l'application : aucun coût par
 *    composant, aucun rerender React),
 *  - l'inclinaison 3D très légère des surfaces au survol,
 *  - un gouverneur de FPS réutilisable (fond 3D : baisse de résolution,
 *    puis repli CSS si la machine suit pas).
 *
 * Principe directeur : les effets ne doivent JAMAIS prendre le pas sur la
 * stabilité, la lisibilité ou la performance. Tout est donc désactivable,
 * dégradé progressivement, et indépendant de React.
 */

/* -------------------------------------------------------------------------- */
/*  Palier de qualité de l'appareil                                           */
/* -------------------------------------------------------------------------- */

export type FxTier = 'high' | 'medium' | 'low';

let cachedTier: FxTier | null = null;

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Estime la puissance de l'appareil une seule fois.
 *
 * Critères volontairement simples et robustes (aucune API exotique) :
 *  - pointeur tactile + écran étroit  → mobile/tablette → « low » ou « medium »,
 *  - nombre de cœurs CPU et mémoire annoncée (quand disponible),
 *  - tout le reste → « high ».
 */
export function getFxTier(): FxTier {
  if (cachedTier) return cachedTier;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    cachedTier = 'low';
    return cachedTier;
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth || 1280, window.innerHeight || 800) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as NavigatorWithMemory).deviceMemory ?? 4;

  if ((coarse && narrow) || cores <= 3 || memory <= 2) cachedTier = 'low';
  else if (coarse || cores <= 4 || memory <= 4) cachedTier = 'medium';
  else cachedTier = 'high';

  // Exposé sur <html> : le CSS l'utilise pour alléger certains effets
  // (flous, reflets animés) sur les petites machines.
  if (typeof document !== 'undefined') document.documentElement.dataset.fx = cachedTier;
  return cachedTier;
}

/* -------------------------------------------------------------------------- */
/*  Préférences de mouvement                                                  */
/* -------------------------------------------------------------------------- */

/** Les animations sont-elles autorisées (préférence système OU réglage utilisateur) ? */
export function motionAllowed(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.animations === 'off') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}

/**
 * Prévient `callback` quand la préférence de mouvement change : préférence
 * système (`prefers-reduced-motion`) ou réglage utilisateur (`data-animations`
 * posé sur <html> par la page Paramètres).
 *
 * Retourne la fonction de désinscription.
 */
export function onMotionPreferenceChange(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const cleanups: Array<() => void> = [];

  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (media) {
    media.addEventListener('change', callback);
    cleanups.push(() => media.removeEventListener('change', callback));
  }
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'data-animations') {
          callback();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-animations'] });
    cleanups.push(() => observer.disconnect());
  }
  return () => {
    for (const stop of cleanups) stop();
  };
}

/* -------------------------------------------------------------------------- */
/*  Lumière curseur + inclinaison 3D (déléguées, sans React)                  */
/* -------------------------------------------------------------------------- */

const GLOW_SELECTOR = '.btn, .card--hover, .tile, [data-glow]';
const TILT_SELECTOR = '[data-tilt]';
/** Inclinaison maximale, en degrés. Volontairement minuscule : lisibilité d'abord. */
const TILT_MAX_DEG = 2.6;

/**
 * Un seul écouteur `pointermove` pour toute l'application :
 *  - pose `--mx` / `--my` (position du curseur dans l'élément) sur le bouton
 *    ou la carte survolé(e) → le CSS y ancre un reflet lumineux qui « glisse »
 *    sur le verre ;
 *  - incline très légèrement (`--rx` / `--ry`) les surfaces `data-tilt`.
 *
 * Tout est throtté par `requestAnimationFrame` et n'écrit que des propriétés
 * CSS sur l'élément survolé : zéro rerender, zéro alloc notable.
 */
export function startPointerFx(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  let scheduled = false;
  let lastEvent: PointerEvent | null = null;
  let lastGlow: HTMLElement | null = null;
  let lastTilt: HTMLElement | null = null;
  const fine = !(window.matchMedia?.('(pointer: coarse)').matches ?? true);

  const apply = (): void => {
    scheduled = false;
    const event = lastEvent;
    if (!event || !motionAllowed()) return;

    const target = event.target as Element | null;
    const glow = (target?.closest?.(GLOW_SELECTOR) ?? null) as HTMLElement | null;
    if (glow !== lastGlow) {
      if (lastGlow && lastGlow !== glow) {
        lastGlow.style.removeProperty('--mx');
        lastGlow.style.removeProperty('--my');
        lastGlow.classList.remove('is-lit');
      }
      lastGlow = glow;
      if (glow) glow.classList.add('is-lit');
    }
    if (glow) {
      const rect = glow.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        glow.style.setProperty('--mx', `${Math.round(event.clientX - rect.left)}px`);
        glow.style.setProperty('--my', `${Math.round(event.clientY - rect.top)}px`);
      }
    }

    // Inclinaison 3D : uniquement au pointeur fin (souris/pavé), jamais au doigt.
    if (fine) {
      const tilt = (target?.closest?.(TILT_SELECTOR) ?? null) as HTMLElement | null;
      if (tilt !== lastTilt) {
        if (lastTilt && lastTilt !== tilt) {
          lastTilt.style.setProperty('--rx', '0deg');
          lastTilt.style.setProperty('--ry', '0deg');
        }
        lastTilt = tilt;
      }
      if (tilt) {
        const rect = tilt.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          tilt.style.setProperty('--rx', `${(-py * TILT_MAX_DEG * 2).toFixed(2)}deg`);
          tilt.style.setProperty('--ry', `${(px * TILT_MAX_DEG * 2).toFixed(2)}deg`);
        }
      }
    }
  };

  const onMove = (event: PointerEvent): void => {
    lastEvent = event;
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(apply);
    }
  };
  const onLeave = (): void => {
    if (lastGlow) {
      lastGlow.classList.remove('is-lit');
      lastGlow.style.removeProperty('--mx');
      lastGlow.style.removeProperty('--my');
      lastGlow = null;
    }
    if (lastTilt) {
      lastTilt.style.setProperty('--rx', '0deg');
      lastTilt.style.setProperty('--ry', '0deg');
      lastTilt = null;
    }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  return () => {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    onLeave();
  };
}

/* -------------------------------------------------------------------------- */
/*  Gouverneur de FPS                                                         */
/* -------------------------------------------------------------------------- */

export interface FpsGovernorOptions {
  /** Fenêtre d'observation, en ms (défaut : 3000). */
  windowMs?: number;
  /** Sous ce FPS moyen : premier palier de dégradation. */
  softFloor?: number;
  /** Sous ce FPS moyen : second palier (repli). */
  hardFloor?: number;
  onSoft?: () => void;
  onHard?: () => void;
}

/**
 * Surveille le FPS réel et déclenche des paliers de dégradation.
 *
 * Les paliers ne se déclenchent qu'UNE fois chacun (pas d'oscillation) et
 * seulement si la fenêtre d'observation est remplie de mesures — on ignore
 * ainsi les à-coups de démarrage (chargements, compilation des shaders).
 */
export class FpsGovernor {
  private readonly windowMs: number;
  private readonly softFloor: number;
  private readonly hardFloor: number;
  private readonly onSoft?: () => void;
  private readonly onHard?: () => void;
  private frames = 0;
  private windowStart = 0;
  private softFired = false;
  private hardFired = false;
  private warmupUntil = 0;

  constructor(options: FpsGovernorOptions = {}) {
    this.windowMs = options.windowMs ?? 3000;
    this.softFloor = options.softFloor ?? 42;
    this.hardFloor = options.hardFloor ?? 26;
    this.onSoft = options.onSoft;
    this.onHard = options.onHard;
  }

  /** À appeler à chaque frame, avec le timestamp de `requestAnimationFrame`. */
  tick(now: number): void {
    if (this.hardFired) return;
    /* Deux fenêtres de chauffe ignorées : la compilation des shaders et le
       premier paint produisent des frames irrégulières qui ne mesurent pas la
       vraie vitesse de la machine (le repli CSS se déclenchait sinon sur des
       sursauts de démarrage, pas sur une machine réellement lente). */
    if (this.warmupUntil === 0) this.warmupUntil = now + this.windowMs * 2;
    if (this.windowStart === 0) {
      this.windowStart = now;
      this.frames = 0;
      return;
    }
    this.frames += 1;
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return;

    const fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.windowStart = now;
    if (now < this.warmupUntil) return;

    if (fps < this.hardFloor && !this.hardFired) {
      this.hardFired = true;
      this.onHard?.();
    } else if (fps < this.softFloor && !this.softFired) {
      this.softFired = true;
      this.onSoft?.();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Divers                                                                    */
/* -------------------------------------------------------------------------- */

/** Borne une valeur dans un intervalle (NaN → min). */
export function clampFx(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Lissage exponentiel indépendant du framerate (facteur 0..1). */
export function dampFx(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
