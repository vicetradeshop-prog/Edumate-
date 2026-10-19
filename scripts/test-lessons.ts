/**
 * Test du moteur de leçons interactives et des révisions de quiz.
 *
 * Couvre :
 *  - la couverture de la bibliothèque (chaque famille du catalogue a sa fiche) ;
 *  - la construction des leçons (structure, validité des exercices, déterminisme,
 *    dégradation gracieuse) ;
 *  - le découpage des explications (LaTeX et blocs de code préservés) ;
 *  - la validation du contenu IA (rien de partiel n'est accepté) ;
 *  - la reconstruction d'un essai pour la révision (mêmes questions qu'au quiz)
 *    et le repli « entraînement » quand la graine est absente.
 */
process.env.FALLBACK_STORAGE = 'memory';
process.env.SESSION_SECRET = 'lessons-test-secret-0123456789';
process.env.NODE_ENV = 'test';

const { buildLesson, lessonLibraryCoverage, splitSolution, parseAiLesson, buildAiLessonPrompt, LESSON_LIBRARY, SUBJECT_LESSONS } =
  await import('../src/server/content/lessons.js');
const { buildRevisionPayload, rebuildAttemptQuestions, buildRemediation } = await import('../src/server/lib/revision.js');
const { getCatalog, findTopic } = await import('../src/server/lib/catalog.js');
const { buildQuiz } = await import('../src/server/content/index.js');
const { buildRevisionSteps, checkLessonAnswer, applyAiToLesson } = await import('../src/client/lib/lessonSteps.js');

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const catalog = getCatalog();

/* ------------------------------------------------------------------ */
console.log('\n── Bibliothèque de leçons ──');
/* ------------------------------------------------------------------ */

const sources = catalog.topics.map((topic) => topic.source);
const coverage = lessonLibraryCoverage(sources);
check('chaque famille du catalogue a une fiche de leçon', coverage.missing.length === 0, coverage.missing.join(', '));
check('au moins 100 familles documentées', coverage.covered.length >= 100, String(coverage.covered.length));
check('les 10 matières ont une fiche de repli', Object.keys(SUBJECT_LESSONS).length === 10);

const seedsValides = Object.entries(LESSON_LIBRARY).every(
  ([, seed]) =>
    typeof seed.hook === 'string' && seed.hook.length >= 10 &&
    Array.isArray(seed.goals) && seed.goals.length >= 2 &&
    Array.isArray(seed.method) && seed.method.length >= 3 &&
    typeof seed.trap === 'string' && seed.trap.length >= 10 &&
    typeof seed.tip === 'string' && seed.tip.length >= 10,
);
check('toutes les fiches sont complètes (hook, ≥2 objectifs, ≥3 gestes, piège, astuce)', seedsValides);

/* ------------------------------------------------------------------ */
console.log('\n── Construction des leçons ──');
/* ------------------------------------------------------------------ */

const STEP_KINDS = new Set(['mission', 'concept', 'exemple', 'exercice', 'piege', 'recap']);

// Échantillon : un sujet par matière + des familles variées (générées et banques).
const echantillon = [
  'mathematiques-troisieme-nombres-et-calculs-additions-et-soustractions',
  'mathematiques-terminale-analyse-derivation',
  'francais-seconde-grammaire-nature-des-mots',
  'physique-chimie-seconde-constitution-matiere-mole',
  'anglais-seconde-vocabulaire-ecole',
  'histoire-geographie-troisieme-emc-citoyennete',
].map((id) => findTopic(id)).filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));
// Un sujet de chaque matière restante, choisi dans le catalogue.
for (const subjectId of new Set(catalog.topics.map((t) => t.subjectId))) {
  if (!echantillon.some((t) => t.subjectId === subjectId)) {
    const topic = catalog.topics.find((t) => t.subjectId === subjectId);
    if (topic) echantillon.push(topic);
  }
}
// Une banque méthodologique (questions statiques).
const bankTopic = catalog.topics.find((t) => t.source.startsWith('bank:'));
if (bankTopic) echantillon.push(bankTopic);

