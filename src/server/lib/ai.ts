/**
 * EduMate — Couche d'intelligence artificielle.
 *
 * Principe : la clé API n'existe QUE côté serveur, jamais dans le frontend.
 * L'abstraction `TutorProvider` permet de changer de fournisseur en modifiant
 * une seule variable d'environnement (AI_PROVIDER).
 *
 * Fournisseurs pris en charge (API compatibles OpenAI « chat/completions ») :
 *   - openai   → https://api.openai.com/v1
 *   - groq     → https://api.groq.com/openai/v1   (offre gratuite généreuse)
 *   - mistral  → https://api.mistral.ai/v1
 *   - xai      → https://api.x.ai/v1   (Grok ; alias « grok » accepté)
 *   - custom   → AI_BASE_URL + AI_API_KEY (tout proxy compatible OpenAI)
 *
 * 🔐 La clé n'est JAMAIS codée en dur dans le dépôt : elle provient uniquement
 *    de la variable d'environnement AI_API_KEY (`.env` en local, Render en
 *    production). Si AI_PROVIDER est vide, le fournisseur est déduit du format
 *    de la clé (gsk_ → groq, xai- → xai, sk- → openai) — voir `lib/config.ts`.
 *
 * Sans clé, EduMate bascule sur le **tuteur local** : un moteur pédagogique
 * hors-ligne, honnête et réellement utile (rappels de cours, méthode par
 * étapes, exercices générés par le moteur de quiz). L'interface indique
 * toujours clairement le mode utilisé.
 */
import type { TutorMode, TutorRequest, TutorResponse } from '../../shared/types.js';
import { config, hasAiProvider } from './config.js';
import { buildQuestions } from '../content/index.js';
import { sanitizeModelContent } from '../../shared/markdownSanitize.js';

export interface StudentContext {
  name?: string;
  level?: string;
  subject?: string;
}

