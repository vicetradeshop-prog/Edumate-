/**
 * EduMate — Hooks React réutilisables.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Horloge partagée : `now` est rafraîchi toutes les `intervalMs`. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Compteur animé (utilisé pour les scores et statistiques). */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced || durationMs <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);
  return value;
}

/** Respect de `prefers-reduced-motion`. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Requête média CSS réactive (responsive logique). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** État persisté dans localStorage (préférences locales, brouillons…). */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* quota atteint : on ignore, l'UI reste fonctionnelle */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}

/** Valeur précédente (utile pour les animations de transition). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/** Debounce d'une valeur (recherche as-you-type). */
export function useDebounced<T>(value: T, delayMs = 280): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Intervalle propre (pausable) pour minuteurs et chronomètres. */
export function useTicker(active: boolean, onTick: () => void, intervalMs = 1000): void {
  const saved = useRef(onTick);
  useEffect(() => {
    saved.current = onTick;
  }, [onTick]);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => saved.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
}

/** Raccourcis clavier globaux (touches simples, ignorées dans les champs). */
export function useHotkeys(map: Record<string, () => void>, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      const action = ref.current[key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}

/** Ferme un élément au clic extérieur / touche Échap. */
export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onTouch = (event: TouchEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    /*
     * Phase CAPTURE : certains composants appellent stopPropagation() sur
     * leurs clics (cartes de quiz, calendrier, boutons du topbar…). En phase
     * de capture, document reçoit l'événement AVANT ces coupures : la
     * fermeture au clic extérieur devient fiable partout, tout le temps.
     */
    document.addEventListener('mousedown', onClick, true);
    document.addEventListener('touchstart', onTouch, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick, true);
      document.removeEventListener('touchstart', onTouch, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/** Titre de document dynamique. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · EduMate`;
  }, [title]);
}

/** Mémorise une valeur dérivée coûteuse dépendant d'une liste d'objets. */
export function useDeepMemo<T>(value: T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, deps);
}
