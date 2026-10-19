import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock3, Flag, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Empty } from '../../components/ui/Feedback.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { useDocumentTitle, useHotkeys } from '../../lib/hooks.js';
import { toast } from '../../lib/store.js';

interface Lap {
  index: number;
  elapsed: number;
  split: number;
}

function formatMs(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centis = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export default function StopwatchToolPage() {
  useDocumentTitle('Chronomètre');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);

  const tick = useCallback(() => {
    const start = performance.now();
    let base = 0;
    setElapsed((current) => {
      base = current;
      return current;
    });
    let frame = 0;
    const loop = (): void => {
      setElapsed(base + (performance.now() - start));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let base = 0;
    // On capture la valeur courante sans provoquer de rendu supplémentaire.
    setElapsed((current) => {
      base = current;
      return current;
    });
    let frame = 0;
    const loop = (): void => {
      setElapsed(base + (performance.now() - start));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  useEffect(() => {
    document.title = running ? `${formatMs(elapsed)} · Chronomètre` : 'Chronomètre · EduMate';
  }, [running, elapsed]);

  const addLap = (): void => {
    setLaps((prev) => {
      const previous = prev[0]?.elapsed ?? 0;
      return [{ index: prev.length + 1, elapsed, split: elapsed - previous }, ...prev];
    });
  };

  const reset = (): void => {
    setRunning(false);
    setElapsed(0);
    setLaps([]);
  };

  useHotkeys(
    {
      ' ': () => setRunning((value) => !value),
      l: addLap,
      r: reset,
    },
    true,
  );

  const best = laps.length > 1 ? Math.min(...laps.map((lap) => lap.split)) : null;
  const worst = laps.length > 1 ? Math.max(...laps.map((lap) => lap.split)) : null;

  return (
    <ToolShell
      title="Chronomètre"
      description="Mesure précise au centième de seconde, avec tours intermédiaires pour comparer tes temps."
      icon={<Clock3 size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Flag size={16} />}>Raccourcis clavier</CardTitle>
            <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8, fontSize: '0.9rem', color: 'var(--ed-text-soft)' }}>
              <li>
                <span className="kbd">Espace</span> démarrer / pause
              </li>
              <li>
                <span className="kbd">L</span> enregistrer un tour
              </li>
              <li>
                <span className="kbd">R</span> réinitialiser
              </li>
            </ul>
          </Card>
          <Card flat>
            <CardTitle>⏱️ Idées d’usage</CardTitle>
            <CardSubtitle>
              Chronométrer un exercice type bac, mesurer le temps réel d’une dissertation, ou se lancer des défis de
              calcul mental.
            </CardSubtitle>
          </Card>
        </>
      }
    >
      <div style={{ display: 'grid', placeItems: 'center', gap: 22, padding: '6px 0' }}>
        <div className={`dial${running ? ' dial--running' : ''}`} style={{ width: 'min(360px, 84vw)' }}>
          <div className="dial__value">
            <span className="dial__time" style={{ fontVariantNumeric: 'tabular-nums' }} role="timer" aria-live="off">
              {formatMs(elapsed)}
            </span>
            <span className="dial__hint">{running ? 'En marche' : elapsed > 0 ? 'En pause' : 'Prêt'}</span>
          </div>
        </div>

        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button size="lg" variant={running ? 'soft' : 'primary'} onClick={() => setRunning((value) => !value)} icon={running ? <Pause size={19} /> : <Play size={19} />}>
            {running ? 'Pause' : elapsed > 0 ? 'Reprendre' : 'Démarrer'}
          </Button>
          <Button size="lg" variant="ghost" onClick={addLap} disabled={elapsed === 0} icon={<Flag size={18} />}>
            Tour
          </Button>
          <IconButton label="Réinitialiser" variant="soft" onClick={reset} disabled={elapsed === 0 && laps.length === 0}>
            <RotateCcw size={18} />
          </IconButton>
        </div>

        <div style={{ width: '100%', maxWidth: 560 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontFamily: 'var(--ed-font-display)' }}>Tours enregistrés</strong>
            {laps.length ? (
              <IconButton
                label="Effacer les tours"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLaps([]);
                  toast.info('Tours effacés.');
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            ) : null}
          </div>

          {laps.length === 0 ? (
            <Empty emoji="⏱️" title="Aucun tour" description="Lance le chrono puis clique sur « Tour » pour comparer tes temps." />
          ) : (
            <div className="ed-stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {laps.map((lap) => (
                <motion.div
                  key={lap.index}
                  className="list-item"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ background: 'var(--ed-surface-2)', borderRadius: 12 }}
                >
                  <span className="list-item__icon" aria-hidden="true">
                    <Badge tone="outline">#{lap.index}</Badge>
                  </span>
                  <span className="list-item__body">
                    <span className="list-item__title ed-mono">{formatMs(lap.split)}</span>
                    <span className="list-item__meta">Cumul : {formatMs(lap.elapsed)}</span>
                  </span>
                  {best !== null && lap.split === best ? <Badge tone="success">Meilleur</Badge> : null}
                  {worst !== null && lap.split === worst ? <Badge tone="danger">Plus lent</Badge> : null}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
