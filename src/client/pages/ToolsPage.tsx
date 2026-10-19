import { Link } from 'react-router-dom';
import { Calendar, Clock3, Headphones, Languages, PenTool, Timer, Compass, ArrowRight, Music4 } from 'lucide-react';
import { Card, CardSubtitle, CardTitle, Tile } from '../components/ui/Card.js';
import { useDocumentTitle } from '../lib/hooks.js';

export const TOOLS = [
  {
    to: '/outils/horloge',
    label: 'Horloge',
    icon: Clock3,
    color: '#0ea5e9',
    description: 'Heure actuelle, affichage analogique et numérique, fuseau local.',
  },
  {
    to: '/outils/minuteur',
    label: 'Minuteur',
    icon: Timer,
    color: '#e11d48',
    description: 'Compte à rebours personnalisable, pause, reprise et méthode pomodoro.',
  },
  {
    to: '/outils/chronometre',
    label: 'Chronomètre',
    icon: Clock3,
    color: '#f59e0b',
    description: 'Mesure précise au centième, tours intermédiaires et réinitialisation.',
  },
  {
    to: '/outils/tableau',
    label: 'Tableau interactif',
    icon: PenTool,
    color: '#7c3aed',
    description: 'Dessin, écriture, formes, gomme, couleurs, annulation et export PNG.',
  },
  {
    to: '/outils/calendrier',
    label: 'Calendrier',
    icon: Calendar,
    color: '#16a34a',
    description: 'Vue mensuelle, devoirs, examens et sessions de travail.',
  },
  {
    to: '/outils/traducteur',
    label: 'Traducteur',
    icon: Languages,
    color: '#0891b2',
    description: '15 langues, détection automatique, copie en un clic.',
  },
  {
    to: '/outils/musique',
    label: 'Musique de concentration',
    icon: Headphones,
    color: '#db2777',
    description: '6 ambiances générées en temps réel, 100 % libres de droit.',
  },
] as const;

export default function ToolsPage() {
  useDocumentTitle('Outils');
  return (
    <div className="ed-stack" style={{ gap: 24 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <Compass size={13} style={{ verticalAlign: '-2px' }} /> Boîte à outils
          </span>
          <h1>Les outils EduMate</h1>
          <p>
            Tout ce qu’il faut pour organiser, mesurer et rendre tes révisions plus agréables — sans quitter
            l’application et sans compte externe.
          </p>
        </div>
      </header>

      <div className="card-grid stagger">
        {TOOLS.map((tool) => (
          <Tile key={tool.to} to={tool.to} icon={<tool.icon size={21} />} title={tool.label} description={tool.description} color={tool.color} />
        ))}
      </div>

      <div className="split">
        <Card>
          <CardTitle icon={<Music4 size={17} />}>Ambiances disponibles</CardTitle>
          <CardSubtitle>
            Les musiques sont synthétisées par ton navigateur : aucun fichier à télécharger, aucun droit d’auteur, aucune
            coupure publicitaire.
          </CardSubtitle>
          <ul style={{ marginTop: 12, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.92rem', display: 'grid', gap: 5 }}>
            <li>🎧 Lo-fi studieux — accords jazzy, 68 BPM</li>
            <li>🎹 Piano doux — arpèges lents pour lire et rédiger</li>
            <li>🌌 Nappe atmosphérique — sans rythme, concentration profonde</li>
            <li>🌧️ Pluie douce — bruit filtré, mémorisation</li>
            <li>🌊 Vagues — ressac lent, révisions du soir</li>
            <li>🌲 Forêt & oiseaux — sous-bois et notes cristallines</li>
          </ul>
          <Link to="/outils/musique" className="section__link" style={{ marginTop: 12, display: 'inline-flex' }}>
            Ouvrir le lecteur <ArrowRight size={14} />
          </Link>
        </Card>

        <Card>
          <CardTitle icon={<Timer size={17} />}>Bien utiliser son temps</CardTitle>
          <CardSubtitle>Une méthode simple, testée et approuvée.</CardSubtitle>
          <ol style={{ marginTop: 12, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.92rem', display: 'grid', gap: 6 }}>
            <li>25 min de travail concentré (téléphone loin, notifications coupées)</li>
            <li>5 min de pause : bouger, boire, respirer</li>
            <li>Après 4 cycles, une vraie pause de 20 à 30 min</li>
            <li>Termine chaque session par un quiz de 5 questions pour ancrer</li>
          </ol>
          <Link to="/outils/minuteur" className="section__link" style={{ marginTop: 12, display: 'inline-flex' }}>
            Lancer un minuteur <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    </div>
  );
}
