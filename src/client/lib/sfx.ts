/**
 * EduMate — Retours sonores d'interface (WebAudio, aucun fichier audio).
 *
 * Pourquoi des sons SYNTHÉTISÉS et pas des .mp3 ?
 *   - zéro requête réseau, zéro octet ajouté au bundle (le plan gratuit Render
 *     dort déjà assez comme ça),
 *   - hauteur variable à la volée : indispensable pour « jouer » un graphique
 *     pendant que la souris le balaye,
 *   - aucun décodage asynchrone, donc aucun son en retard sur le geste.
 *
 * 🔑 **Le choix qui rend l'effet agréable au lieu de le rendre insupportable :
 * l'échelle PENTATONIQUE.** Cinq notes par octave, sans demi-ton — donc sans
 * seconde mineure ni triton. Conséquence : n'importe quelle succession de notes
 * est consonante. Balayer un graphique au hasard produit une petite mélodie
 * cohérente, jamais une cacophonie. C'est exactement le principe des
 * « audio games » et des sonifications de données réussies.
 *
 * Garde-fous contre la fatigue auditive :
 *   - gain très bas (0.03) et enveloppe courte (70 ms) : un « tick », pas une note,
 *   - filtrage passe-bas : aucune harshness dans les aigus,
 *   - anti-mitraille : intervalle minimal entre deux sons, et une même hauteur
 *     répétée est ignorée (survoler une barre ne rejoue pas en boucle),
 *   - coupé si la préférence « Sons » du compte est désactivée,
 *   - jamais d'exception : un contexte audio refusé par le navigateur ne doit
 *     pas casser l'interface.
 */

/** Sons disponibles. */
export type SfxName = 'hover' | 'select' | 'success' | 'error' | 'tick' | 'whoosh';

/**
 * Échelle pentatonique majeure sur deux octaves, à partir de Do5.
 *
 * Les valeurs sont les fréquences réelles (tempérament égal, A4 = 440 Hz).
 * Dix notes : assez pour que le balayage d'un graphique donne une vraie
 * progression mélodique, pas assez pour devenir criard (max = La6, 1 760 Hz).
 */
export const PENTATONIC_HZ: readonly number[] = [
  523.25, // Do5
  587.33, // Ré5
  659.25, // Mi5
  783.99, // Sol5
  880.0, // La5
  1046.5, // Do6
  1174.66, // Ré6
  1318.51, // Mi6
  1567.98, // Sol6
  1760.0, // La6
];

/** Intervalle minimal entre deux sons, en millisecondes. */
const MIN_INTERVAL_MS = 34;
/** Une même hauteur rejouée dans cette fenêtre est ignorée (anti-mitraille). */
const SAME_NOTE_WINDOW_MS = 110;

type Ctx = AudioContext & { __edumateMaster?: GainNode };

let context: Ctx | null = null;
let master: GainNode | null = null;
let enabled = true;
let lastPlayedAt = 0;
let lastIndex = -1;
let lastIndexAt = 0;
let gestureHooked = false;

/** Active ou coupe tous les sons (synchronisé sur la préférence du compte). */
export function setSfxEnabled(value: boolean): void {
  enabled = value !== false;
  if (!enabled) {
    lastIndex = -1;
  }
}

export function isSfxEnabled(): boolean {
  return enabled;
}

/**
 * Ouvre (ou rouvre) le contexte audio.
 *
 * Les navigateurs exigent une activation utilisateur : créé trop tôt, le
 * contexte reste `suspended`. On tente donc un `resume()`, et on accroche un
 * écouteur unique sur le premier geste réel (clic, touche, toucher) pour le
 * débloquer définitivement. Un échec est silencieux : le son est un confort,
 * jamais une fonctionnalité bloquante.
 */
function ensureContext(): Ctx | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor() as Ctx;
      master = context.createGain();
      // Volume global volontairement bas : ces sons accompagnent, ils ne couvrent
      // ni la musique de concentration ni un cours.
      master.gain.value = 0.5;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    hookGesture();
    return context;
  } catch {
    return null;
  }
}

/** Débloque le contexte audio au premier geste réel de l'utilisateur. */
function hookGesture(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const unlock = (): void => {
    if (context && context.state === 'suspended') void context.resume().catch(() => undefined);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, unlock, { once: false, passive: true });
  }
}

interface ToneOptions {
  frequency: number;
  /** Durée en secondes (décroissance comprise). */
  duration?: number;
  /** Volume relatif, 0 → 1. */
  gain?: number;
  type?: OscillatorType;
  /** Décalage de démarrage en secondes (accords, arpèges). */
  delay?: number;
  /** Fréquence de coupure du passe-bas, en Hz. */
  cutoff?: number;
}

/**
 * Émet UNE note. Ne lève jamais d'exception.
 *
 * Chaîne de traitement : oscillateur → passe-bas → gain (enveloppe) → master.
 * L'enveloppe est `attack 6 ms / exponential decay` : c'est ce qui donne le
 * « tick » perlé plutôt qu'un bip électronique désagréable.
 */
