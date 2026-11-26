import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { Box, Point } from '../../../services/api/trainingDatasets';
import { colorFor } from '../../../ui/common';
import { PhotoImage } from '../../project/PhotoViews';
import type { Photo } from '../../project/useProject';

const MIN_BOX_PX = 4;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function boxStyle(box: Box) {
  return {
    left: `${Math.min(box.start.x, box.end.x) * 100}%`, top: `${Math.min(box.start.y, box.end.y) * 100}%`,
    width: `${Math.abs(box.start.x - box.end.x) * 100}%`, height: `${Math.abs(box.start.y - box.end.y) * 100}%`,
  };
}

/**
 * The photo with its boxes. Drag to draw a new box of `activeClass`.
 * Coordinates are stored normalised (0–1), so zoom never changes the saved boxes.
 */
export function LabelCanvas({ photo, labels, zoom, canDraw, awaiting, activeClass, selected, onSelect, onAdd }: {
  photo: Photo;
  labels: string[];
  zoom: number;
  canDraw: boolean;
  awaiting: boolean;
  activeClass: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onAdd: (box: Box) => void;
}) {
  const [draft, setDraft] = useState<Box | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const color = colorFor(labels, activeClass);

  function point(event: ReactPointerEvent): Point {
    const rect = area.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }

  return <div className={`canvas-viewport${awaiting ? ' awaiting' : ''}`}>
    {awaiting && !draft && <div className="canvas-hint" aria-hidden="true">
      <span className="swatch" style={{ background: color }} /> Drag on the photo to draw a box around the {activeClass}
    </div>}
    <div className={`canvas-zoom${zoom === 100 ? ' fit' : ''}`} style={zoom === 100 ? undefined : { width: `${zoom}%` }}>
      <div ref={area} className={`canvas-photo${canDraw ? '' : ' locked'}`}
        onPointerDown={event => {
          if (!canDraw || event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = point(event);
          onSelect(null);
          setDraft({ start, end: start, label: activeClass });
        }}
        onPointerMove={event => {
          if (canDraw) setHover(point(event));
          if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const end = point(event);
          setDraft(box => box && { ...box, end });
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={event => {
          if (!draft) return;
          const end = point(event);
          const rect = area.current!.getBoundingClientRect();
          const wide = Math.abs(draft.start.x - end.x) * rect.width >= MIN_BOX_PX;
          const tall = Math.abs(draft.start.y - end.y) * rect.height >= MIN_BOX_PX;
          if (wide && tall) onAdd({ ...draft, end });
          setDraft(null);
        }}
        onLostPointerCapture={() => setDraft(null)}>
        <PhotoImage photo={photo} alt={photo.filename} />

        {canDraw && hover && <div className="crosshair" aria-hidden="true">
          <span className="ch-x" style={{ top: `${hover.y * 100}%`, borderColor: color }} />
          <span className="ch-y" style={{ left: `${hover.x * 100}%`, borderColor: color }} />
        </div>}

        {photo.boxes.map((box, index) => {
          const top = Math.min(box.start.y, box.end.y);
          const boxColor = colorFor(labels, box.label ?? '');
          return <div key={index} className={`lbox${selected === index ? ' selected' : ''}${top < .06 ? ' flip' : ''}`}
            style={{ ...boxStyle(box), borderColor: boxColor }}>
            <button type="button" className="lbl" style={{ background: boxColor }}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => onSelect(selected === index ? null : index)}
              aria-label={`Select box ${index + 1}: ${box.label}`}><span className="lbl-n">{index + 1}</span>{box.label}</button>
          </div>;
        })}

        {draft && <div className={`lbox draft${Math.min(draft.start.y, draft.end.y) < .06 ? ' flip' : ''}`}
          style={{ ...boxStyle(draft), borderColor: color }}>
          <span className="lbl" style={{ background: color }}>{draft.label}</span>
        </div>}
      </div>
    </div>
  </div>;
}
