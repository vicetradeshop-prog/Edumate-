/**
 * EduMate — Rendu du texte riche (Markdown léger + formules LaTeX).
 *
 * Deux contraintes fortes :
 *   1. Sécurité : tout le contenu est échappé avant transformation, donc
 *      aucune balise HTML injectée par le modèle ou l'utilisateur ne peut
 *      s'exécuter (protection XSS).
 *   2. Fidélité : les formules mathématiques ($...$, $$...$$) sont rendues
 *      par KaTeX, et les blocs de code sont préservés tels quels.
 */
import katex from 'katex';
import { htmlToMarkdown } from '../../shared/markdownSanitize.js';

/*
 * La feuille de style KaTeX est importée côté application (`main.tsx`) et non
 * ici : ce module reste ainsi utilisable dans un contexte Node (tests unitaires,
 * vérification du rendu) sans résolution de fichier CSS.
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rendu d'une formule LaTeX.
 *
 * `throwOnError: true` (et non `false`) : avec `false`, KaTeX affiche les
 * formules invalides en ROUGE vif dans la conversation — l'élève croit à un
 * bug alors qu'il s'agit souvent d'un faux positif (symboles dollar de prix,
 * LaTeX approximatif du modèle…). Désormais, une formule invalide retombe sur
 * son texte brut : lisible, sans couleur d'erreur.
 */
function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      output: 'html',
    });
  } catch {
    const dollars = displayMode ? '$$' : '$';
    return escapeHtml(`${dollars}${tex}${dollars}`);
  }
}

