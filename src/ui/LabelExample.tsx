import { Icon } from './Icon';
import { LABEL_EXAMPLE } from './inspectionExample';

export function LabelExample({ compact = false }: { compact?: boolean }) {
  return <section className={`label-example${compact ? ' compact' : ''}`} aria-label="Box label check example">
    <header><Icon name="tag" /><h2>{LABEL_EXAMPLE.project}</h2></header>
    <div className="label-example-pair">
      {LABEL_EXAMPLE.labels.map(({ name, kind }) => <figure key={name}>
        <div className={`parcel-diagram ${kind}`} aria-hidden="true">
          <div className="parcel"><span className="parcel-target" /><span className="parcel-label"><i /><i /><i /></span></div>
        </div>
        <figcaption><Icon name={kind === 'good' ? 'check' : 'close'} /> {name}</figcaption>
      </figure>)}
    </div>
    {!compact && <p>{LABEL_EXAMPLE.instruction}</p>}
  </section>;
}
