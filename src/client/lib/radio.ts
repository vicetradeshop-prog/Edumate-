/**
 * EduMate — Lecteur de webradios (musique douce).
 *
 * Module distinct du générateur Web Audio (`music.ts`) : il possède son propre
 * élément `<audio>` et sa logique de bascule, ce qui garde le générateur local
 * intact et sert de repli.
 *
 * Points de robustesse (l'écoute en flux est intrinsèquement fragile) :
 *   1. **Bascule automatique** : si un flux échoue (station hors ligne, codec
 *      non supporté, coupure), on passe au suivant sans intervention.
 *   2. **Repli sur le générateur local** : quand toutes les stations d'une
 *      ambiance ont échoué, on repasse en mode « généré » et on prévient
 *      l'élève — jamais d'écran muet sans explication.
 *   3. **HTTPS uniquement** : les flux sont filtrés côté serveur, car une page
 *      HTTPS refuse tout média HTTP (mixed content).
 *   4. **Analyse spectrale impossible** : brancher un flux tiers sur un
 *      AnalyserNode exigerait `crossorigin="anonymous"` et des en-têtes CORS
 *      que la plupart des webradios n'envoient pas. Le visualiseur bascule donc
 *      sur une animation douce synthétique.
 */

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  homepage: string;
  favicon: string;
  codec: string;
  bitrate: number;
  country: string;
  tags: string[];
  votes: number;
}

export type RadioState = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'fallback';

export interface RadioSnapshot {
  state: RadioState;
  station: RadioStation | null;
  index: number;
  total: number;
  /** Message lisible quand quelque chose se passe (erreur, bascule…). */
  notice: string | null;
  buffering: boolean;
}

/** Événements émis vers l'interface. */
export interface RadioEvents {
  onChange: (snapshot: RadioSnapshot) => void;
  /** Toutes les stations ont échoué : le client doit repasser en mode local. */
  onExhausted: () => void;
}

/** Durée maximale de tentative de connexion à un flux, en millisecondes. */
const CONNECT_TIMEOUT_MS = 12_000;

export class RadioPlayer {
  private audio: HTMLAudioElement | null = null;
  private stations: RadioStation[] = [];
  private index = 0;
  private state: RadioState = 'idle';
  private notice: string | null = null;
  private buffering = false;
  private volume = 0.5;
  private timer: number | null = null;
  /** Compteur de générations : ignore les événements d'une station déjà abandonnée. */
  private generation = 0;
  /** Stations déjà en échec pour l'ambiance courante (jamais re-sélectionnées). */
  private failed = new Set<string>();
  private readonly events: RadioEvents;

  constructor(events: RadioEvents) {
    this.events = events;
  }

  /* ------------------------------------------------------------------ */
  /*  État public                                                        */
  /* ------------------------------------------------------------------ */

  get snapshot(): RadioSnapshot {
    return {
      state: this.state,
      station: this.stations[this.index] ?? null,
      index: this.index,
      total: this.stations.length,
      notice: this.notice,
      buffering: this.buffering,
    };
  }

  get hasStations(): boolean {
    return this.stations.length > 0;
  }

  private emit(): void {
    this.events.onChange(this.snapshot);
  }

  private setState(state: RadioState, notice: string | null = null): void {
    this.state = state;
    this.notice = notice;
    this.emit();
  }

  /* ------------------------------------------------------------------ */
  /*  Éléments audio                                                     */
  /* ------------------------------------------------------------------ */

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const element = new Audio();
    // `preload` évite de télécharger avant un appui explicite sur Lecture.
    element.preload = 'none';
    element.volume = this.volume;
    // Pas de `crossOrigin` : voir l'en-tête du module (CORS non garanti).

    element.addEventListener('playing', () => {
      this.buffering = false;
      this.clearTimer();
      this.setState('playing');
    });
    element.addEventListener('waiting', () => {
      this.buffering = true;
      this.emit();
    });
    element.addEventListener('pause', () => {
      // `playing` peut être suivi de `pause` pendant une mise en mémoire tampon.
      if (this.state === 'playing' && !element.ended) {
        this.buffering = false;
        this.setState('paused');
      }
    });
    element.addEventListener('error', () => {
      this.clearTimer();
      this.handleFailure('Ce flux ne répond pas.');
    });
    element.addEventListener('stalled', () => {
      this.buffering = true;
      this.emit();
    });

    this.audio = element;
    return element;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Pilotage                                                           */
  /* ------------------------------------------------------------------ */

