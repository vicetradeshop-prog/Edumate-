import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Gamepad2, LayoutDashboard } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Empty, Loader } from '../components/ui/Feedback.js';
import { StepPlayer } from '../components/lessons/StepPlayer.js';
import { endpoints, type RevisionPayload } from '../lib/api.js';
import { buildRevisionSteps } from '../lib/lessonSteps.js';
import { useDocumentTitle } from '../lib/hooks.js';

/**
 * Révision interactive d'un quiz joué.
 *
 * Accessible :
 *  - depuis le résultat d'un quiz (« Réviser ce quiz »), avec `?attempt=<id>` ;
 *  - depuis le tableau de bord / la progression, sans essai précisé : le
 *    serveur reprend alors le dernier essai du sujet.
 *
 * Deux modes, décidés côté serveur :
 *  - « quiz »         : l'essai est rejouable (graine conservée) → correction
 *                       pas à pas de chaque erreur + exercice de rattrapage ;
 *  - « entrainement » : pas d'essai exploitable → questions neuves avec
 *                       correction immédiate (la page n'est jamais vide).
 */
export default function QuizReviewPage() {
  const { topicId = '' } = useParams();
  const [params] = useSearchParams();
  const attemptId = params.get('attempt')?.trim() || undefined;

  const [payload, setPayload] = useState<RevisionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useDocumentTitle(payload ? `Révision : ${payload.topicName}` : 'Révision du quiz');

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    endpoints
      .revision(topicId, attemptId)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Impossible de charger cette révision.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, attemptId, reloadKey]);

  const steps = useMemo(() => (payload ? buildRevisionSteps(payload) : []), [payload]);
  const playthroughId = payload
    ? `${topicId}-${payload.mode}-${payload.seed}-${payload.attempt?.id ?? 'x'}-${reloadKey}`
    : 'none';

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  if (loading && !payload) return <Loader label="Préparation de ta révision…" large />;

  if (error || !payload) {
    return (
      <Empty
        emoji="📖"
        title="Révision indisponible"
        description={error ?? 'Ce sujet n’a pas pu être chargé.'}
        action={
          <>
            <Button variant="primary" onClick={retry}>
              Réessayer
            </Button>
            <Link to="/lecons">
              <Button variant="soft">Ouvrir une leçon</Button>
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
      meta={{ topicName: payload.topicName, emoji: payload.emoji, color: payload.color, subjectName: payload.subjectName }}
      mode="revision"
      exitTo="/tableau-de-bord"
      exitLabel="Tableau de bord"
      finishActions={
        <>
          <Link to={`/quiz/${encodeURIComponent(topicId)}/jouer`}>
            <Button variant="primary" icon={<Gamepad2 size={17} />}>
              Rejouer ce quiz
            </Button>
          </Link>
          <Link to={`/lecons/${encodeURIComponent(topicId)}`}>
            <Button variant="soft" icon={<BookOpen size={17} />}>
              Leçon complète
            </Button>
          </Link>
          <Link to="/lecons">
            <Button variant="ghost" icon={<LayoutDashboard size={17} />}>
              Toutes les leçons
            </Button>
          </Link>
        </>
      }
    />
  );
}
