import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, BookOpenText, CheckCircle2, Home, MessageCircleQuestion, NotebookText, RefreshCw, Sparkles, TrendingUp, XCircle } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, Stars } from '../components/ui/Badge.js';
import { Confetti } from '../components/ui/Confetti.js';
import { Empty, QuestionText } from '../components/ui/Feedback.js';
import { QuizCoach, type QuizCoachHandle } from '../components/quiz/QuizCoach.js';
import { useCountUp, useDocumentTitle } from '../lib/hooks.js';
import { useAuth, useQuiz } from '../lib/store.js';
import { encouragement, formatDuration } from '../lib/format.js';

/** Anneau de score animé (SVG, sans bibliothèque de graphiques). */
function ScoreRing({ percent, color }: { percent: number; color: string }) {
  const animated = useCountUp(percent, 1100);
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, animated)) / 100);
  return (
    <div className="result-ring">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Score : ${percent} pour cent`}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--ed-surface-3)" strokeWidth="16" />
        <motion.circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="result-ring__value">
        <span className="result-ring__percent">{Math.round(animated)}%</span>
        <span className="result-ring__label">de réussite</span>
      </div>
    </div>
  );
}

export default function QuizResultPage() {
  const result = useQuiz((state) => state.result);
  const clear = useQuiz((state) => state.clear);
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const coachRef = useRef<QuizCoachHandle>(null);
  useDocumentTitle(result ? `Résultat : ${result.topicName}` : 'Résultat du quiz');

  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [result]);

  if (!result) {
    return (
      <Empty
        emoji="📊"
        title="Aucun résultat à afficher"
        description="Termine un quiz pour voir ton score détaillé et les corrections."
        action={
          <>
            <Link to="/quiz">
              <Button variant="primary">Choisir un quiz</Button>
            </Link>
            <Link to="/progression">
              <Button variant="soft">Voir ma progression</Button>
            </Link>
          </>
        }
      />
    );
  }

  const feedback = encouragement(result.percent);
  const correctCount = result.results.filter((item) => item.correct).length;
  const mistakes = result.results.filter((item) => !item.correct);
  const color = result.percent >= 70 ? 'var(--ed-success)' : result.percent >= 40 ? 'var(--ed-warning)' : 'var(--ed-danger)';

  const replay = (): void => {
    clear();
    navigate(`/quiz/${result.topicId}/jouer`);
  };

  /*
   * Bouton « Réviser ce quiz » : ouvre la révision INTERACTIVE (correction pas
   * à pas de chaque erreur + exercices de rattrapage). L'identifiant d'essai
   * cible la partie qui vient d'être jouée ; sans compte (essai non
   * enregistré), la page bascule automatiquement en session d'entraînement.
   */
  const reviewPath = `/quiz/${encodeURIComponent(result.topicId)}/revision${result.attemptId ? `?attempt=${encodeURIComponent(result.attemptId)}` : ''}`;

  return (
    <div className="ed-stack" style={{ gap: 22, maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <Confetti show={result.percent >= 70} />

      <motion.section
        className="card result-hero"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <span style={{ fontSize: 46 }} aria-hidden="true">
          {feedback.emoji}
        </span>
        <h1 style={{ marginTop: 6 }}>{feedback.title}</h1>
        <p className="ed-soft" style={{ maxWidth: '52ch', margin: '6px auto 0' }}>
          {feedback.message}
        </p>

        <ScoreRing percent={result.percent} color={color} />

        <div className="ed-row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="primary">
            {result.emoji} {result.topicName}
          </Badge>
          <Badge tone="outline">
            {result.score} / {result.total} bonnes réponses
          </Badge>
          <Badge tone="outline">{formatDuration(result.durationSec)}</Badge>
          <span className="ed-row">
            <Stars score={(result.score / Math.max(1, result.total)) * 5} size={17} />
          </span>
        </div>

        <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <Link to={reviewPath}>
            <Button variant="primary" size="lg" icon={<BookOpen size={18} />}>
              Réviser ce quiz
            </Button>
          </Link>
          {/* Pont quiz → leçon → fiche : le parcours complet de révision. */}
          <Link to={`/lecons/${encodeURIComponent(result.topicId)}`}>
            <Button variant="soft" size="lg" icon={<BookOpenText size={18} />}>
              Voir la leçon
            </Button>
          </Link>
          <Button variant="soft" onClick={replay} icon={<RefreshCw size={17} />}>
            Recommencer
          </Button>
          <Link to="/quiz">
            <Button variant="soft" icon={<Sparkles size={17} />}>
              Autre sujet
            </Button>
          </Link>
          <Link to="/progression">
            <Button variant="ghost" icon={<TrendingUp size={17} />}>
              Ma progression
            </Button>
          </Link>
          <Link to={`/fiches/${encodeURIComponent(result.topicId)}`}>
            <Button variant="ghost" icon={<NotebookText size={17} />}>
              Ma fiche de révision
            </Button>
          </Link>
          <Link to="/tableau-de-bord">
            <Button variant="ghost" icon={<Home size={17} />}>
              Tableau de bord
            </Button>
          </Link>
        </div>

        <p className="ed-small ed-mute" style={{ marginTop: 14 }}>
          💡 Astuce : réussis la <strong>leçon</strong> de ce sujet et sa fiche de révision se crée toute seule dans
          « Apprendre → Fiches de révision ».
        </p>

        {!user ? (
          <p className="ed-small ed-mute" style={{ marginTop: 16 }}>
            Ce score n’a pas pu être enregistré : connecte-toi pour suivre ta progression.
          </p>
        ) : null}
      </motion.section>

      {mistakes.length > 0 ? (
        <Card>
          <CardTitle icon={<XCircle size={17} style={{ color: 'var(--ed-danger)' }} />}>
            {mistakes.length} point{mistakes.length > 1 ? 's' : ''} à corriger
          </CardTitle>
          <CardSubtitle>
            Chaque erreur est une information précieuse : lance la révision interactive ci-dessus pour les corriger pas
            à pas, puis rejoue — les questions changent à chaque partie.
          </CardSubtitle>
        </Card>
      ) : (
        <Card>
          <CardTitle icon={<CheckCircle2 size={17} style={{ color: 'var(--ed-success)' }} />}>Sans faute !</CardTitle>
          <CardSubtitle>Tu peux augmenter la difficulté ou passer à un autre thème.</CardSubtitle>
        </Card>
      )}

      <section className="ed-stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: '1.2rem' }}>Correction détaillée</h2>
        {result.results.map((item, position) => (
          <motion.article
            key={item.questionId}
            className="card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: Math.min(0.3, position * 0.04) }}
            style={{ borderLeft: `5px solid ${item.correct ? 'var(--ed-success)' : 'var(--ed-danger)'}` }}
          >
            <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="ed-row" style={{ gap: 8 }}>
                <strong>Question {position + 1}</strong>
                {item.skill ? <Badge tone="outline">{item.skill}</Badge> : null}
              </span>
              <Badge tone={item.correct ? 'success' : 'danger'}>
                {item.correct ? (
                  <>
                    <CheckCircle2 size={12} /> Correcte
                  </>
                ) : (
                  <>
                    <XCircle size={12} /> À revoir
                  </>
                )}
              </Badge>
            </div>

            <div style={{ fontSize: '0.95rem', marginBottom: 10 }}>
              <QuestionText>{item.prompt}</QuestionText>
            </div>

            {item.options?.length ? (
              <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6, marginBottom: 10 }}>
                {item.options.map((option, optionIndex) => {
                  const isAnswer = optionIndex === item.answer;
                  const isGiven = optionIndex === Number(item.given);
                  return (
                    <li
                      key={optionIndex}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        padding: '7px 11px',
                        borderRadius: 12,
                        fontSize: '0.9rem',
                        background: isAnswer ? 'var(--ed-success-soft)' : isGiven ? 'var(--ed-danger-soft)' : 'var(--ed-surface-2)',
                        border: `1px solid ${isAnswer ? 'var(--ed-success)' : isGiven ? 'var(--ed-danger)' : 'var(--ed-border)'}`,
                      }}
                    >
                      <span style={{ fontWeight: 800, opacity: 0.7 }}>{String.fromCharCode(65 + optionIndex)}</span>
                      <span className="ed-grow">
                        <QuestionText>{option}</QuestionText>
                      </span>
                      {isAnswer ? <CheckCircle2 size={15} style={{ color: 'var(--ed-success)' }} /> : null}
                      {isGiven && !isAnswer ? <XCircle size={15} style={{ color: 'var(--ed-danger)' }} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="ed-stack" style={{ gap: 6, marginBottom: 10, fontSize: '0.9rem' }}>
                <span>
                  <strong>Ta réponse :</strong> {String(item.given ?? '—') || '(vide)'}
                </span>
                <span>
                  <strong>Réponse attendue :</strong> {item.accept?.join(' ou ') ?? '—'}
                </span>
              </div>
            )}

            <div className="feedback" style={{ marginTop: 0 }}>
              <div className="feedback__title">
                <Sparkles size={15} style={{ color: 'var(--ed-primary)' }} /> Explication
              </div>
              <div className="ed-small">
                <QuestionText>{item.explanation}</QuestionText>
              </div>
            </div>

            <div className="ed-row" style={{ marginTop: 12 }}>
              <Button
                size="sm"
                variant="soft"
                icon={<MessageCircleQuestion size={15} />}
                onClick={() => coachRef.current?.explainQuestion(position + 1)}
              >
                Comment trouver la réponse ?
              </Button>
            </div>
          </motion.article>
        ))}
      </section>

      {/* ------------------------------ Coach IA --------------------------- */}
      <QuizCoach ref={coachRef} result={result} />

      <Card flat>
        <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <CardTitle icon={<ArrowRight size={16} />}>Et maintenant ?</CardTitle>
            <CardSubtitle>
              {mistakes.length
                ? `Lance la révision interactive pour transformer tes ${mistakes.length} erreur(s) en acquis, puis rejoue ce sujet.`
                : 'Parfait : augmente la difficulté ou découvre un nouveau thème.'}
            </CardSubtitle>
          </div>
          <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Link to={reviewPath}>
              <Button variant="primary" icon={<BookOpen size={16} />}>
                Révision interactive
              </Button>
            </Link>
            <Button variant="soft" onClick={replay}>
              Rejouer
            </Button>
            <Button variant="ghost" icon={<MessageCircleQuestion size={16} />} onClick={() => coachRef.current?.focusInput()}>
              Parler au coach
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
