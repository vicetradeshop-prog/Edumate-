import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Gamepad2, GraduationCap, List, Lock, NotebookText } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Empty, Loader } from '../components/ui/Feedback.js';
import { StepPlayer } from '../components/lessons/StepPlayer.js';
import { endpoints, type Fiche, type Lesson } from '../lib/api.js';
import { applyAiToLesson } from '../lib/lessonSteps.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { toast } from '../lib/store.js';

/** État du déblocage de la fiche de révision, affiché sur l'écran final. */
type FicheUnlockState =
  | { status: 'loading' }
  | { status: 'unlocked'; fiche: Fiche }
  | { status: 'updated'; fiche: Fiche }
  | { status: 'locked'; message?: string; rate: number; bestRate: number }
  | { status: 'error' };

/**
 * Leçon interactive d'un sujet : parcours animé, étape par étape
 * (mission → méthode → exemples guidés → exercices corrigés → piège → bilan).
 *
 * Le contenu vient de `GET /api/lessons/:topicId`. Deux boutons de rejou :
 *  - « Rejouer » (écran final, géré par le lecteur) : même leçon, remise à zéro ;
 *  - « Nouvelle leçon » : nouvelle graine → nouveaux exemples et exercices.
 *
 * Si une IA est configurée, l'étape « méthode » propose une version sur mesure
 * (générée une fois puis mise en cache pour tous les élèves).
 */
/**
 * Bannière de l'écran final : annonce le déblocage (ou la mise à jour) de la
 * fiche de révision, avec une apparition animée légèrement différée pour
 * laisser les confettis et le score respirer.
 */
function FicheUnlockBanner({ state, topicId }: { state: FicheUnlockState | null; topicId: string }) {
  if (!state) return null;

  if (state.status === 'loading') {
    return (
      <motion.p
        className="fiche-banner fiche-banner--mute"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        ✨ Préparation de ta fiche de révision…
      </motion.p>
    );
  }

  if (state.status === 'unlocked' || state.status === 'updated') {
    const first = state.status === 'unlocked';
    return (
      <motion.div
        className={`fiche-banner${first ? ' fiche-banner--new' : ''}`}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        role="status"
      >
        <motion.span
          className="fiche-banner__icon"
          aria-hidden="true"
          initial={{ rotate: -12, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 14 }}
        >
          {first ? '🎉' : '📔'}
        </motion.span>
        <span className="fiche-banner__text">
          <strong>{first ? 'Fiche de révision créée !' : 'Fiche de révision mise à jour.'}</strong>
          {first
            ? ` ${state.fiche.flashcards.length} cartes mémo et ${state.fiche.sections.length} sections t’attendent dans « Apprendre → Fiches ».`
            : ' Tes derniers scores y sont enregistrés.'}
        </span>
        <Link to={`/fiches/${encodeURIComponent(topicId)}`}>
          <Button size="sm" variant="primary" icon={<NotebookText size={15} />} iconRight={<ArrowRight size={14} />}>
            Voir ma fiche
          </Button>
        </Link>
      </motion.div>
    );
  }

  if (state.status === 'locked') {
    return (
      <motion.div
        className="fiche-banner fiche-banner--locked"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        role="status"
      >
        <span className="fiche-banner__icon" aria-hidden="true">
          <Lock size={17} />
        </span>
        <span className="fiche-banner__text">
          <strong>Leçon pas encore validée : {Math.round((state.rate ?? 0) * 100)} %</strong>
          <span className="ed-mute"> (meilleur : {Math.round((state.bestRate ?? 0) * 100)} %)</span>
          <br />
          {state.message ?? 'Atteins 80 % d’exercices justes pour valider la leçon et créer sa fiche.'}
          <br />
          <span className="ed-mute">Un seul bouton pour retenter : « Rejouer la leçon » juste en dessous.</span>
        </span>
      </motion.div>
    );
  }

  return (
    <motion.p
      className="fiche-banner fiche-banner--mute"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.35 }}
    >
      Impossible de vérifier le déblocage de ta fiche pour le moment — elle t’attendra à ta prochaine visite.
    </motion.p>
  );
}

