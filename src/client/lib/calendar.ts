/**
 * EduMate — Logique de calendrier (fonctions pures).
 *
 * Tout ce qui relève du **calcul** de dates vit ici, séparé de l'interface.
 * Trois raisons :
 *
 *   1. **Testable** : chaque fonction reçoit une date de référence injectable,
 *      donc les tests sont déterministes (pas de dépendance à « aujourd'hui »).
 *      Les bugs de calendrier sont notoirement difficiles à reproduire une fois
 *      noyés dans du JSX.
 *   2. **Réutilisable** : le tableau de bord et l'outil Calendrier doivent
 *      afficher la même urgence, le même compte à rebours. Deux implémentations
 *      finiraient par diverger.
 *   3. **Sûr sur les fuseaux** : toutes les dates sont manipulées en **local**
 *      via `new Date(y, m, d)` et jamais via `toISOString().slice(0,10)` sur une
 *      date locale — cette dernière bascule la veille après 22 h en été pour un
 *      fuseau UTC+2, ce qui décalerait tous les événements d'un jour.
 */
import type { CalendarEvent } from '../../shared/types.js';
import { DAYS_LONG, MONTHS } from './format.js';

/* ------------------------------------------------------------------ */
/*  Dates : conversion et arithmétique                                 */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;

/** `Date` → `AAAA-MM-JJ` **en heure locale** (et non UTC). */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `AAAA-MM-JJ` → `Date` locale à minuit.
 *
 * ⚠️ Ne PAS utiliser `new Date('2026-09-30')` : cette forme est interprétée
 * comme **UTC** par la spécification, puis reconvertie en local — ce qui donne
 * le 29 au soir dans les fuseaux négatifs. On construit explicitement.
 */
export function fromIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  // Contrôle de validité : `2026-02-31` donnerait silencieusement le 3 mars.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

/** Date du jour, à minuit local (heure et secondes neutralisées). */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Ajoute des jours (retourne une nouvelle date, ne mute jamais). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Ajoute des mois en **préservant le jour** autant que possible. */
export function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  // Le 31 janvier + 1 mois doit donner le 28/29 février, pas le 3 mars.
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** Lundi de la semaine contenant `date` (la semaine commence le lundi). */
export function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = dimanche
  return addDays(date, -((day + 6) % 7));
}

/** Nombre de jours entre deux dates, en jours calendaires (pas en ×24 h). */
export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi). */
export function weekNumber(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // ISO : la semaine commence le lundi, on se place sur le jeudi de la semaine.
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
}

/* ------------------------------------------------------------------ */
/*  Grilles                                                            */
/* ------------------------------------------------------------------ */

/**
 * Grille mensuelle : 6 semaines de 7 jours, lundi en premier.
 *
 * Toujours **42 cases**, même pour un mois qui en nécessiterait 5 : cela évite
 * que la hauteur du calendrier change d'un mois à l'autre, ce qui provoquerait
 * un saut de mise en page à chaque navigation.
 */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_unused, index) => addDays(start, index));
}

/** Les 7 jours de la semaine contenant `date`, lundi en premier. */
export function buildWeekGrid(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_unused, index) => addDays(start, index));
}

/* ------------------------------------------------------------------ */
/*  Urgence et compte à rebours                                        */
/* ------------------------------------------------------------------ */

export type Urgency = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

/**
 * Qualifie l'urgence d'un événement.
 *
 * Un événement **terminé** n'est jamais en retard : le classer `overdue`
 * alarmerait pour rien.
 */
export function urgencyOf(event: CalendarEvent, now: Date = new Date()): Urgency {
  const date = fromIsoDate(event.date);
  if (!date) return 'later';
  if (event.done) return 'later';
  const delta = daysBetween(now, date);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta <= 7) return 'week';
  return 'later';
}

/** Couleurs et libellés associés à chaque urgence. */
export const URGENCY_META: Record<Urgency, { label: string; color: string; tone: 'danger' | 'warning' | 'primary' | 'default' | 'success' }> = {
  overdue: { label: 'En retard', color: 'var(--ed-danger, #e11d48)', tone: 'danger' },
  today: { label: 'Aujourd’hui', color: 'var(--ed-warning, #f59e0b)', tone: 'warning' },
  tomorrow: { label: 'Demain', color: 'var(--ed-primary)', tone: 'primary' },
  week: { label: 'Cette semaine', color: 'var(--ed-info, #0ea5e9)', tone: 'default' },
  later: { label: 'Plus tard', color: 'var(--ed-text-mute)', tone: 'default' },
};

