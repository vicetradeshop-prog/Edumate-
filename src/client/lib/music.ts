/**
 * EduMate — Musiques de concentration.
 *
 * DEUX sources complémentaires, l'élève choisissant une ambiance unique :
 *
 *  1. **Webradios** (source `radio`) — de la vraie musique douce, diffusée en
 *     continu. L'annuaire libre Radio Browser est interrogé côté serveur
 *     (`/api/services/music/stations`), sans clé d'API. La lecture se fait dans
 *     un élément `<audio>` géré par `lib/radio.ts`.
 *
 *  2. **Générateur local** (source `local`) — ambiances synthétisées en temps
 *     réel avec l'API Web Audio : accords, arpèges, nappes, pluie, vagues.
 *     Aucun téléchargement, aucun droit d'auteur, boucles infinies.
 *
 * Le générateur local joue un double rôle : il fournit les sons de nature
 * (pluie, vagues, forêt), pour lesquels les webradios fiables sont rares, et il
 * sert de **repli automatique** si une ambiance radio devient injoignable.
 * L'application n'est donc jamais muette sans explication.
 */
import { RadioPlayer, type RadioSnapshot, type RadioStation } from './radio.js';
import { endpoints } from './api.js';

export interface Track {
  id: string;
  name: string;
  emoji: string;
  description: string;
  bpm: number;
  colors: [string, string];
  kind: 'chords' | 'arpeggio' | 'pad' | 'noise';
  /** Progression d'accords (degrés MIDI) pour les ambiances harmoniques. */
  progression?: number[][];
  /** Densité de notes (0..1). */
  density?: number;
  /** Type de bruit pour pluie / vagues. */
  noise?: 'rain' | 'waves';
}

/**
 * Recommandations musicales.
 *
 * EduMate ne télécharge JAMAIS de musique protégée (spotdl, rip YouTube…) :
 * ce serait illégal et contraire aux droits des artistes. Une recommandation
 * devient jouable dans le site UNIQUEMENT si un fichier audio dont l'élève
 * détient les droits est déposé dans `public/music/` (voir le README du
 * dossier). Sinon, la carte propose les liens d'écoute officiels.
 */
export interface RecommendedTrack {
  id: string;
  title: string;
  artist: string;
  emoji: string;
  description: string;
  colors: [string, string];
  /** Chemin de base du fichier facultatif, servi par le site (sans extension). */
  srcBase: string;
  /** Extensions acceptées, essayées dans l'ordre. */
  extensions: string[];
  /** Liens d'écoute officiels (toujours proposés). */
  legal: { label: string; url: string }[];
}

