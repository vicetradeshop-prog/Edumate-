/**
 * EduMate — Service catalogue.
 *
 * Charge le catalogue généré (`data/generated/catalog.json`) une seule fois
 * en mémoire, puis expose la recherche et le filtrage des sujets de quiz.
 * La séparation données / interface permet d'ajouter des milliers de sujets
 * sans toucher au frontend.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogTopic, Difficulty, Level, Subject, Theme } from '../../shared/types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Catalog {
  version: number;
  generatedAt: string;
  subjects: Subject[];
  levels: Level[];
  themes: Theme[];
  topics: CatalogTopic[];
  stats: { subjects: number; levels: number; themes: number; topics: number; playable: number; questionPool: number };
}

function candidatePaths(): string[] {
  return [
    path.resolve(dirname, '../../../data/generated/catalog.json'),
    path.resolve(dirname, '../../data/generated/catalog.json'),
    path.resolve(process.cwd(), 'data/generated/catalog.json'),
  ];
}

let cache: Catalog | null = null;
let cacheError: string | null = null;

export function getCatalog(): Catalog {
  if (cache) return cache;
  for (const file of candidatePaths()) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Catalog;
      if (!Array.isArray(parsed.topics)) throw new Error('format inattendu');
      cache = parsed;
      cacheError = null;
      console.log(`[EduMate] Catalogue chargé : ${parsed.topics.length} sujets (${path.relative(process.cwd(), file)})`);
      return cache;
    } catch (error) {
      cacheError = (error as Error).message;
    }
  }
  if (!cache) {
    cacheError = cacheError ?? 'catalogue introuvable';
    // Catalogue vide : l'API répond proprement au lieu de planter.
    cache = {
      version: 0,
      generatedAt: new Date().toISOString(),
      subjects: [],
      levels: [],
      themes: [],
      topics: [],
      stats: { subjects: 0, levels: 0, themes: 0, topics: 0, playable: 0, questionPool: 0 },
    };
    console.error(`[EduMate] ⚠️  Catalogue indisponible (${cacheError}). Lancez « npm run build:data ».`);
  }
  return cache;
}

export function catalogError(): string | null {
  getCatalog();
  return cacheError;
}

export function findTopic(topicId: string): CatalogTopic | null {
  return getCatalog().topics.find((topic) => topic.id === topicId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Recherche                                                          */
/* ------------------------------------------------------------------ */

export interface SearchParams {
  query?: string;
  subjectId?: string;
  levelId?: string;
  themeId?: string;
  theme?: string;
  difficulty?: Difficulty;
  favorites?: string[];
  onlyFavorites?: boolean;
  exclude?: string[];
  sort?: 'pertinence' | 'matiere' | 'difficulte' | 'nom';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  items: CatalogTopic[];
  facets: {
    subjects: { id: string; name: string; count: number }[];
    levels: { id: string; name: string; count: number }[];
    difficulties: { id: Difficulty; count: number }[];
    themes: { id: string; name: string; count: number }[];
  };
}

const DIFFICULTY_ORDER: Record<Difficulty, number> = { facile: 0, moyen: 1, difficile: 2 };

