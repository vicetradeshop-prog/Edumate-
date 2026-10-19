/**
 * EduMate — Corpus de langues vivantes : ANGLAIS et ESPAGNOL.
 *
 * (Le corpus de français — grammaire, littérature, conjugaison — se trouve
 * dans `data/french.ts`.)
 */


export interface EnglishVerb {
  base: string;
  past: string;
  participle: string;
  fr: string;
  regular: boolean;
}

export const ENGLISH_VERBS: EnglishVerb[] = [
  { base: 'be', past: 'was/were', participle: 'been', fr: 'être', regular: false },
  { base: 'have', past: 'had', participle: 'had', fr: 'avoir', regular: false },
  { base: 'do', past: 'did', participle: 'done', fr: 'faire', regular: false },
  { base: 'go', past: 'went', participle: 'gone', fr: 'aller', regular: false },
  { base: 'say', past: 'said', participle: 'said', fr: 'dire', regular: false },
  { base: 'get', past: 'got', participle: 'got', fr: 'obtenir', regular: false },
  { base: 'make', past: 'made', participle: 'made', fr: 'fabriquer', regular: false },
  { base: 'know', past: 'knew', participle: 'known', fr: 'savoir', regular: false },
  { base: 'think', past: 'thought', participle: 'thought', fr: 'penser', regular: false },
  { base: 'take', past: 'took', participle: 'taken', fr: 'prendre', regular: false },
  { base: 'see', past: 'saw', participle: 'seen', fr: 'voir', regular: false },
  { base: 'come', past: 'came', participle: 'come', fr: 'venir', regular: false },
  { base: 'give', past: 'gave', participle: 'given', fr: 'donner', regular: false },
  { base: 'find', past: 'found', participle: 'found', fr: 'trouver', regular: false },
  { base: 'tell', past: 'told', participle: 'told', fr: 'raconter', regular: false },
  { base: 'write', past: 'wrote', participle: 'written', fr: 'écrire', regular: false },
  { base: 'read', past: 'read', participle: 'read', fr: 'lire', regular: false },
  { base: 'run', past: 'ran', participle: 'run', fr: 'courir', regular: false },
  { base: 'eat', past: 'ate', participle: 'eaten', fr: 'manger', regular: false },
  { base: 'drink', past: 'drank', participle: 'drunk', fr: 'boire', regular: false },
  { base: 'sing', past: 'sang', participle: 'sung', fr: 'chanter', regular: false },
  { base: 'swim', past: 'swam', participle: 'swum', fr: 'nager', regular: false },
  { base: 'begin', past: 'began', participle: 'begun', fr: 'commencer', regular: false },
  { base: 'break', past: 'broke', participle: 'broken', fr: 'casser', regular: false },
  { base: 'build', past: 'built', participle: 'built', fr: 'construire', regular: false },
  { base: 'buy', past: 'bought', participle: 'bought', fr: 'acheter', regular: false },
  { base: 'catch', past: 'caught', participle: 'caught', fr: 'attraper', regular: false },
  { base: 'choose', past: 'chose', participle: 'chosen', fr: 'choisir', regular: false },
  { base: 'cut', past: 'cut', participle: 'cut', fr: 'couper', regular: false },
  { base: 'draw', past: 'drew', participle: 'drawn', fr: 'dessiner', regular: false },
  { base: 'drive', past: 'drove', participle: 'driven', fr: 'conduire', regular: false },
  { base: 'fall', past: 'fell', participle: 'fallen', fr: 'tomber', regular: false },
  { base: 'feel', past: 'felt', participle: 'felt', fr: 'ressentir', regular: false },
  { base: 'fight', past: 'fought', participle: 'fought', fr: 'se battre', regular: false },
  { base: 'fly', past: 'flew', participle: 'flown', fr: 'voler', regular: false },
  { base: 'forget', past: 'forgot', participle: 'forgotten', fr: 'oublier', regular: false },
  { base: 'grow', past: 'grew', participle: 'grown', fr: 'grandir', regular: false },
  { base: 'hear', past: 'heard', participle: 'heard', fr: 'entendre', regular: false },
  { base: 'keep', past: 'kept', participle: 'kept', fr: 'garder', regular: false },
  { base: 'leave', past: 'left', participle: 'left', fr: 'partir', regular: false },
  { base: 'lose', past: 'lost', participle: 'lost', fr: 'perdre', regular: false },
  { base: 'meet', past: 'met', participle: 'met', fr: 'rencontrer', regular: false },
  { base: 'pay', past: 'paid', participle: 'paid', fr: 'payer', regular: false },
  { base: 'put', past: 'put', participle: 'put', fr: 'mettre', regular: false },
  { base: 'ride', past: 'rode', participle: 'ridden', fr: 'chevaucher', regular: false },
  { base: 'rise', past: 'rose', participle: 'risen', fr: 'se lever', regular: false },
  { base: 'sell', past: 'sold', participle: 'sold', fr: 'vendre', regular: false },
  { base: 'send', past: 'sent', participle: 'sent', fr: 'envoyer', regular: false },
  { base: 'sit', past: 'sat', participle: 'sat', fr: "s'asseoir", regular: false },
  { base: 'sleep', past: 'slept', participle: 'slept', fr: 'dormir', regular: false },
  { base: 'speak', past: 'spoke', participle: 'spoken', fr: 'parler', regular: false },
  { base: 'spend', past: 'spent', participle: 'spent', fr: 'dépenser', regular: false },
  { base: 'stand', past: 'stood', participle: 'stood', fr: 'être debout', regular: false },
  { base: 'teach', past: 'taught', participle: 'taught', fr: 'enseigner', regular: false },
  { base: 'understand', past: 'understood', participle: 'understood', fr: 'comprendre', regular: false },
  { base: 'wake', past: 'woke', participle: 'woken', fr: 'réveiller', regular: false },
  { base: 'wear', past: 'wore', participle: 'worn', fr: 'porter', regular: false },
  { base: 'win', past: 'won', participle: 'won', fr: 'gagner', regular: false },
  { base: 'work', past: 'worked', participle: 'worked', fr: 'travailler', regular: true },
  { base: 'play', past: 'played', participle: 'played', fr: 'jouer', regular: true },
  { base: 'watch', past: 'watched', participle: 'watched', fr: 'regarder', regular: true },
  { base: 'listen', past: 'listened', participle: 'listened', fr: 'écouter', regular: true },
  { base: 'study', past: 'studied', participle: 'studied', fr: 'étudier', regular: true },
  { base: 'stop', past: 'stopped', participle: 'stopped', fr: 'arrêter', regular: true },
  { base: 'travel', past: 'travelled', participle: 'travelled', fr: 'voyager', regular: true },
  { base: 'live', past: 'lived', participle: 'lived', fr: 'habiter', regular: true },
  { base: 'love', past: 'loved', participle: 'loved', fr: 'aimer', regular: true },
  { base: 'help', past: 'helped', participle: 'helped', fr: 'aider', regular: true },
  { base: 'ask', past: 'asked', participle: 'asked', fr: 'demander', regular: true },
  { base: 'answer', past: 'answered', participle: 'answered', fr: 'répondre', regular: true },
];

