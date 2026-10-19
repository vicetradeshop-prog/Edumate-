/**
 * EduMate — Nettoyage du contenu produit par les modèles d'IA.
 *
 * Les modèles (Groq, OpenAI, Mistral, xAI…) mélangent parfois du HTML dans
 * leurs réponses Markdown : `<br>`, `<details>`, `<summary>`, `<strong>`…
 * Côté client, tout le HTML est échappé (protection XSS) : ces balises
 * s'affichaient donc BRUTES dans la conversation (« <br> » visible à l'écran).
 *
 * Ce module convertit les balises de MISE EN FORME (liste blanche) en
 * équivalents Markdown AVANT l'échappement. Les balises inconnues ou
 * dangereuses (`<img>`, `<script>`, `<iframe>`…) ne sont jamais converties :
 * elles restent échappées et affichées comme texte inoffensif.
 *
 * Utilisé :
 *   - côté serveur (lib/ai.ts) : l'historique persisté est déjà propre ;
 *   - côté client (lib/richtext.ts) : filet de sécurité au rendu.
 */

/**
 * Convertit les balises HTML courantes des modèles en Markdown.
 * Ne traite QUE la liste blanche ; tout le reste est laissé intact
 * (et sera échappé par le rendu, donc inoffensif).
 */
export function htmlToMarkdown(source: string): string {
  if (!source || !/[<&]/.test(source)) return source;
  let text = source;

  /* --- Sauts de ligne et séparateurs ---------------------------------- */
  /*
   * `<br>` devient « \u0001 + retour à la ligne » : \u0001 est la sentinelle
   * de SAUT DE LIGNE FORCÉ du rendu riche (équivalent des deux espaces de fin
   * de ligne en Markdown). Un simple \n aurait été recollé au paragraphe.
   */
  text = text.replace(/<br\s*\/?>/gi, '\u0001\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  /* --- Mise en forme inline -------------------------------------------- */
  text = text.replace(/<\/?(?:strong|b)\s*>/gi, '**');
  text = text.replace(/<\/?(?:em|i)\s*>/gi, '*');
  text = text.replace(/<\/?(?:del|s|strike)\s*>/gi, '~~');
  text = text.replace(/<\/?u\s*>/gi, '');
  text = text.replace(/<\/?(?:sub|sup|small|mark|font[^>]*|span[^>]*|center|label[^>]*|abbr[^>]*|kbd|var|cite|q)\s*>/gi, '');

  /* --- Code : <pre><code>…</code></pre> → bloc Markdown ---------------- */
  text = text.replace(/<pre[^>]*>\s*(?:<code[^>]*>)?/gi, '\n\n```\n');
  text = text.replace(/(?:<\/code>\s*)?<\/pre>/gi, '\n```\n\n');
  text = text.replace(/<\/?code\s*>/gi, '`');

  /* --- Titres ------------------------------------------------------------ */
  text = text.replace(/<h1[^>]*>/gi, '\n\n# ');
  text = text.replace(/<h2[^>]*>/gi, '\n\n## ');
  text = text.replace(/<h3[^>]*>/gi, '\n\n### ');
  text = text.replace(/<h([4-6])[^>]*>/gi, '\n\n#### ');
  text = text.replace(/<\/h[1-6]\s*>/gi, '\n\n');

  /* --- Paragraphes et conteneurs ----------------------------------------- */
  text = text.replace(/<\/p\s*>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/?(?:div|section|article|main|figure|figcaption|aside|header|footer)[^>]*>/gi, '\n');

  /* --- Listes -------------------------------------------------------------- */
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<\/ul\s*>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  text = text.replace(/<\/ol\s*>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/<\/li\s*>/gi, '');

  /* --- Citations ------------------------------------------------------------ */
  text = text.replace(/<blockquote[^>]*>/gi, '\n> ');
  text = text.replace(/<\/blockquote\s*>/gi, '\n');

  /* --- Blocs dépliants (détails de correction, notamment) ------------------- */
  text = text.replace(/<details[^>]*>/gi, '\n');
  text = text.replace(/<\/details\s*>/gi, '\n');
  text = text.replace(/<summary[^>]*>/gi, '\n**');
  text = text.replace(/<\/summary\s*>/gi, '**\n');

  /* --- Tableaux : <tr><td>a</td></tr> → | a | (Markdown) ------------------- */
  text = text.replace(/<\/?(?:table|thead|tbody|tfoot)[^>]*>/gi, '\n');
  text = text.replace(/<tr[^>]*>/gi, '\n| ');
  text = text.replace(/<\/tr\s*>/gi, '');
  text = text.replace(/<\/t([hd])\s*>/gi, ' | ');
  text = text.replace(/<t([hd])[^>]*>/gi, '');

  /* --- Liens : uniquement http(s) et mailto, sinon texte seul --------------- */
  text = text.replace(
    /<a\s+[^>]*href\s*=\s*["']?(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+)["']?[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_match, href: string, label: string) => `[${label.replace(/\s+/g, ' ').trim()}](${href})`,
  );
  text = text.replace(/<\/?a[^>]*>/gi, '');

  /* --- Normalisation : éviter les lignes vides en cascade ------------------- */
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\*\*\s+\*\*/g, '').replace(/(?<!\*)\*\*\*(?!\*)/g, '**');

  return text.trim();
}

/**
 * Supprime les artefacts de « réflexion » que certains modèles laissent
 * échapper (balises de pensée, préfixes parasites), sans toucher au contenu
 * pédagogique.
 */
export function stripModelArtifacts(source: string): string {
  if (!source) return source;
  let text = source;
  // Balises de raisonnement internes (jamais destinées à l'élève).
  text = text.replace(/<(thinking|reasoning|analysis|thought|scratchpad)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  text = text.replace(/<\/?(?:thinking|reasoning|analysis|thought|scratchpad)\b[^>]*>/gi, '');
  // Séquences de contrôle résiduelles.
  text = text.replace(/<\|[^|>]{0,40}\|>/g, '');
  return text;
}

/** Nettoyage complet appliqué aux réponses des modèles avant persistance/rendu. */
export function sanitizeModelContent(source: string): string {
  return htmlToMarkdown(stripModelArtifacts(source ?? ''));
}