/**
 * Compte à rebours lisible.
 *
 * Descend jusqu'à l'heure quand l'échéance est aujourd'hui (« dans 3 h »),
 * puis passe en jours. C'est ce qui rend l'urgence palpable sans avoir à
 * calculer mentalement.
 */
export function countdownLabel(event: CalendarEvent, now: Date = new Date()): string {
  const date = fromIsoDate(event.date);
  if (!date) return '';
  const delta = daysBetween(now, date);

  if (event.done) return 'Terminé';

  if (delta === 0) {
    if (!event.time) return 'Aujourd’hui';
    const [hours, minutes] = event.time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 'Aujourd’hui';
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
    const minutesLeft = Math.round((target.getTime() - now.getTime()) / 60_000);
    if (minutesLeft < 0) return `Il y a ${formatElapsed(-minutesLeft)}`;
    if (minutesLeft === 0) return 'Maintenant';
    if (minutesLeft < 60) return `dans ${minutesLeft} min`;
    return `dans ${formatElapsed(minutesLeft)}`;
  }

  if (delta === 1) return 'Demain';
  if (delta === -1) return 'Hier';
  if (delta < -1) return `Retard de ${Math.abs(delta)} j`;
  if (delta < 7) return `dans ${delta} j`;
  if (delta < 14) return 'dans 1 semaine';
  const weeks = Math.round(delta / 7);
  if (delta < 60) return `dans ${weeks} sem.`;
  const months = Math.round(delta / 30);
  return `dans ${months} mois`;
}

/** Formate une durée en minutes sous forme « 2 h 15 ». */
export function formatElapsed(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Libellés                                                           */
/* ------------------------------------------------------------------ */

/** « lundi 30 septembre » — utilisé dans les en-têtes de groupe. */
export function longDayLabel(iso: string, now: Date = new Date()): string {
  const date = fromIsoDate(iso);
  if (!date) return iso;
  const delta = daysBetween(now, date);
  /*
   * Jour ET mois en minuscules : c'est la typographie française pour une date
   * (« mercredi 30 septembre »). La version précédente mettait le mois en
   * minuscule mais laissait le jour en capitale — incohérent, et visible dans
   * les en-têtes de groupe de l'agenda.
   */
  const base = `${DAYS_LONG[(date.getDay() + 6) % 7].toLowerCase()} ${date.getDate()} ${MONTHS[date.getMonth()].toLowerCase()}`;
  if (delta === 0) return `Aujourd’hui · ${base}`;
  if (delta === 1) return `Demain · ${base}`;
  if (delta === -1) return `Hier · ${base}`;
  return base;
}

/** Nom du mois en français, avec l'année si elle diffère de l'année courante. */
export function monthTitle(year: number, month: number, now: Date = new Date()): string {
  const label = `${MONTHS[month]} ${year}`;
  return year === now.getFullYear() ? MONTHS[month] : label;
}

/* ------------------------------------------------------------------ */
/*  Regroupements et tris                                              */
/* ------------------------------------------------------------------ */

/** Regroupe les événements par date (clé `AAAA-MM-JJ`). */
export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  for (const list of map.values()) list.sort(compareEvents);
  return map;
}

/**
 * Ordre de tri : date, puis heure (les événements sans heure passent avant),
 * puis titre. Stable et prévisible pour l'œil.
 */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  if (ta !== tb) {
    if (!ta) return -1;
    if (!tb) return 1;
    return ta < tb ? -1 : 1;
  }
  return a.title.localeCompare(b.title, 'fr');
}

/** Événements à venir (non terminés), du plus proche au plus lointain. */
export function upcomingEvents(events: CalendarEvent[], now: Date = new Date()): CalendarEvent[] {
  const todayIso = toIsoDate(now);
  return events
    .filter((event) => !event.done && event.date >= todayIso)
    .sort(compareEvents);
}

/** Événements en retard (non terminés, date passée), du plus ancien d'abord. */
export function overdueEvents(events: CalendarEvent[], now: Date = new Date()): CalendarEvent[] {
  const todayIso = toIsoDate(now);
  return events
    .filter((event) => !event.done && event.date < todayIso)
    .sort(compareEvents);
}

/** Événements d'un mois donné (`AAAA-MM`). */
export function eventsOfMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return events.filter((event) => event.date.startsWith(key)).sort(compareEvents);
}