let leconOk = 0;
for (const topic of echantillon) {
  const lesson = buildLesson({ topic, seed: 7 });
  const kinds = lesson.steps.map((s) => s.kind);
  const structureOk =
    lesson.steps.length >= 4 &&
    kinds[0] === 'mission' &&
    kinds[kinds.length - 1] === 'recap' &&
    kinds.every((kind) => STEP_KINDS.has(kind));
  const exercices = lesson.steps.filter((s) => s.kind === 'exercice');
  const exemples = lesson.steps.filter((s) => s.kind === 'exemple');
  const exercicesOk = exercices.every((s) => {
    if (s.kind !== 'exercice') return false;
    const q = s.question;
    if (!q.prompt || !q.explanation) return false;
    if (q.kind === 'texte') return (q.accept?.length ?? 0) > 0 && q.answer === null;
    return q.answer !== null && q.options.length > (q.answer ?? -1) && q.options.length >= 2;
  });
  const exemplesOk = exemples.every((s) => s.kind === 'exemple' && s.prompt.length > 0 && s.solution.length > 0 && s.answerLabel !== '—');
  if (structureOk && exercicesOk && exemplesOk && exercices.length >= 1) leconOk += 1;
  else console.log(`     ⚠️  leçon suspecte : ${topic.id} (${kinds.join('→')})`);
}
check(`leçons valides pour les ${echantillon.length} sujets échantillonnés`, leconOk === echantillon.length, `${leconOk}/${echantillon.length}`);

const topicRef = echantillon[0];
const l1 = buildLesson({ topic: topicRef, seed: 42 });
const l2 = buildLesson({ topic: topicRef, seed: 42 });
const l3 = buildLesson({ topic: topicRef, seed: 43 });
check('même graine → leçon identique (rejouable à l’identique)', JSON.stringify(l1.steps) === JSON.stringify(l2.steps));
check('graine différente → nouveaux exemples/exercices', JSON.stringify(l1.steps) !== JSON.stringify(l3.steps));
check('une leçon complète compte 2 exemples et 3 exercices',
  l1.steps.filter((s) => s.kind === 'exemple').length === 2 && l1.steps.filter((s) => s.kind === 'exercice').length === 3);
check('identifiants d’étapes uniques', new Set(l1.steps.map((s) => s.id)).size === l1.steps.length);

// Dégradation gracieuse : famille inconnue → leçon « concept » sans crash.
const topicCasse = { ...topicRef, source: 'famille.inexistante' };
const leconRepli = buildLesson({ topic: topicCasse, seed: 1 });
check('famille inconnue → leçon de repli jouable (mission…recap)',
  leconRepli.steps.length >= 4 &&
  leconRepli.steps[0].kind === 'mission' &&
  leconRepli.steps[leconRepli.steps.length - 1].kind === 'recap');

// Fusion IA : les étapes générées localement (exemples/exercices) sont conservées.
// (Leçon construite avec `aiAvailable` : c'est le cas réel quand le bouton ✨
// est proposé, donc l'étape méthode est marquée enrichissable.)
const l1Ai = buildLesson({ topic: topicRef, seed: 42, aiAvailable: true });
const ai = { hook: 'H', goals: ['g1', 'g2'], method: ['m1', 'm2', 'm3'], trap: 'T', tip: 'P', chips: ['c1', 'c2', 'c3'] };
const merged = applyAiToLesson(l1Ai, ai);
const mission = merged.steps.find((s) => s.kind === 'mission');
const concept = merged.steps.find((s) => s.kind === 'concept');
check('fusion IA : accroche et objectifs remplacés', mission?.kind === 'mission' && mission.intro === 'H' && mission.goals[0] === 'g1');
check('fusion IA : méthode remplacée, bouton IA désactivé', concept?.kind === 'concept' && concept.points[0] === 'm1' && concept.ai === false);
check('fusion IA : exemples et exercices conservés',
  merged.steps.filter((s) => s.kind === 'exemple').length === l1Ai.steps.filter((s) => s.kind === 'exemple').length &&
  merged.steps.filter((s) => s.kind === 'exercice').length === l1Ai.steps.filter((s) => s.kind === 'exercice').length);
check('sans IA configurée, aucun bouton ✨ n’est proposé',
  l1.steps.filter((s) => s.kind === 'concept').every((s) => s.kind === 'concept' && s.ai === false));

/* ------------------------------------------------------------------ */
console.log('\n── Découpage des explications ──');
/* ------------------------------------------------------------------ */

check('explication vide → ligne de repli', splitSolution('').length === 1);
const simple = splitSolution('On calcule 2 + 2. Le résultat est 4. Donc la réponse est 4.');
check('les phrases sont séparées', simple.length === 3, JSON.stringify(simple));
const latex = splitSolution('Aire $= \\pi r^{2} = \\pi \\times 25 = 78.5$ cm² (environ 196.3 cm²).');
check('une formule LaTeX n’est jamais coupée', latex.length === 1, JSON.stringify(latex));
const code = splitSolution('On déroule:\n```\ns ← 2 × s + 3\n```\nRésultat : 22.');
check('un bloc de code reste intact', code.some((line) => line.includes('```')) && code.length >= 2);
const long = splitSolution('A. B. C. D. E. F. G. H.'.replaceAll('. ', '. Phrase longue numéro ') + ' Phrase longue numéro H.', 6);
check('au-delà de 6 lignes, la fin est regroupée', long.length === 6, String(long.length));

