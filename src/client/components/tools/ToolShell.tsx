import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TOOLS } from '../../pages/ToolsPage.js';

interface ToolShellProps {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
}

/** Mise en page commune aux outils : titre, zone principale, panneau latéral. */
export function ToolShell({ title, description, icon, children, aside, wide = false }: ToolShellProps) {
  return (
    <div className="ed-stack" style={{ gap: 20 }}>
      <nav className="breadcrumb" aria-label="Fil d’Ariane">
        <Link to="/outils">
          <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Outils
        </Link>
        <span aria-hidden="true">/</span>
        <span>{title}</span>
      </nav>

      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="page-head__title">
          <h1 className="ed-row" style={{ gap: 10 }}>
            <span aria-hidden="true">{icon}</span>
            {title}
          </h1>
          <p>{description}</p>
        </div>
      </header>

      <div className={aside ? 'tool-layout' : undefined} style={aside ? undefined : { maxWidth: wide ? 'none' : 900 }}>
        <div className="tool-panel">{children}</div>
        {aside ? <aside className="ed-stack" style={{ gap: 16 }}>{aside}</aside> : null}
      </div>

      <nav className="ed-row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {TOOLS.filter((tool) => tool.label !== title).map((tool) => (
          <Link key={tool.to} to={tool.to} className="badge badge--outline" style={{ padding: '7px 13px', fontSize: '0.8rem' }}>
            <tool.icon size={13} /> {tool.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
