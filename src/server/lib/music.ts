/**
 * EduMate — Source de musique douce : API Radio Browser.
 *
 * Pourquoi ce service ?
 *   Le générateur Web Audio intégré compose des ambiances correctes, mais ce ne
 *   sont pas de « vrais » morceaux. Radio Browser est un annuaire libre et
 *   gratuit de webradios (~40 000 stations), **sans clé d'API**, ce qui évite
 *   d'introduire un nouveau secret dans le projet. Il expose des flux audio
 *   directs (MP3/AAC) parfaitement adaptés à une écoute longue de concentration.
 *
 * Choix d'architecture :
 *   - l'annuaire est interrogé CÔTÉ SERVEUR : pas de CORS, cache mémoire, et le
 *     `connect-src 'self'` de la CSP reste intact ;
 *   - le flux audio, lui, est lu DIRECTEMENT par le navigateur (`media-src`
 *     étendu à `https:`). Le proxyfier ferait transiter un flux continu par
 *     l'instance Render gratuite : coût réseau énorme et connexions longues.
 *   - une curation est appliquée : tri par votes, débit minimal, codecs audio
 *     uniquement, et exclusion des stations parlées (infos, talk, sport) qui
 *     polluent certains tags.
 *
 * Dégradation : si l'annuaire est injoignable, la route renvoie une liste vide
 * et le client retombe sur le générateur local. Jamais de blocage.
 */
import { config } from '../lib/config.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MusicStation {
  /** Identifiant stable de la station (stationuuid). */
  id: string;
  name: string;
  /** URL de lecture directe du flux. */
  url: string;
  homepage: string;
  favicon: string;
  codec: string;
  bitrate: number;
  country: string;
  tags: string[];
  votes: number;
}

export interface MoodDefinition {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Tags Radio Browser, du plus pertinent au plus large. */
  tags: string[];
  /** Filtre additionnel sur le nom (chaîne simple, insensible à la casse). */
  nameIncludes?: string;
}

/* ------------------------------------------------------------------ */
/*  Ambiances proposées                                                */
/* ------------------------------------------------------------------ */

/**
 * Ambiances servies par de vraies webradios.
 *
 * Les sons de nature (pluie, vagues, forêt) sont volontairement EXCLUS : les
 * stations correspondantes sont rares et peu fiables, alors que le générateur
 * local les produit très bien. Ils restent donc en mode « généré ».
 */
export const MUSIC_MOODS: MoodDefinition[] = [
  {
    id: 'lofi',
    label: 'Lo-fi studieux',
    emoji: '🎧',
    description: 'Beats lents et feutrés : idéal pour les devoirs longs.',
    tags: ['lofi', 'chillhop', 'lo-fi'],
  },
  {
    id: 'ambient',
    label: 'Nappe atmosphérique',
    emoji: '🌌',
    description: 'Nappes longues sans rythme : concentration profonde.',
    tags: ['ambient', 'chillout', 'downtempo'],
  },
  {
    id: 'piano',
    label: 'Piano doux',
    emoji: '🎹',
    description: 'Piano calme et aérien, pour lire et rédiger.',
    tags: ['piano', 'instrumental'],
    nameIncludes: 'piano',
  },
  {
    id: 'classique',
    label: 'Classique calme',
    emoji: '🎻',
    description: 'Œuvres classiques lentes : mémorisation et lecture.',
    tags: ['classical', 'classic'],
  },
  {
    id: 'jazz',
    label: 'Jazz feutré',
    emoji: '🎷',
    description: 'Jazz doux et swing lent, sans paroles aggressives.',
    tags: ['smooth jazz', 'jazz'],
  },
  {
    id: 'chillout',
    label: 'Chillout',
    emoji: '🛋️',
    description: 'Électro très lente : révisions du soir et pauses.',
    tags: ['chillout', 'chill'],
  },
];

export const MOOD_BY_ID: Record<string, MoodDefinition> = Object.fromEntries(
  MUSIC_MOODS.map((mood) => [mood.id, mood]),
);

/* ------------------------------------------------------------------ */
/*  Curation                                                           */
/* ------------------------------------------------------------------ */

/** Codecs réellement lisibles par les navigateurs. */
const ALLOWED_CODECS = new Set(['MP3', 'AAC', 'AAC+', 'OGG', 'OPUS']);

/** Débit minimal : en dessous, la qualité est insuffisante pour un fond sonore. */
const MIN_BITRATE = 64;

/**
 * Mots-clés écartant les stations parlées, qui polluent les tags musicaux
 * (ex. une radio d'information taguée « lofi » pour son habillage sonore).
 */
const EXCLUDED_NAME = /(info|news|talk|sport|politique|débat|debate|radio\s?france\s?info|podcast|sermon|prédication|bible|quran|koran|kurdî|kurdistan)/i;

/** Tags écartant une station même si son nom semble correct. */
const EXCLUDED_TAG = /^(news|talk|sport|politics|religion|sermon|podcast|comedy)$/i;