/** Événements d'une plage de dates incluse. */
export function eventsInRange(events: CalendarEvent[], startIso: string, endIso: string): CalendarEvent[] {
  return events.filter((event) => event.date >= startIso && event.date <= endIso).sort(compareEvents);
}

/**
 * Recherche plein texte dans les événements (titre, notes, matière).
 * Insensible à la casse et aux accents — « controle » trouve « Contrôle ».
 */
export function filterEventsByQuery(events: CalendarEvent[], query: string): CalendarEvent[] {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!needle) return events;
  return events.filter((event) => {
    const haystack = `${event.title} ${event.notes ?? ''} ${event.subjectId ?? ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return haystack.includes(needle);
  });
}

/* ------------------------------------------------------------------ */
/*  Statistiques                                                       */
/* ------------------------------------------------------------------ */

export interface CalendarStats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  today: number;
  /** Prochains 7 jours, événements non terminés. */
  next7: number;
  /** Répartition par type. */
  byKind: Record<string, number>;
}

/** Agrégats affichés dans l'outil Calendrier. */
export function computeCalendarStats(events: CalendarEvent[], now: Date = new Date()): CalendarStats {
  const todayIso = toIsoDate(now);
  const in7 = toIsoDate(addDays(now, 7));
  const stats: CalendarStats = { total: events.length, done: 0, pending: 0, overdue: 0, today: 0, next7: 0, byKind: {} };
  for (const event of events) {
    stats.byKind[event.kind] = (stats.byKind[event.kind] ?? 0) + 1;
    if (event.done) {
      stats.done += 1;
      continue;
    }
    stats.pending += 1;
    if (event.date < todayIso) stats.overdue += 1;
    if (event.date === todayIso) stats.today += 1;
    if (event.date >= todayIso && event.date <= in7) stats.next7 += 1;
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/*  Export .ics (sans dépendance)                                      */
/* ------------------------------------------------------------------ */

/** Échappe le texte selon la RFC 5545 (virgules, points-virgules, sauts). */
function icsEscape(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `AAAA-MM-JJ` + `HH:MM` → `AAAA-MM-DDTHHMMSS` (heure locale, sans fuseau). */
function icsDateTime(iso: string, time?: string): string {
  const compact = iso.replace(/-/g, '');
  if (!time) return `${compact}`;
  const [hours, minutes] = time.split(':');
  return `${compact}T${String(hours ?? '00').padStart(2, '0')}${String(minutes ?? '00').padStart(2, '0')}00`;
}

/**
 * Génère un calendrier iCalendar (.ics) téléchargeable.
 *
 * Implémenté à la main plutôt que via une librairie : le format est simple, et
 * cela évite d'ajouter une dépendance pour un export occasionnel. Les événements
 * sans heure sont émis en `VALUE=DATE` (journée entière), conformément à la RFC.
 */
export function buildIcs(events: CalendarEvent[], name = 'EduMate'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//EduMate//${icsEscape(name)}//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
  ];
  for (const event of events) {
    if (!fromIsoDate(event.date)) continue; // date invalide : on l'ignore
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(event.id)}@edumate`);
    lines.push(`DTSTAMP:${stamp}`);
    if (event.time) {
      lines.push(`DTSTART:${icsDateTime(event.date, event.time)}`);
      // Durée par défaut d'une heure : sans DTEND, certains agenda ignorent l'événement.
      const [hours, minutes] = event.time.split(':').map(Number);
      const start = new Date(
        Number(event.date.slice(0, 4)),
        Number(event.date.slice(5, 7)) - 1,
        Number(event.date.slice(8, 10)),
        Number.isFinite(hours) ? hours : 0,
        Number.isFinite(minutes) ? minutes : 0,
      );
      const end = new Date(start.getTime() + 3600_000);
      lines.push(`DTEND:${icsDateTime(toIsoDate(end), `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`)}`);
    } else {
      // Journée entière : DTEND est EXCLUSIF, donc le lendemain.
      const next = addDays(fromIsoDate(event.date) as Date, 1);
      lines.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${toIsoDate(next).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsEscape(event.title)}`);
    if (event.notes) lines.push(`DESCRIPTION:${icsEscape(event.notes)}`);
    lines.push(`STATUS:${event.done ? 'COMPLETED' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // La RFC impose CRLF comme séparateur de lignes.
  return `${lines.join('\r\n')}\r\n`;
}