export default function LessonPage() {
  const { topicId = '' } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [playCount, setPlayCount] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [ficheState, setFicheState] = useState<FicheUnlockState | null>(null);
  useDocumentTitle(lesson ? `Leçon : ${lesson.topicName}` : 'Leçon interactive');

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    endpoints
      .lesson(topicId, seed)
      .then((response) => {
        if (cancelled) return;
        setLesson(response.lesson);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Impossible de charger cette leçon.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, seed]);

  /* Enrichissement IA : fusionné dans les étapes SANS réinitialiser la partie. */
  const enrich = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const response = await endpoints.enrichLesson(topicId);
      if (response.ai) {
        setLesson((prev) => (prev ? applyAiToLesson(prev, response.ai!) : prev));
        toast.success('Méthode réécrite par l’IA ✨');
      } else {
        toast.info(response.message ?? 'L’assistant n’a pas pu réécrire la méthode pour l’instant.');
      }
    } catch (cause) {
      toast.fromError(cause, 'Enrichissement IA impossible.');
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, topicId]);

  /* Nouvelle leçon (autres exemples/exercices) : nouvelle graine + nouvelle partie. */
  const newLesson = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
    setPlayCount((count) => count + 1);
    setFicheState(null);
  }, []);

  /*
   * Fin de partie : le serveur juge le score d'exercices et, s'il suffit
   * (≥ 70 %), crée automatiquement la fiche de révision du sujet. Un échec
   * réseau ne gâche jamais l'écran de félicitations : bannière discrète.
   */
  const onLessonFinish = useCallback(
    ({ score, exerciseCount, durationSec }: { score: number; exerciseCount: number; durationSec: number }) => {
      setFicheState({ status: 'loading' });
      endpoints
        .completeLesson(topicId, { score, total: exerciseCount, durationSec })
        .then((response) => {
          if (response.validated && response.fiche) {
            setFicheState({ status: response.already ? 'updated' : 'unlocked', fiche: response.fiche });
            if (!response.already) toast.success('Leçon validée : fiche de révision créée ✨');
          } else {
            setFicheState({
              status: 'locked',
              message: response.message,
              rate: response.rate,
              bestRate: response.bestRate,
            });
          }
        })
        .catch(() => setFicheState({ status: 'error' }));
    },
    [topicId],
  );

  const steps = useMemo(() => lesson?.steps ?? [], [lesson]);
  const playthroughId = lesson ? `${topicId}-${seed}-${playCount}` : 'none';

  if (loading && !lesson) return <Loader label="Préparation de ta leçon…" large />;

  if (error || !lesson) {
    return (
      <Empty
        emoji="📚"
        title="Leçon indisponible"
        description={error ?? 'Ce sujet n’a pas pu être chargé.'}
        action={
          <>
            <Button variant="primary" onClick={() => setSeed((value) => value + 1)}>
              Réessayer
            </Button>
            <Link to="/lecons">
              <Button variant="soft">Toutes les leçons</Button>
            </Link>
          </>
        }
      />
    );
  }

  return (
    <StepPlayer
      steps={steps}
      playthroughId={playthroughId}
      meta={{ topicName: lesson.topicName, emoji: lesson.emoji, color: lesson.color, subjectName: lesson.subjectName }}
      mode="lesson"
      exitTo="/lecons"
      exitLabel="Leçons"
      onAi={lesson.aiAvailable && !lesson.ai ? () => void enrich() : undefined}
      aiLoading={aiLoading}
      onFinish={onLessonFinish}
      replayEmphasis={ficheState?.status === 'locked'}
      finishExtra={<FicheUnlockBanner state={ficheState} topicId={topicId} />}
      finishActions={
        <>
          <Link to={`/quiz/${encodeURIComponent(topicId)}/jouer`}>
            <Button variant="primary" icon={<Gamepad2 size={17} />}>
              Faire le quiz
            </Button>
          </Link>
          <Button variant="soft" icon={<GraduationCap size={17} />} onClick={newLesson}>
            Nouvelle leçon
          </Button>
          <Link to="/lecons">
            <Button variant="ghost" icon={<List size={17} />}>
              Autres leçons
            </Button>
          </Link>
        </>
      }
    />
  );
}
