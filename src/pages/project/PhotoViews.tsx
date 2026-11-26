import type { Box } from '../../services/api/trainingDatasets';
import { colorFor, useObjectUrl } from '../../ui/common';
import type { Photo } from './useProject';

/** Shows a photo from its local file (not uploaded yet) or from the API. */
export function PhotoImage({ photo, className, alt = '' }: { photo: Photo; className?: string; alt?: string }) {
  const local = useObjectUrl(photo.file);
  const src = photo.file ? local : photo.savedUrl;
  return src ? <img className={className} src={src} alt={alt} loading="lazy" draggable={false} /> : null;
}

/** Read-only colored boxes drawn over a thumbnail. */
export function BoxOverlay({ boxes, labels }: { boxes: Box[]; labels: string[] }) {
  return <div className="boxes-overlay" aria-hidden="true">
    {boxes.map((box, index) => <span key={index} style={{
      left: `${Math.min(box.start.x, box.end.x) * 100}%`, top: `${Math.min(box.start.y, box.end.y) * 100}%`,
      width: `${Math.abs(box.start.x - box.end.x) * 100}%`, height: `${Math.abs(box.start.y - box.end.y) * 100}%`,
      borderColor: colorFor(labels, box.label ?? ''),
    }} />)}
  </div>;
}