/** Vocabulaire thématique anglais → français (programmes collège/lycée). */
export const ENGLISH_VOCAB: { theme: string; items: [string, string][] }[] = [
  {
    theme: 'Famille et relations',
    items: [
      ['sibling', 'frère ou sœur'], ['nephew', 'neveu'], ['niece', 'nièce'], ['stepfather', 'beau-père (remariage)'],
      ['mother-in-law', 'belle-mère (par alliance)'], ['twins', 'jumeaux'], ['relatives', 'la famille / les proches'],
      ['fiancé', 'fiancé'], ['godmother', 'marraine'], ['cousin', 'cousin ou cousine'],
    ],
  },
  {
    theme: 'École et études',
    items: [
      ['timetable', 'emploi du temps'], ['headteacher', 'directeur / proviseur'], ['pupil', 'élève (primaire)'],
      ['degree', 'diplôme universitaire'], ['to revise', 'réviser'], ['to pass an exam', 'réussir un examen'],
      ['to fail', 'échouer'], ['scholarship', 'bourse d’études'], ['textbook', 'manuel scolaire'],
      ['homework', 'devoirs (à la maison)'], ['break time', 'récréation'], ['to cheat', 'tricher'],
    ],
  },
  {
    theme: 'Voyages et transports',
    items: [
      ['luggage', 'bagages'], ['journey', 'trajet / voyage'], ['to board', 'embarquer'], ['departure', 'départ'],
      ['platform', 'quai (de gare)'], ['to miss a train', 'rater un train'], ['abroad', 'à l’étranger'],
      ['round trip', 'aller-retour'], ['crowded', 'bondé'], ['to hitchhike', 'faire du stop'],
    ],
  },
  {
    theme: 'Environnement',
    items: [
      ['global warming', 'réchauffement climatique'], ['pollution', 'pollution'], ['to recycle', 'recycler'],
      ['greenhouse gases', 'gaz à effet de serre'], ['waste', 'déchets'], ['renewable energy', 'énergie renouvelable'],
      ['drought', 'sécheresse'], ['flood', 'inondation'], ['endangered species', 'espèces menacées'],
      ['to save the planet', 'sauver la planète'],
    ],
  },
  {
    theme: 'Travail et métiers',
    items: [
      ['job interview', 'entretien d’embauche'], ['employer', 'employeur'], ['employee', 'employé'],
      ['salary', 'salaire'], ['to hire', 'embaucher'], ['to fire', 'licencier'], ['skill', 'compétence'],
      ['full-time', 'à temps plein'], ['part-time', 'à temps partiel'], ['retirement', 'retraite'],
    ],
  },
  {
    theme: 'Médias et numérique',
    items: [
      ['news', 'actualités'], ['fake news', 'fausses informations'], ['social networks', 'réseaux sociaux'],
      ['to post', 'publier'], ['screen', 'écran'], ['to download', 'télécharger'], ['streaming', 'lecture en continu'],
      ['cyberbullying', 'cyberharcèlement'], ['privacy', 'vie privée'], ['to scroll', 'faire défiler'],
    ],
  },
  {
    theme: 'Sports et loisirs',
    items: [
      ['to train', 's’entraîner'], ['coach', 'entraîneur'], ['team spirit', 'esprit d’équipe'],
      ['to win', 'gagner'], ['to lose', 'perdre'], ['match', 'match'], ['referee', 'arbitre'],
      ['to warm up', 's’échauffer'], ['injury', 'blessure'], ['achievement', 'exploit / réussite'],
    ],
  },
  {
    theme: 'Santé et corps',
    items: [
      ['headache', 'mal de tête'], ['to cough', 'tousser'], ['sore throat', 'mal de gorge'],
      ['fever', 'fièvre'], ['medicine', 'médicament'], ['to heal', 'guérir'], ['healthy', 'en bonne santé'],
      ['balanced diet', 'alimentation équilibrée'], ['workout', 'séance d’entraînement'], ['to rest', 'se reposer'],
    ],
  },
];

