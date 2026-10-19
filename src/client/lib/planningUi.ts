/**
 * EduMate — Métadonnées UI du planning (icônes, libellés, couleurs).
 * Partagées par le hub, le détail, le tableau de bord et les séances.
 */
import {
  BookOpenText,
  CalendarCheck2,
  FileText,
  GraduationCap,
  Layers,
  PenLine,
  RotateCw,
  Timer,
  Zap,
} from 'lucide-react';
import type { NotionPriorityLevel, SessionActivity } from '../../shared/types.js';

export const ACTIVITY_META: Record<
  SessionActivity,
  { label: string; icon: typeof PenLine; color: string; hint: string }
> = {
  cours: { label: 'Cours / découverte', icon: BookOpenText, color: '#6c5ce7', hint: 'Leçon interactive' },
  exercices: { label: 'Exercices ciblés', icon: PenLine, color: '#0ea5e9', hint: 'Questions + exercices' },
  quiz: { label: 'Entraînement quiz', icon: GraduationCap, color: '#16a34a', hint: 'Quiz corrigé' },
  revision: { label: 'Révision des erreurs', icon: RotateCw, color: '#f59e0b', hint: 'Refaire ce qui a raté' },
  quizblanc: { label: 'Quiz blanc', icon: FileText, color: '#e11d48', hint: 'Conditions d’examen' },
  express: { label: 'Révision express', icon: Zap, color: '#7c3aed', hint: '5-10 minutes chrono' },
};

export const PRIORITY_UI: Record<
  NotionPriorityLevel,
  { label: string; dot: string; color: string; soft: string }
> = {
  urgent: { label: 'Urgent', dot: '🔴', color: '#e11d48', soft: 'rgba(225,29,72,.12)' },
  travail: { label: 'À travailler', dot: '🟠', color: '#f97316', soft: 'rgba(249,115,22,.12)' },
  revoir: { label: 'À revoir', dot: '🟡', color: '#f59e0b', soft: 'rgba(245,158,11,.14)' },
  maitrise: { label: 'Maîtrisé', dot: '🟢', color: '#16a34a', soft: 'rgba(22,163,74,.12)' },
};

export const SELF_LEVELS: { id: 'maitrise' | 'moyen' | 'difficultes' | 'zero'; label: string; emoji: string }[] = [
  { id: 'maitrise', label: 'Je maîtrise', emoji: '😎' },
  { id: 'moyen', label: 'Moyen', emoji: '🙂' },
  { id: 'difficultes', label: 'J’ai des difficultés', emoji: '😅' },
  { id: 'zero', label: 'Je pars de zéro', emoji: '🌱' },
];

export const DAILY_MINUTES_CHOICES: { value: number; label: string }[] = [
  { value: 10, label: '10 min/jour' },
  { value: 20, label: '20 min/jour' },
  { value: 30, label: '30 min/jour' },
  { value: 45, label: '45 min/jour' },
  { value: 60, label: '1 h/jour' },
];

/** Même jour de référence que le serveur (Europe/Paris). */
export function appToday(): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return 'Contrôle passé';
  if (daysLeft === 0) return 'Aujourd’hui !';
  if (daysLeft === 1) return 'Demain';
  return `J-${daysLeft}`;
}

export const PLAN_ICONS = { CalendarCheck2, Timer, Layers };
