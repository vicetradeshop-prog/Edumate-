import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Clock, Heart, Info, ListOrdered, Play, Sparkles } from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, DifficultyBadge, Stars } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Segmented } from '../components/ui/Field.js';
import { TopicCard } from '../components/quiz/TopicCard.js';
import { endpoints, type GeneratedQuiz } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { toast, useQuiz } from '../lib/store.js';
import { formatDuration, softColor } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import type { CatalogTopic } from '../../shared/types.js';

/** Univers visuel de chaque matière (motif d'arrière-plan). */
const SUBJECT_PATTERNS: Record<string, string> = {
  mathematiques: 'geometry',
  francais: 'books',
  'physique-chimie': 'lab',
  svt: 'nature',
  'histoire-geographie': 'map',
  philosophie: 'mind',
  anglais: 'language',
  espagnol: 'language',
  nsi: 'tech',
  ses: 'economy',
};

export default function QuizDetailPage() {
  const { topicId = '' } = useParams();
  const navigate = useNavigate();
  const setSession = useQuiz((state) => state.setSession);
  useDocumentTitle('Détail du quiz');

  const detail = useApi(() => endpoints.topic(topicId), { deps: [topicId] });
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'facile' | 'moyen' | 'difficile' | ''>('');
  const [favorite, setFavorite] = useState(false);
  const [mastery, setMastery] = useState<{ bestScore: number; attempts: number; rate: number } | null>(null);
  const [starting, setStarting] = useState(false);

  const topic = detail.data?.topic;
  const related = detail.data?.related ?? [];

  useEffect(() => {
    if (topic) {
      document.title = `${topic.name} · EduMate`;
      setDifficulty(topic.difficulty);
    }
  }, [topic]);

  useEffect(() => {
    if (!topicId) return;
    endpoints
      .mastery()
      .then((response) => {
        const entry = (response.items as { topicId: string; bestScore: number; attempts: number; rate: number }[]).find(
          (item) => item.topicId === topicId,
        );
        setMastery(entry ?? null);
      })
      .catch(() => undefined);
    endpoints
      .favorites()
      .then((response) => setFavorite(response.favorites.includes(topicId)))
      .catch(() => undefined);
  }, [topicId]);

  const start = async (): Promise<void> => {
    if (!topic) return;
    setStarting(true);
    try {
      const quiz: GeneratedQuiz = await endpoints.generate({
        topicId: topic.id,
        count,
        difficulty: difficulty || undefined,
        seed: Math.floor(Math.random() * 1_000_000),
      });
      setSession({
        topicId: quiz.topic.id,
        topicName: quiz.topic.name,
        subjectName: quiz.topic.subjectName,
        themeName: quiz.topic.themeName,
        levelName: quiz.topic.levelName,
        emoji: quiz.topic.emoji,
        color: quiz.topic.color,
        accent: quiz.topic.accent,
        seed: quiz.seed,
        durationSec: quiz.durationSec,
        startedAt: Date.now(),
        questions: quiz.questions,
      });
      navigate(`/quiz/${topic.id}/jouer`);
    } catch (error) {
      toast.fromError(error, 'Impossible de démarrer ce quiz pour le moment.');
    } finally {
      setStarting(false);
    }
  };

  const toggleFavorite = async (): Promise<void> => {
    const next = !favorite;
    setFavorite(next);
    try {
      const result = await endpoints.toggleFavorite(topicId);
      setFavorite(result.added);
      toast.info(result.added ? 'Ajouté à tes favoris ⭐' : 'Retiré de tes favoris');
    } catch (error) {
      setFavorite(!next);
      toast.fromError(error);
    }
  };

  if (detail.loading && !detail.data) return <Loader label="Chargement du sujet…" large />;
  if (detail.error || !topic) {
    return (
      <Empty
        emoji="🤔"
        title="Sujet introuvable"
        description={detail.error ?? 'Ce quiz n’existe plus dans le catalogue.'}
        action={
          <Link to="/quiz">
            <Button variant="primary">Retour au catalogue</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="ed-stack" style={{ gap: 22, maxWidth: 1080, margin: '0 auto', width: '100%' }}>
      <Link to="/quiz" className="section__link">
        <ArrowLeft size={14} /> Retour au catalogue
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="card"
        data-pattern={SUBJECT_PATTERNS[topic.subjectId] ?? 'geometry'}
        style={{
          padding: 'clamp(20px, 3vw, 32px)',
          background: `linear-gradient(135deg, ${softColor(topic.color, 0.16)}, ${softColor(topic.accent, 0.12)})`,
          borderColor: softColor(topic.color, 0.28),
          overflow: 'hidden',
        }}
      >
        <div className="ed-row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span
            style={{
              width: 66,
              height: 66,
              borderRadius: 22,
              display: 'grid',
              placeItems: 'center',
              fontSize: 34,
              background: 'var(--ed-surface)',
              boxShadow: 'var(--ed-shadow-sm)',
              flex: 'none',
            }}
            aria-hidden="true"
          >
            {topic.emoji}
          </span>
          <div className="ed-grow" style={{ minWidth: 220 }}>
            <div className="ed-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <Badge tone="primary">{topic.subjectName}</Badge>
              <Badge tone="outline">{topic.levelName}</Badge>
              <Badge tone="outline">{topic.themeName}</Badge>
            </div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 1.1rem + 1vw, 2rem)' }}>{topic.name}</h1>
            <p className="ed-soft" style={{ marginTop: 6 }}>
              {topic.generated
                ? 'Questions générées à la volée : chaque partie est différente, avec correction détaillée.'
                : `Banque de ${topic.pool} questions rédigées, tirées et mélangées à chaque partie.`}
            </p>
          </div>
          <IconButton label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} variant="soft" onClick={toggleFavorite}>
            <Heart size={19} fill={favorite ? 'currentColor' : 'none'} style={{ color: favorite ? 'var(--ed-warning)' : undefined }} />
          </IconButton>
        </div>

        <div className="ed-row" style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <span className="quiz-chip">
            <ListOrdered size={15} /> {topic.pool >= 9999 ? 'questions illimitées' : `${topic.pool} questions`}
          </span>
          <span className="quiz-chip">
            <Clock size={15} /> ~{formatDuration(count * 45)}
          </span>
          {mastery ? (
            <span className="quiz-chip">
              <Stars score={mastery.bestScore * 5} /> meilleur score · {mastery.attempts} tentative{mastery.attempts > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="quiz-chip">
              <Sparkles size={15} /> jamais tenté
            </span>
          )}
        </div>
      </motion.div>

      <div className="split">
        <Card>
          <CardTitle icon={<Play size={17} />}>Configurer ta session</CardTitle>
          <CardSubtitle>Le nombre de questions et la difficulté sont adaptés à chaque partie.</CardSubtitle>

          <div className="ed-stack" style={{ gap: 18, marginTop: 18 }}>
            <div>
              <p className="field__label" style={{ marginBottom: 8 }}>
                Nombre de questions
              </p>
              <Segmented
                ariaLabel="Nombre de questions"
                value={String(count)}
                onChange={(value) => setCount(Number(value))}
                options={[
                  { value: '5', label: '5 · rapide' },
                  { value: '10', label: '10 · standard' },
                  { value: '15', label: '15 · approfondi' },
                  { value: '20', label: '20 · marathon' },
                ]}
              />
            </div>

            <div>
              <p className="field__label" style={{ marginBottom: 8 }}>
                Difficulté
              </p>
              <Segmented
                ariaLabel="Difficulté"
                value={difficulty || topic.difficulty}
                onChange={(value) => setDifficulty(value as 'facile' | 'moyen' | 'difficile')}
                options={[
                  { value: 'facile', label: 'Facile' },
                  { value: 'moyen', label: 'Moyen' },
                  { value: 'difficile', label: 'Difficile' },
                ]}
              />
            </div>

            <Button size="lg" variant="primary" block loading={starting} onClick={start} iconRight={<ArrowRight size={18} />}>
              Commencer le quiz
            </Button>

            <Link to={`/lecons/${encodeURIComponent(topic.id)}`} style={{ display: 'block', marginTop: 10 }}>
              <Button size="sm" variant="soft" block icon={<BookOpen size={16} />}>
                Voir la leçon interactive
              </Button>
            </Link>

            <Notice tone="info">
              <strong>Tu peux quitter à tout moment</strong> : ta progression est conservée dans ton navigateur et le
              score est enregistré dès que tu valides la dernière question.
            </Notice>
          </div>
        </Card>

        <div className="ed-stack" style={{ gap: 18 }}>
          <Card>
            <CardTitle icon={<Info size={17} />}>Ce que tu vas travailler</CardTitle>
            <ul style={{ marginTop: 10, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', display: 'grid', gap: 6, fontSize: '0.92rem' }}>
              <li>Thème : {topic.themeName}</li>
              <li>Niveau : {topic.levelName}</li>
              <li>Matière : {topic.subjectName}</li>
              <li>Correction détaillée après chaque réponse</li>
              <li>Statistiques enregistrées dans ta progression</li>
            </ul>
            <Link to="/assistant" className="section__link" style={{ marginTop: 12, display: 'inline-flex' }}>
              Demander une explication à l’assistant <ArrowRight size={14} />
            </Link>
          </Card>

          {mastery ? (
            <Card>
              <CardTitle icon={<BookOpen size={17} />}>Ton historique</CardTitle>
              <div className="ed-stack" style={{ gap: 10, marginTop: 10 }}>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Meilleur score</span>
                  <Stars score={mastery.bestScore * 5} />
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Réussite moyenne</span>
                  <strong>{Math.round(mastery.rate * 100)} %</strong>
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Tentatives</span>
                  <strong>{mastery.attempts}</strong>
                </div>
                <Link to="/progression" className="section__link">
                  Voir ma progression <ArrowRight size={14} />
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section>
          <div className="section__head">
            <h2 style={{ fontSize: '1.2rem' }}>Dans le même thème</h2>
            <Link to={`/quiz?theme=${encodeURIComponent(topic.themeId)}`} className="section__link">
              Tout le thème <ArrowRight size={14} />
            </Link>
          </div>
          <div className="card-grid stagger">
            {related.map((item: CatalogTopic) => (
              <TopicCard key={item.id} topic={item} compact />
            ))}
          </div>
        </section>
      ) : null}

      <Card flat>
        <div className="ed-row" style={{ justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <CardTitle icon={<DifficultyBadge difficulty={topic.difficulty} />}>Niveau conseillé</CardTitle>
            <CardSubtitle>
              {topic.difficulty === 'facile'
                ? 'Idéal pour découvrir ou consolider les bases.'
                : topic.difficulty === 'moyen'
                  ? 'Niveau standard du programme : à faire régulièrement.'
                  : 'Sujet exigeant : parfait pour viser l’excellence.'}
            </CardSubtitle>
          </div>
          <Button variant="soft" onClick={start} loading={starting} icon={<Play size={16} />}>
            Lancer maintenant
          </Button>
        </div>
      </Card>
    </div>
  );
}