export const RECOMMENDED_TRACKS: RecommendedTrack[] = [
  {
    id: 'nodey-no-title',
    title: 'No Title',
    artist: 'Nodey',
    emoji: '💿',
    description: 'La recommandation d’EduMate pour le focus profond : planante, régulière, sans paroles qui distraient.',
    colors: ['#db2777', '#f59e0b'],
    srcBase: '/music/nodey-no-title',
    extensions: ['.mp3', '.wav', '.ogg', '.m4a'],
    legal: [
      { label: 'Spotify', url: 'https://open.spotify.com/search/Nodey%20No%20Title' },
      { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=Nodey+No+Title' },
      { label: 'Deezer', url: 'https://www.deezer.com/search/Nodey%20No%20Title' },
    ],
  },
];

export const TRACKS: Track[] = [
  {
    id: 'lofi',
    name: 'Lo-fi studieux',
    emoji: '🎧',
    description: 'Accords jazzy feutrés, tempo lent : idéal pour les devoirs longs.',
    bpm: 68,
    colors: ['#6c5ce7', '#a29bfe'],
    kind: 'chords',
    progression: [
      [60, 64, 67, 71], // Cmaj7
      [57, 60, 64, 67], // Am7
      [65, 69, 72, 76], // Fmaj7
      [62, 65, 69, 72], // Dm7
    ],
    density: 0.75,
  },
  {
    id: 'piano',
    name: 'Piano doux',
    emoji: '🎹',
    description: 'Arpèges de piano calmes, très aériens, pour lire et rédiger.',
    bpm: 60,
    colors: ['#0ea5e9', '#67e8f9'],
    kind: 'arpeggio',
    progression: [
      [57, 60, 64, 67], // Am
      [53, 57, 60, 65], // F
      [48, 52, 55, 60], // C
      [55, 59, 62, 67], // G
    ],
    density: 0.9,
  },
  {
    id: 'ambient',
    name: 'Nappe atmosphérique',
    emoji: '🌌',
    description: 'Nappes longues sans rythme : concentration profonde, zéro distraction.',
    bpm: 40,
    colors: ['#7c3aed', '#22d3ee'],
    kind: 'pad',
    progression: [
      [48, 55, 60], // C
      [45, 52, 57], // A
      [43, 50, 55], // G
      [41, 48, 53], // F
    ],
    density: 0.5,
  },
  {
    id: 'pluie',
    name: 'Pluie douce',
    emoji: '🌧️',
    description: 'Pluie régulière et filtrée, parfait fond sonore pour mémoriser.',
    bpm: 60,
    colors: ['#475569', '#94a3b8'],
    kind: 'noise',
    noise: 'rain',
    density: 0.8,
  },
  {
    id: 'vagues',
    name: 'Vagues',
    emoji: '🌊',
    description: 'Ressac lent et apaisant, pour les révisions du soir.',
    bpm: 20,
    colors: ['#0891b2', '#5eead4'],
    kind: 'noise',
    noise: 'waves',
    density: 0.7,
  },
  {
    id: 'foret',
    name: 'Forêt & oiseaux',
    emoji: '🌲',
    description: 'Ambiance de sous-bois avec de légères notes cristallines.',
    bpm: 54,
    colors: ['#16a34a', '#a3e635'],
    kind: 'arpeggio',
    progression: [
      [62, 66, 69], // D
      [59, 62, 66], // Bm
      [64, 67, 71], // E
      [57, 61, 64], // A
    ],
    density: 0.45,
  },
];

const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/* ------------------------------------------------------------------ */
/*  Catalogue des ambiances proposées à l'élève                        */
/* ------------------------------------------------------------------ */

/**
 * Correspondance ambiance radio → piste locale de repli.
 * Utilisée quand l'annuaire est injoignable ou que tous les flux ont échoué.
 */
const LOCAL_FALLBACK: Record<string, string> = {
  lofi: 'lofi',
  ambient: 'ambient',
  piano: 'piano',
  classique: 'piano',
  jazz: 'lofi',
  chillout: 'ambient',
};

export interface Mood {
  id: string;
  name: string;
  emoji: string;
  description: string;
  colors: [string, string];
  /** `radio` = vraies webradios ; `local` = ambiances générées. */
  source: 'radio' | 'local';
  /** Piste du générateur local utilisée en repli (ambiances radio). */
  localFallback: string;
  /** Indiqué à titre informatif pour les ambiances générées. */
  bpm?: number;
}

/**
 * Ambiances dans l'ordre d'affichage.
 *
 * Les identifiants recoupent ceux de `TRACKS` quand une piste locale existe :
 * une préférence `focusMusic` enregistrée avant l'arrivée des webradios reste
 * donc valide et sélectionne la même ambiance.
 */
export const MOODS: Mood[] = [
  {
    id: 'lofi',
    name: 'Lo-fi studieux',
    emoji: '🎧',
    description: 'Beats lents et feutrés : idéal pour les devoirs longs.',
    colors: ['#6c5ce7', '#a29bfe'],
    source: 'radio',
    localFallback: 'lofi',
    bpm: 68,
  },
  {
    id: 'piano',
    name: 'Piano doux',
    emoji: '🎹',
    description: 'Piano calme et aérien, pour lire et rédiger.',
    colors: ['#0ea5e9', '#67e8f9'],
    source: 'radio',
    localFallback: 'piano',
    bpm: 60,
  },
  {
    id: 'classique',
    name: 'Classique calme',
    emoji: '🎻',
    description: 'Œuvres classiques lentes : mémorisation et lecture.',
    colors: ['#b45309', '#fcd34d'],
    source: 'radio',
    localFallback: 'piano',
  },
  {
    id: 'jazz',
    name: 'Jazz feutré',
    emoji: '🎷',
    description: 'Jazz doux et swing lent, sans paroles envahissantes.',
    colors: ['#0f766e', '#5eead4'],
    source: 'radio',
    localFallback: 'lofi',
  },
  {
    id: 'ambient',
    name: 'Nappe atmosphérique',
    emoji: '🌌',
    description: 'Nappes longues sans rythme : concentration profonde.',
    colors: ['#7c3aed', '#22d3ee'],
    source: 'radio',
    localFallback: 'ambient',
    bpm: 40,
  },
  {
    id: 'chillout',
    name: 'Chillout',
    emoji: '🛋️',
    description: 'Électro très lente : révisions du soir et pauses.',
    colors: ['#be185d', '#f9a8d4'],
    source: 'radio',
    localFallback: 'ambient',
  },
  {
    id: 'pluie',
    name: 'Pluie douce',
    emoji: '🌧️',
    description: 'Bruitage de pluie synthétisé : masque les bruits parasites.',
    colors: ['#475569', '#94a3b8'],
    source: 'local',
    localFallback: 'pluie',
    bpm: 0,
  },
  {
    id: 'vagues',
    name: 'Vagues',
    emoji: '🌊',
    description: 'Ressac régulier synthétisé : respiration et pauses.',
    colors: ['#0369a1', '#7dd3fc'],
    source: 'local',
    localFallback: 'vagues',
    bpm: 0,
  },
  {
    id: 'foret',
    name: 'Forêt & oiseaux',
    emoji: '🌲',
    description: 'Nappe végétale et chants d’oiseaux synthétisés.',
    colors: ['#15803d', '#86efac'],
    source: 'local',
    localFallback: 'foret',
    bpm: 0,
  },
];

export const MOOD_BY_ID: Record<string, Mood> = Object.fromEntries(MOODS.map((mood) => [mood.id, mood]));

/** Résout un identifiant d'ambiance, avec repli sur la première. */
export function resolveMood(id: string | null | undefined): Mood {
  if (id && MOOD_BY_ID[id]) return MOOD_BY_ID[id];
  return MOODS[0];
}

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private step = 0;
  private nextNoteTime = 0;

  trackId: string = TRACKS[0].id;
  playing = false;
  volume = 0.5;
  private listeners = new Set<() => void>();

  /* --------------------- Recommandation (fichier local) --------------------- */

  /** Identifiant de la recommandation en lecture (null = aucune). */
  recId: string | null = null;
  /** Disponibilité détectée des fichiers audio déposés dans public/music/. */
  recAvailable: Record<string, boolean> = {};
  /** Source résolue (fichier local ou URL hébergée par l'élève). */
  recSrc: Record<string, string> = {};
  /**
   * Époque de lecture : chaque intention utilisateur (play, pause, reco…)
   * l'incrémente. Une routine asynchrone qui se termine APRÈS un changement
   * d'avis (ex. `await radio.play()` d'une ambiance abandonnée) constate
   * l'écart et n'écrase plus l'état courant.
   */
  private playEpoch = 0;
  /** true si la source est distante : lecture directe, sans routage WebAudio
      (un flux cross-origin sans CORS serait rendu muet par l'AnalyserNode). */
  recRemote: Record<string, boolean> = {};
  private recProbed = false;
  private recElements = new Map<string, HTMLAudioElement>();
  private recNodes = new Map<string, MediaElementAudioSourceNode>();

  /* ------------------------- Webradios ------------------------- */

  /** Ambiance choisie par l'élève (radio ou locale). */
  moodId: string = MOODS[0].id;
  /**
   * Source réellement utilisée. Peut valoir `local` alors que l'ambiance
   * choisie est `radio` : c'est le repli automatique après échec des flux.
   */
  effectiveSource: 'radio' | 'local' = MOODS[0].source;
  /** Stations de l'ambiance courante. */
  stations: RadioStation[] = [];
  /** Chargement en cours de la liste de stations. */
  loadingStations = false;
  /** Erreur de récupération des stations (affiche un message, pas de blocage). */
  stationsError: string | null = null;
  /** Instantané du lecteur radio. */
  radioSnapshot: RadioSnapshot = {
    state: 'idle',
    station: null,
    index: 0,
    total: 0,
    notice: null,
    buffering: false,
  };

  private radio: RadioPlayer = new RadioPlayer({
    onChange: (snapshot) => {
      this.radioSnapshot = snapshot;
      if (this.recId && snapshot.state === 'playing') {
        // La radio ne doit jamais reprendre par-dessus la recommandation.
        this.radio.pause();
      }
      this.emit();
    },
    onExhausted: () => {
      // Toutes les stations ont échoué : repli sur le générateur local.
      if (this.recId) return; // l'élève a choisi autre-temps entre-temps
      this.fallbackToLocal('Aucune webradio joignable pour cette ambiance.');
    },
  });

  get mood(): Mood {
    return resolveMood(this.moodId);
  }

  get track(): Track {
    return TRACKS.find((t) => t.id === this.trackId) ?? TRACKS[0];
  }

  /** Station en cours de lecture (ou null). */
  get station(): RadioStation | null {
    return this.radioSnapshot.station;
  }

  get isRadio(): boolean {
    return this.effectiveSource === 'radio' && this.stations.length > 0;
  }

  /** Sonde (une seule fois) la présence des fichiers recommandés. */
  async probeRecommended(): Promise<void> {
    if (this.recProbed) return;
    this.recProbed = true;
    await Promise.all(
      RECOMMENDED_TRACKS.map(async (track) => {
        this.recAvailable[track.id] = false;
        this.recRemote[track.id] = false;
        // 1) Fichier déposé dans public/music/ (mp3, wav, ogg, m4a).
        for (const extension of track.extensions) {
          try {
            const response = await fetch(`${track.srcBase}${extension}`, { method: 'HEAD' });
            const type = response.headers.get('content-type') ?? '';
            // Exige un VRAI type audio : un repli SPA renverrait text/html.
            if (response.ok && type.startsWith('audio')) {
              this.recAvailable[track.id] = true;
              this.recSrc[track.id] = `${track.srcBase}${extension}`;
              break;
            }
          } catch {
            /* extension suivante */
          }
        }
        // 2) Sinon : URL hébergée par l'élève (RECOMMENDED_MUSIC_URL sur Render).
        if (!this.recAvailable[track.id]) {
          try {
            const response = await fetch('/api/services/music/recommended');
            if (response.ok) {
              const payload = (await response.json()) as { url?: string | null };
              if (payload.url && /^https:\/\//.test(payload.url)) {
                this.recAvailable[track.id] = true;
                this.recSrc[track.id] = payload.url;
                this.recRemote[track.id] = true;
              }
            }
          } catch {
            /* pas d'URL configurée : état informatif */
          }
        }
      }),
    );
    this.emit();
  }

  isRecAvailable(id: string): boolean {
    return Boolean(this.recAvailable[id]);
  }

  get recommendedPlaying(): boolean {
    return this.recId !== null && this.playing;
  }

  /**
   * Lance une recommandation (fichier local). Stoppe toute ambiance en cours.
   * Résout `true` si la lecture démarre réellement : le fichier peut exister
   * mais être illisible, et un bouton qui ne fait rien est un bug.
   */
  async playRecommended(id: string): Promise<boolean> {
    const track = RECOMMENDED_TRACKS.find((entry) => entry.id === id);
    if (!track || !this.isRecAvailable(id)) return false;
    this.stopMoodSilently();
    const resolved = this.recSrc[id];
    if (!resolved) return false;
    const epoch = ++this.playEpoch;
    let audio = this.recElements.get(id);
    if (!audio) {
      const created = new Audio(resolved);
      created.loop = true;
      created.preload = 'auto';
      /* Auto-guérison : si un acteur tiers (chaîne radio, repli…) met cet
         élément en pause pendant qu'il est LA source choisie, on repart.
         Les pauses légitimes passent d'abord par recId = null. */
      created.addEventListener('pause', () => {
        if (this.recId === id && this.playing && created.paused && !created.ended) {
          void created.play().catch(() => undefined);
        }
      });
      this.recElements.set(id, created);
      audio = created;
    }
    const element: HTMLAudioElement = audio;
    if (this.recRemote[id]) {
      // Flux distant : lecture directe (volume sur l'élément), pas de WebAudio.
      element.crossOrigin = 'anonymous';
      element.volume = this.volume;
    } else {
      const ctx = this.ensureContext();
      if (!this.recNodes.has(id)) {
        const node = ctx.createMediaElementSource(element);
        node.connect(this.master!);
        this.recNodes.set(id, node);
      }
      /* 🔴 stopLocal() laisse un ramp de gain vers ~0 (0,25 s) : sans
         annulation, la recommandation redémarrait en silence (« impossible
         de relire »). On repart toujours d'un gain net. */
      this.master!.gain.cancelScheduledValues(ctx.currentTime);
      this.master!.gain.setValueAtTime(this.volume, ctx.currentTime);
    }
    this.recId = id;
    this.playing = true;
    this.emit();
    /* Certains navigateurs refusent le tout premier `play()` d'un élément
       média fraîchement créé (initialisation paresseuse du décodeur) : un
       seul essai supplémentaire après `load()` suffit, et un bouton de
       lecture qui ne fait rien du tout serait un bug inacceptable. */
    try {
      element.load();
      await element.play();
      if (epoch !== this.playEpoch) {
        element.pause();
        return false;
      }
      this.emit();
      return true;
    } catch {
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await element.play();
        if (epoch !== this.playEpoch) {
          element.pause();
          return false;
        }
        this.emit();
        return true;
      } catch {
        this.recId = null;
        this.playing = false;
        this.emit();
        return false;
      }
    }
  }

  /** Stoppe la recommandation en cours. */
  stopRecommended(): void {
    this.playEpoch += 1;
    if (!this.recId) return;
    const current = this.recId;
    this.recId = null;
    this.recElements.get(current)?.pause();
    this.playing = false;
    this.emit();
  }

  async toggleRecommended(id: string): Promise<boolean> {
    if (this.recId === id && this.playing) {
      this.stopRecommended();
      return true;
    }
    return this.playRecommended(id);
  }

  /** Stoppe l'ambiance (radio/générateur) sans toucher à l'état `playing`. */
  private stopMoodSilently(): void {
    this.radio.pause();
    this.stopLocal();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio indisponible sur ce navigateur.');
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /**
   * Données du visualiseur (0..1 par barre).
   *
   * En lecture de webradio, aucune analyse spectrale n'est possible : brancher
   * un flux tiers sur un AnalyserNode exigerait `crossorigin="anonymous"` et
   * des en-têtes CORS que la plupart des stations n'envoient pas (l'élément
   * audio passerait alors en mode opaque et produirait du silence). On affiche
   * donc une animation douce déterministe, clairement décorative.
   */
  levels(): number[] {
    const recIsRemote = this.recId !== null && this.recRemote[this.recId];
    if (this.isRadio || recIsRemote) {
      if (!this.playing) return Array.from({ length: 16 }, () => 0.04);
      const now = Date.now() / 1000;
      return Array.from({ length: 16 }, (_unused, index) => {
        const wave = Math.sin(now * 1.6 + index * 0.55) * 0.5 + 0.5;
        const slow = Math.sin(now * 0.7 + index * 0.21) * 0.5 + 0.5;
        return Math.min(1, 0.16 + wave * 0.5 + slow * 0.24);
      });
    }
    if (!this.analyser || !this.playing) return Array.from({ length: 16 }, () => 0.04);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const bars = 16;
    const size = Math.max(1, Math.floor(data.length / bars));
    return Array.from({ length: bars }, (_unused, index) => {
      let sum = 0;
      for (let i = 0; i < size; i += 1) sum += data[index * size + i] ?? 0;
      return Math.min(1, sum / size / 200);
    });
  }

  /* ------------------------------ Notes ------------------------------ */

  private playTone(freq: number, at: number, duration: number, gain: number, type: OscillatorType = 'sine', detune = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(6500, freq * 6);
    filter.Q.value = 0.6;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.detune.setValueAtTime(detune, at);

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.25, duration * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private playKick(at: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.13);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.32, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /* ---------------------------- Ambiances ---------------------------- */

  private scheduleStep(time: number): void {
    const track = this.track;
    const progression = track.progression ?? [[60, 64, 67]];
    const chordIndex = Math.floor(this.step / 4) % progression.length;
    const chord = progression[chordIndex];
    const beatInChord = this.step % 4;
    const density = track.density ?? 0.7;

    if (track.kind === 'chords') {
      if (beatInChord === 0) {
        chord.forEach((note, index) => {
          this.playTone(midiToFreq(note - 12), time + index * 0.012, 2.6, 0.075, 'triangle');
        });
      }
      if (Math.random() < density * 0.55) {
        const note = chord[Math.floor(Math.random() * chord.length)] + 12;
        this.playTone(midiToFreq(note), time, 0.55, 0.05, 'sine');
      }
      if (this.step % 4 === 0) this.playKick(time);
    } else if (track.kind === 'arpeggio') {
      const note = chord[beatInChord % chord.length] + (Math.random() < 0.3 ? 12 : 0);
      this.playTone(midiToFreq(note), time, 1.9, 0.085, 'sine');
      if (Math.random() < density * 0.4) {
        this.playTone(midiToFreq(note + 7), time + 0.28, 1.1, 0.035, 'sine', 6);
      }
      if (beatInChord === 0) {
        this.playTone(midiToFreq(chord[0] - 24), time, 3.4, 0.06, 'triangle');
      }
    } else if (track.kind === 'pad') {
      if (this.step % 4 === 0) {
        chord.forEach((note, index) => {
          this.playTone(midiToFreq(note), time + index * 0.05, 9, 0.055, 'sawtooth', index % 2 ? 5 : -5);
        });
      }
    }
    // Pour 'noise', la boucle continue tourne en parallèle (voir startNoise).
  }

  private startNoise(): void {
    const ctx = this.ensureContext();
    this.stopNoise();
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer();
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const gain = ctx.createGain();
    gain.gain.value = 0;

    if (this.track.noise === 'waves') {
      filter.frequency.value = 620;
      gain.gain.value = 0.24;
      // Ressac : LFO lent sur le gain et sur la fréquence du filtre.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.09;
      lfoGain.gain.value = 0.13;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      const lfo2 = ctx.createOscillator();
      const lfo2Gain = ctx.createGain();
      lfo2.frequency.value = 0.06;
      lfo2Gain.gain.value = 260;
      lfo2.connect(lfo2Gain);
      lfo2Gain.connect(filter.frequency);
      lfo.start();
      lfo2.start();
      this.lfo = lfo;
    } else {
      filter.frequency.value = 1800;
      gain.gain.value = 0.13;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.23;
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      this.lfo = lfo;
    }

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
    this.noiseSource = source;
    this.noiseGain = gain;
  }

  private stopNoise(): void {
    try {
      this.noiseSource?.stop();
      this.noiseSource?.disconnect();
      this.lfo?.stop();
      this.lfo?.disconnect();
      this.noiseGain?.disconnect();
    } catch {
      /* déjà arrêté */
    }
    this.noiseSource = null;
    this.lfo = null;
    this.noiseGain = null;
  }

  /* ----------------------------- Transport --------------------------- */

  private tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const secondsPerStep = 60 / this.track.bpm / 2;
    // Pré-planifie ~150 ms à l'avance pour un rendu parfaitement stable.
    while (this.nextNoteTime < ctx.currentTime + 0.15) {
      this.scheduleStep(this.nextNoteTime);
      this.nextNoteTime += secondsPerStep;
      this.step += 1;
    }
    this.timer = window.setTimeout(this.tick, 40);
  };

  /* ------------------------------------------------------------------ */
  /*  Ambiances et webradios                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Charge les stations d'une ambiance depuis le serveur.
   *
   * Toujours tolérant : un échec réseau ne bloque pas l'outil, il bascule sur
   * le générateur local et affiche la raison.
   */
  async loadStations(moodId: string): Promise<void> {
    const mood = resolveMood(moodId);
    if (mood.source !== 'radio') {
      this.stations = [];
      this.radio.setStations([]);
      this.stationsError = null;
      return;
    }
    this.loadingStations = true;
    this.stationsError = null;
    this.emit();
    try {
      const response = await endpoints.musicStations(mood.id);
      // L'élève peut avoir changé d'ambiance pendant la requête : on ignore
      // alors une réponse devenue obsolète.
      if (this.moodId !== mood.id) return;
      this.stations = response.stations ?? [];
      this.radio.resetFailures();
      this.radio.setStations(this.stations);
      if (!this.stations.length) {
        this.stationsError = 'Aucune webradio trouvée pour cette ambiance.';
        this.effectiveSource = 'local';
        this.trackId = mood.localFallback;
      } else {
        this.effectiveSource = 'radio';
      }
    } catch {
      if (this.moodId !== mood.id) return;
      this.stations = [];
      this.radio.setStations([]);
      this.stationsError = 'Annuaire des webradios injoignable — musique générée localement.';
      this.effectiveSource = 'local';
      this.trackId = mood.localFallback;
    } finally {
      if (this.moodId === mood.id) {
        this.loadingStations = false;
        this.emit();
      }
    }
  }

  /**
   * Sélectionne une ambiance (et lance la lecture si elle était en cours).
   * C'est le point d'entrée utilisé par l'interface.
   */
  async selectMood(moodId: string): Promise<void> {
    const mood = resolveMood(moodId);
    const wasPlaying = this.playing;
    this.playEpoch += 1;

    // Arrêt propre des deux sources avant de changer.
    this.stopLocal();
    this.radio.pause();
    this.playing = false;

    this.moodId = mood.id;
    this.effectiveSource = mood.source === 'radio' ? 'radio' : 'local';
    this.trackId = mood.source === 'local' ? mood.id : mood.localFallback;
    this.step = 0;
    this.stationsError = null;

    if (mood.source === 'radio') await this.loadStations(mood.id);
    else {
      this.stations = [];
      this.radio.setStations([]);
    }

    if (this.moodId !== mood.id) return; // l'élève a déjà changé d'ambiance
    if (wasPlaying) await this.play();
    else this.emit();
  }

  /** Repli sur le générateur local, en conservant l'ambiance choisie. */
  private fallbackToLocal(reason: string): void {
    /*
     * 🔴 BUG CORRIGÉ : la chaîne asynchrone d'échec des webradios pouvait se
     * terminer APRÈS que l'élève a lancé la recommandation (ou changé d'avis)
     * et remettait une ambiance en lecture par-dessus, en coupant la
     * recommandation (« impossible de relire »). Si une recommandation joue,
     * ce repli n'a plus lieu d'être : c'est un choix utilisateur plus récent.
     */
    if (this.recId) return;
    const mood = this.mood;
    this.effectiveSource = 'local';
    this.trackId = mood.localFallback;
    this.stationsError = `${reason} Musique générée par ton navigateur.`;
    this.radio.pause();
    const wasPlaying = this.playing;
    this.playing = false;
    this.stopLocal();
    if (wasPlaying) this.playLocal();
    this.emit();
  }

  /** Nouvelle tentative sur les webradios après un repli local. */
  async retryRadio(): Promise<void> {
    const mood = this.mood;
    if (mood.source !== 'radio') return;
    const wasPlaying = this.playing;
    this.stopLocal();
    this.playing = false;
    this.effectiveSource = 'radio';
    this.stationsError = null;
    await this.loadStations(mood.id);
    if (this.effectiveSource === 'radio' && wasPlaying) await this.play();
    else this.emit();
  }

  /** Station suivante (ou ambiance suivante s'il n'y a qu'une station). */
  nextStation(): void {
    if (!this.isRadio) return;
    this.radio.next();
  }

  previousStation(): void {
    if (!this.isRadio) return;
    this.radio.previous();
  }

  /**
   * Saute directement à une station précise de la liste.
   *
   * Une navigation par boucle (« next jusqu'à tomber sur l'index voulu »)
   * déclencherait autant de connexions intermédiaires que de sauts, et
   * pourrait ne jamais s'arrêter si l'index est injoignable. D'où cette méthode
   * dédiée, bornée et sans effet de bord.
   */
  selectStation(index: number): void {
    if (!this.isRadio) return;
    if (index < 0 || index >= this.stations.length) return;
    this.radio.selectIndex(index);
    this.playing = true;
    this.emit();
    void this.radio.play();
  }

  /* ------------------------------------------------------------------ */
  /*  Lecture                                                            */
  /* ------------------------------------------------------------------ */

  /** Démarre la lecture sur la source effective (radio ou générateur). */
  async play(): Promise<void> {
    // Une ambiance et une recommandation ne jouent jamais ensemble.
    // (recId effacé AVANT la pause : le garde-fou « reprise » ne se trompe pas.)
    if (this.recId) {
      const current = this.recId;
      this.recId = null;
      this.recElements.get(current)?.pause();
    }
    const epoch = ++this.playEpoch;
    if (this.isRadio) {
      this.playing = true;
      this.emit();
      await this.radio.play();
      // Routine périmée (l'élève a changé de source pendant l'attente) :
      // elle n'écrase PLUS l'état courant.
      if (epoch !== this.playEpoch) return;
      // Le lecteur radio émet son propre état ; on resynchronise `playing`.
      this.playing = this.radioSnapshot.state === 'playing' || this.radioSnapshot.state === 'loading';
      this.emit();
      return;
    }
    this.playLocal();
  }

  /** Démarre le générateur Web Audio (comportement historique). */
  private playLocal(): void {
    const ctx = this.ensureContext();
    if (this.playing) {
      this.emit();
      return;
    }
    this.playing = true;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setValueAtTime(Math.max(0.0001, this.master!.gain.value), ctx.currentTime);
    this.master!.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.7);
    this.startNoiseIfNeeded();
    this.tick();
    this.emit();
  }

  /** Arrête le générateur Web Audio sans toucher à la radio. */
  private stopLocal(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    }
    this.stopNoise();
  }

  /**
   * Lecture d'une piste LOCALE précise.
   *
   * Conservé pour compatibilité : `play()` sans argument démarre désormais la
   * source effective (radio ou générateur). Passer un `trackId` force le
   * générateur local sur cette piste.
   */
  playTrack(trackId: string): void {
    if (trackId !== this.trackId) {
      this.trackId = trackId;
      this.step = 0;
      this.moodId = trackId;
      this.effectiveSource = 'local';
      if (this.playing) this.startNoiseIfNeeded();
    }
    this.playLocal();
  }

  private startNoiseIfNeeded(): void {
    if (this.track.kind === 'noise') this.startNoise();
    else this.stopNoise();
  }

  pause(): void {
    this.playEpoch += 1;
    if (this.recId) {
      const current = this.recId;
      this.recId = null;
      this.recElements.get(current)?.pause();
    }
    this.radio.pause();
    if (!this.playing) {
      this.emit();
      return;
    }
    this.playing = false;
    this.stopLocal();
    this.emit();
  }

  toggle(): void {
    if (this.playing || this.radioSnapshot.state === 'loading') this.pause();
    else void this.play();
  }

  /**
   * @deprecated Utilise `selectMood()`, qui gère les webradios et leur repli.
   * Conservé pour les appels existants qui manipulent une piste locale.
   */
  select(trackId: string): void {
    void this.selectMood(trackId);
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.radio.setVolume(this.volume);
    if (this.ctx && this.master && this.playing && !this.isRadio) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.volume, now, 0.05);
    }
    for (const [id, element] of this.recElements) {
      if (this.recRemote[id]) element.volume = this.volume;
    }
    this.emit();
  }

  /** Libère les ressources (appelé au démontage de l'application). */
  dispose(): void {
    this.pause();
    this.radio.dispose();
    try {
      void this.ctx?.close();
    } catch {
      /* contexte déjà fermé */
    }
    this.ctx = null;
    this.master = null;
    this.analyser = null;
  }
}

export const music = new MusicEngine();
