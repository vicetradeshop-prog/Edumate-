import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Play, Sparkles } from 'lucide-react';
import type { CatalogTopic } from '../../../shared/types.js';
import { Badge, DifficultyBadge, Stars } from '../ui/Badge.js';
import { endpoints } from '../../lib/api.js';
import { toast, useAuth } from '../../lib/store.js';
import { softColor } from '../../lib/format.js';

interface TopicCardProps {
  topic: CatalogTopic & { favorite?: boolean };
  /** Score mémorisé (0..1) pour afficher les étoiles. */
  bestScore?: number;
  attempts?: number;
  compact?: boolean;
  onFavoriteChange?: (topicId: string, favorite: boolean) => void;
}

/**
 * Carte de sujet de quiz : matière, thème, niveau, difficulté, note.
 * Cliquable (détail du sujet) avec action directe « Commencer ».
 */
export function TopicCard({ topic, bestScore, attempts = 0, compact = false, onFavoriteChange }: TopicCardProps) {
  const user = useAuth((state) => state.user);
  const [favorite, setFavorite] = useState(Boolean(topic.favorite));
  const [busy, setBusy] = useState(false);

  const toggleFavorite = async (event: React.MouseEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      toast.warning('Connecte-toi pour enregistrer tes favoris.');
      return;
    }
    setBusy(true);
    const next = !favorite;
    setFavorite(next);
    try {
      const result = await endpoints.toggleFavorite(topic.id);
      setFavorite(result.added);
      onFavoriteChange?.(topic.id, result.added);
      toast.info(result.added ? 'Ajouté à tes favoris ⭐' : 'Retiré de tes favoris');
    } catch (error) {
      setFavorite(!next);
      toast.fromError(error, 'Impossible de mettre à jour tes favoris.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="card card--hover topic-card"
      style={{
        ['--tile-color' as string]: topic.color,
        ['--tile-soft' as string]: softColor(topic.color, 0.14),
        padding: compact ? 14 : undefined,
      }}
    >
      <div className="topic-card__head">
        <span className="topic-card__emoji" style={{ background: softColor(topic.color, 0.16) }} aria-hidden="true">
          {topic.emoji}
        </span>
        <span className="ed-grow">
          <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
            <Badge tone="primary">{topic.subjectName}</Badge>
            <Badge tone="outline">{topic.levelName}</Badge>
          </span>
          <span className="topic-card__name" style={{ display: 'block' }}>
            {topic.name}
          </span>
        </span>
        <button
          type="button"
          className="fav-btn"
          aria-pressed={favorite}
          aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={toggleFavorite}
          disabled={busy}
        >
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="topic-card__meta">
        <span>📁 {topic.themeName}</span>
        {topic.generated ? <span>♾️ questions illimitées</span> : <span>🎲 {topic.pool} questions</span>}
        {attempts > 0 ? <span>· {attempts} tentative{attempts > 1 ? 's' : ''}</span> : null}
      </div>

      <div className="topic-card__foot">
        <span className="ed-row" style={{ gap: 8 }}>
          {typeof bestScore === 'number' && attempts > 0 ? <Stars score={bestScore * 5} /> : <DifficultyBadge difficulty={topic.difficulty} />}
        </span>
        <span className="ed-row" style={{ gap: 6 }}>
          <Link to={`/quiz/${topic.id}`} onClick={(event) => event.stopPropagation()}>
            <Badge tone="outline">
              <Sparkles size={11} /> Détails
            </Badge>
          </Link>
          <Link to={`/quiz/${topic.id}/jouer`} className="btn btn--primary btn--sm" onClick={(event) => event.stopPropagation()}>
            <Play size={14} /> Commencer
          </Link>
        </span>
      </div>
    </motion.div>
  );
}