/** Phrasal verbs fréquents. */
export const PHRASAL_VERBS: [string, string][] = [
  ['give up', 'abandonner / renoncer à'],
  ['look after', "s'occuper de"],
  ['look for', 'chercher'],
  ['look forward to', 'avoir hâte de'],
  ['turn on', 'allumer'],
  ['turn off', 'éteindre'],
  ['put off', 'reporter / repousser'],
  ['carry on', 'continuer'],
  ['get along with', "bien s'entendre avec"],
  ['take off', 'décoller / enlever'],
  ['run out of', 'être à court de'],
  ['come up with', 'trouver (une idée)'],
  ['break down', 'tomber en panne'],
  ['set up', 'mettre en place / fonder'],
  ['find out', 'découvrir / apprendre'],
  ['work out', "s'entraîner / résoudre"],
];

/** Faux amis anglais-français. */
export const FALSE_FRIENDS: [string, string, string][] = [
  ['actually', 'en fait', 'actuellement'],
  ['eventually', 'finalement', 'éventuellement'],
  ['library', 'bibliothèque', 'librairie'],
  ['to attend', 'assister à', 'attendre'],
  ['to deceive', 'tromper', 'décevoir'],
  ['a chance', 'une occasion', 'une chance'],
  ['to achieve', 'réussir / accomplir', 'achever'],
  ['a journey', 'un trajet', 'une journée'],
  ['to remain', 'rester', 'remarquer'],
  ['sensible', 'raisonnable', 'sensible'],
  ['comprehensive', 'complet / exhaustif', 'compréhensif'],
  ['to support', 'soutenir', 'supporter'],
  ['a coin', 'une pièce de monnaie', 'un coin'],
  ['preservative', 'conservateur (alimentaire)', 'préservatif'],
  ['to assist', 'aider', 'assister à'],
  ['currently', 'actuellement', 'couramment'],
  ['to envy', 'envier', 'ennuyer'],
  ['a lecture', 'un cours magistral / une conférence', 'une lecture'],
  ['to cry', 'pleurer', 'crier'],
  ['hurt', 'blessé / faire mal', 'hurler'],
];