/* ------------------------------------------------------------------ */
console.log('\n── Validation du contenu IA ──');
/* ------------------------------------------------------------------ */

check('JSON valide (même dans une clôture ```json) → accepté',
  parseAiLesson('```json\n{"hook":"Accroche","goals":["g1","g2"],"method":["m1","m2","m3"],"trap":"t","tip":"p","chips":["c1","c2","c3"]}\n```') !== null);
check('JSON invalide → rejeté', parseAiLesson('{hook: cassé') === null);
check('texte vide → rejeté', parseAiLesson('   ') === null);
check('object incomplet → rejeté (jamais de contenu partiel)',
  parseAiLesson('{"hook":"ok","goals":["un seul"],"method":["a","b","c"],"trap":"t","tip":"p","chips":["a","b","c"]}') === null);
check('tableau au lieu d’objet → rejeté', parseAiLesson('[1,2,3]') === null);
check('l’invite mentionne le sujet et le format JSON',
  buildAiLessonPrompt(topicRef).includes(topicRef.name) && buildAiLessonPrompt(topicRef).includes('JSON'));

/* ------------------------------------------------------------------ */
console.log('\n── Révision interactive d’un quiz ──');
/* ------------------------------------------------------------------ */

const topicQuiz = findTopic('mathematiques-troisieme-nombres-et-calculs-additions-et-soustractions')!;
const SEED = 99;
const session = buildQuiz({ topicId: topicQuiz.id, source: topicQuiz.source, params: topicQuiz.params ?? {}, difficulty: topicQuiz.difficulty, count: 6, seed: `${topicQuiz.id}#${SEED}` });

// Essai simulé : premières questions justes, dernières fausses (comme un vrai grade).
const attempt = {
  id: 'att-1',
  userId: 'u1',
  topicId: topicQuiz.id,
  subjectId: topicQuiz.subjectId,
  levelId: topicQuiz.levelId,
  themeName: topicQuiz.themeName,
  topicName: topicQuiz.name,
  score: 4,
  total: session.questions.length,
  durationSec: 100,
  answers: session.questions.map((q, index) => ({
    questionId: q.id,
    correct: index < 4,
    given: index < 4 ? (q.answer ?? 0) : ((q.answer ?? 0) + 1) % Math.max(2, q.options?.length ?? 2),
  })),
  seed: SEED,
  createdAt: new Date().toISOString(),
};

const rebuilt = rebuildAttemptQuestions(topicQuiz, attempt);
check('la graine régénère exactement les questions jouées',
  rebuilt !== null && rebuilt.length === session.questions.length &&
  rebuilt.every((q, i) => q.prompt === session.questions[i].prompt && q.answer === session.questions[i].answer));

const payload = buildRevisionPayload({ topic: topicQuiz, attempt });
check('mode « quiz » avec l’essai rejouable', payload.mode === 'quiz' && payload.attempt?.id === 'att-1');
check('chaque question retrouve sa réponse et son verdict',
  payload.items.length === session.questions.length &&
  payload.items.slice(0, 4).every((item) => item.correct === true) &&
  payload.items.slice(4).every((item) => item.correct === false));
check('chaque erreur propose un exercice de rattrapage',
  payload.items.filter((i) => i.correct === false).every((i) => i.remediation !== null));
check('les réussites n’ont pas de rattrapage',
  payload.items.filter((i) => i.correct === true).every((i) => i.remediation === null));
check('le rattrapage est une question NEUVE (jamais jouée)',
  payload.items.filter((i) => i.remediation).every((i) => !session.questions.some((q) => q.prompt === i.remediation!.prompt)));
check('deux rattrapages ne sont jamais la même question',
  new Set(payload.items.filter((i) => i.remediation).map((i) => i.remediation!.prompt)).size ===
    payload.items.filter((i) => i.remediation).length);

// Essai sans graine (historique antérieur) → repli entraînement.
const { seed: _sansGraine, ...attemptSansSeed } = attempt;
const payloadRepli = buildRevisionPayload({ topic: topicQuiz, attempt: attemptSansSeed as typeof attempt });
check('essai sans graine → mode entraînement (jamais d’écran vide)',
  payloadRepli.mode === 'entrainement' && payloadRepli.items.length > 0 && payloadRepli.attempt === null);