function tone(options: ToneOptions): void {
  const ctx = ensureContext();
  if (!ctx || !master || ctx.state === 'suspended') return;
  const { frequency, duration = 0.07, gain = 0.03, type = 'sine', delay = 0, cutoff = 2600 } = options;
  if (!Number.isFinite(frequency) || frequency <= 0) return;

  try {
    const startedAt = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startedAt);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, startedAt);
    filter.Q.value = 0.7;

    // Enveloppe : montée quasi instantanée puis décroissance exponentielle.
    // `exponentialRampToValueAtTime` refuse 0 : on vise 0.0001.
    envelope.gain.setValueAtTime(0.0001, startedAt);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startedAt + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + duration + 0.02);
    // Libération des nœuds : sans cela, chaque survol laisserait un oscillateur
    // connecté et la consommation mémoire grimperait en continu.
    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        filter.disconnect();
        envelope.disconnect();
      } catch {
        /* déjà déconnecté */
      }
    };
  } catch {
    /* contexte fermé par le navigateur : on ignore */
  }
}

/** Ramène une valeur quelconque dans [0, 1]. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Index de note (0 → 9) correspondant à une valeur normalisée. */
export function noteIndexFor(value01: number): number {
  const max = PENTATONIC_HZ.length - 1;
  return Math.round(clamp01(value01) * max);
}

/** Anti-mitraille : vrai si ce son doit être émis maintenant. */
function canPlay(index: number): boolean {
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return false;
  if (index === lastIndex && now - lastIndexAt < SAME_NOTE_WINDOW_MS) return false;
  lastPlayedAt = now;
  lastIndex = index;
  lastIndexAt = now;
  return true;
}

/**
 * Note de survol, dont la hauteur suit la valeur survolée.
 *
 * C'est le cœur de la sonification : balayer un graphique de gauche à droite
 * monte la gamme, de droite à gauche la redescend. Comme l'échelle est
 * pentatonique, le résultat reste musical dans tous les cas.
 *
 * @param value01 valeur normalisée (0 = plus grave, 1 = plus aigu)
 */
export function playHoverTone(value01: number): void {
  if (!enabled) return;
  const index = noteIndexFor(value01);
  if (!canPlay(index)) return;
  tone({ frequency: PENTATONIC_HZ[index], duration: 0.075, gain: 0.028, type: 'sine' });
  // Doublement à l'octave, très atténué : ajoute de la brillance sans dureté.
  tone({ frequency: PENTATONIC_HZ[index] * 2, duration: 0.05, gain: 0.008, type: 'triangle', delay: 0.004 });
}

/** Clic / sélection : deux notes, la seconde plus aiguë. */
export function playSelect(): void {
  if (!enabled) return;
  if (!canPlay(-2)) return;
  tone({ frequency: 659.25, duration: 0.05, gain: 0.026, type: 'triangle' });
  tone({ frequency: 987.77, duration: 0.07, gain: 0.02, type: 'sine', delay: 0.045 });
}

/** Réussite : arpège pentatonique ascendant (3 notes). */
export function playSuccess(): void {
  if (!enabled) return;
  const [root, third, fifth] = [523.25, 659.25, 783.99];
  tone({ frequency: root, duration: 0.1, gain: 0.03, type: 'sine' });
  tone({ frequency: third, duration: 0.1, gain: 0.03, type: 'sine', delay: 0.08 });
  tone({ frequency: fifth, duration: 0.18, gain: 0.032, type: 'sine', delay: 0.16 });
}

/** Échec : deux notes descendantes, sans triton (désagréable mais pas agressif). */
export function playError(): void {
  if (!enabled) return;
  tone({ frequency: 392.0, duration: 0.09, gain: 0.026, type: 'triangle', cutoff: 1400 });
  tone({ frequency: 311.13, duration: 0.14, gain: 0.024, type: 'triangle', cutoff: 1200, delay: 0.09 });
}

/** Tic discret (compteurs, pas-à-pas). */
export function playTick(): void {
  if (!enabled) return;
  if (!canPlay(-3)) return;
  tone({ frequency: 1046.5, duration: 0.035, gain: 0.014, type: 'sine', cutoff: 3200 });
}

/** Souffle court : changement d'onglet, ouverture de panneau. */
export function playWhoosh(): void {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx || !master || ctx.state === 'suspended') return;
  try {
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.16);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      // Bruit blanc fenêtré : monte puis redescend, d'où l'effet « souffle ».
      const t = i / length;
      channel[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.5;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.16);
    filter.Q.value = 1.1;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.onended = () => {
      try {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
      } catch {
        /* déjà déconnecté */
      }
    };
  } catch {
    /* ignoré */
  }
}

/** Façade unique, pratique à passer en props. */
export const sfx = {
  hover: playHoverTone,
  select: playSelect,
  success: playSuccess,
  error: playError,
  tick: playTick,
  whoosh: playWhoosh,
  setEnabled: setSfxEnabled,
  isEnabled: isSfxEnabled,
  noteIndexFor,
} as const;

/**
 * Réinitialise l'état interne (tests, changement de page).
 * Ne ferme PAS le contexte audio : le recréer coûte cher et le navigateur
 * limite le nombre de contextes par page.
 */
export function resetSfxState(): void {
  lastPlayedAt = 0;
  lastIndex = -1;
  lastIndexAt = 0;
}