/** Score de pertinence simple (correspondance de mots, pas d'index externe). */
function relevance(topic: CatalogTopic, tokens: string[]): number {
  if (!tokens.length) return 0;
  const haystack = `${topic.name} ${topic.themeName} ${topic.subjectName} ${topic.levelName} ${(topic.keywords ?? []).join(' ')}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (haystack.includes(token)) score += 3;
    const words = haystack.split(/\s+/);
    if (words.some((w) => w.startsWith(token))) score += 2;
  }
  const name = topic.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (tokens.some((t) => name.includes(t))) score += 4;
  return score;
}

export function searchTopics(params: SearchParams = {}): SearchResult {
  const catalog = getCatalog();
  const tokens = (params.query ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);

  const favorites = new Set(params.favorites ?? []);
  const exclude = new Set(params.exclude ?? []);

  const scored: { topic: CatalogTopic; score: number }[] = [];
  for (const topic of catalog.topics) {
    if (topic.pool < 4) continue; // sujet non jouable : jamais affiché
    if (params.subjectId && topic.subjectId !== params.subjectId) continue;
    if (params.levelId && topic.levelId !== params.levelId) continue;
    if (params.themeId && topic.themeId !== params.themeId) continue;
    if (params.theme && topic.themeName !== params.theme) continue;
    if (params.difficulty && topic.difficulty !== params.difficulty) continue;
    if (params.onlyFavorites && !favorites.has(topic.id)) continue;
    if (exclude.has(topic.id)) continue;

    const score = relevance(topic, tokens);
    if (tokens.length && score === 0) continue;
    scored.push({ topic, score });
  }

  const sort = params.sort ?? 'pertinence';
  scored.sort((a, b) => {
    if (sort === 'difficulte') return DIFFICULTY_ORDER[a.topic.difficulty] - DIFFICULTY_ORDER[b.topic.difficulty] || a.topic.name.localeCompare(b.topic.name);
    if (sort === 'matiere') return a.topic.subjectName.localeCompare(b.topic.subjectName) || a.topic.levelName.localeCompare(b.topic.levelName) || a.topic.themeName.localeCompare(b.topic.themeName);
    if (sort === 'nom') return a.topic.name.localeCompare(b.topic.name);
    return b.score - a.score || a.topic.subjectName.localeCompare(b.topic.subjectName) || a.topic.name.localeCompare(b.topic.name);
  });

  const total = scored.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(120, Math.max(1, params.limit ?? 24));
  const items = scored.slice(offset, offset + limit).map((entry) => entry.topic);

  const countBy = (key: (topic: CatalogTopic) => string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const entry of scored) {
      const value = key(entry.topic);
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return map;
  };

  const subjectCounts = countBy((t) => t.subjectId);
  const levelCounts = countBy((t) => t.levelId);
  const themeCounts = countBy((t) => t.themeId);
  const difficultyCounts = countBy((t) => t.difficulty);

  return {
    total,
    items,
    facets: {
      subjects: catalog.subjects
        .filter((subject) => subjectCounts.has(subject.id))
        .map((subject) => ({ id: subject.id, name: subject.name, count: subjectCounts.get(subject.id) ?? 0 })),
      levels: catalog.levels
        .filter((level) => levelCounts.has(level.id))
        .map((level) => ({ id: level.id, name: level.name, count: levelCounts.get(level.id) ?? 0 })),
      difficulties: (['facile', 'moyen', 'difficile'] as Difficulty[])
        .filter((difficulty) => difficultyCounts.has(difficulty))
        .map((difficulty) => ({ id: difficulty, count: difficultyCounts.get(difficulty) ?? 0 })),
      themes: catalog.themes
        .filter((theme) => themeCounts.has(theme.id))
        .slice(0, 60)
        .map((theme) => ({ id: theme.id, name: theme.name, count: themeCounts.get(theme.id) ?? 0 })),
    },
  };
}

/** Navigation MATIÈRE → NIVEAU → THÈME → SUJET. */
export function browse(subjectId?: string, levelId?: string): {
  subjects: (Subject & { count: number })[];
  levels: (Level & { count: number })[];
  themes: { id: string; name: string; count: number }[];
  topics: CatalogTopic[];
} {
  const catalog = getCatalog();
  const playable = catalog.topics.filter((topic) => topic.pool >= 4);

  const subjects = catalog.subjects
    .map((subject) => ({ ...subject, count: playable.filter((t) => t.subjectId === subject.id).length }))
    .filter((subject) => subject.count > 0);

  const levels = catalog.levels
    .map((level) => ({
      ...level,
      count: playable.filter((t) => t.levelId === level.id && (!subjectId || t.subjectId === subjectId)).length,
    }))
    .filter((level) => level.count > 0);

  const themeMap = new Map<string, { id: string; name: string; count: number }>();
  const topics = playable.filter((topic) => (!subjectId || topic.subjectId === subjectId) && (!levelId || topic.levelId === levelId));
  for (const topic of topics) {
    const entry = themeMap.get(topic.themeId) ?? { id: topic.themeId, name: topic.themeName, count: 0 };
    entry.count += 1;
    themeMap.set(topic.themeId, entry);
  }
  const themes = [...themeMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return { subjects, levels, themes, topics };
}
