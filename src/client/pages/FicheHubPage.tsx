/**
 * EduMate — Hub des fiches de révision (refonte v2.6).
 *
 * Une bande héro animée (compteurs qui montent), puis les fiches en cartes
 * « couverture » : bandeau dégradé à la couleur de la matière, emoji géant en
 * filigrane, stats de validation (leçon / quiz / cartes) et ouverture en un
 * clic. Cascade d'apparition, survol lumineux, zéro écran vide sans guide.
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpenText, Gamepad2, Layers, NotebookText, Sparkles, Trophy } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useCountUp, useDocumentTitle } from '../lib/hooks.js';
import { formatRelative } from '../lib/format.js';

function HeroStat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const animated = useCountUp(value, 900);
  return (
    <span className="fiche2-hero__stat">
      <strong>
        {Math.round(animated)}
        {suffix}
      </strong>
      {label}
    </span>
  );
}

export default function FicheHubPage() {
  useDocumentTitle('Fiches de révision');
  const fiches = useApi(() => endpoints.fiches(), { deps: [] });
  const list = fiches.data?.fiches ?? [];
  const totalCards = list.reduce((sum, entry) => sum + entry.cardCount, 0);

  return (
    <div className="ed-stack" style={{ gap: 20 }}>
      {/* ------------------------------- Héro ------------------------------ */}
      <motion.header
        className="fiche2-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="fiche2-hero__watermark" aria-hidden="true">
          🗂️
        </span>
        <div className="fiche2-hero__main">
          <span className="page-head__eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>
            <NotebookText size={13} style={{ verticalAlign: '-2px' }} /> Apprendre
          </span>
          <h1>Mes fiches de révision</h1>
          <p>
            Nées automatiquement de tes leçons réussies : l'essentiel du cours, les pièges, les formules et des
            cartes mémo à retourner dans tous les sens.
          </p>
          {list.length > 0 ? (
            <div className="fiche2-hero__stats">
              <HeroStat value={list.length} label={list.length > 1 ? 'fiches' : 'fiche'} />
              <HeroStat value={totalCards} label="cartes mémo" />
              <HeroStat value={list.filter((entry) => entry.quizBest !== null && entry.quizBest >= 80).length} label="quiz ≥ 80 %" />
            </div>
          ) : null}
        </div>
      </motion.header>

      {fiches.error ? <Notice tone="danger">{fiches.error}</Notice> : null}

      {fiches.loading && !fiches.data ? (
        <div className="fiche2-grid">
          <div className="skeleton" style={{ height: 230, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 230, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 230, borderRadius: 20 }} />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <Empty
            emoji="🗂️"
            title="Aucune fiche pour l’instant"
            description="Une fiche se crée toute seule dès que tu réussis une leçon avec au moins 80 % d’exercices justes. Suis le parcours :"
          />
          <div className="fiche-howto" aria-hidden="false">
            {[
              { icon: <Gamepad2 size={20} />, title: 'Joue un quiz', text: 'Repère un sujet fragile ou nouveau.' },
              { icon: <BookOpenText size={20} />, title: 'Réussis sa leçon', text: '≥ 80 % d’exercices : la fiche naît toute seule.' },
              { icon: <NotebookText size={20} />, title: 'Révise avec la fiche', text: 'Sections animées + cartes mémo à retourner.' },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                className="fiche-howto__step"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.12, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="fiche-howto__icon">{item.icon}</span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
                {index < 2 ? (
                  <span className="fiche-howto__arrow" aria-hidden="true">
                    <ArrowRight size={16} />
                  </span>
                ) : null}
              </motion.div>
            ))}
          </div>
          <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Link to="/lecons">
              <Button variant="primary" icon={<BookOpenText size={16} />}>
                Ouvrir une leçon
              </Button>
            </Link>
            <Link to="/quiz">
              <Button variant="soft" icon={<Gamepad2 size={16} />}>
                Faire un quiz
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="fiche2-grid">
          {list.map((fiche, index) => (
            <motion.div
              key={fiche.topicId}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.08, 0.45), ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -7 }}
            >
              <Link to={`/fiches/${encodeURIComponent(fiche.topicId)}`} className="fiche2-card" style={{ ['--fiche-color' as string]: fiche.color }}>
                <span className="fiche2-card__cover">
                  <span className="fiche2-card__emoji" aria-hidden="true">
                    {fiche.emoji}
                  </span>
                  <span className="fiche2-card__count">
                    <Layers size={12} /> {fiche.cardCount} cartes
                  </span>
                </span>
                <span className="fiche2-card__body">
                  <strong>{fiche.topicName}</strong>
                  <span className="fiche2-card__meta">
                    {fiche.subjectName} · {fiche.themeName}
                  </span>
                  <span className="fiche2-card__stats">
                    <span title="Score à la leçon">🎓 {fiche.lessonScore}/{fiche.lessonTotal}</span>
                    <span title="Meilleur quiz sur ce sujet">
                      <Trophy size={11} style={{ verticalAlign: '-1px' }} /> {fiche.quizBest !== null ? `${fiche.quizBest} %` : '—'}
                    </span>
                    <span className="fiche2-card__when">{formatRelative(fiche.unlockedAt)}</span>
                  </span>
                </span>
                <span className="fiche2-card__go" aria-hidden="true">
                  Ouvrir <ArrowRight size={14} />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {list.length > 0 ? (
        <motion.p
          className="ed-small ed-mute ed-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          <Sparkles size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          Plus tu valides de leçons, plus ta pile de fiches grandit — idéale pour réviser avant un contrôle.
        </motion.p>
      ) : null}
    </div>
  );
}