  /** Remplace la liste de stations (changement d'ambiance) sans démarrer. */
  setStations(stations: RadioStation[], startIndex = 0): void {
    this.stations = stations;
    this.failed.clear();
    this.generation += 1;
    this.clearTimer();
    this.index = stations.length ? Math.min(Math.max(0, startIndex), stations.length - 1) : 0;
    this.buffering = false;
    if (!stations.length) {
      this.setState('idle', null);
      return;
    }
    this.state = this.state === 'playing' ? 'playing' : 'idle';
    this.notice = null;
    this.emit();
  }

  /** Démarre (ou reprend) la lecture de la station courante. */
  async play(): Promise<void> {
    if (!this.stations.length) {
      this.setState('error', 'Aucune station disponible pour cette ambiance.');
      return;
    }
    const element = this.ensureAudio();
    const station = this.stations[this.index];
    const generation = ++this.generation;

    this.buffering = true;
    this.setState('loading', null);

    // Timeout de connexion : une station muette ne doit pas bloquer l'élève.
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.handleFailure('La station met trop de temps à répondre.');
    }, CONNECT_TIMEOUT_MS);

    try {
      if (element.src !== station.url) {
        element.src = station.url;
        element.load();
      }
      element.volume = this.volume;
      await element.play();
      if (generation !== this.generation) return;
      this.clearTimer();
      this.buffering = false;
      this.setState('playing');
    } catch (error) {
      if (generation !== this.generation) return;
      this.clearTimer();
      // `NotAllowedError` : le navigateur exige un geste utilisateur. On ne
      // bascule PAS sur une autre station dans ce cas, ce serait inutile.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.setState('paused', 'Appuie sur Lecture pour démarrer la musique.');
        return;
      }
      this.handleFailure('Lecture impossible sur cette station.');
    }
  }

  pause(): void {
    this.clearTimer();
    this.generation += 1;
    this.buffering = false;
    try {
      this.audio?.pause();
    } catch {
      /* élément déjà arrêté */
    }
    if (this.state === 'playing' || this.state === 'loading') this.setState('paused');
    else this.emit();
  }

  /** Station suivante, avec remise à zéro de la liste si nécessaire. */
  next(): void {
    if (this.stations.length < 2) return;
    this.index = (this.index + 1) % this.stations.length;
    this.buffering = false;
    this.notice = null;
    if (this.state === 'playing' || this.state === 'loading') void this.play();
    else this.emit();
  }

  previous(): void {
    if (this.stations.length < 2) return;
    this.index = (this.index - 1 + this.stations.length) % this.stations.length;
    this.buffering = false;
    this.notice = null;
    if (this.state === 'playing' || this.state === 'loading') void this.play();
    else this.emit();
  }

  /** Sélectionne une station précise et (re)démarre la lecture. */
  selectIndex(index: number): void {
    if (index < 0 || index >= this.stations.length) return;
    this.index = index;
    this.failed.clear();
    this.buffering = false;
    this.notice = null;
    this.emit();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.audio) this.audio.volume = this.volume;
  }

  /* ------------------------------------------------------------------ */
  /*  Échec et bascule                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Tente la station suivante. Si toutes ont échoué, demande au client de
   * repasser sur le générateur local.
   *
   * La station en échec est mémorisée pour ne jamais être re-sélectionnée dans
   * la même série : sans cela, deux stations mortes suffiraient à faire
   * alterner la lecture indéfiniment.
   */
  private handleFailure(reason: string): void {
    const station = this.stations[this.index];
    if (station) this.failed.add(station.id);

    const remaining = this.stations.filter((item) => !this.failed.has(item.id));
    if (remaining.length) {
      // Prochaine station viable en partant de la position courante.
      for (let step = 1; step <= this.stations.length; step += 1) {
        const candidate = this.stations[(this.index + step) % this.stations.length];
        if (candidate && !this.failed.has(candidate.id)) {
          this.index = this.stations.indexOf(candidate);
          break;
        }
      }
      this.notice = station
        ? `« ${station.name} » indisponible — passage à la station suivante.`
        : 'Station indisponible — passage à la suivante.';
      void this.play();
      return;
    }

    // Plus aucune station exploitable : repli sur la musique générée.
    this.failed.clear();
    this.buffering = false;
    this.setState('fallback', reason);
    this.events.onExhausted();
  }

  /** Réinitialise le suivi des échecs (nouvelle ambiance, nouvel essai). */
  resetFailures(): void {
    this.failed.clear();
  }

  /** Libère l'élément audio (démontage de la page). */
  dispose(): void {
    this.clearTimer();
    this.generation += 1;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        /* déjà libéré */
      }
      this.audio = null;
    }
    this.stations = [];
    this.state = 'idle';
  }
}