/** Applique les transformations inline (gras, italique, code, liens). */
function inlineMarkdown(text: string): string {
  return text
    // `code`
    .replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`)
    // **gras**
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // *italique*
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    // ~~barré~~
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    // [libellé](https://…) — uniquement http(s), jamais javascript:
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
    );
}

/** Convertit une liste de lignes Markdown en HTML de bloc. */
function blocksToHtml(lines: string[]): string {
  const html: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const joined = paragraph.join(' ');
    // Une formule bloc seule sur sa ligne : posée telle quelle, sans <p>
    // (un <div> KaTeX dans un <p> est un imbriquage invalide que le
    // navigateur « réparerait » en cassant le paragraphe).
    if (/^\u0000MATH\d+\u0000$/.test(joined)) {
      html.push(joined);
      paragraph = [];
      return;
    }
    // \u0001 = sentinelle de saut de ligne forcé (« <br> » du modèle ou deux
    // espaces de fin de ligne en Markdown). Remplacée APRÈS les transformations
    // inline pour ne jamais interférer avec elles.
    html.push(`<p>${inlineMarkdown(joined).replace(/\u0001/g, '<br />')}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (!list) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = (): void => {
    if (!quote.length) return;
    html.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`);
    quote = [];
  };
  const flushAll = (): void => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const rawLine of lines) {
    // Saut de ligne forcé Markdown : deux espaces (ou « \ ») en fin de ligne.
    const hardBreak = /( {2,}|\\)$/.test(rawLine) || rawLine.includes('\u0001');
    const line = rawLine.replace(/\s+$/, '');

    if (!line.trim() && !line.includes('\u0001')) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = Math.min(4, heading[1].length + 1); // h2..h5 pour rester dans la hiérarchie de la page
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll();
      html.push('<hr />');
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();

    const unordered = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ordered[2]);
      continue;
    }
    flushList();

    // Ligne de tableau simple : | a | b |
    if (line.startsWith('|') && line.endsWith('|')) {
      flushParagraph();
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue; // ligne de séparation
      const tag = html.at(-1)?.startsWith('<table') ? 'td' : 'th';
      if (tag === 'th') html.push('<table>');
      html.push(`<tr>${cells.map((cell) => `<${tag}>${inlineMarkdown(cell)}</${tag}>`).join('')}</tr>`);
      continue;
    }

    paragraph.push(hardBreak && !line.endsWith('\u0001') ? `${line}\u0001` : line);
  }
  flushAll();

  // Ferme une table ouverte
  const joined = html.join('\n');
  return joined.includes('<table>') && !joined.includes('</table>') ? `${joined}\n</table>` : joined;
}

/**
 * Convertit un texte (Markdown + LaTeX) en HTML sûr.
 * Les blocs ``` sont extraits avant tout traitement, puis réinjectés.
 */
export function renderRichText(source: string): string {
  if (!source) return '';
  const codeBlocks: string[] = [];

  // 1) Isoler les blocs de code pour ne pas les transformer.
  let text = source.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_match, lang: string | undefined, code: string) => {
    const index = codeBlocks.length;
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000CODE${index}\u0000`;
  });

  // 2) Convertir le HTML de mise en forme produit par les modèles (<br>,
  //    <details>, <summary>, <strong>…) en Markdown AVANT l'échappement :
  //    plus jamais de balises affichées brutes dans la conversation. Les
  //    balises non reconnues (img, script…) ne sont pas converties : elles
  //    restent échappées à l'étape suivante (protection XSS inchangée).
  text = htmlToMarkdown(text);

  // 3) Extraire et rendre les formules LaTeX AVANT tout échappement, puis
  //    ISOLER le rendu sous forme de jeton.
  //    🔴 Ordre crucial : échapper d'abord corrompait le LaTeX (apostrophes
  //    en &#39;, comparaisons en &gt;) et KaTeX partait en erreur — c'était
  //    le fameux « texte rouge » visible dans les réponses.
  //    Le jeton règle un second problème : le HTML KaTeX contient des retours
  //    à la ligne (SVG des racines carrées) que le découpage Markdown de
  //    l'étape 5 déchiquetait (attribut `d` des <path> tronqué).
  //    Garde-fou anti faux positifs : une formule en ligne ne commence ni ne
  //    termine par une espace (« 5 $ et 10 $ » reste du texte, pas des maths).
  const mathBlocks: string[] = [];
  const stashMath = (_m: string, tex: string, displayMode: boolean): string => {
    const index = mathBlocks.length;
    mathBlocks.push(renderMath(tex.trim(), displayMode));
    return `\u0000MATH${index}\u0000`;
  };
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, tex: string) => stashMath(m, tex, true))
    .replace(/\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (m, tex: string) => stashMath(m, tex, false))
    // Tolérance aux \( \) et \[ \]
    .replace(/\\\[([\s\S]+?)\\\]/g, (m, tex: string) => stashMath(m, tex, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, tex: string) => stashMath(m, tex, false));

  // 4) Échapper le HTML du reste du document (les jetons ne contiennent
  //    aucun caractère échappable : ils traversent cette étape intacts).
  text = escapeHtml(text);

  // 5) Markdown par blocs.
  let html = blocksToHtml(text.split(/\r?\n/));

  // 6) Réinjecter le code et les formules.
  html = html
    .replace(/\u0000CODE(\d+)\u0000/g, (_m, index: string) => codeBlocks[Number(index)] ?? '')
    .replace(/\u0000MATH(\d+)\u0000/g, (_m, index: string) => mathBlocks[Number(index)] ?? '');

  return html;
}

/** Rendu KaTeX autonome (pour les énoncés de quiz). */
export function renderMathText(source: string): string {
  if (!source) return '';
  const codeBlocks: string[] = [];
  let text = source.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`);
    return `\u0000CODE${index}\u0000`;
  });
  const mathBlocks: string[] = [];
  const stashMath = (_m: string, tex: string, displayMode: boolean): string => {
    const index = mathBlocks.length;
    mathBlocks.push(renderMath(tex.trim(), displayMode));
    return `\u0000MATH${index}\u0000`;
  };
  // Formules extraites AVANT l'échappement (mêmes raisons que renderRichText).
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, tex: string) => stashMath(m, tex, true))
    .replace(/\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (m, tex: string) => stashMath(m, tex, false));
  text = escapeHtml(text);
  text = inlineMarkdown(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />');
  const html = `<p>${text}</p>`;
  return html
    .replace(/\u0000CODE(\d+)\u0000/g, (_m, index: string) => codeBlocks[Number(index)] ?? '')
    .replace(/\u0000MATH(\d+)\u0000/g, (_m, index: string) => mathBlocks[Number(index)] ?? '');
}