check('entraînement : réponses neuves (given = null)', payloadRepli.items.every((item) => item.given === null && item.correct === null));

// Aucun essai → entraînement également.
const payloadVide = buildRevisionPayload({ topic: topicQuiz, attempt: null });
check('aucun essai → mode entraînement', payloadVide.mode === 'entrainement' && payloadVide.items.length >= 3);

// Rattrapages : unicité garantie par buildRemediation.
const missed = session.questions.slice(4);
const remediations = buildRemediation(topicQuiz, [...missed, ...missed], new Set(session.questions.map((q) => q.prompt)), 5);
check('un seul rattrapage par question (doublons écartés)', remediations.size === missed.length);

/* ------------------------------------------------------------------ */
console.log('\n── Étapes de révision (côté client) ──');
/* ------------------------------------------------------------------ */

const stepsQuiz = buildRevisionSteps(payload);
check('révision « quiz » : mission d’ouverture avec le score',
  stepsQuiz[0].kind === 'mission' && 'intro' in stepsQuiz[0] && stepsQuiz[0].intro.includes('4/6'));
check('réussites célébrées dans une étape dédiée', stepsQuiz.some((s) => s.id === 'reussites'));
check('une correction pas à pas par erreur', stepsQuiz.filter((s) => s.kind === 'exemple').length === 2);
check('la correction rappelle la réponse donnée ET la bonne réponse',
  stepsQuiz.filter((s) => s.kind === 'exemple').every((s) => s.kind === 'exemple' && s.solution.some((line) => line.startsWith('Ta réponse')) && s.solution.some((line) => line.startsWith('Bonne réponse'))));
check('un exercice de rattrapage suit chaque correction', stepsQuiz.filter((s) => s.kind === 'exercice').length === 2);
check('bilan final avec les notions à consolider', stepsQuiz[stepsQuiz.length - 1].kind === 'recap');
check('identifiants d’étapes uniques (clés React stables)', new Set(stepsQuiz.map((s) => s.id)).size === stepsQuiz.length);

const stepsEntrainement = buildRevisionSteps(payloadRepli);
check('entraînement : chaque question devient un exercice',
  stepsEntrainement.filter((s) => s.kind === 'exercice').length === payloadRepli.items.length);
check('entraînement : mission + bilan encadrent les exercices',
  stepsEntrainement[0].kind === 'mission' && stepsEntrainement[stepsEntrainement.length - 1].kind === 'recap');

const payloadSansFaute = buildRevisionPayload({
  topic: topicQuiz,
  attempt: { ...attempt, score: attempt.total, answers: attempt.answers.map((a) => ({ ...a, correct: true })) },
});
const stepsSansFaute = buildRevisionSteps(payloadSansFaute);
check('sans faute : pas d’étape de correction, mais des bonus',
  stepsSansFaute.filter((s) => s.kind === 'exemple').length === 0 && stepsSansFaute.some((s) => s.id.startsWith('bonus-')));

const stepsVides = buildRevisionSteps({ ...payloadVide, items: [] });
check('charge dégénérée (0 question) → parcours minimal jouable',
  stepsVides.length === 2 && stepsVides[0].kind === 'mission' && stepsVides[1].kind === 'recap');

/* ------------------------------------------------------------------ */
console.log('\n── Correction des exercices (règle partagée) ──');
/* ------------------------------------------------------------------ */

const qcmEx = { id: 'q1', kind: 'qcm' as const, prompt: '?', options: ['a', 'b', 'c'], answer: 1, accept: null, explanation: '', skill: null };
check('QCM : bon index accepté', checkLessonAnswer(qcmEx, 1));
check('QCM : mauvais index refusé', !checkLessonAnswer(qcmEx, 2));
const texteEx = { id: 'q2', kind: 'texte' as const, prompt: '?', options: [], answer: null, accept: ['42', 'quarante-deux'], explanation: '', skill: null };
check('texte : accents et casse ignorés (même règle que le serveur)', checkLessonAnswer(texteEx, ' Quarante-DEUX '));
check('texte : réponse fausse refusée', !checkLessonAnswer(texteEx, '41'));
check('texte : réponse vide refusée', !checkLessonAnswer(texteEx, ''));

/* ------------------------------------------------------------------ */
console.log(`\n🧪 Moteur de leçons — ${passed} contrôles`);
if (failures.length) {
  console.error(`❌ ${failures.length} échec(s) :`);
  for (const failure of failures) console.error(`   • ${failure}`);
  process.exit(1);
}
console.log('✅ Toutes les leçons et révisions sont conformes.\n');