/* ------------------------------------------------------------------ */
/*  Espagnol                                                           */
/* ------------------------------------------------------------------ */

export interface SpanishVerb {
  infinitive: string;
  group: 'ar' | 'er' | 'ir';
  stem: string;
  past: string; // 1re personne du prétérit
  fr: string;
  irregular?: boolean;
}

export const SPANISH_VERBS: SpanishVerb[] = [
  { infinitive: 'hablar', group: 'ar', stem: 'habl', past: 'hablé', fr: 'parler' },
  { infinitive: 'cantar', group: 'ar', stem: 'cant', past: 'canté', fr: 'chanter' },
  { infinitive: 'bailar', group: 'ar', stem: 'bail', past: 'bailé', fr: 'danser' },
  { infinitive: 'estudiar', group: 'ar', stem: 'estudi', past: 'estudié', fr: 'étudier' },
  { infinitive: 'trabajar', group: 'ar', stem: 'trabaj', past: 'trabajé', fr: 'travailler' },
  { infinitive: 'comprar', group: 'ar', stem: 'compr', past: 'compré', fr: 'acheter' },
  { infinitive: 'mirar', group: 'ar', stem: 'mir', past: 'miré', fr: 'regarder' },
  { infinitive: 'escuchar', group: 'ar', stem: 'escuch', past: 'escuché', fr: 'écouter' },
  { infinitive: 'viajar', group: 'ar', stem: 'viaj', past: 'viajé', fr: 'voyager' },
  { infinitive: 'cocinar', group: 'ar', stem: 'cocin', past: 'cociné', fr: 'cuisiner' },
  { infinitive: 'comer', group: 'er', stem: 'com', past: 'comí', fr: 'manger' },
  { infinitive: 'beber', group: 'er', stem: 'beb', past: 'bebí', fr: 'boire' },
  { infinitive: 'aprender', group: 'er', stem: 'aprend', past: 'aprendí', fr: 'apprendre' },
  { infinitive: 'vivir', group: 'ir', stem: 'viv', past: 'viví', fr: 'vivre' },
  { infinitive: 'escribir', group: 'ir', stem: 'escrib', past: 'escribí', fr: 'écrire' },
  { infinitive: 'abrir', group: 'ir', stem: 'abr', past: 'abrí', fr: 'ouvrir' },
  { infinitive: 'recibir', group: 'ir', stem: 'recib', past: 'recibí', fr: 'recevoir' },
  { infinitive: 'ser', group: 'er', stem: 'soy', past: 'fui', fr: 'être (essence)', irregular: true },
  { infinitive: 'estar', group: 'ar', stem: 'estoy', past: 'estuve', fr: 'être (état)', irregular: true },
  { infinitive: 'tener', group: 'er', stem: 'tengo', past: 'tuve', fr: 'avoir', irregular: true },
  { infinitive: 'hacer', group: 'er', stem: 'hago', past: 'hice', fr: 'faire', irregular: true },
  { infinitive: 'ir', group: 'ir', stem: 'voy', past: 'fui', fr: 'aller', irregular: true },
  { infinitive: 'poder', group: 'er', stem: 'puedo', past: 'pude', fr: 'pouvoir', irregular: true },
  { infinitive: 'querer', group: 'er', stem: 'quiero', past: 'quise', fr: 'vouloir', irregular: true },
  { infinitive: 'saber', group: 'er', stem: 'sé', past: 'supe', fr: 'savoir', irregular: true },
  { infinitive: 'decir', group: 'ir', stem: 'digo', past: 'dije', fr: 'dire', irregular: true },
  { infinitive: 'venir', group: 'ir', stem: 'vengo', past: 'vine', fr: 'venir', irregular: true },
  { infinitive: 'ver', group: 'er', stem: 'veo', past: 'vi', fr: 'voir', irregular: true },
  { infinitive: 'salir', group: 'ir', stem: 'salgo', past: 'salí', fr: 'sortir', irregular: true },
  { infinitive: 'poner', group: 'er', stem: 'pongo', past: 'puse', fr: 'mettre', irregular: true },
];

