import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight as ArrowRightIcon,
  Circle,
  Download,
  Eraser,
  Grid3x3,
  Highlighter,
  Minus,
  Pen,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Modal } from '../../components/ui/Modal.js';
import { Notice } from '../../components/ui/Feedback.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { useDocumentTitle, useHotkeys } from '../../lib/hooks.js';
import { toast } from '../../lib/store.js';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
type Background = 'white' | 'grid' | 'ruled';

const COLORS = ['#1d2136', '#e11d48', '#f59e0b', '#16a34a', '#0ea5e9', '#6c5ce7', '#db2777', '#ffffff'];
const SIZES = [2, 4, 7, 12, 20];

const TOOLS: { id: Tool; label: string; icon: typeof Pen }[] = [
  { id: 'pen', label: 'Crayon', icon: Pen },
  { id: 'highlighter', label: 'Surligneur', icon: Highlighter },
  { id: 'eraser', label: 'Gomme', icon: Eraser },
  { id: 'line', label: 'Trait', icon: Minus },
  { id: 'arrow', label: 'Flèche', icon: ArrowRightIcon },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Cercle', icon: Circle },
  { id: 'text', label: 'Texte', icon: Type },
];

interface Point {
  x: number;
  y: number;
}

export default function WhiteboardToolPage() {
  useDocumentTitle('Tableau interactif');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLCanvasElement | null>(null); // calque du dessin validé
  const containerRef = useRef<HTMLDivElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const startPoint = useRef<Point>({ x: 0, y: 0 });
  const lastPoint = useRef<Point>({ x: 0, y: 0 });

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[5]);
  const [size, setSize] = useState(4);
  const [background, setBackground] = useState<Background>('grid');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const [size_px, setSizePx] = useState({ width: 0, height: 0 });

  /* ----------------------------- Dimensionnement --------------------------- */

  /**
   * Dimension maximale d'un côté du canvas, en pixels appareil.
   *
   * Au-delà, les navigateurs refusent silencieusement l'allocation : le canvas
   * reste en place mais `getContext('2d')` renvoie `null` et plus aucun tracé
   * n'apparaît — d'où un fond « quadrillé » ou « ligné » qui semble ne rien
   * faire. Plafonner évite cet état muet, qui est le plus difficile à
   * diagnostiquer.
   */
  const MAX_CANVAS_SIDE = 4096;

  /** Dernières dimensions appliquées : sert de garde anti-boucle. */
  const lastSize = useRef({ width: 0, height: 0, dpr: 1 });

  /**
   * Référence toujours à jour de `render`, pour le `ResizeObserver`.
   *
   * 🔴 Second bug corrigé ici : l'observateur était installé dans un `useEffect`
   * à dépendances vides, donc il capturait le `resize` du PREMIER rendu — et à
   * travers lui le `render` de ce même rendu. Après avoir choisi « Lignes »,
   * un redimensionnement de fenêtre redessinait donc l'ancien fond. La ref casse
   * cette capture périmée sans recréer l'observateur.
   */
  const renderRef = useRef<() => void>(() => undefined);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const content = contentRef.current;
    const container = containerRef.current;
    if (!canvas || !content || !container) return;

    /*
     * `clientWidth` / `clientHeight` mesurent la boîte de CONTENU : ils
     * excluent la bordure de 2 px du cadre. `getBoundingClientRect()`, lui,
     * renvoie la boîte de bordure — c'est précisément cet écart de 4 px qui
     * entretenait la boucle infinie de croissance.
     */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(280, Math.min(MAX_CANVAS_SIDE, Math.floor(container.clientWidth)));
    const height = Math.max(280, Math.min(MAX_CANVAS_SIDE, Math.floor(container.clientHeight)));

    /*
     * Garde anti-boucle : si rien n'a changé, on ne fait RIEN.
     *
     * C'est la protection décisive. Sans elle, toute variation d'un pixel
     * déclencherait écriture de style → observation → nouvelle écriture. Avec
     * elle, la chaîne s'arrête dès le second passage, même si le CSS devait
     * changer un jour.
     */
    const previous = lastSize.current;
    if (previous.width === width && previous.height === height && previous.dpr === dpr) {
      return;
    }
    lastSize.current = { width, height, dpr };

    // Sauvegarde du tracé existant avant redimensionnement (le canvas se vide).
    const snapshot = document.createElement('canvas');
    snapshot.width = content.width;
    snapshot.height = content.height;
    if (content.width > 0 && content.height > 0) {
      snapshot.getContext('2d')?.drawImage(content, 0, 0);
    }

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    /*
     * Pas de `canvas.style.width/height` : le CSS (`position: absolute; inset: 0;
     * width/height: 100 %`) s'en charge. Écrire ces styles depuis le script
     * était l'autre moitié de la boucle de rétroaction.
     */
    content.width = canvas.width;
    content.height = canvas.height;

    const ctx = content.getContext('2d');
    if (ctx && snapshot.width > 0) {
      ctx.drawImage(snapshot, 0, 0);
    }
    setSizePx({ width, height });
    renderRef.current();
  }, []);

  // `renderRef` suit toujours la dernière version de `render`.
  useEffect(() => {
    renderRef.current = render;
  });

  /* -------------------------------- Rendu --------------------------------- */
  const drawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      if (background === 'grid') {
        const step = 28 * (window.devicePixelRatio > 1 ? Math.min(2, window.devicePixelRatio) : 1);
        ctx.strokeStyle = 'rgba(29, 33, 54, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y <= height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      } else if (background === 'ruled') {
        const step = 34 * (window.devicePixelRatio > 1 ? Math.min(2, window.devicePixelRatio) : 1);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.16)';
        ctx.lineWidth = 1;
        for (let y = step; y <= height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }
    },
    [background],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const content = contentRef.current;
    if (!canvas || !content) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBackground(ctx, canvas.width, canvas.height);
    ctx.drawImage(content, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background, drawBackground]);

  useEffect(() => {
    if (!contentRef.current) contentRef.current = document.createElement('canvas');
    resize();

    /*
     * Les observations sont regroupées dans une image d'animation.
     *
     * Un `ResizeObserver` peut tirer plusieurs fois dans la même frame (mise en
     * page, barre de défilement, clavier mobile…). Sans regroupement, chaque
     * tir recalculait, réallouait le canvas et le vidait — d'où un scintillement
     * et une perte du tracé en cours.
     */
    let frame = 0;
    const scheduleResize = (): void => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        resize();
      });
    };

    const observer = new ResizeObserver(scheduleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('orientationchange', scheduleResize);
    window.addEventListener('resize', scheduleResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('orientationchange', scheduleResize);
      window.removeEventListener('resize', scheduleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    render();
  }, [background, render, size_px.width, size_px.height]);

  /* ------------------------------- Historique ----------------------------- */
  const pushHistory = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const ctx = content.getContext('2d');
    if (!ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, content.width, content.height));
    if (undoStack.current.length > 24) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((value) => value + 1);
  }, []);

  const restore = (image: ImageData): void => {
    const content = contentRef.current;
    if (!content) return;
    const ctx = content.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(image, 0, 0);
    render();
  };

  const undo = useCallback(() => {
    const content = contentRef.current;
    if (!content || !undoStack.current.length) {
      toast.info('Rien à annuler.');
      return;
    }
    const ctx = content.getContext('2d');
    if (ctx) redoStack.current.push(ctx.getImageData(0, 0, content.width, content.height));
    restore(undoStack.current.pop()!);
    setHistoryVersion((value) => value + 1);
  }, [render]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) {
      toast.info('Rien à rétablir.');
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const ctx = content.getContext('2d');
    if (ctx) undoStack.current.push(ctx.getImageData(0, 0, content.width, content.height));
    restore(redoStack.current.pop()!);
    setHistoryVersion((value) => value + 1);
  }, [render]);

  useHotkeys(
    {
      z: () => undo(),
      y: () => redo(),
    },
    true,
  );

  /* -------------------------------- Dessin -------------------------------- */
  const toPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    return { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };
  };

  const context = (): CanvasRenderingContext2D | null => contentRef.current?.getContext('2d') ?? null;

  const applyStyle = (ctx: CanvasRenderingContext2D, target: Tool = tool): void => {
    const dpr = canvasRef.current ? canvasRef.current.width / Math.max(1, canvasRef.current.clientWidth) : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * dpr;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (target === 'highlighter') {
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = size * 3 * dpr;
    }
    if (target === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size * 4 * dpr;
    }
  };

  const drawSegment = (from: Point, to: Point): void => {
    const ctx = context();
    if (!ctx) return;
    applyStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  /** Trace une forme sur le contexte donné (calque validé ou prévisualisation). */
  const drawShape = (ctx: CanvasRenderingContext2D, from: Point, to: Point): void => {
    applyStyle(ctx);
    ctx.beginPath();
    if (tool === 'line') {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (tool === 'arrow') {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.max(12, size * 4);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (tool === 'rect') {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (tool === 'ellipse') {
      const cx = (from.x + to.x) / 2;
      const cy = (from.y + to.y) / 2;
      const rx = Math.abs(to.x - from.x) / 2;
      const ry = Math.abs(to.y - from.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    pushHistory();

    if (tool === 'text') {
      const value = window.prompt('Texte à écrire sur le tableau :');
      if (value && value.trim()) {
        const ctx = context();
        if (ctx) {
          const dpr = canvas.width / Math.max(1, canvas.clientWidth);
          applyStyle(ctx);
          ctx.font = `${Math.max(14, size * 5) * dpr}px 'Segoe UI', system-ui, sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillText(value, point.x, point.y);
          ctx.globalAlpha = 1;
          render();
          toast.success('Texte ajouté au tableau.');
        }
      } else {
        undoStack.current.pop();
      }
      return;
    }

    drawing.current = true;
    startPoint.current = point;
    lastPoint.current = point;

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      drawSegment(point, { x: point.x + 0.01, y: point.y + 0.01 });
      render();
    } else {
      render();
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    event.preventDefault();
    const point = toPoint(event);
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      drawSegment(lastPoint.current, point);
      lastPoint.current = point;
      render();
    } else {
      // Formes : prévisualisation directe sur le canvas affiché.
      const preview = canvasRef.current?.getContext('2d');
      if (preview) drawShape(preview, startPoint.current, point);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    drawing.current = false;
    const point = toPoint(event);
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      render();
    } else {
      const ctx = context();
      if (ctx) {
        drawShape(ctx, startPoint.current, point);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      render();
    }
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* capture déjà relâchée */
    }
  };

  /* -------------------------------- Actions ------------------------------- */
  const clearAll = (): void => {
    pushHistory();
    const content = contentRef.current;
    const ctx = content?.getContext('2d');
    if (content && ctx) ctx.clearRect(0, 0, content.width, content.height);
    render();
    setClearOpen(false);
    toast.info('Tableau effacé (Ctrl+Z pour annuler).');
  };

  const exportPng = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    drawBackground(ctx, output.width, output.height);
    if (contentRef.current) ctx.drawImage(contentRef.current, 0, 0);
    const link = document.createElement('a');
    link.download = `edumate-tableau-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
    toast.success('Tableau exporté en PNG.');
  };

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void historyVersion;

  return (
    <ToolShell
      title="Tableau interactif"
      description="Écris, dessine, schématise : crayon, surligneur, formes, gomme, annulation et export en image."
      icon={<Grid3x3 size={24} />}
      wide
      aside={
        <>
          <Card>
            <CardTitle icon={<Type size={16} />}>Raccourcis</CardTitle>
            <ul style={{ marginTop: 10, listStyle: 'none', padding: 0, display: 'grid', gap: 8, fontSize: '0.9rem', color: 'var(--ed-text-soft)' }}>
              <li>
                <span className="kbd">Z</span> annuler
              </li>
              <li>
                <span className="kbd">Y</span> rétablir
              </li>
            </ul>
            <div className="ed-row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Button size="sm" variant="soft" icon={<Undo2 size={15} />} onClick={undo} disabled={!canUndo}>
                Annuler
              </Button>
              <Button size="sm" variant="soft" icon={<Redo2 size={15} />} onClick={redo} disabled={!canRedo}>
                Rétablir
              </Button>
            </div>
            <div className="ed-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="primary" icon={<Download size={15} />} onClick={exportPng}>
                Exporter PNG
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={() => setClearOpen(true)}>
                Tout effacer
              </Button>
            </div>
          </Card>

          <Card flat>
            <CardTitle>Fond du tableau</CardTitle>
            <div className="pill-grid" style={{ marginTop: 10 }}>
              {([
                { id: 'white', label: '⬜ Uni' },
                { id: 'grid', label: '▦ Quadrillé' },
                { id: 'ruled', label: '☰ Lignes' },
              ] as const).map((item) => (
                <button key={item.id} type="button" className="pill" aria-pressed={background === item.id} onClick={() => setBackground(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </Card>

          <Card flat>
            <CardSubtitle>
              Le dessin reste en mémoire locale tant que tu gardes la page ouverte : utilise « Exporter PNG » pour
              conserver une trace durable ou l’insérer dans un devoir.
            </CardSubtitle>
          </Card>
        </>
      }
    >
      <div className="toolbar" role="toolbar" aria-label="Outils de dessin">
        <div className="toolbar__group">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tool-btn"
              aria-pressed={tool === item.id}
              aria-label={item.label}
              title={item.label}
              onClick={() => setTool(item.id)}
            >
              <item.icon size={18} />
            </button>
          ))}
        </div>

        <div className="swatches" role="group" aria-label="Couleurs">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className="swatch"
              style={{ background: item, border: item === '#ffffff' ? '2px solid var(--ed-border-strong)' : undefined }}
              aria-pressed={color === item}
              aria-label={`Couleur ${item}`}
              onClick={() => setColor(item)}
            />
          ))}
          <label className="swatch" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', position: 'relative' }}>
            <span className="sr-only">Couleur personnalisée</span>
            <input
              type="color"
              value={color}
              aria-label="Choisir une couleur personnalisée"
              onChange={(event) => setColor(event.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            />
          </label>
        </div>

        <div className="toolbar__group" role="group" aria-label="Épaisseur du trait">
          {SIZES.map((item) => (
            <button
              key={item}
              type="button"
              className="tool-btn"
              aria-pressed={size === item}
              aria-label={`Épaisseur ${item}`}
              title={`Épaisseur ${item}`}
              onClick={() => setSize(item)}
            >
              <span style={{ width: Math.min(22, item + 4), height: Math.min(22, item + 4), borderRadius: '50%', background: 'currentColor' }} />
            </button>
          ))}
        </div>

        <div className="ed-grow" />
        <IconButton label="Annuler" onClick={undo} variant="ghost" disabled={!canUndo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Rétablir" onClick={redo} variant="ghost" disabled={!canRedo}>
          <Redo2 size={18} />
        </IconButton>
        <IconButton label="Exporter en PNG" onClick={exportPng} variant="ghost">
          <Download size={18} />
        </IconButton>
        <IconButton label="Tout effacer" onClick={() => setClearOpen(true)} variant="ghost">
          <Trash2 size={18} />
        </IconButton>
      </div>

      <Notice tone="info">
        Astuce : le <strong>surligneur</strong> est parfait pour annoter un schéma, la <strong>flèche</strong> pour
        montrer une relation, et le <strong>texte</strong> pour légender.
      </Notice>

      <div className="canvas-frame" ref={containerRef} style={{ marginTop: 14 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label="Zone de dessin du tableau interactif"
          role="img"
        />
      </div>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Effacer tout le tableau ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={clearAll}>
              Tout effacer
            </Button>
          </>
        }
      >
        <p className="ed-soft">
          Le contenu du tableau sera supprimé. Tu pourras annuler cette action juste après avec le bouton « Annuler ».
        </p>
      </Modal>
    </ToolShell>
  );
}