/** Nombre de stations renvoyées par ambiance. */
const STATIONS_PER_MOOD = 6;

interface RawStation {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  countrycode?: string;
  country?: string;
  tags?: string;
  votes?: number;
  clickcount?: number;
  hls?: number | string;
  lastcheckok?: number | string;
}

/** Normalise et filtre une station brute de l'annuaire. */
function normalizeStation(raw: RawStation): MusicStation | null {
  const url = String(raw.url_resolved ?? raw.url ?? '').trim();

  /*
   * 🔒 HTTPS OBLIGATOIRE — ce n'est pas une préférence, c'est bloquant.
   *
   * EduMate est servi en HTTPS (Render). Un navigateur qui charge une page
   * HTTPS refuse tout média provenant d'une origine HTTP : c'est le « mixed
   * content », bloqué silencieusement avec une simple erreur console. Sans ce
   * filtre, la majorité des stations (les plus votées sont souvent en HTTP)
   * auraient produit un lecteur muet et l'élève n'aurait rien compris.
   */
  if (!url.toLowerCase().startsWith('https://')) return null;

  // Les flux HLS (.m3u8) ne sont pas lus partout de façon fiable : on les écarte.
  if (String(raw.hls ?? '0') === '1') return null;
  if (/\.m3u8?(\?|$)/i.test(url)) return null;

  const name = String(raw.name ?? '').trim();
  if (!name || EXCLUDED_NAME.test(name)) return null;

  const codec = String(raw.codec ?? '').toUpperCase();
  if (codec && !ALLOWED_CODECS.has(codec)) return null;

  const bitrate = Number(raw.bitrate ?? 0);
  // 0 = débit inconnu : toléré, car beaucoup de stations ne le déclarent pas.
  if (bitrate > 0 && bitrate < MIN_BITRATE) return null;

  // Une station signalée comme cassée au dernier contrôle est écartée.
  if (String(raw.lastcheckok ?? '1') === '0') return null;

  const tags = String(raw.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.some((tag) => EXCLUDED_TAG.test(tag))) return null;

  return {
    id: String(raw.stationuuid ?? url),
    name,
    url,
    homepage: String(raw.homepage ?? '').trim(),
    favicon: String(raw.favicon ?? '').trim(),
    codec: codec || 'MP3',
    bitrate,
    country: String(raw.countrycode ?? raw.country ?? '').trim().toUpperCase(),
    tags: tags.slice(0, 6),
    votes: Number(raw.votes ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/*  Interrogation de l'annuaire                                        */
/* ------------------------------------------------------------------ */

/**
 * Miroirs officiels, interrogés dans l'ordre.
 *
 * Radio Browser est un service distribué : un miroir peut être lent ou hors
 * ligne. Les essayer en séquence rend la recherche de stations résiliente sans
 * dépendre d'un appel de découverte préalable.
 */
const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];

async function fetchMirror(pathname: string): Promise<unknown | null> {
  for (const mirror of MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.services.requestTimeoutMs);
    try {
      const response = await fetch(`${mirror}${pathname}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          // Radio Browser exige un User-Agent identifiable.
          'User-Agent': 'EduMate/1.0 (plateforme educative scolaire; contact via depot GitHub)',
        },
      });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Miroir suivant.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Recherche les stations d'une ambiance.
 *
 * Plusieurs tags sont interrogés puis fusionnés : un seul tag est souvent trop
 * étroit (« lofi » ne renvoie que quelques dizaines de stations) et donne une
 * liste fragile.
 */
export async function searchStations(moodId: string, limit = STATIONS_PER_MOOD): Promise<MusicStation[]> {
  const mood = MOOD_BY_ID[moodId];
  if (!mood) return [];

  const collected = new Map<string, MusicStation>();

  for (const tag of mood.tags) {
    if (collected.size >= limit * 3) break;
    const params = new URLSearchParams({
      tag,
      order: 'votes',
      reverse: 'true',
      hidebroken: 'true',
      // Limite large : le tri par votes remonte beaucoup de flux HTTP, écartés
      // ensuite. Il faut donc piocher plus profond pour obtenir 6 stations HTTPS.
      limit: '100',
    });
    const payload = (await fetchMirror(`/json/stations/search?${params.toString()}`)) as RawStation[] | null;
    if (!Array.isArray(payload)) continue;

    for (const raw of payload) {
      const station = normalizeStation(raw);
      if (!station) continue;
      // `nameIncludes` : filtre de pertinence quand le tag est trop générique
      // (« instrumental » renvoie aussi bien du piano que de la guitare).
      if (mood.nameIncludes && !station.name.toLowerCase().includes(mood.nameIncludes.toLowerCase())) continue;
      collected.set(station.id, station);
    }
  }

  // Les plus votées d'abord : bon indicateur de fiabilité et de qualité.
  return [...collected.values()]
    .sort((a, b) => b.votes - a.votes || b.bitrate - a.bitrate || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Liste des ambiances disponibles, pour l'interface. */
export function listMoods(): MoodDefinition[] {
  return MUSIC_MOODS;
}