export interface TutorProvider {
  readonly id: string;
  readonly configured: boolean;
  complete(request: TutorRequest, student?: StudentContext): Promise<TutorResponse>;
  /**
   * Réponse en continu (streaming) : chaque fragment arrive via `onDelta`.
   * Optionnel — la route SSE retombe sur `complete()` s'il est absent.
   */
  completeStream?(
    request: TutorRequest,
    student: StudentContext | undefined,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<TutorResponse>;
}

/* ------------------------------------------------------------------ */
/*  Contexte pédagogique commun                                        */
/* ------------------------------------------------------------------ */

const MODE_INSTRUCTIONS: Record<TutorMode, string> = {
  expliquer:
    "Explique la notion pas à pas, avec un langage adapté au niveau de l'élève. Commence par l'idée essentielle, développe, puis donne un exemple chiffré ou concret. Termine par un encadré « À retenir ».",
  reformuler:
    "Reformule la demande ou le texte de l'élève avec des mots plus simples, sans perdre aucune information. Propose deux versions : une très courte (une phrase) et une détaillée.",
  methode:
    "Propose une méthode de résolution numérotée (étape 1, étape 2…), applicable à ce type d'exercice. Ajoute les pièges classiques à éviter et un conseil de vérification.",
  exercices:
    "Propose 3 exercices progressifs (facile, moyen, difficile) sur la notion demandée. Donne les énoncés, puis les corrections détaillées séparées par la mention « Corrections ».",
  questions:
    "Génère 5 questions de type quiz (QCM à 4 propositions) sur le sujet demandé, avec la bonne réponse et une courte justification pour chacune.",
  corriger:
    "Analyse la production de l'élève : souligne ce qui est correct, identifie précisément les erreurs, explique pourquoi c'est faux, puis donne la version corrigée et un conseil pour progresser.",
};

const MODE_FORMATS: Record<TutorMode, string> = {
  expliquer:
    'Structure attendue : « ## L’essentiel » (2-3 phrases), « ## Explication pas à pas » (liste numérotée), « ## Exemple » (un exemple complet et détaillé), « ## ✅ À retenir » (1 à 3 puces).',
  reformuler:
    'Structure attendue : « ## En une phrase » (la version courte), « ## Version détaillée » (le texte reformulé), puis « ## Ce qu’il faut retenir » si utile.',
  methode:
    'Structure attendue : « ## Méthode étape par étape » (liste numérotée avec une action claire par étape), « ## ⚠️ Pièges à éviter » (puces), « ## Comment vérifier » (1-2 puces).',
  exercices:
    'Structure attendue : « ## Exercice 1 — facile », « ## Exercice 2 — moyen », « ## Exercice 3 — difficile » (énoncés seuls), puis « ## Corrections » avec « ### Correction 1 », etc. Ne donne JAMAIS la réponse avant la section Corrections.',
  questions:
    'Structure attendue : pour chaque question, « **Question N.** … » suivi des propositions « - A. … - B. … - C. … - D. … », puis « ✅ Réponse : X — justification courte ».',
  corriger:
    'Structure attendue : « ## Ce qui est correct » (puces), « ## Les erreurs » (pour chacune : citation, pourquoi c’est faux, la règle), « ## Version corrigée », « ## Conseil pour progresser ».',
};

export function buildSystemPrompt(request: TutorRequest, studentName?: string, levelLabel?: string, subjectLabel?: string): string {
  const who = studentName ? `L'élève s'appelle ${studentName}` : "L'élève n'a pas précisé son prénom";
  return [
    "Tu es EduMate, un tuteur scolaire bienveillant, clair et exigeant, spécialisé dans l'accompagnement des collégiens et lycéens francophones.",
    `${who}${levelLabel ? `, ${levelLabel}` : ''}${subjectLabel ? `, matière : ${subjectLabel}` : ''}.`,
    'Règles :',
    '- Réponds toujours en français (sauf pour les cours de langues, où tu peux utiliser la langue cible).',
    '- Réponds UNIQUEMENT en Markdown propre : titres courts (##), listes à puces, gras pour les mots-clés, blocs de code si utile.',
    "- INTERDICTION d'utiliser la moindre balise HTML : pas de <br>, <p>, <details>, <summary>, <span>, <div>… Pour un saut de ligne, termine simplement ta ligne. Tout HTML serait affiché brut à l'élève.",
    "- N'écris aucune balise de raisonnement ni méta-commentaire (« En tant qu'IA… », <thinking>…) : réponds directement, comme un professeur.",
    '- Formules mathématiques : utilise EXCLUSIVEMENT $...$ (en ligne) et $$...$$ (en bloc). N\u2019utilise jamais \\(...\\) ni \\[...\\]. N\u2019utilise pas le symbole $ pour autre chose que des mathématiques.',
    '- Adapte ton vocabulaire et tes exemples au niveau indiqué : concret et imagé en Troisième/Seconde, rigoureux et technique en Première/Terminale.',
    '- Sois pédagogique : explique le raisonnement, pas seulement le résultat.',
    '- Si la question manque de précision (énoncé incomplet, notion ambiguë), réponds sur l\u2019interprétation la plus probable PUIS pose une courte question pour confirmer.',
    "- N'invente jamais une donnée, une date ou une citation : si tu n'es pas sûr, dis-le.",
    "- N'aide pas à tricher à un examen : guide vers la compréhension plutôt que vers une réponse toute faite.",
    '- Termine par une question de vérification ou une petite piste d’entraînement quand c’est pertinent.',
    `- Consigne pour cette demande (${request.mode}) : ${MODE_INSTRUCTIONS[request.mode]}`,
    `- ${MODE_FORMATS[request.mode]}`,
    '- Longueur cible : 200 à 400 mots, sauf demande contraire. Aère le texte : paragraphes courts, jamais de bloc compact.',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Fournisseur HTTP compatible OpenAI                                 */
/* ------------------------------------------------------------------ */

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  // xAI (Grok) : API compatible OpenAI. `AI_PROVIDER=xai` (ou l'alias `grok`),
  // une clé `xai-...` est d'ailleurs reconnue automatiquement par config.ts.
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4-fast' },
};

export interface ChatMessageLike {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * Normalise les délimiteurs mathématiques renvoyés par certains modèles
 * (\\(...\\) et \\[...\\]) vers le format $...$ / $$...$$ attendu par le rendu
 * KaTeX du client. Sans cela, les formules s'afficheraient en texte brut.
 */
export function normalizeMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex: string) => `$$${tex.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, tex: string) => `$${tex.trim()}$`);
}

/**
 * Appel générique au fournisseur d'IA configuré (API compatible OpenAI).
 * Utilisé par le tuteur, la traduction et le coach de quiz.
 * Lève une Error si le fournisseur est absent, injoignable ou silencieux.
 */
export async function chatCompletion(messages: ChatMessageLike[], options: ChatCompletionOptions = {}): Promise<string> {
  if (!hasAiProvider()) throw new Error('assistant indisponible');
  const defaults = PROVIDER_DEFAULTS[config.ai.provider] ?? PROVIDER_DEFAULTS.openai;
  const baseUrl = (config.ai.baseUrl || defaults.baseUrl).replace(/\/$/, '');
  const model = config.ai.model || defaults.model;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? config.ai.maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API IA ${response.status} ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Réponse IA vide');
    return sanitizeModelContent(normalizeMathDelimiters(content));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Appel en continu (streaming SSE) au fournisseur compatible OpenAI.
 * Chaque fragment de texte arrive via `onDelta` ; la fonction retourne le
 * texte complet (normalisé et nettoyé comme `chatCompletion`).
 */
export async function chatCompletionStream(
  messages: ChatMessageLike[],
  onDelta: (text: string) => void,
  options: ChatCompletionOptions & { signal?: AbortSignal } = {},
): Promise<string> {
  if (!hasAiProvider()) throw new Error('assistant indisponible');
  const defaults = PROVIDER_DEFAULTS[config.ai.provider] ?? PROVIDER_DEFAULTS.openai;
  const baseUrl = (config.ai.baseUrl || defaults.baseUrl).replace(/\/$/, '');
  const model = config.ai.model || defaults.model;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
  // Relie l'annulation externe (déconnexion de l'élève) à l'appel fournisseur.
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? config.ai.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`API IA ${response.status} ${text.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Trame SSE : blocs séparés par une ligne vide.
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf('\n\n');

        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const piece = parsed.choices?.[0]?.delta?.content;
            if (piece) {
              full += piece;
              onDelta(piece);
            }
          } catch {
            /* fragment JSON incomplet : ignoré, la suite le rattrapera */
          }
        }
      }
    }

    if (!full.trim()) throw new Error('Réponse IA vide');
    return sanitizeModelContent(normalizeMathDelimiters(full));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

