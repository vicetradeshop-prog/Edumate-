/**
 * EduMate — Agrégation des sujets de quiz issus des tables de données.
 *
 * Les trois modules d'extension déclinent systématiquement les générateurs
 * paramétrables (maths, langues, connaissances) en sujets distincts.
 */
import type { TopicDefinition } from '../topics.js';
import { EXPANDED_MATH } from './math.js';
import { EXPANDED_LANGUAGES } from './languages.js';
import { EXPANDED_KNOWLEDGE } from './knowledge.js';

export const EXPANDED_TOPICS: TopicDefinition[] = [...EXPANDED_MATH, ...EXPANDED_LANGUAGES, ...EXPANDED_KNOWLEDGE];
