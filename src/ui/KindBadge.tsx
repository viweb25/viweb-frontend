import type { ClassKind } from '../services/api/trainingDatasets';
import { Icon } from './Icon';
import { KIND_LABEL } from './common';

/** Small "Good" / "Defect" pill. Plain objects show nothing unless `showObject` is set. */
export function KindBadge({ kind, showObject = false }: { kind: ClassKind; showObject?: boolean }) {
  if (kind === 'object') return showObject ? <span className="kind-plain"><Icon name="box" />{KIND_LABEL.object}</span> : null;
  return <span className={`kind ${kind}`}><Icon name={kind === 'good' ? 'check' : 'alert'} />{KIND_LABEL[kind]}</span>;
}