class OpenAiCompatibleProvider implements TutorProvider {
  readonly id: string;
  readonly configured: boolean;
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor(id: string, apiKey: string) {
    this.id = id;
    this.apiKey = apiKey;
    const defaults = PROVIDER_DEFAULTS[id] ?? PROVIDER_DEFAULTS.openai;
    this.baseUrl = (config.ai.baseUrl || defaults.baseUrl).replace(/\/$/, '');
    this.model = config.ai.model || defaults.model;
    this.configured = Boolean(apiKey);
  }

  private buildMessages(request: TutorRequest, student?: StudentContext): ChatMessageLike[] {
    return [
      { role: 'system', content: buildSystemPrompt(request, student?.name, student?.level, student?.subject) },
      ...(request.history ?? []).slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: request.message },
    ];
  }

  async complete(request: TutorRequest, student?: StudentContext): Promise<TutorResponse> {
    const content = await chatCompletion(this.buildMessages(request, student));
    return { content, provider: `${this.id}:${this.model}`, offline: false };
  }

  async completeStream(
    request: TutorRequest,
    student: StudentContext | undefined,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<TutorResponse> {
    const content = await chatCompletionStream(this.buildMessages(request, student), onDelta, { signal });
    return { content, provider: `${this.id}:${this.model}`, offline: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Tuteur local (hors-ligne)                                          */
/* ------------------------------------------------------------------ */

interface SubjectHints {
  keywords: string[];
  recall: string[];
  steps: string[];
  pitfalls: string[];
  exerciseSource?: { source: string; params?: Record<string, unknown> };
}

const SUBJECT_HINTS: Record<string, SubjectHints> = {
  mathematiques: {
    keywords: ['math', 'fonction', 'dérivé', 'équation', 'calcul', 'fraction', 'géométrie', 'probabilit', 'vecteur', 'suite', 'intégrale', 'pourcentage', 'théorème', 'pythagore', 'trigono'],
    recall: [
      '**Équation du premier degré** — isoler $x$ : $ax + b = c \\iff x = \\dfrac{c - b}{a}$ (avec $a \\ne 0$).',
      '**Second degré** — $ax^{2} + bx + c = 0$ : $\\Delta = b^{2} - 4ac$. Si $\\Delta > 0$, deux solutions $x = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}$.',
      '**Dérivation** — $(x^{n})\' = n x^{n-1}$, $(uv)\' = u\'v + uv\'$, $\\left(\\dfrac{u}{v}\\right)\' = \\dfrac{u\'v - uv\'}{v^{2}}$.',
      '**Suites** — arithmétique : $u_n = u_0 + nr$ ; géométrique : $u_n = u_0 q^{n}$.',
      '**Probabilités** — $P(A \\cap B) = P(A) \\times P_A(B)$ ; $P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$.',
    ],
    steps: [
      'Lis l’énoncé deux fois et souligne les données et la question posée.',
      'Écris ce que tu cherches sous forme mathématique (inconnue, formule).',
      'Choisis l’outil adapté (équation, dérivée, théorème…) et justifie-le.',
      'Applique la méthode en détaillant chaque ligne de calcul.',
      'Vérifie le résultat : ordre de grandeur, signe, test dans l’énoncé.',
    ],
    pitfalls: [
      'Diviser par une expression qui peut valoir 0.',
      'Oublier d’inverser le sens d’une inégalité quand on divise par un négatif.',
      'Confondre $f(x)$ (image) et $x$ (antécédent).',
      'Arrondir trop tôt dans un calcul en chaîne.',
    ],
    exerciseSource: { source: 'math.function.value' },
  },
  francais: {
    keywords: ['français', 'grammaire', 'conjugaison', 'orthographe', 'texte', 'poème', 'roman', 'dissertation', 'commentaire', 'figure de style', 'auteur', 'siècle'],
    recall: [
      '**Figures de style** — comparaison (avec outil), métaphore (sans outil), personnification, hyperbole, litote, antithèse, oxymore.',
      '**Analyse** — toujours : procédé → citation → effet produit → interprétation.',
      '**Conjugaison** — participe passé avec *avoir* : accord seulement si le COD est placé avant ; avec *être* : accord avec le sujet.',
      '**Plan de dissertation** — thèse / antithèse / dépassement, ou thématique progressif.',
    ],
    steps: [
      'Identifie la nature du document (texte, image, corpus) et son contexte.',
      'Repère le thème, la thèse de l’auteur et les procédés employés.',
      'Cite précisément le texte entre guillemets pour chaque remarque.',
      'Explique l’effet produit sur le lecteur, puis l’intention de l’auteur.',
      'Organise ta réponse en paragraphes : une idée par paragraphe.',
    ],
    pitfalls: [
      'La paraphrase : raconter au lieu d’analyser.',
      'Une citation sans explication.',
      'Oublier de relier l’analyse à la problématique.',
      'Confondre auteur, narrateur et personnage.',
    ],
    exerciseSource: { source: 'fr.figures' },
  },
  'physique-chimie': {
    keywords: ['physique', 'chimie', 'force', 'vitesse', 'énergie', 'molécule', 'mole', 'ph', 'courant', 'tension', 'onde', 'lumière', 'atome', 'réaction'],
    recall: [
      '**Mécanique** — $v = \\dfrac{d}{t}$, $P = m g$, $E_c = \\dfrac{1}{2} m v^{2}$, $\\sum \\vec{F} = m \\vec{a}$.',
      '**Électricité** — $U = R I$, $P = U I$, $E = P \\Delta t$.',
      '**Ondes** — $\\lambda = \\dfrac{v}{f}$, $T = \\dfrac{1}{f}$.',
      '**Chimie** — $n = \\dfrac{m}{M}$, $C = \\dfrac{n}{V}$, $\\mathrm{pH} = -\\log[\\mathrm{H_3O^{+}}]$, $PV = nRT$.',
    ],
    steps: [
      'Liste les données avec leurs unités et convertis tout dans le système international.',
      'Écris la relation littérale (avec les lettres) avant de calculer.',
      'Isole la grandeur cherchée algébriquement.',
      'Applique numériquement, puis vérifie l’unité et l’ordre de grandeur du résultat.',
      'Rédige une phrase de conclusion avec l’unité et le nombre de chiffres significatifs cohérent.',
    ],
    pitfalls: [
      'Oublier de convertir (km/h → m/s, mL → L, g → kg, cm³ → m³).',
      'Confondre masse (kg) et poids (N).',
      'Appliquer une formule sans vérifier ses conditions de validité.',
      'Donner un résultat sans unité.',
    ],
    exerciseSource: { source: 'phys.speed' },
  },
  svt: {
    keywords: ['svt', 'cellule', 'adn', 'gène', 'évolution', 'immunit', 'photosynthèse', 'géologie', 'écosystème', 'enzyme', 'neurone'],
    recall: [
      '**Cellule** — membrane, cytoplasme, noyau ; mitochondries (respiration), chloroplastes (photosynthèse).',
      '**Génétique** — ADN → ARNm (transcription) → protéine (traduction) ; un gène peut avoir plusieurs allèles.',
      '**Évolution** — mutation + sélection naturelle + dérive génétique modifient les fréquences alléliques.',
      '**Immunité** — innée (rapide, non spécifique) puis adaptative (lymphocytes, anticorps, mémoire).',
    ],
    steps: [
      'Observe le document : titre, légende, unités, échelle.',
      'Décris objectivement ce que tu vois avant d’interpréter.',
      'Relie les observations à une notion du cours.',
      'Formule une explication testable, en citant les indices du document.',
      'Conclue en répondant exactement à la question posée.',
    ],
    pitfalls: [
      'Interpréter avant de décrire.',
      'Confondre gène, allèle et chromosome.',
      'Oublier que la sélection naturelle agit sur des variations préexistantes.',
    ],
    exerciseSource: { source: 'svt.termes' },
  },
  'histoire-geographie': {
    keywords: ['histoire', 'géographie', 'guerre', 'révolution', 'siècle', 'capitale', 'europe', 'monde', 'population', 'ville', 'climat', 'république'],
    recall: [
      '**Repères** — 1789 Révolution française, 1848 IIᵉ République, 1914-1918 et 1939-1945 guerres mondiales, 1958 Vᵉ République, 1989 chute du mur de Berlin.',
      '**Analyse de document** — nature, auteur, date, contexte, destinataire, intention, portée, limites.',
      '**Croquis** — titre, légende hiérarchisée, figurés ponctuels / linéaires / de surface.',
    ],
    steps: [
      'Présente le document (nature, auteur, date, contexte).',
      'Dégage l’idée principale et la thèse de l’auteur.',
      'Explique les éléments du document à la lumière du contexte historique.',
      'Critique le document : que dit-il, que tait-il, dans quel but ?',
      'Conclus sur son intérêt pour l’historien ou le géographe.',
    ],
    pitfalls: [
      'Réciter le cours sans utiliser le document.',
      'Confondre la date du document et la date des faits décrits.',
      'Oublier de contextualiser.',
    ],
    exerciseSource: { source: 'hg.histoire.dates' },
  },
  philosophie: {
    keywords: ['philo', 'conscience', 'liberté', 'vérité', 'justice', 'bonheur', 'devoir', 'état', 'art', 'temps', 'dissertation'],
    recall: [
      '**Méthode** — analyser les termes, dégager un paradoxe, construire une alternative, dépasser par une distinction conceptuelle.',
      '**Repères** — Descartes (cogito), Kant (impératif catégorique), Rousseau (volonté générale), Marx (matérialisme), Sartre (existence précède l’essence).',
      '**Explication de texte** — thème, thèse, problème, mouvements, puis analyse des notions.',
    ],
    steps: [
      'Définis chaque terme du sujet (sens commun puis sens philosophique).',
      'Fais apparaître la difficulté : deux réponses également défendables.',
      'Construis l’alternative et examine successivement chaque thèse.',
      'Mobilise une référence précise pour trancher ou déplacer le problème.',
      'Conclus en répondant clairement à la problématique.',
    ],
    pitfalls: [
      'Le placage de cours : réciter un auteur sans répondre au sujet.',
      'Juxtaposer des opinions sans les justifier.',
      'Oublier de définir les notions.',
    ],
    exerciseSource: { source: 'philo.concepts' },
  },
  anglais: {
    keywords: ['anglais', 'english', 'verbe irrégulier', 'phrasal', 'traduction', 'anglais'],
    recall: [
      '**Temps** — present simple (habitude), present continuous (en cours), preterit (passé révolu), present perfect (bilan/lien avec le présent).',
      '**Modaux** — must (obligation), mustn’t (interdiction), have to (nécessité), should (conseil).',
      '**Faux amis** — actually = en fait, library = bibliothèque, to attend = assister à.',
    ],
    steps: [
      'Identifie le temps et la personne du verbe.',
      'Repère les marqueurs temporels (yesterday, since, every day…).',
      'Vérifie l’ordre sujet-verbe-complément et les auxiliaires do/does/did.',
      'Relis en contrôlant les terminaisons (-s, -ed, -ing) et les irréguliers.',
    ],
    pitfalls: ['Oublier le -s à la 3ᵉ personne du singulier.', 'Confondre since et for.', 'Utiliser le preterit pour une action en cours.'],
    exerciseSource: { source: 'en.irregular' },
  },
  espagnol: {
    keywords: ['espagnol', 'español', 'conjugaison espagnol'],
    recall: [
      '**Présent** — verbes en -ar : -o, -as, -a, -amos, -áis, -an ; en -er/-ir : -o, -es, -e…',
      '**ser / estar** — ser pour l’essence, estar pour l’état et la localisation.',
    ],
    steps: ['Identifie le groupe du verbe (-ar, -er, -ir).', 'Choisis le temps demandé.', 'Applique la terminaison à la personne.', 'Vérifie les irrégularités (e→ie, o→ue).'],
    pitfalls: ['Confondre ser et estar.', 'Oublier l’accent sur certaines formes (estudié, está).'],
    exerciseSource: { source: 'es.conjugaison' },
  },
  nsi: {
    keywords: ['nsi', 'python', 'algorithme', 'binaire', 'sql', 'réseau', 'code', 'informatique', 'programmation'],
    recall: [
      '**Complexité** — O(1) constant, O(log n) dichotomie, O(n) parcours, O(n²) doubles boucles, O(n log n) tri fusion.',
      '**Python** — `range(a, b)` exclut b ; les listes sont indicées à partir de 0.',
      '**SQL** — `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY`.',
      '**Réseaux** — DNS traduit un nom en IP, TCP garantit l’ordre, HTTP(S) transporte les pages.',
    ],
    steps: [
      'Lis le code ligne par ligne en suivant l’état des variables.',
      'Pour une boucle, écris un tableau de trace (itération, valeur).',
      'Vérifie les conditions d’arrêt (risque de boucle infinie).',
      'Teste ton raisonnement sur un petit jeu de données.',
    ],
    pitfalls: ['Confondre indice et valeur.', 'Oublier que `range` exclut la borne supérieure.', 'Mélanger pile (LIFO) et file (FIFO).'],
    exerciseSource: { source: 'nsi.python' },
  },
  ses: {
    keywords: ['ses', 'économie', 'sociologie', 'marché', 'croissance', 'chômage', 'inflation', 'entreprise', 'social'],
    recall: [
      '**Marché** — le prix d’équilibre égalise offre et demande.',
      '**Macro** — PIB, croissance, inflation, chômage structurel vs conjoncturel.',
      '**Calculs** — taux de variation = ((valeur finale − initiale) / initiale) × 100 ; coefficient = finale / initiale.',
    ],
    steps: [
      'Définis précisément les notions du sujet.',
      'Identifie les mécanismes en jeu et leurs enchaînements causaux.',
      'Appuie chaque argument sur une donnée chiffrée ou un auteur.',
      'Nuance : montre les limites du mécanisme.',
    ],
    pitfalls: ['Réciter le cours sans l’articuler au sujet.', 'Utiliser un chiffre sans source ni date.', 'Confondre corrélation et causalité.'],
    exerciseSource: { source: 'ses.concepts' },
  },
};

function detectSubject(message: string): string | null {
  const text = message.toLowerCase();
  let best: { subject: string; score: number } | null = null;
  for (const [subject, hints] of Object.entries(SUBJECT_HINTS)) {
    const score = hints.keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0);
    if (score > 0 && (!best || score > best.score)) best = { subject, score };
  }
  return best?.subject ?? null;
}

const SUBJECT_LABELS: Record<string, string> = {
  mathematiques: 'Mathématiques',
  francais: 'Français',
  'physique-chimie': 'Physique-Chimie',
  svt: 'SVT',
  'histoire-geographie': 'Histoire-Géographie',
  philosophie: 'Philosophie',
  anglais: 'Anglais',
  espagnol: 'Espagnol',
  nsi: 'NSI / Informatique',
  ses: 'SES',
};

function practiceQuestions(subjectId: string | null): string {
  const hints = subjectId ? SUBJECT_HINTS[subjectId] : null;
  const source = hints?.exerciseSource?.source ?? 'math.arithmetic';
  try {
    const questions = buildQuestions({ topicId: 'tutor-practice', source, count: 3 });
    if (!questions.length) return '';
    const lines = questions.map((question, index) => {
      const options = question.options?.map((option, i) => `- ${'ABCD'[i] ?? i + 1}. ${option}`).join('\n') ?? '';
      const answer = question.answer !== undefined ? `**${'ABCD'[question.answer] ?? question.answer + 1}**` : question.accept?.[0] ?? '';
      return [
        `**Exercice ${index + 1}.** ${question.prompt.replace(/\$/g, '')}`,
        options,
        `> ✅ Réponse : ${answer} — ${question.explanation.replace(/\$/g, '')}`,
      ].filter(Boolean).join('\n');
    });
    return `\n\n## Exercices d'entraînement\n\n${lines.join('\n\n')}\n`;
  } catch {
    return '';
  }
}

export class LocalTutor implements TutorProvider {
  readonly id = 'local';
  readonly configured = true;

  async complete(request: TutorRequest): Promise<TutorResponse> {
    const subjectId = request.subjectId && SUBJECT_HINTS[request.subjectId] ? request.subjectId : detectSubject(request.message);
    const hints = subjectId ? SUBJECT_HINTS[subjectId] : null;
    const subjectLabel = subjectId ? SUBJECT_LABELS[subjectId] ?? subjectId : 'matière non précisée';

    const parts: string[] = [];
    parts.push(
      `## Tuteur intégré EduMate\n\nVoici une aide complète et fiable pour ta demande : la méthode pas à pas, les rappels de cours utiles et des exercices corrigés.\n`,
    );
    parts.push(`**Ta demande** : ${request.message.trim().slice(0, 400)}\n`);
    parts.push(`**Matière détectée** : ${subjectLabel} · **Mode** : ${request.mode}\n`);

    if (hints) {
      parts.push('## Rappels essentiels\n');
      parts.push(hints.recall.map((item) => `- ${item}`).join('\n'));
      parts.push('\n## Méthode pas à pas\n');
      parts.push(hints.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
      parts.push('\n## Pièges à éviter\n');
      parts.push(hints.pitfalls.map((item) => `- ${item}`).join('\n'));
    } else {
      parts.push('## Méthode générale\n');
      parts.push(
        [
          '1. **Comprendre** : relis la consigne, souligne les mots-clés et reformule la question avec tes mots.',
          '2. **Mobiliser** : note au brouillon les définitions, formules ou repères qui peuvent servir.',
          '3. **Chercher** : essaie une piste simple, vérifie sur un exemple, ajuste.',
          '4. **Rédiger** : une idée par paragraphe, chaque affirmation justifiée.',
          '5. **Vérifier** : relis en cherchant activement une erreur (unités, accords, signe, hors-sujet).',
        ].join('\n'),
      );
    }

    if (request.mode === 'exercices' || request.mode === 'questions') {
      parts.push(practiceQuestions(subjectId));
    }

    parts.push('\n## Prochaine étape\n');
    parts.push(
      `- Ouvre le quiz **${subjectLabel}** dans la section Quiz pour t’entraîner sur cette notion (les questions sont générées et corrigées automatiquement).`,
    );
    parts.push('- Reformule ta question en précisant la notion exacte et ton niveau : je pourrai cibler davantage ma réponse.');

    return { content: parts.join('\n'), provider: 'edumate-local', offline: true };
  }
}

/* ------------------------------------------------------------------ */
/*  Sélection du fournisseur                                           */
/* ------------------------------------------------------------------ */

let provider: TutorProvider | null = null;

const LOCAL_FALLBACK_NOTE =
  "> 💡 Petite indisponibilité momentanée : voici l'aide du tuteur intégré, avec la méthode et les rappels essentiels.\n\n";

/** Découpe un texte en fragments pour simuler un affichage progressif. */
async function emitInChunks(text: string, onDelta: (piece: string) => void, chunkSize = 48): Promise<void> {
  for (let index = 0; index < text.length; index += chunkSize) {
    onDelta(text.slice(index, index + chunkSize));
    // Micro-pause : le client voit le texte arriver, comme avec un vrai modèle.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function getTutorProvider(): TutorProvider {
  if (provider) return provider;
  if (hasAiProvider()) {
    const remote = new OpenAiCompatibleProvider(config.ai.provider, config.ai.apiKey);
    // Repli automatique sur le tuteur local en cas d'échec de l'API.
    provider = {
      id: remote.id,
      configured: true,
      complete: async (request: TutorRequest, student?: StudentContext) => {
        try {
          return await remote.complete(request, student);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('[EduMate] IA indisponible, repli sur le tuteur local :', message);
          const fallback = new LocalTutor();
          const result = await fallback.complete(request);
          return { ...result, content: `${LOCAL_FALLBACK_NOTE}${result.content}` };
        }
      },
      completeStream: async (request, student, onDelta, signal) => {
        let streamed = '';
        try {
          return await remote.completeStream(
            request,
            student,
            (piece) => {
              streamed += piece;
              onDelta(piece);
            },
            signal,
          );
        } catch (error) {
          // L'élève a lui-même arrêté la génération : on renvoie ce qui existe.
          if (signal?.aborted) {
            return {
              content: sanitizeModelContent(normalizeMathDelimiters(streamed)) || '_(réponse interrompue)_',
              provider: `${remote.id}:${config.ai.model || 'stream'}`,
              offline: false,
            };
          }
          const message = error instanceof Error ? error.message : String(error);
          // Une réponse substantielle est déjà affichée : on la conserve et on
          // signale la coupure, plutôt que de tout remplacer sous les yeux de
          // l'élève.
          if (streamed.trim().length > 120) {
            console.warn('[EduMate] Flux IA interrompu en cours de réponse :', message);
            const note = '\n\n---\n\n> ⚠️ *La connexion au modèle a été interrompue avant la fin. Le contenu ci-dessus reste valable ; tu peux régénérer une réponse complète.*';
            onDelta(note);
            return {
              content: sanitizeModelContent(normalizeMathDelimiters(streamed)) + note,
              provider: `${remote.id}:${config.ai.model || 'stream'}`,
              offline: false,
            };
          }
          // Rien d'utilisable : repli complet sur le tuteur intégré.
          console.warn('[EduMate] IA indisponible, repli sur le tuteur local :', message);
          const fallback = new LocalTutor();
          const result = await fallback.complete(request);
          const content = `${LOCAL_FALLBACK_NOTE}${result.content}`;
          await emitInChunks(content, onDelta);
          return { ...result, content };
        }
      },
    };
    return provider;
  }
  const local = new LocalTutor();
  provider = {
    id: local.id,
    configured: true,
    complete: (request) => local.complete(request),
    completeStream: async (request, _student, onDelta) => {
      const result = await local.complete(request);
      await emitInChunks(result.content, onDelta);
      return result;
    },
  };
  return provider;
}

export function providerInfo(): { provider: string; configured: boolean; model?: string } {
  if (hasAiProvider()) {
    const defaults = PROVIDER_DEFAULTS[config.ai.provider] ?? PROVIDER_DEFAULTS.openai;
    return { provider: config.ai.provider, configured: true, model: config.ai.model || defaults.model };
  }
  return { provider: 'local', configured: false };
}

export { SUBJECT_LABELS };
