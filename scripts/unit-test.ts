/**
 * EduMate — Tests unitaires des modules critiques (sans framework).
 *
 * Couvre : sécurité du rendu riche, formatage, validation, hachage des mots
 * de passe, jetons de session, stockage, calcul de progression, détection de
 * langue, moteur de questions et banques de données.
 *
 * Lancement : npm run test:unit
 */
import assert from 'node:assert/strict';

import { renderMathText, renderRichText } from '../src/client/lib/richtext.js';
import { encouragement, formatClock, formatDayLabel, formatDuration, formatNumber, formatPercent, isoDate, starsFor } from '../src/client/lib/format.js';
import { TRACKS } from '../src/client/lib/music.js';
import { LIMITS, normalizeEmail, passwordIssues } from '../src/server/lib/validate.js';
import { requireEmail, requirePassword } from '../src/server/lib/validation.js';
import { createToken, hashPassword, newId, verifyPassword, verifyToken } from '../src/server/lib/auth.js';
import { computeProgress } from '../src/server/lib/store.js';
import { buildQuestions, familyPool, FAMILIES } from '../src/server/content/index.js';
import { detectLanguage, LANGUAGES } from '../src/server/lib/languages.js';
import { conjugateFrench, FRENCH_VERBS } from '../src/server/content/data/french.js';
import { ENGLISH_VERBS } from '../src/server/content/data/languages.js';
import { derivative, evaluate, simplify, toLatex, add, mul, num, pow, variable } from '../src/server/content/symbolic.js';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => {
          passed += 1;
        },
        (error: unknown) => {
          failures.push(`${name} : ${(error as Error).message}`);
        },
      );
      return;
    }
    passed += 1;
  } catch (error) {
    failures.push(`${name} : ${(error as Error).message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Rendu riche (sécurité XSS + LaTeX)                                 */
/* ------------------------------------------------------------------ */

test('renderRichText échappe le HTML injecté', () => {
  const html = renderRichText('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'), 'balise img non échappée');
  assert.ok(html.includes('&lt;img'), 'entités HTML manquantes');
});

test('renderRichText n’autorise pas javascript: dans les liens', () => {
  const html = renderRichText('[piège](javascript:alert(1))');
  assert.ok(!html.includes('href="javascript'), 'lien javascript: accepté');
});

test('renderRichText convertit le Markdown de base', () => {
  const html = renderRichText('# Titre\n\n**gras** et *italique*\n\n- un\n- deux\n');
  assert.match(html, /<h2>Titre<\/h2>/);
  assert.match(html, /<strong>gras<\/strong>/);
  assert.match(html, /<em>italique<\/em>/);
  assert.match(html, /<ul>[\s\S]*<li>un<\/li>/);
});

test('renderRichText préserve les blocs de code', () => {
  const html = renderRichText('```python\nprint("<b>")\n```');
  assert.match(html, /<pre><code class="language-python">/);
  assert.ok(html.includes('&lt;b&gt;'), 'contenu du code non échappé');
});

test('renderRichText rend les formules LaTeX', () => {
  const html = renderRichText('Calculer $\\dfrac{3}{4} + 1$');
  assert.ok(html.includes('katex'), 'rendu KaTeX absent');
});

test('renderMathText gère les énoncés de quiz', () => {
  const html = renderMathText('Soit $f(x) = 2x + 1$');
  assert.ok(html.includes('katex'));
});

test('renderRichText convertit les <br> du modèle en vrais sauts de ligne', () => {
  const html = renderRichText('Première ligne<br>Deuxième ligne<br />Troisième');
  assert.ok(!html.includes('&lt;br'), 'balise <br> affichée brute');
  assert.ok(!html.includes('<br>Deux'), 'balise <br> injectée telle quelle');
  assert.equal((html.match(/<br \/>/g) ?? []).length, 2, 'sauts de ligne manquants');
});

test('renderRichText convertit <details>/<summary> en Markdown lisible', () => {
  const html = renderRichText('<details><summary>Réponse : B</summary>Parce que 2+2=4.</details>');
  assert.ok(!html.includes('&lt;details'), 'balise details affichée brute');
  assert.ok(!html.includes('&lt;summary'), 'balise summary affichée brute');
  assert.match(html, /<strong>Réponse : B<\/strong>/);
});

test('renderRichText convertit les balises de mise en forme courantes', () => {
  const html = renderRichText('<h3>Titre</h3><p>Texte <strong>gras</strong> et <em>italique</em>.</p><ul><li>un</li><li>deux</li></ul>');
  assert.ok(!/&lt;(h3|p|strong|em|ul|li)[ >]/.test(html), 'balises de mise en forme affichées brutes');
  assert.match(html, /<h4>Titre<\/h4>/);
  assert.match(html, /<strong>gras<\/strong>/);
  assert.match(html, /<em>italique<\/em>/);
  assert.match(html, /<li>un<\/li>/);
});

test('renderRichText neutralise une formule LaTeX invalide sans texte rouge', () => {
  const html = renderRichText('Valeur : $\\frac{1}{$ cassé');
  assert.ok(!html.includes('#cc0000'), 'formule invalide rendue en rouge');
  assert.ok(!html.includes('katex-error'), 'erreur KaTeX exposée');
});

test('renderRichText ne prend pas un prix en dollars pour une formule', () => {
  const html = renderRichText('Il coûte 5 $ et son frère 10 $ au marché.');
  assert.ok(!html.includes('katex'), 'faux positif : montant pris pour du LaTeX');
  assert.ok(html.includes('5 $'), 'texte du montant perdu');
});

test('renderRichText rend le LaTeX contenant apostrophes et comparaisons', () => {
  const html = renderRichText("Dérivation : $(x^n)' = n x^{n-1}$ et si $\\Delta > 0$, deux solutions.");
  // Aucune formule ne doit retomber en texte brut (ancien symptôme : rendu
  // rouge ou LaTeX visible). Les entités DANS le HTML KaTeX sont légitimes ;
  // on vérifie donc l'absence des fragments bruts d'origine.
  assert.ok(!html.includes('&#39;'), 'apostrophe échappée avant KaTeX');
  assert.ok(!html.includes('$(x^n)'), 'formule apostrophe non rendue');
  assert.ok(!html.includes('$\\Delta'), 'formule comparaison non rendue');
  assert.ok((html.match(/class="katex"/g) ?? []).length >= 2, 'formules non rendues par KaTeX');
});

test('renderRichText rend une racine carrée sans déchiqueter le SVG', () => {
  const html = renderRichText('Calculer $\\sqrt{2}$ puis $$\\sqrt{\\dfrac{1}{2}}$$');
  assert.ok(html.includes('katex'), 'racine non rendue');
  const pathBroken = /<path[^>]*d="[^"]*(<\/|<p>|<li)/.test(html);
  assert.ok(!pathBroken, 'SVG KaTeX déchiqueté par le Markdown');
});

test('lessonSuccess applique le seuil de 80 %', async () => {
  const { lessonSuccess } = await import('../src/server/lib/fiches.js');
  assert.equal(lessonSuccess(8, 10), true);
  assert.equal(lessonSuccess(7, 10), false, '70 % ne suffit plus : seuil 80 %');
  assert.equal(lessonSuccess(6, 10), false);
  assert.equal(lessonSuccess(5, 6), true);
  assert.equal(lessonSuccess(3, 3), true);
  assert.equal(lessonSuccess(0, 0), false);
  assert.equal(lessonSuccess(Number.NaN, 5), false);
});

test('priorités v2.5 : cases quiz/leçon, validation et raisons lisibles', async () => {
  const { notionPriority } = await import('../src/server/lib/planning.js');
  const { computeProgress } = await import('../src/server/lib/store.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topic = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!;
  const now = new Date().toISOString();
  const attempts = [
    { id: 'a1', userId: 'u', topicId: topic.id, subjectId: topic.subjectId, levelId: topic.levelId, themeName: topic.themeName, topicName: topic.name, score: 9, total: 10, durationSec: 60, answers: [], seed: 1, createdAt: now },
  ] as never;
  const summary = computeProgress(attempts as never);
  const sansLecon = notionPriority(topic.id, summary, 'moyen', 5, false)!;
  assert.equal(sansLecon.quizOk, true, 'quiz ≥ 80 % non détecté');
  assert.equal(sansLecon.lessonOk, false);
  assert.equal(sansLecon.validated, false, 'validation sans leçon');
  assert.ok(sansLecon.reasons.length >= 3, 'raisons absentes');
  const avecLecon = notionPriority(topic.id, summary, 'moyen', 5, true)!;
  assert.equal(avecLecon.validated, true, 'quiz + leçon = validée');
  assert.equal(avecLecon.level, 'maitrise', 'notion validée = priorité basse');
  assert.ok(avecLecon.weight <= sansLecon.weight, 'validation ne réduit pas la priorité');
});

test('buildFicheContent produit sections, formules et cartes mémo', async () => {
  const { buildFicheContent, buildFicheLesson } = await import('../src/server/lib/fiches.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topic = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques') ?? null;
  assert.ok(topic, 'sujet de test introuvable');
  const lesson = buildFicheLesson(topic!, null);
  const { sections, formulas, flashcards } = buildFicheContent(lesson);
  assert.ok(sections.length >= 3, `sections insuffisantes (${sections.length})`);
  assert.ok(sections.every((section) => section.items.length > 0 && section.title.length > 0), 'section vide');
  assert.ok(flashcards.length >= 4, `cartes mémo insuffisantes (${flashcards.length})`);
  assert.ok(flashcards.every((card) => card.front.trim().length > 3 && card.back.trim().length > 3), 'carte mémo vide');
  assert.ok(Array.isArray(formulas), 'formules absentes');
});

test('buildExamPlan : quiz blanc la veille, express le jour J, budget respecté', async () => {
  const { buildExamPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topicId = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!.id;
  const now = new Date();
  const exam = {
    id: 'exam-test',
    subjectId: 'mathematiques',
    title: 'Contrôle test',
    date: addDays(todayKey(now), 5),
    topics: [topicId],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const plan = buildExamPlan(exam, [], {}, now);
  assert.equal(plan.days.length, 6, 'un jour par jour avant le contrôle, inclus');
  const lastDay = plan.days[plan.days.length - 1];
  assert.equal(lastDay.sessions[0]?.activity, 'express', 'séance express le jour J');
  const veille = plan.days[plan.days.length - 2];
  assert.equal(veille.sessions[0]?.activity, 'quizblanc', 'quiz blanc la veille');
  for (const day of plan.days) {
    assert.ok(day.minutes <= 30, `budget quotidien dépassé (${day.minutes} min)`);
  }
  assert.ok(plan.notions.length >= 1, 'notions absentes');
  assert.ok(plan.notions[0].level === 'urgent' || plan.notions[0].level === 'travail', 'notion jamais jouée non prioritaire');
  assert.ok(plan.notions[0].weight > 0.3, 'poids de priorité incohérent');
  assert.ok(plan.totalMinutes > 0 && plan.totalQuestions > 0, 'totaux vides');
});

test('buildExamPlan : contrôle aujourd’hui → express seulement', async () => {
  const { buildExamPlan, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topicId = getCatalog().topics[0].id;
  const now = new Date();
  const exam = {
    id: 'exam-j0',
    subjectId: getCatalog().topics[0].subjectId,
    title: 'Contrôle aujourd’hui',
    date: todayKey(now),
    topics: [topicId],
    dailyMinutes: 20,
    selfLevel: 'zero' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const plan = buildExamPlan(exam, [], {}, now);
  assert.equal(plan.days.length, 1, 'un seul jour');
  assert.equal(plan.days[0].sessions.length, 1, 'une seule séance');
  assert.equal(plan.days[0].sessions[0].activity, 'express', 'express uniquement');
  assert.ok(plan.days[0].sessions[0].durationMin <= 10, 'séance express courte');
});

test('buildExamPlan : une séance reportée glisse au lendemain', async () => {
  const { buildExamPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topicId = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!.id;
  const now = new Date();
  const exam = {
    id: 'exam-report',
    subjectId: 'mathematiques',
    title: 'Contrôle report',
    date: addDays(todayKey(now), 4),
    topics: [topicId],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const base = buildExamPlan(exam, [], {}, now);
  const target = base.days[0].sessions[0];
  assert.ok(target, 'séance du jour absente');
  const withState = buildExamPlan(exam, [], { [target.id]: { status: 'postponed', postponedTimes: 1, updatedAt: now.toISOString() } }, now);
  const moved = withState.days[1]?.sessions.find((session) => session.id === target.id);
  assert.ok(moved, 'séance reportée introuvable au lendemain');
  assert.equal(moved?.status, 'postponed');
});

test('buildTodayPlan : contrôle seul → tout le budget du jour', async () => {
  const { buildTodayPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topicId = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!.id;
  const now = new Date();
  const exam = {
    id: 'exam-today',
    subjectId: 'mathematiques',
    title: 'Contrôle today',
    date: addDays(todayKey(now), 3),
    topics: [topicId],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const today = buildTodayPlan([exam], [], {}, now);
  assert.equal(today.capacityMinutes, 30);
  assert.ok(today.sessions.length >= 1, 'aucune séance aujourd’hui');
  assert.ok(today.nextExam?.topSession, 'prochaine séance absente');
});

test('planning : un quiz joué AVANT la création du contrôle ne valide rien', async () => {
  const { buildExamPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topic = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!;
  const now = new Date();
  const createdAt = new Date(Date.now() - 3600_000).toISOString(); // contrôle créé il y a 1 h
  const exam = {
    id: 'exam-auto',
    subjectId: topic.subjectId,
    title: 'Contrôle auto',
    date: addDays(todayKey(now), 4),
    topics: [topic.id],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt,
    updatedAt: createdAt,
  };
  const oldAttempt = {
    id: 'a-old',
    userId: 'u',
    topicId: topic.id,
    subjectId: topic.subjectId,
    levelId: topic.levelId,
    themeName: topic.themeName,
    topicName: topic.name,
    score: 5,
    total: 5,
    durationSec: 60,
    answers: [],
    seed: 1,
    createdAt: new Date(Date.now() - 7200_000).toISOString(), // AVANT le contrôle
  };
  const before = buildExamPlan(exam, [oldAttempt], {}, { now });
  assert.ok(before.days[0].sessions.every((s) => s.status !== 'done' || s.autoDone !== true), 'quiz antérieur a validé une séance');
  assert.equal(before.prepPercent, 0, 'progression gonflée par un quiz antérieur');

  const newAttempt = { ...oldAttempt, id: 'a-new', score: 4, total: 5, createdAt: new Date().toISOString() };
  const after = buildExamPlan(exam, [oldAttempt, newAttempt], {}, { now });
  const auto = after.days.flatMap((d) => d.sessions).find((s) => s.autoDone);
  assert.ok(auto, 'quiz lié postérieur non détecté');
  assert.equal(auto?.autoScore, 80, 'score du quiz lié absent');
  assert.ok(after.prepPercent > 0, 'progression non mise à jour');
});

test('planning : un quiz lié RATÉ sous 80 % ne valide PAS la séance', async () => {
  const { buildExamPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topic = getCatalog().topics.find((entry) => entry.subjectId === 'mathematiques')!;
  const now = new Date();
  const createdAt = new Date(Date.now() - 3600_000).toISOString();
  const exam = {
    id: 'exam-echec',
    subjectId: topic.subjectId,
    title: 'Contrôle échec',
    date: addDays(todayKey(now), 4),
    topics: [topic.id],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt,
    updatedAt: createdAt,
  };
  const failedAttempt = {
    id: 'a-fail',
    userId: 'u',
    topicId: topic.id,
    subjectId: topic.subjectId,
    levelId: topic.levelId,
    themeName: topic.themeName,
    topicName: topic.name,
    score: 2,
    total: 5,
    durationSec: 60,
    answers: [],
    seed: 1,
    createdAt: new Date().toISOString(),
  } as never;
  const plan = buildExamPlan(exam, [failedAttempt], {}, { now });
  const auto = plan.days.flatMap((d) => d.sessions).find((s) => s.autoDone);
  assert.equal(auto, undefined, 'un échec a validé une séance !');
  assert.equal(plan.prepPercent, 0, 'progression gonflée par un échec');
  const pending = plan.days[0].sessions.filter((s) => s.status === 'prevue');
  assert.ok(pending.length > 0, 'les séances à faire ont disparu');
});

test('planning : contrôle passé → aucun jour planifié', async () => {
  const { buildExamPlan, addDays, todayKey } = await import('../src/server/lib/planning.js');
  const { getCatalog } = await import('../src/server/lib/catalog.js');
  const topic = getCatalog().topics[0];
  const now = new Date();
  const exam = {
    id: 'exam-past',
    subjectId: topic.subjectId,
    title: 'Contrôle passé',
    date: addDays(todayKey(now), -2),
    topics: [topic.id],
    dailyMinutes: 30,
    selfLevel: 'moyen' as const,
    status: 'actif' as const,
    planReady: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: now.toISOString(),
  };
  const plan = buildExamPlan(exam, [], {}, { now });
  assert.equal(plan.past, true);
  assert.equal(plan.days.length, 0, 'des jours après la date du contrôle');
  assert.equal(plan.remainingSessions, 0);
});

test('htmlToMarkdown supprime les artefacts de raisonnement du modèle', async () => {
  const { sanitizeModelContent } = await import('../src/shared/markdownSanitize.js');
  const clean = sanitizeModelContent('<thinking>réflexion interne</thinking>Voici la réponse<br>finale.');
  assert.ok(!clean.includes('réflexion interne'), 'bloc de pensée conservé');
  assert.ok(!clean.includes('<br>'), 'balise <br> conservée');
  assert.ok(clean.includes('Voici la réponse'), 'contenu utile perdu');
});

test('htmlToMarkdown n’ouvre aucune porte au HTML dangereux', () => {
  const html = renderRichText('<script>alert(1)</script><iframe src="//x"></iframe><img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'), 'balise script injectée');
  assert.ok(!html.includes('<iframe'), 'balise iframe injectée');
  assert.ok(!html.includes('<img'), 'balise img injectée');
});

/* ------------------------------------------------------------------ */
/*  Formatage                                                          */
/* ------------------------------------------------------------------ */

test('formatClock formate les durées', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(95), '01:35');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-5), '00:00');
});

test('formatDuration est lisible en français', () => {
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(125), '2 min');
  assert.equal(formatDuration(3720), '1 h 02');
});

test('formatNumber et formatPercent utilisent le séparateur français', () => {
  assert.ok(formatNumber(1234).includes('234'));
  assert.equal(formatPercent(0.5), '50 %');
  assert.equal(formatPercent(0.125, 1), '12,5 %');
});

test('starsFor borne la note entre 0 et 5', () => {
  assert.equal(starsFor(0), 0);
  assert.equal(starsFor(5), 5);
  assert.equal(starsFor(7), 5);
  assert.equal(starsFor(3, 6), 2.5);
});

test('isoDate renvoie une date locale AAAA-MM-JJ', () => {
  assert.match(isoDate(new Date(2025, 0, 2, 12)), /^\d{4}-\d{2}-\d{2}$/);
});

test('formatDayLabel reconnaît aujourd’hui et demain', () => {
  assert.equal(formatDayLabel(isoDate(new Date())), 'Aujourd’hui');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(formatDayLabel(isoDate(tomorrow)), 'Demain');
});

test('encouragement adapte le message au score', () => {
  assert.equal(encouragement(95).emoji, '🏆');
  assert.equal(encouragement(20).emoji, '🌱');
});

/* ------------------------------------------------------------------ */
/*  Musique (données)                                                  */
/* ------------------------------------------------------------------ */

test('toutes les ambiances musicales sont décrites', () => {
  assert.ok(TRACKS.length >= 6, 'moins de 6 ambiances');
  for (const track of TRACKS) {
    assert.ok(track.id && track.name && track.emoji && track.description);
    assert.ok(track.bpm > 0);
    assert.equal(track.colors.length, 2);
    if (track.kind !== 'noise') assert.ok(track.progression?.length, `progression manquante pour ${track.id}`);
    if (track.kind === 'noise') assert.ok(track.noise, `type de bruit manquant pour ${track.id}`);
  }
  assert.equal(new Set(TRACKS.map((track) => track.id)).size, TRACKS.length, 'identifiants d’ambiance en double');
});

/* ------------------------------------------------------------------ */
/*  Validation & sécurité                                              */
/* ------------------------------------------------------------------ */

test('requireEmail accepte et rejette correctement', () => {
  assert.equal(requireEmail(' Eleve@Example.FR '), 'eleve@example.fr');
  assert.throws(() => requireEmail('pas-un-email'));
  assert.throws(() => requireEmail('a@b'));
});

test('requirePassword impose 8 caractères, une lettre et un chiffre', () => {
  assert.equal(requirePassword('motdepasse1'), 'motdepasse1');
  assert.throws(() => requirePassword('court1'));
  assert.throws(() => requirePassword('sanschiffre'));
  assert.throws(() => requirePassword('12345678'));
  assert.deepEqual(passwordIssues('ab1'), ['8 caractères minimum']);
});

test('normalizeEmail met en minuscules', () => {
  assert.equal(normalizeEmail(' A@B.FR '), 'a@b.fr');
});

test('les limites de longueur sont définies', () => {
  assert.ok(LIMITS.password >= 64);
  assert.ok(LIMITS.message >= 1000);
});

test('hashPassword/verifyPassword : hachage salé et vérification', () => {
  const hash = hashPassword('motdepasse1');
  assert.ok(hash.startsWith('scrypt$'));
  assert.notEqual(hash, hashPassword('motdepasse1'), 'le sel doit rendre le hachage unique');
  assert.equal(verifyPassword('motdepasse1', hash), true);
  assert.equal(verifyPassword('mauvais', hash), false);
  assert.equal(verifyPassword('motdepasse1', 'invalide'), false);
});

test('createToken/verifyToken : jeton signé, expirable et inviolable', () => {
  const token = createToken({ sub: 'user-1', email: 'a@b.fr', role: 'eleve' });
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload?.sub, 'user-1');
  assert.equal(verifyToken(`${token.slice(0, -2)}xx`), null, 'signature modifiée acceptée');
  assert.equal(verifyToken('a.b.c'), null);
  assert.equal(verifyToken(''), null);
});

test('newId produit des identifiants uniques', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
});

/* ------------------------------------------------------------------ */
/*  Progression                                                        */
/* ------------------------------------------------------------------ */

test('computeProgress agrège scores, séries et maîtrise', () => {
  const now = new Date();
  const attempts = Array.from({ length: 5 }, (_unused, index) => ({
    id: `a${index}`,
    userId: 'u1',
    topicId: index < 3 ? 'topic-a' : `topic-${index}`,
    subjectId: index % 2 === 0 ? ('mathematiques' as const) : ('francais' as const),
    levelId: 'seconde' as const,
    themeName: 'Thème',
    topicName: `Sujet ${index}`,
    score: index < 4 ? 9 : 2,
    total: 10,
    durationSec: 60,
    answers: [],
    createdAt: new Date(now.getTime() - index * 86_400_000).toISOString(),
  }));
  const summary = computeProgress(attempts);
  assert.equal(summary.attempts, 5);
  assert.equal(summary.correct, 38);
  assert.equal(summary.total, 50);
  assert.equal(summary.successRate, 38 / 50);
  assert.equal(summary.totalDurationSec, 300);
  assert.ok(summary.streakDays >= 4, `série incorrecte : ${summary.streakDays}`);
  assert.equal(summary.bySubject.length, 2);
  assert.equal(summary.last30Days.length, 30);
  const mastered = summary.byTopic.find((topic) => topic.topicId === 'topic-a');
  assert.ok(mastered?.mastered, 'topic-a devrait être maîtrisé (3 tentatives à 90 %)');
  assert.ok(summary.toReview.includes('topic-4'), 'le sujet raté doit apparaître dans « à revoir »');
});

test('computeProgress supporte un historique vide', () => {
  const summary = computeProgress([]);
  assert.equal(summary.attempts, 0);
  assert.equal(summary.successRate, 0);
  assert.equal(summary.streakDays, 0);
  assert.deepEqual(summary.bySubject, []);
});

/* ------------------------------------------------------------------ */
/*  Détection de langue                                                */
/* ------------------------------------------------------------------ */

test('detectLanguage identifie les principales langues', () => {
  assert.equal(detectLanguage('Bonjour, comment vas-tu aujourd’hui ?'), 'fr');
  assert.equal(detectLanguage('Hello, how are you doing today my friend?'), 'en');
  assert.equal(detectLanguage('Hola, ¿cómo estás hoy amigo mío?'), 'es');
  assert.equal(detectLanguage('Hallo, wie geht es dir heute?'), 'de');
  assert.equal(detectLanguage('你好世界'), 'zh');
  assert.ok(LANGUAGES.length >= 12);
});

/* ------------------------------------------------------------------ */
/*  Moteur de contenu                                                  */
/* ------------------------------------------------------------------ */

test('toutes les familles déclarées sont enregistrées', () => {
  const ids = Object.keys(FAMILIES);
  assert.ok(ids.length >= 60, `seulement ${ids.length} familles enregistrées`);
  for (const id of ids) {
    const family = FAMILIES[id];
    assert.equal(family.id, id);
    assert.equal(typeof family.make, 'function');
    const pool = familyPool(id, {});
    assert.ok(pool >= 0, `vivier invalide pour ${id}`);
  }
});

test('les familles mathématiques produisent des questions exactes', () => {
  const questions = buildQuestions({ topicId: 'test', source: 'math.arithmetic', params: { op: '×', max: 12 }, count: 20, seed: 'unit-test' });
  assert.equal(questions.length, 20);
  for (const question of questions) {
    assert.ok(question.options && question.options.length >= 2);
    assert.ok(question.answer !== undefined && question.answer >= 0 && question.answer < question.options!.length);
    assert.ok(question.explanation.length > 10);
    // Vérification arithmétique du résultat annoncé dans l'explication.
    const match = question.prompt.match(/\$(\d+)\s*\\times\s*(\d+)\$/);
    if (match) {
      const expected = Number(match[1]) * Number(match[2]);
      const correct = question.options![question.answer!].replace(/\s/g, '').replace(',', '.');
      assert.equal(Number(correct), expected, `résultat faux : ${question.prompt} → ${correct} ≠ ${expected}`);
    }
  }
});

test('les distracteurs sont toujours distincts de la bonne réponse', () => {
  for (const source of ['math.fractions', 'math.derivative', 'phys.ohm', 'fr.conjugaison', 'en.irregular', 'hg.histoire.dates', 'philo.concepts', 'nsi.bases', 'ses.concepts', 'svt.termes']) {
    const questions = buildQuestions({ topicId: `t-${source}`, source, count: 8, seed: `seed-${source}` });
    assert.ok(questions.length >= 4, `${source} : seulement ${questions.length} questions`);
    for (const question of questions) {
      if (!question.options) continue;
      const normalized = question.options.map((option) => option.trim().toLowerCase());
      assert.equal(new Set(normalized).size, normalized.length, `${source} : propositions en doublon → ${question.options.join(' | ')}`);
      assert.ok(question.options[question.answer!], `${source} : bonne réponse hors limites`);
    }
  }
});

test('la conjugaison française est exacte sur des formes de référence', () => {
  const etre = FRENCH_VERBS.find((verb) => verb.infinitive === 'être')!;
  assert.equal(conjugateFrench(etre, 'present', 0), 'suis');
  assert.equal(conjugateFrench(etre, 'present', 3), 'sommes');
  const parler = FRENCH_VERBS.find((verb) => verb.infinitive === 'parler')!;
  assert.equal(conjugateFrench(parler, 'present', 2), 'parle');
  assert.equal(conjugateFrench(parler, 'imparfait', 3), 'parlions');
  assert.equal(conjugateFrench(parler, 'futur', 0), 'parlerai');
  const finir = FRENCH_VERBS.find((verb) => verb.infinitive === 'finir')!;
  assert.equal(conjugateFrench(finir, 'present', 3), 'finissons');
  const vendre = FRENCH_VERBS.find((verb) => verb.infinitive === 'vendre')!;
  assert.equal(conjugateFrench(vendre, 'present', 2), 'vend');
  const manger = FRENCH_VERBS.find((verb) => verb.infinitive === 'manger')!;
  assert.equal(conjugateFrench(manger, 'present', 3), 'mangeons');
});

test('tous les verbes du corpus se conjuguent au présent', () => {
  for (const verb of FRENCH_VERBS) {
    for (let person = 0 as 0 | 1 | 2 | 3 | 4 | 5; person <= 5; person = (person + 1) as 0 | 1 | 2 | 3 | 4 | 5) {
      const form = conjugateFrench(verb, 'present', person);
      assert.ok(form && form.length > 0, `${verb.infinitive} : forme manquante à la personne ${person}`);
      assert.ok(!/undefined|null/.test(form), `${verb.infinitive} : forme invalide « ${form} »`);
    }
  }
});

test('les verbes anglais irréguliers ont leurs trois formes', () => {
  const irregular = ENGLISH_VERBS.filter((verb) => !verb.regular);
  assert.ok(irregular.length >= 40, 'corpus de verbes irréguliers trop petit');
  for (const verb of ENGLISH_VERBS) {
    assert.ok(verb.base && verb.past && verb.participle && verb.fr, `formes manquantes pour ${verb.base}`);
  }
});

/* ------------------------------------------------------------------ */
/*  Moteur symbolique (dérivation)                                     */
/* ------------------------------------------------------------------ */

test('le moteur symbolique dérive correctement les polynômes', () => {
  const x = variable('x');
  const f = simplify(add(mul(num(3), pow(x, num(2))), mul(num(2), x), num(5)));
  const d = simplify(derivative(f));
  // f'(x) = 6x + 2 → vérification numérique en plusieurs points
  for (const value of [-3, 0, 1, 7]) {
    assert.equal(evaluate(d, { x: value }), 6 * value + 2, `dérivée fausse en x=${value}`);
  }
  assert.ok(toLatex(d).includes('6'));
});

test('le moteur symbolique dérive sin, exp, ln et un quotient', () => {
  const x = variable('x');
  const dSin = simplify(derivative({ t: 'fn', name: 'sin', a: x }));
  assert.ok(toLatex(dSin).includes('cos'));
  const dExp = simplify(derivative({ t: 'fn', name: 'exp', a: x }));
  assert.ok(toLatex(dExp).includes('e^'));
  const dLn = simplify(derivative({ t: 'fn', name: 'ln', a: x }));
  assert.ok(toLatex(dLn).includes('frac'));
  const quotient = simplify(derivative({ t: 'div', a: x, b: add(x, num(1)) }));
  // (x/(x+1))' = 1/(x+1)² → contrôle numérique
  for (const value of [0, 1, 4]) {
    const expected = 1 / (value + 1) ** 2;
    assert.ok(Math.abs(evaluate(quotient, { x: value }) - expected) < 1e-9, `dérivée du quotient fausse en x=${value}`);
  }
});

/* ------------------------------------------------------------------ */
/*  Normalisation des formules IA                                      */
/* ------------------------------------------------------------------ */

test('normalizeMathDelimiters convertit les délimiteurs parenthèses/crochets vers dollar', async () => {
  const { normalizeMathDelimiters } = await import('../src/server/lib/ai.js');
  assert.equal(normalizeMathDelimiters('Voici \\(x^2 + 1\\) en ligne.'), 'Voici $x^2 + 1$ en ligne.');
  assert.equal(normalizeMathDelimiters('Bloc :\n\\[\n\\frac{1}{2}\n\\]\nfin'), 'Bloc :\n' + '$$' + '\\frac{1}{2}' + '$$' + '\nfin');
  assert.equal(normalizeMathDelimiters('Déjà $x+1$ et $y$.'), 'Déjà $x+1$ et $y$.');
  assert.equal(normalizeMathDelimiters('Texte sans maths.'), 'Texte sans maths.');
});

/* ------------------------------------------------------------------ */
/*  Chargement du fichier .env                                         */
/* ------------------------------------------------------------------ */

test('parseEnv lit les paires cle=valeur simples', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('AI_PROVIDER=groq\nAI_API_KEY=abc123\n');
  assert.equal(parsed.AI_PROVIDER, 'groq');
  assert.equal(parsed.AI_API_KEY, 'abc123');
});

test('parseEnv ignore commentaires et lignes vides', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('# commentaire\n\n   \nAI_MODEL=gpt-4o-mini\n# AI_API_KEY=ignore\n');
  assert.equal(Object.keys(parsed).length, 1);
  assert.equal(parsed.AI_MODEL, 'gpt-4o-mini');
});

test('parseEnv retire les guillemets sans alterer le contenu', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('A="valeur double"\nB=\'valeur simple\'\nC=sans guillemets\n');
  assert.equal(parsed.A, 'valeur double');
  assert.equal(parsed.B, 'valeur simple');
  assert.equal(parsed.C, 'sans guillemets');
});

test('parseEnv preserve un # inside une valeur guillemetee', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('SECRET="mot#de#passe"\n');
  assert.equal(parsed.SECRET, 'mot#de#passe');
});

test('parseEnv accepte le prefixe export et les fins de ligne CRLF', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('export AI_PROVIDER=groq\r\nAI_API_KEY=cle123\r\n');
  assert.equal(parsed.AI_PROVIDER, 'groq');
  assert.equal(parsed.AI_API_KEY, 'cle123');
});

test('parseEnv ecarte les cles invalides et les lignes sans =', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('1MAUVAISE=x\nSANS-EGALE\n=pasDeCle\nBONNE=ok\n');
  assert.deepEqual(Object.keys(parsed), ['BONNE']);
});

test('parseEnv gere un commentaire de fin de ligne hors guillemets', async () => {
  const { parseEnv } = await import('../src/server/lib/env.js');
  const parsed = parseEnv('PORT=8787 # port HTTP\n');
  assert.equal(parsed.PORT, '8787');
});

/* ------------------------------------------------------------------ */
/*  Logique de calendrier                                              */
/* ------------------------------------------------------------------ */

const CAL = await import('../src/client/lib/calendar.js');

/** Événement de test minimal. */
const ev = (partial: Partial<import('../src/shared/types.js').CalendarEvent> = {}): import('../src/shared/types.js').CalendarEvent =>
  ({
    id: 'e1',
    userId: 'u1',
    title: 'Devoir',
    kind: 'devoir',
    date: '2026-09-30',
    done: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  }) as import('../src/shared/types.js').CalendarEvent;

const CAL_REF = new Date(2026, 8, 30, 10, 0, 0); // mercredi 30 septembre 2026, 10 h

test('toIsoDate / fromIsoDate font l’aller-retour en heure locale', () => {
  for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
    const date = CAL.fromIsoDate(iso);
    assert.ok(date, `date invalide pour ${iso}`);
    assert.equal(CAL.toIsoDate(date as Date), iso);
  }
});

test('fromIsoDate refuse les dates invalides', () => {
  assert.equal(CAL.fromIsoDate('2026-02-31'), null, 'le 31 février ne doit pas exister');
  assert.equal(CAL.fromIsoDate('2026-13-01'), null);
  assert.equal(CAL.fromIsoDate('pas-une-date'), null);
  assert.equal(CAL.fromIsoDate(''), null);
  assert.equal(CAL.fromIsoDate(undefined as unknown as string), null);
});

test('fromIsoDate n’utilise pas UTC (pas de décalage d’un jour)', () => {
  const date = CAL.fromIsoDate('2026-09-30') as Date;
  assert.equal(date.getDate(), 30, 'le jour doit rester le 30 quel que soit le fuseau');
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getHours(), 0);
});

test('addMonths préserve le jour et gère les fins de mois', () => {
  assert.equal(CAL.toIsoDate(CAL.addMonths(new Date(2026, 0, 31), 1)), '2026-02-28', '31 janvier + 1 mois');
  assert.equal(CAL.toIsoDate(CAL.addMonths(new Date(2024, 0, 31), 1)), '2024-02-29', 'année bissextile');
  assert.equal(CAL.toIsoDate(CAL.addMonths(new Date(2026, 0, 31), -1)), '2025-12-31');
  assert.equal(CAL.toIsoDate(CAL.addMonths(new Date(2026, 4, 15), 3)), '2026-08-15', 'jour préservé');
});

test('startOfWeek place toujours le lundi', () => {
  for (let day = 0; day < 7; day += 1) {
    const date = CAL.addDays(new Date(2026, 8, 28), day);
    const monday = CAL.startOfWeek(date);
    assert.equal(monday.getDay(), 1, `pour ${CAL.toIsoDate(date)}`);
    assert.ok(CAL.daysBetween(monday, date) >= 0 && CAL.daysBetween(monday, date) <= 6);
  }
});

test('daysBetween compte en jours calendaires', () => {
  assert.equal(CAL.daysBetween(CAL_REF, new Date(2026, 8, 30, 23, 59)), 0, 'même jour, heure différente');
  assert.equal(CAL.daysBetween(CAL_REF, new Date(2026, 9, 1)), 1);
  assert.equal(CAL.daysBetween(CAL_REF, new Date(2026, 8, 29)), -1);
  assert.equal(CAL.daysBetween(new Date(2026, 9, 25), new Date(2026, 9, 26)), 1, 'passage à l’heure d’hiver');
});

test('weekNumber suit ISO 8601', () => {
  assert.equal(CAL.weekNumber(new Date(2026, 0, 1)), 1);
  assert.equal(CAL.weekNumber(new Date(2024, 11, 30)), 1, 'le 30/12/2024 appartient à la semaine 1 de 2025');
  assert.equal(CAL.weekNumber(new Date(2026, 8, 30)), 40);
});

test('buildMonthGrid produit toujours 42 cases, lundi en premier', () => {
  for (let month = 0; month < 12; month += 1) {
    const grid = CAL.buildMonthGrid(2026, month);
    assert.equal(grid.length, 42, `mois ${month}`);
    assert.equal(grid[0].getDay(), 1, `première case = lundi, mois ${month}`);
    assert.ok(grid.some((date) => date.getMonth() === month && date.getDate() === 1), `le 1er doit apparaître, mois ${month}`);
  }
});

test('buildMonthGrid couvre février bissextile', () => {
  const grid = CAL.buildMonthGrid(2024, 1);
  assert.ok(grid.some((date) => CAL.toIsoDate(date) === '2024-02-29'));
});

test('buildWeekGrid renvoie 7 jours du lundi au dimanche', () => {
  const week = CAL.buildWeekGrid(CAL_REF);
  assert.equal(week.length, 7);
  assert.equal(week[0].getDay(), 1);
  assert.equal(week[6].getDay(), 0);
  assert.ok(week.some((date) => CAL.toIsoDate(date) === '2026-09-30'));
});

test('urgencyOf qualifie correctement chaque cas', () => {
  assert.equal(CAL.urgencyOf(ev({ date: '2026-09-28' }), CAL_REF), 'overdue');
  assert.equal(CAL.urgencyOf(ev({ date: '2026-09-30' }), CAL_REF), 'today');
  assert.equal(CAL.urgencyOf(ev({ date: '2026-10-01' }), CAL_REF), 'tomorrow');
  assert.equal(CAL.urgencyOf(ev({ date: '2026-10-05' }), CAL_REF), 'week');
  assert.equal(CAL.urgencyOf(ev({ date: '2026-12-01' }), CAL_REF), 'later');
});

test('urgencyOf : un événement terminé n’est jamais en retard', () => {
  assert.equal(CAL.urgencyOf(ev({ date: '2020-01-01', done: true }), CAL_REF), 'later');
});

test('urgencyOf tolère une date invalide', () => {
  assert.equal(CAL.urgencyOf(ev({ date: 'invalide' }), CAL_REF), 'later');
});

test('countdownLabel descend à l’heure le jour même', () => {
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-30', time: '13:00' }), CAL_REF), 'dans 3 h');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-30', time: '10:30' }), CAL_REF), 'dans 30 min');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-30', time: '10:00' }), CAL_REF), 'Maintenant');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-30', time: '08:00' }), CAL_REF), 'Il y a 2 h');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-30' }), CAL_REF), 'Aujourd’hui');
});

test('countdownLabel exprime les échéances lointaines', () => {
  assert.equal(CAL.countdownLabel(ev({ date: '2026-10-01' }), CAL_REF), 'Demain');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-10-03' }), CAL_REF), 'dans 3 j');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-10-10' }), CAL_REF), 'dans 1 semaine');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-10-21' }), CAL_REF), 'dans 3 sem.');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-12-30' }), CAL_REF), 'dans 3 mois');
});

test('countdownLabel signale les retards', () => {
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-29' }), CAL_REF), 'Hier');
  assert.equal(CAL.countdownLabel(ev({ date: '2026-09-25' }), CAL_REF), 'Retard de 5 j');
});

test('countdownLabel : terminé et date invalide', () => {
  assert.equal(CAL.countdownLabel(ev({ done: true }), CAL_REF), 'Terminé');
  assert.equal(CAL.countdownLabel(ev({ date: 'invalide' }), CAL_REF), '');
});

test('formatElapsed formate les durées', () => {
  assert.equal(CAL.formatElapsed(30), '30 min');
  assert.equal(CAL.formatElapsed(60), '1 h');
  assert.equal(CAL.formatElapsed(135), '2 h 15');
  assert.equal(CAL.formatElapsed(-10), '0 min');
});

test('longDayLabel situe le jour par rapport à aujourd’hui', () => {
  assert.ok(CAL.longDayLabel('2026-09-30', CAL_REF).startsWith('Aujourd’hui'));
  assert.ok(CAL.longDayLabel('2026-10-01', CAL_REF).startsWith('Demain'));
  assert.ok(CAL.longDayLabel('2026-09-29', CAL_REF).startsWith('Hier'));
  assert.ok(CAL.longDayLabel('2026-11-15', CAL_REF).startsWith('dimanche'));
  assert.equal(CAL.longDayLabel('invalide', CAL_REF), 'invalide');
});

test('monthTitle n’affiche l’année que si elle diffère', () => {
  assert.equal(CAL.monthTitle(2026, 8, CAL_REF), 'Septembre');
  assert.equal(CAL.monthTitle(2027, 0, CAL_REF), 'Janvier 2027');
});

test('compareEvents trie par date puis heure, sans heure en premier', () => {
  const list = [
    ev({ id: 'c', date: '2026-09-30', time: '14:00', title: 'C' }),
    ev({ id: 'a', date: '2026-09-30', title: 'A' }),
    ev({ id: 'b', date: '2026-09-29', time: '09:00', title: 'B' }),
  ];
  assert.deepEqual([...list].sort(CAL.compareEvents).map((e) => e.id), ['b', 'a', 'c']);
});

test('groupByDate regroupe et trie chaque journée', () => {
  const map = CAL.groupByDate([
    ev({ id: '2', date: '2026-09-30', time: '18:00', title: 'B' }),
    ev({ id: '1', date: '2026-09-30', time: '08:00', title: 'A' }),
    ev({ id: '3', date: '2026-10-01', title: 'C' }),
  ]);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get('2026-09-30')?.map((e) => e.id), ['1', '2']);
});

test('upcomingEvents exclut les terminés et les passés', () => {
  const list = [
    ev({ id: 'past', date: '2026-09-01' }),
    ev({ id: 'today', date: '2026-09-30' }),
    ev({ id: 'done', date: '2026-10-05', done: true }),
    ev({ id: 'later', date: '2026-12-01' }),
  ];
  assert.deepEqual(CAL.upcomingEvents(list, CAL_REF).map((e) => e.id), ['today', 'later']);
});

test('overdueEvents ne retient que les non terminés en retard', () => {
  const list = [
    ev({ id: 'late', date: '2026-09-01' }),
    ev({ id: 'lateDone', date: '2026-09-02', done: true }),
    ev({ id: 'today', date: '2026-09-30' }),
  ];
  assert.deepEqual(CAL.overdueEvents(list, CAL_REF).map((e) => e.id), ['late']);
});

test('eventsOfMonth et eventsInRange filtrent correctement', () => {
  const list = [
    ev({ id: '1', date: '2026-09-05' }),
    ev({ id: '2', date: '2026-09-30' }),
    ev({ id: '3', date: '2026-10-01' }),
  ];
  assert.deepEqual(CAL.eventsOfMonth(list, 2026, 8).map((e) => e.id), ['1', '2']);
  assert.deepEqual(CAL.eventsInRange(list, '2026-09-28', '2026-10-02').map((e) => e.id), ['2', '3']);
});

test('filterEventsByQuery ignore casse et accents', () => {
  const list = [
    ev({ id: '1', title: 'Contrôle de maths' }),
    ev({ id: '2', title: 'Exposé d’histoire', notes: 'Révolution française' }),
    ev({ id: '3', title: 'SVT', subjectId: 'svt' }),
  ];
  assert.deepEqual(CAL.filterEventsByQuery(list, 'controle').map((e) => e.id), ['1']);
  assert.deepEqual(CAL.filterEventsByQuery(list, 'RÉVOLUTION').map((e) => e.id), ['2']);
  assert.deepEqual(CAL.filterEventsByQuery(list, 'svt').map((e) => e.id), ['3']);
  assert.equal(CAL.filterEventsByQuery(list, '').length, 3, 'requête vide = tout');
  assert.equal(CAL.filterEventsByQuery(list, '   ').length, 3);
  assert.equal(CAL.filterEventsByQuery(list, 'zzz').length, 0);
});

test('computeCalendarStats agrège correctement', () => {
  const list = [
    ev({ id: '1', date: '2026-09-01', kind: 'devoir' }),
    ev({ id: '2', date: '2026-09-30', kind: 'examen' }),
    ev({ id: '3', date: '2026-10-02', kind: 'devoir' }),
    ev({ id: '4', date: '2026-12-01', kind: 'autre', done: true }),
  ];
  const stats = CAL.computeCalendarStats(list, CAL_REF);
  assert.equal(stats.total, 4);
  assert.equal(stats.done, 1);
  assert.equal(stats.pending, 3);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.today, 1);
  assert.equal(stats.next7, 2, 'aujourd’hui + le 2 octobre');
  assert.equal(stats.byKind.devoir, 2);
  assert.equal(stats.byKind.examen, 1);
});

test('computeCalendarStats sur liste vide', () => {
  const stats = CAL.computeCalendarStats([], CAL_REF);
  assert.equal(stats.total, 0);
  assert.equal(stats.pending, 0);
  assert.deepEqual(stats.byKind, {});
});

test('buildIcs produit un calendrier RFC 5545 valide', () => {
  const ics = CAL.buildIcs(
    [
      ev({ id: 'x1', title: 'Devoir; avec, caractères', date: '2026-10-01', time: '14:30', notes: 'ligne1\nligne2' }),
      ev({ id: 'x2', title: 'Journée entière', date: '2026-10-05', done: true }),
      ev({ id: 'x3', title: 'Date invalide', date: 'pas-une-date' }),
    ],
    'EduMate',
  );
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'en-tête');
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'), 'pied');
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('DTSTART:20261001T143000'), 'date+heure compacte');
  assert.ok(ics.includes('DTEND:20261001T153000'), 'fin = début + 1 h');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261005'), 'journée entière');
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261006'), 'DTEND exclusif = lendemain');
  assert.ok(ics.includes('SUMMARY:Devoir\\; avec\\, caractères'), 'échappement RFC');
  assert.ok(ics.includes('DESCRIPTION:ligne1\\nligne2'), 'sauts de ligne échappés');
  assert.ok(ics.includes('STATUS:COMPLETED'), 'événement terminé');
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2, 'la date invalide est ignorée');
  assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 2);
  assert.ok(!ics.includes('\n') || /\r\n/.test(ics), 'séparateurs CRLF');
});

test('buildIcs sur liste vide reste structurellement valide', () => {
  const ics = CAL.buildIcs([]);
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 0);
});

/* ------------------------------------------------------------------ */
/*  Bilan                                                              */
/* ------------------------------------------------------------------ */

setTimeout(() => {
  console.log(`\n🧪 Tests unitaires EduMate`);
  console.log(`   Réussis : ${passed}`);
  if (failures.length) {
    console.error(`   Échecs  : ${failures.length}`);
    for (const failure of failures) console.error(`     • ${failure}`);
    process.exit(1);
  }
  console.log('   Échecs  : 0\n   ✅ Tous les modules critiques sont conformes.\n');
}, 250);
