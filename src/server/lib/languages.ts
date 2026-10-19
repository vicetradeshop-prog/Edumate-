/**
 * EduMate — Langues prises en charge par le traducteur et détection légère.
 *
 * La détection repose sur des mots-outils très fréquents et sur les plages
 * Unicode (cyrillique, arabe, CJK…) : elle couvre les langues proposées sans
 * aucun service externe ni modèle embarqué.
 */

export const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'Anglais', flag: '🇬🇧' },
  { code: 'es', name: 'Espagnol', flag: '🇪🇸' },
  { code: 'de', name: 'Allemand', flag: '🇩🇪' },
  { code: 'it', name: 'Italien', flag: '🇮🇹' },
  { code: 'pt', name: 'Portugais', flag: '🇵🇹' },
  { code: 'nl', name: 'Néerlandais', flag: '🇳🇱' },
  { code: 'ar', name: 'Arabe', flag: '🇸🇦' },
  { code: 'zh', name: 'Chinois', flag: '🇨🇳' },
  { code: 'ja', name: 'Japonais', flag: '🇯🇵' },
  { code: 'ru', name: 'Russe', flag: '🇷🇺' },
  { code: 'tr', name: 'Turc', flag: '🇹🇷' },
  { code: 'pl', name: 'Polonais', flag: '🇵🇱' },
  { code: 'sv', name: 'Suédois', flag: '🇸🇪' },
  { code: 'el', name: 'Grec', flag: '🇬🇷' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const SIGNATURES: Record<string, string[]> = {
  fr: ['le', 'la', 'les', 'des', 'une', 'est', 'et', 'dans', 'pour', 'que', 'qui', 'avec', 'vous', 'nous', 'pas', 'sur', 'ce', 'cette', 'mon', 'je', 'tu', 'il', 'elle', 'aujourd'],
  en: ['the', 'and', 'is', 'are', 'of', 'to', 'in', 'that', 'it', 'for', 'with', 'you', 'this', 'have', 'not', 'but', 'they', 'we', 'will', 'can', 'how'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con', 'para', 'no', 'se', 'su', 'como', 'más', 'pero', 'hola', 'estás'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'auf', 'für', 'ein', 'eine', 'sie', 'wir', 'auch', 'nach', 'bei', 'von', 'zu', 'wie', 'hallo'],
  it: ['il', 'lo', 'la', 'di', 'che', 'è', 'e', 'un', 'una', 'per', 'con', 'non', 'si', 'sono', 'ha', 'ma', 'come', 'più', 'ciao'],
  pt: ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'do', 'da', 'um', 'uma', 'para', 'com', 'não', 'por', 'mais', 'como', 'olá'],
  nl: ['de', 'het', 'een', 'van', 'en', 'is', 'dat', 'niet', 'voor', 'met', 'zijn', 'op', 'te', 'aan', 'ook'],
  tr: ['bir', 've', 'bu', 'için', 'ile', 'değil', 'daha', 'gibi', 'ama', 'var'],
  pl: ['nie', 'się', 'jest', 'na', 'to', 'i', 'że', 'co', 'jak', 'ale', 'za', 'od'],
  sv: ['och', 'att', 'det', 'som', 'för', 'med', 'har', 'inte', 'den', 'var'],
  el: ['και', 'το', 'της', 'ο', 'η', 'με', 'στο', 'για'],
  ru: ['и', 'в', 'не', 'что', 'на', 'с', 'это', 'как', 'для'],
  ar: ['في', 'من', 'على', 'إلى', 'هذا', 'التي', 'عن', 'مع'],
};

/** Détecte la langue dominante d'un court texte (repli : français). */
export function detectLanguage(text: string): string {
  const value = String(text ?? '');
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh';
  if (/[\u3040-\u30ff]/.test(value)) return 'ja';
  if (/[\u0600-\u06ff]/.test(value)) return 'ar';
  if (/[\u0400-\u04ff]/.test(value)) return 'ru';
  if (/[\u0370-\u03ff]/.test(value)) return 'el';

  const sample = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!sample.length) return 'fr';

  let best = { code: 'fr', score: 0 };
  for (const [code, words] of Object.entries(SIGNATURES)) {
    const score = sample.reduce((total, token) => (words.includes(token) ? total + 1 : total), 0);
    if (score > best.score) best = { code, score };
  }
  return best.score > 0 ? best.code : 'fr';
}
