import type { Specimen } from '../core/types.js';
import { hex } from './bytes.js';

export interface CoronerReportProps {
  specimen: Specimen;
  onJump: (offset: number) => void;
}

/** The warning list: what the decoder could not recover, in plain words. */
export function CoronerReport({ specimen, onJump }: CoronerReportProps) {
  const { warnings, meta } = specimen;
  const facts = Object.entries(meta).filter(([, v]) => v !== undefined && !Array.isArray(v));
  return (
    <section className="coroner" aria-labelledby="coroner-title">
      <h2 id="coroner-title">Coroner&rsquo;s report</h2>
      {warnings.length === 0 ? (
        <p className="coroner-clean">No damage found. Every byte of this file was accounted for.</p>
      ) : (
        <>
          <p>What the coroner could not recover, or had to assume ({warnings.length}):</p>
          <ol className="coroner-list">
            {warnings.map((w, i) => (
              <li key={i}>
                <span>{w.message}</span>
                {w.offset !== undefined && (
                  <button type="button" className="btn btn-quiet mono" onClick={() => onJump(w.offset ?? 0)}>
                    at 0x{hex(w.offset, 6)} &rarr; autopsy
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {facts.length > 0 && (
        <dl className="coroner-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {meta.dotCommands && meta.dotCommands.length > 0 && (
        <p className="mono coroner-dots">Dot commands kept out of the text: {meta.dotCommands.join('  ')}</p>
      )}
    </section>
  );
}
