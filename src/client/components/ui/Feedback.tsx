import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { renderMathText, renderRichText } from '../../lib/richtext.js';

/** Rendu Markdown + LaTeX (assistant IA). Le HTML est échappé en amont. */
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  const html = useMemo(() => renderRichText(children ?? ''), [children]);
  return <div className={`rich ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Rendu d'un énoncé de quiz : LaTeX + code + sauts de ligne simples. */
export function QuestionText({ children }: { children: string }) {
  const html = useMemo(() => renderMathText(children ?? ''), [children]);
  return <div className="rich" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Écran de chargement plein cadre. */
export function Loader({ label = 'Chargement…', large = false }: { label?: string; large?: boolean }) {
  return (
    <div className="loader-screen" role="status" aria-live="polite">
      <span className={`spinner${large ? ' spinner--lg' : ''}`} style={{ color: 'var(--ed-primary)' }} />
      <span>{label}</span>
    </div>
  );
}

/** Cartes squelettes pour les listes en cours de chargement. */
export function SkeletonCards({ count = 6, height = 132 }: { count?: number; height?: number }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/** État vide avec illustration et action. */
export function Empty({ emoji = '🔍', title, description, action }: { emoji?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty anim-fade-up">
      <span className="empty__emoji" aria-hidden="true">
        {emoji}
      </span>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {description ? <p style={{ maxWidth: '46ch', margin: '0 auto' }}>{description}</p> : null}
      {action ? <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>{action}</div> : null}
    </div>
  );
}

/** Bandeau d'information contextuel (mode hors-ligne, base non configurée…). */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  const colors = {
    info: 'var(--ed-info)',
    warning: 'var(--ed-warning)',
    danger: 'var(--ed-danger)',
    success: 'var(--ed-success)',
  } as const;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '12px 15px',
        borderRadius: 'var(--ed-radius-sm)',
        background: `color-mix(in srgb, ${colors[tone]} 10%, var(--ed-surface))`,
        border: `1px solid color-mix(in srgb, ${colors[tone]} 30%, transparent)`,
        borderLeft: `4px solid ${colors[tone]}`,
        fontSize: '0.9rem',
        lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

/** Logo EduMate (SVG inline, aucune requête réseau). */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="EduMate">
      <defs>
        <linearGradient id="edumate-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8e7bff" />
          <stop offset="100%" stopColor="#4f6df5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#edumate-logo-gradient)" />
      <circle cx="24" cy="28" r="8.5" fill="#fff" />
      <circle cx="40" cy="28" r="8.5" fill="#fff" />
      <circle cx="24" cy="28.5" r="4" fill="#2f2a55" />
      <circle cx="40" cy="28.5" r="4" fill="#2f2a55" />
      <circle cx="25.6" cy="26.8" r="1.4" fill="#fff" opacity="0.9" />
      <circle cx="41.6" cy="26.8" r="1.4" fill="#fff" opacity="0.9" />
      <path d="M32 36c3 0 5.5 2 6.5 3.6.5.8-.1 1.8-1 1.8h-11c-.9 0-1.5-1-1-1.8C26.5 38 29 36 32 36z" fill="#ffd166" />
    </svg>
  );
}
