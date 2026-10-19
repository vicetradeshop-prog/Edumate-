import { Clock3 } from 'lucide-react';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { useNow, useDocumentTitle } from '../../lib/hooks.js';
import { DAYS_LONG, formatTimeWithSeconds, MONTHS } from '../../lib/format.js';

/** Horloge analogique SVG (aiguilles animées en douceur). */
function AnalogClock({ date }: { date: Date }) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  const hand = (angle: number, length: number, width: number, color: string, rounded = true) => (
    <line
      x1="100"
      y1="100"
      x2={100 + length * Math.sin((angle * Math.PI) / 180)}
      y2={100 - length * Math.cos((angle * Math.PI) / 180)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap={rounded ? 'round' : 'butt'}
    />
  );

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={`Horloge : ${formatTimeWithSeconds(date)}`} style={{ width: 'min(300px, 74vw)', height: 'auto' }}>
      <circle cx="100" cy="100" r="94" fill="var(--ed-surface)" stroke="var(--ed-border)" strokeWidth="3" />
      {Array.from({ length: 60 }, (_unused, index) => {
        const angle = index * 6;
        const major = index % 5 === 0;
        const inner = major ? 80 : 86;
        return (
          <line
            key={index}
            x1={100 + inner * Math.sin((angle * Math.PI) / 180)}
            y1={100 - inner * Math.cos((angle * Math.PI) / 180)}
            x2={100 + 89 * Math.sin((angle * Math.PI) / 180)}
            y2={100 - 89 * Math.cos((angle * Math.PI) / 180)}
            stroke={major ? 'var(--ed-text-soft)' : 'var(--ed-border-strong)'}
            strokeWidth={major ? 2.6 : 1.2}
            strokeLinecap="round"
          />
        );
      })}
      {[12, 3, 6, 9].map((number, index) => {
        const angle = index * 90;
        return (
          <text
            key={number}
            x={100 + 64 * Math.sin((angle * Math.PI) / 180)}
            y={100 - 64 * Math.cos((angle * Math.PI) / 180) + 6}
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="var(--ed-text-soft)"
            fontFamily="var(--ed-font-display)"
          >
            {number}
          </text>
        );
      })}
      {hand(hours * 30, 50, 6, 'var(--ed-text)')}
      {hand(minutes * 6, 72, 4, 'var(--ed-text)')}
      {hand(seconds * 6, 80, 2, 'var(--ed-primary)')}
      <circle cx="100" cy="100" r="6" fill="var(--ed-primary)" />
      <circle cx="100" cy="100" r="2.4" fill="var(--ed-surface)" />
    </svg>
  );
}

export default function ClockToolPage() {
  useDocumentTitle('Horloge');
  const now = useNow(200);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekNumber = (() => {
    const target = new Date(now.valueOf());
    const dayNr = (now.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target.valueOf() - firstThursday.valueOf();
    return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  })();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);

  return (
    <ToolShell
      title="Horloge"
      description="L’heure exacte, en analogique et en numérique, avec les repères de la journée."
      icon={<Clock3 size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Clock3 size={16} />}>Repères</CardTitle>
            <ul style={{ marginTop: 10, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.9rem', display: 'grid', gap: 6 }}>
              <li>
                Jour de l’année : <strong>{dayOfYear}</strong> / {now.getFullYear() % 4 === 0 ? 366 : 365}
              </li>
              <li>
                Semaine : <strong>S{weekNumber}</strong>
              </li>
              <li>
                Fuseau : <strong>{timeZone}</strong>
              </li>
              <li>
                Heure UTC : <strong>{now.toISOString().slice(11, 19)}</strong>
              </li>
            </ul>
          </Card>
          <Card flat>
            <CardTitle>💡 Astuce révision</CardTitle>
            <CardSubtitle>
              Fixe des créneaux précis (ex. 18 h 00 → 18 h 25) et lance le minuteur : ton cerveau associera l’heure au
              travail concentré.
            </CardSubtitle>
          </Card>
        </>
      }
    >
      <div style={{ display: 'grid', placeItems: 'center', gap: 18, padding: '10px 0 4px' }}>
        <AnalogClock date={now} />
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--ed-font-display)',
              fontSize: 'clamp(2.6rem, 12vw, 4.2rem)',
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
            aria-live="off"
          >
            {formatTimeWithSeconds(now)}
          </div>
          <p className="ed-soft" style={{ marginTop: 8, fontSize: '1.02rem', textTransform: 'capitalize' }}>
            {DAYS_LONG[(now.getDay() + 6) % 7]} {now.getDate()} {MONTHS[now.getMonth()].toLowerCase()} {now.getFullYear()}
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
