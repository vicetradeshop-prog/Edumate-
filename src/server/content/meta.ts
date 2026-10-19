/**
 * EduMate — Structure du catalogue pédagogique.
 *
 * MATIÈRE → NIVEAU → THÈME → SUJET → QUIZ
 *
 * C'est ICI que l'on ajoute une matière ou un niveau.
 * Les sujets de quiz sont déclarés dans `topics.ts` (une ligne par sujet).
 */
import type { Level, LevelId, Subject, SubjectId, Theme } from '../../shared/types.js';

export const SUBJECTS: Subject[] = [
  {
    id: 'mathematiques',
    name: 'Mathématiques',
    short: 'Maths',
    emoji: '📐',
    color: '#4f6df5',
    colorSoft: '#eef1ff',
    accent: '#22d3ee',
    pattern: 'geometry',
    description: 'Calcul, fonctions, géométrie, probabilités : des milliers d’exercices générés et corrigés.',
  },
  {
    id: 'francais',
    name: 'Français',
    short: 'Français',
    emoji: '📚',
    color: '#e0567a',
    colorSoft: '#fdeef3',
    accent: '#f59e0b',
    pattern: 'books',
    description: 'Grammaire, conjugaison, littérature, méthode : maîtrise la langue et les textes.',
  },
  {
    id: 'physique-chimie',
    name: 'Physique-Chimie',
    short: 'Physique-Chimie',
    emoji: '⚗️',
    color: '#0ea5a4',
    colorSoft: '#e6f7f6',
    accent: '#84cc16',
    pattern: 'lab',
    description: 'Mécanique, électricité, ondes, chimie : des applications numériques exactes.',
  },
  {
    id: 'svt',
    name: 'SVT',
    short: 'SVT',
    emoji: '🧬',
    color: '#22a05b',
    colorSoft: '#e8f7ee',
    accent: '#a3e635',
    pattern: 'nature',
    description: 'Génétique, physiologie, géologie, écologie : le vivant sous toutes ses formes.',
  },
  {
    id: 'histoire-geographie',
    name: 'Histoire-Géographie',
    short: 'Histoire-Géo',
    emoji: '🌍',
    color: '#c2703d',
    colorSoft: '#fdf1e7',
    accent: '#eab308',
    pattern: 'map',
    description: 'Repères chronologiques, cartes, enjeux du monde contemporain.',
  },
  {
    id: 'philosophie',
    name: 'Philosophie',
    short: 'Philo',
    emoji: '🦉',
    color: '#7c5cd6',
    colorSoft: '#f1ecfd',
    accent: '#f472b6',
    pattern: 'mind',
    description: 'Notions, auteurs, doctrines et méthode de la dissertation.',
  },
  {
    id: 'anglais',
    name: 'Anglais',
    short: 'Anglais',
    emoji: '🇬🇧',
    color: '#2f7fe0',
    colorSoft: '#e9f2fd',
    accent: '#f97316',
    pattern: 'language',
    description: 'Vocabulaire, verbes irréguliers, grammaire, faux amis.',
  },
  {
    id: 'espagnol',
    name: 'Espagnol',
    short: 'Espagnol',
    emoji: '🇪🇸',
    color: '#e0762f',
    colorSoft: '#fdf1e6',
    accent: '#ef4444',
    pattern: 'language',
    description: 'Conjugaison, vocabulaire thématique et verbes irréguliers.',
  },
  {
    id: 'nsi',
    name: 'NSI / Informatique',
    short: 'NSI',
    emoji: '💻',
    color: '#3b4b63',
    colorSoft: '#eef1f6',
    accent: '#06b6d4',
    pattern: 'tech',
    description: 'Algorithmique, Python, bases de données, réseaux, logique binaire.',
  },
  {
    id: 'ses',
    name: 'SES',
    short: 'SES',
    emoji: '📊',
    color: '#d4a017',
    colorSoft: '#fdf6e3',
    accent: '#10b981',
    pattern: 'economy',
    description: 'Économie, sociologie, science politique : notions, auteurs et calculs.',
  },
];

export const LEVELS: Level[] = [
  { id: 'troisieme', name: 'Troisième', short: '3ᵉ', order: 1 },
  { id: 'seconde', name: 'Seconde', short: '2de', order: 2 },
  { id: 'premiere', name: 'Première', short: '1ʳᵉ', order: 3 },
  { id: 'terminale', name: 'Terminale', short: 'Tle', order: 4 },
];

export const SUBJECT_BY_ID: Record<string, Subject> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const LEVEL_BY_ID: Record<string, Level> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** Matières proposées à chaque niveau (spécialités du lycée incluses). */
export const SUBJECTS_BY_LEVEL: Record<LevelId, SubjectId[]> = {
  troisieme: ['mathematiques', 'francais', 'physique-chimie', 'svt', 'histoire-geographie', 'anglais', 'espagnol', 'nsi'],
  seconde: ['mathematiques', 'francais', 'physique-chimie', 'svt', 'histoire-geographie', 'anglais', 'espagnol', 'nsi', 'ses'],
  premiere: ['mathematiques', 'francais', 'physique-chimie', 'svt', 'histoire-geographie', 'philosophie', 'anglais', 'espagnol', 'nsi', 'ses'],
  terminale: ['mathematiques', 'physique-chimie', 'svt', 'histoire-geographie', 'philosophie', 'anglais', 'espagnol', 'nsi', 'ses'],
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Thèmes construits automatiquement à partir de la liste des sujets. */
export function buildThemes(topics: { subjectId: SubjectId; levelId: LevelId; theme: string }[]): Theme[] {
  const seen = new Set<string>();
  const themes: Theme[] = [];
  for (const topic of topics) {
    const id = `${topic.subjectId}:${topic.levelId}:${slugify(topic.theme)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    themes.push({ id, subjectId: topic.subjectId, levelId: topic.levelId, name: topic.theme });
  }
  return themes;
}