/** Terminaisons espagnoles du présent de l'indicatif. */
export const SPANISH_PRESENT: Record<'ar' | 'er' | 'ir', string[]> = {
  ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
  er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
  ir: ['o', 'es', 'e', 'imos', 'ís', 'en'],
};

export const SPANISH_VOCAB: { theme: string; items: [string, string][] }[] = [
  {
    theme: 'Vie quotidienne',
    items: [
      ['el desayuno', 'le petit-déjeuner'], ['la cama', 'le lit'], ['el trabajo', 'le travail'],
      ['la llave', 'la clé'], ['el dinero', 'l’argent'], ['la casa', 'la maison'],
      ['el coche', 'la voiture'], ['la calle', 'la rue'], ['el perro', 'le chien'], ['la ropa', 'les vêtements'],
    ],
  },
  {
    theme: 'Scolarité',
    items: [
      ['el instituto', 'le lycée'], ['la asignatura', 'la matière'], ['el cuaderno', 'le cahier'],
      ['el examen', 'l’examen'], ['la nota', 'la note'], ['el recreo', 'la récréation'],
      ['el profesor', 'le professeur'], ['la biblioteca', 'la bibliothèque'], ['los deberes', 'les devoirs'],
      ['aprobar', 'réussir (un examen)'],
    ],
  },
  {
    theme: 'Voyages',
    items: [
      ['el viaje', 'le voyage'], ['la maleta', 'la valise'], ['el billete', 'le billet'],
      ['la estación', 'la gare'], ['el aeropuerto', 'l’aéroport'], ['la playa', 'la plage'],
      ['el extranjero', 'l’étranger'], ['el paisaje', 'le paysage'], ['la frontera', 'la frontière'],
      ['el pasaporte', 'le passeport'],
    ],
  },
  {
    theme: 'Sentiments',
    items: [
      ['la alegría', 'la joie'], ['la tristeza', 'la tristesse'], ['el miedo', 'la peur'],
      ['la sorpresa', 'la surprise'], ['el enfado', 'la colère'], ['la vergüenza', 'la honte'],
      ['el orgullo', 'la fierté'], ['la ilusión', 'l’enthousiasme'], ['el cariño', 'l’affection'],
      ['la esperanza', 'l’espoir'],
    ],
  },
];
