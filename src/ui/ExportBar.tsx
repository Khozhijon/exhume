import { useState } from 'react';
import type { Specimen } from '../core/types.js';
import { exportTargets } from '../export/index.js';
import { reincarnate } from './reincarnate.js';
import { baseName, download } from './bytes.js';

export interface ExportBarProps {
  fileName: string;
  specimen: Specimen;
}

/** Reincarnate: hand the specimen back in formats that will still open tomorrow. */
export function ExportBar({ fileName, specimen }: ExportBarProps) {
  const [note, setNote] = useState('');
  const targets = exportTargets(specimen.payload);

  const run = (id: string) => {
    const target = targets.find((t) => t.id === id);
    if (!target) return;
    try {
      const result = reincarnate(target.extension, specimen, fileName);
      const out = `${baseName(fileName)}.${target.extension}`;
      download(out, target.mime, result.data);
      setNote(result.warnings.length ? `${out} saved. ${result.warnings.join(' ')}` : `${out} saved to your downloads.`);
    } catch (e) {
      setNote(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="export-bar">
      <span className="export-label" id="reincarnate-label">Reincarnate as</span>
      <div role="group" aria-labelledby="reincarnate-label" className="export-buttons">
        {targets.map((t, i) => (
          <button key={t.id} type="button" className={i === 0 ? 'btn btn-ember' : 'btn'} onClick={() => run(t.id)} title={t.label}>
            {t.extension.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="export-note" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
