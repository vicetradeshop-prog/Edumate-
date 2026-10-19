/**
 * EduMate — Carte dashboard « Ta prochaine révision ».
 *
 * Affiche le contrôle le plus proche, la notion prioritaire, la durée de la
 * séance du jour, la progression et les jours restants, avec un bouton
 * « Commencer » qui ouvre directement l'outil adapté (leçon, quiz, révision).
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarPlus, Play } from 'lucide-react';
import { Card, CardTitle } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { endpoints } from '../../lib/api.js';
import { useApi } from '../../lib/data.js';
import { formatDayLabel } from '../../lib/format.js';
import { ACTIVITY_META, PRIORITY_UI, daysLeftLabel } from '../../lib/planningUi.js';

export function NextRevisionCard() {
  const today = useApi(() => endpoints.planningToday(), { deps: [] });
  const plan = today.data?.today ?? null;
  const next = plan?.nextExam ?? null;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <Card className="plan-next">
        <div className="plan-next__head">
          <CardTitle icon={<span aria-hidden="true">🎯</span>}>Ta prochaine révision</CardTitle>
          {next ? (
            <Badge tone={next.daysLeft <= 2 ? 'danger' : 'primary'}>{daysLeftLabel(next.daysLeft)}</Badge>
          ) : null}
        </div>

        {today.loading && !today.data ? (
          <div className="ed-stack" style={{ gap: 8 }}>
            <div className="skeleton" style={{ height: 26 }} />
            <div className="skeleton" style={{ height: 40 }} />
          </div>
        ) : !next ? (
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <p className="ed-small ed-soft" style={{ margin: 0 }}>
              Aucun contrôle actif : ajoute-en un et EduMate construira ton programme de révision automatiquement.
            </p>
            <Link to="/planning?new=1">
              <Button variant="soft" size="sm" icon={<CalendarPlus size={15} />}>
                Ajouter un contrôle
              </Button>
            </Link>
          </div>
        ) : (
          <div className="plan-next__body">
            <div className="plan-next__exam">
              <strong>
                {next.exam.title}
              </strong>
              <span className="ed-small ed-mute">
                {formatDayLabel(next.exam.date)}
                {next.exam.time ? ` · ${next.exam.time}` : ''}
              </span>
              <span className="plan-next__progress">
                <span className="plan-bar" aria-hidden="true">
                  <motion.span
                    className="plan-bar__fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${next.prepPercent}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
                <span className="ed-small ed-mute">{next.prepPercent} % préparé</span>
              </span>
            </div>

            {next.topSession ? (
              <div className="plan-next__session">
                <span className="plan-next__notion">
                  <span aria-hidden="true">{next.topSession.emoji}</span>
                  {next.topSession.topicName || next.exam.title}
                  <Badge tone="outline">{next.topSession.durationMin} min</Badge>
                </span>
                <span className="ed-small ed-mute">
                  {ACTIVITY_META[next.topSession.activity].label} · priorité{' '}
                  {PRIORITY_UI[next.topSession.priority].label.toLowerCase()}
                </span>
                <div className="ed-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Link to={next.topSession.startPath}>
                    <Button variant="primary" size="sm" icon={<Play size={14} />}>
                      Commencer ma séance
                    </Button>
                  </Link>
                  <Link to={`/planning/${encodeURIComponent(next.exam.id)}`} className="section__link" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    Voir le planning <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="plan-next__session">
                <p className="ed-small ed-soft" style={{ margin: 0 }}>
                  Toutes les séances d'aujourd'hui sont faites ✅ Le planning de demain est déjà prêt.
                </p>
                <Link to={`/planning/${encodeURIComponent(next.exam.id)}`} className="section__link" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 8 }}>
                  Voir le planning <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
