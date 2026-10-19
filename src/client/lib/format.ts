/**
 * EduMate — Formatage (dates, durées, nombres) en français.
 */

export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAYS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const nf = (digits = 0): Intl.NumberFormat =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatNumber(value: number, digits = 0): string {
  return nf(digits).format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${nf(digits).format(value * 100)} %`;
}

/** 95 → "01:35" ; 3725 → "1:02:05" */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (v: number): string => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 3725 → "1 h 02" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatTimeWithSeconds(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', ...opts });
}

export function formatDateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - value.getTime();
  if (Number.isNaN(value.getTime())) return '—';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  if (days < 31) return `il y a ${Math.round(days / 7)} sem.`;
  return formatDate(value);
}

/** "Aujourd'hui", "Demain", "Dans 3 jours", "Hier"… */
export function formatDayLabel(dateString: string): string {
  const target = new Date(`${dateString}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Aujourd’hui';
  if (diffDays === 1) return 'Demain';
  if (diffDays === -1) return 'Hier';
  if (diffDays > 1 && diffDays < 7) return `Dans ${diffDays} jours`;
  if (diffDays < -1 && diffDays > -7) return `Il y a ${-diffDays} jours`;
  return target.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isoDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** Note sur 5 étoiles (arrondi à la demi-étoile). */
export function starsFor(score: number, total = 5): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(5, Math.round((score / total) * 5 * 2) / 2));
}

/** Message d'encouragement selon le score obtenu. */
export function encouragement(percent: number): { title: string; message: string; emoji: string } {
  if (percent >= 90) return { title: 'Excellent !', message: 'Tu maîtrises ce sujet, continue comme ça.', emoji: '🏆' };
  if (percent >= 75) return { title: 'Très bien !', message: 'Encore un petit effort pour la perfection.', emoji: '🎉' };
  if (percent >= 60) return { title: 'Bien joué !', message: 'Les bases sont là, révise les points manqués.', emoji: '👏' };
  if (percent >= 40) return { title: 'Courage !', message: 'Relis les corrections puis retente le quiz.', emoji: '💪' };
  return { title: 'On progresse !', message: 'Chaque erreur est une leçon : reprends les explications.', emoji: '🌱' };
}

/** Salutation adaptée à l'heure de la journée. */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Couleur douce dérivée d'une couleur principale (fonds de pastilles). */
export function softColor(color: string, alpha = 0.14): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = Number.parseInt(full.slice(0, 2), 16) || 0;
  const g = Number.parseInt(full.slice(2, 4), 16) || 0;
  const b = Number.parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
