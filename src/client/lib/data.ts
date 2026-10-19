import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api.js';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
}

interface UseApiOptions {
  /** Déclenche la requête au montage (défaut : true). */
  immediate?: boolean;
  /** Fonction de comparaison pour éviter des re-rendus inutiles. */
  deps?: unknown[];
}

/**
 * Chargement de données API avec états explicites :
 * chargement, erreur lisible, serveur injoignable.
 * L'interface n'affiche jamais d'erreur technique brute.
 */
export function useApi<T>(fetcher: () => Promise<T>, options: UseApiOptions = {}) {
  const { immediate = true, deps = [] } = options;
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: immediate, error: null, offline: false });
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (mounted.current) setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ data, loading: false, error: null, offline: false });
      return data;
    } catch (error) {
      if (!mounted.current) return null;
      const apiError = error instanceof ApiError ? error : null;
      const offline = apiError?.code === 'network' || apiError?.code === 'timeout';
      setState({
        data: null,
        loading: false,
        error: apiError?.message ?? 'Une erreur est survenue pendant le chargement.',
        offline,
      });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (immediate) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, load, ...deps]);

  return { ...state, reload: load };
}

/** Action asynchrone avec état d'occupation et message d'erreur lisible. */
export function useAction<T extends (...args: never[]) => Promise<unknown>>(action: T) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(action);
  ref.current = action;

  const run = useCallback(async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    setPending(true);
    setError(null);
    try {
      return (await ref.current(...args)) as ReturnType<T>;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible pour le moment.');
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, clearError: () => setError(null) };
}

/** Chronomètre/minuteur générique : `remaining` en secondes, contrôles complets. */
export interface Stopwatch {
  elapsedMs: number;
  running: boolean;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  addMs: (ms: number) => void;
  setMs: (ms: number) => void;
}

export function useStopwatch(initialMs = 0): Stopwatch {
  const [elapsedMs, setElapsedMs] = useState(initialMs);
  const [running, setRunning] = useState(false);
  const lastTick = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    lastTick.current = performance.now();
    let frame = 0;
    const tick = (): void => {
      const now = performance.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      setElapsedMs((value) => Math.max(0, value + delta));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return {
    elapsedMs,
    running,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    toggle: () => setRunning((value) => !value),
    reset: () => {
      setRunning(false);
      setElapsedMs(initialMs);
    },
    addMs: (ms) => setElapsedMs((value) => Math.max(0, value + ms)),
    setMs: (ms) => setElapsedMs(Math.max(0, ms)),
  };
}
