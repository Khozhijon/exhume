import { useState } from 'react';
import type { DragEvent } from 'react';
import type { FormatModule, Specimen } from '../core/types.js';
import { Autopsy } from './autopsy/Autopsy.js';
import { CoronerReport } from './CoronerReport.js';
import { ExportBar } from './ExportBar.js';
import { ImageViewer } from './viewers/ImageViewer.js';
import { SheetViewer } from './viewers/SheetViewer.js';
import { TableViewer } from './viewers/TableViewer.js';
import { DocumentViewer } from './viewers/DocumentViewer.js';
import { formatSize } from './bytes.js';
import './specimen.css';
import './frames.css';

export interface SpecimenViewProps {
  fileName: string;
  bytes: Uint8Array;
  module: FormatModule;
  specimen: Specimen;
  onBack: () => void;
  onFile: (name: string, bytes: Uint8Array) => void;
}

type Tab = 'viewer' | 'autopsy' | 'report';

export function SpecimenView({ fileName, bytes, module, specimen, onBack, onFile }: SpecimenViewProps) {
  const [tab, setTab] = useState<Tab>('viewer');
  const [focusOffset, setFocusOffset] = useState<number | null>(null);
  const { payload, warnings } = specimen;

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file.name, new Uint8Array(await file.arrayBuffer()));
  };
  const jump = (offset: number) => {
    setFocusOffset(offset);
    setTab('autopsy');
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'viewer', label: 'Viewer' },
    { id: 'autopsy', label: 'Autopsy' },
    { id: 'report', label: `Coroner’s report${warnings.length ? ` (${warnings.length})` : ''}` },
  ];

  return (
    <main className="specimen" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void onDrop(e)}>
      <header className="specimen-head">
        <button type="button" className="btn btn-quiet" onClick={onBack}>&larr; Graveyard</button>
        <div className="specimen-id">
          <h1>{fileName}</h1>
          <p>
            <span className="chip chip-format">{module.name} &middot; {module.born}&ndash;{module.died}</span>
            <span className="chip">{formatSize(bytes.length)}</span>
            <span className="chip">{warnings.length === 0 ? 'intact' : `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}</span>
          </p>
        </div>
        <ExportBar fileName={fileName} specimen={specimen} />
      </header>

      <div className="tabs" role="tablist" aria-label="Rooms">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'viewer' && payload.kind === 'image' && <ImageViewer payload={payload} formatId={module.id} fileName={fileName} />}
        {tab === 'viewer' && payload.kind === 'sheet' && <SheetViewer payload={payload} fileName={fileName} />}
        {tab === 'viewer' && payload.kind === 'table' && <TableViewer payload={payload} fileName={fileName} />}
        {tab === 'viewer' && payload.kind === 'document' && <DocumentViewer payload={payload} fileName={fileName} />}
        {tab === 'autopsy' && <Autopsy bytes={bytes} annotations={specimen.annotations} focusOffset={focusOffset} />}
        {tab === 'report' && <CoronerReport specimen={specimen} onJump={jump} />}
      </div>
    </main>
  );
}
