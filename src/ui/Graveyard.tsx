import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { modules } from '../core/registry.js';
import { samples } from '../samples/data.js';
import type { SampleSpecimen } from '../samples/data.js';
import { base64ToBytes } from './bytes.js';
import { registerOffline } from './offline.js';
import './graveyard.css';

export interface GraveyardProps {
  onFile: (name: string, bytes: Uint8Array) => void;
  error: { title: string; detail: string } | null;
}

const tilts = ['-2.2deg', '1.4deg', '-0.8deg', '2deg', '-1.6deg', '0.9deg'];

export function Graveyard({ onFile, error }: GraveyardProps) {
  const [over, setOver] = useState(false);
  const [offline, setOffline] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerOffline((state) => {
      if (state === 'ready') setOffline(true);
    });
  }, []);

  const take = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      onFile(file.name, new Uint8Array(await file.arrayBuffer()));
    },
    [onFile],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files[0]);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void take(e.target.files?.[0]);
    e.target.value = '';
  };
  const openSample = (s: SampleSpecimen) => onFile(s.file, base64ToBytes(s.base64));

  return (
    <main
      id="main"
      tabIndex={-1}
      className="graveyard"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="masthead">
        <h1>Exhume</h1>
        <p className="tagline">Raise your dead files.</p>
        <p className="pitch">
          Somewhere on an old disk there is a drawing, a budget, a letter that no program opens any more.
          Drop it here. Exhume decodes it <strong>in this tab</strong>, shows what every byte means, and
          hands it back in a format that will still open tomorrow.
        </p>
      </header>

      <section className={over ? 'grave over' : 'grave'} aria-labelledby="grave-title">
        <h2 id="grave-title">The open grave</h2>
        <p>Drop a file anywhere on this page, or choose one. The format is read from the bytes, not the name.</p>
        <input ref={input} id="file-input" type="file" onChange={onPick} aria-label="Choose a file to exhume" />
        <button type="button" className="btn btn-ember" onClick={() => input.current?.click()}>
          Choose a file to exhume
        </button>
        <p className="privacy">Nothing is uploaded. There is no server. It works offline.</p>
      </section>

      {error && (
        <div className="error-card" role="alert">
          <h3>{error.title}</h3>
          <p>{error.detail}</p>
        </div>
      )}

      <h2 className="plot-title">Here lie</h2>
      <ul className="plots">
        {modules.map((m, i) => {
          const sample = samples.find((s) => s.formatId === m.id);
          return (
            <li className="plot" key={m.id}>
              <button
                type="button"
                className="stone"
                style={{ ['--tilt' as string]: tilts[i % tilts.length] }}
                disabled={!sample}
                onClick={() => sample && openSample(sample)}
                aria-label={sample ? `Exhume the ${m.name} sample, ${sample.file}` : `${m.name}, no sample`}
              >
                <span className="rip">R.I.P.</span>
                <span className="name">{m.name}</span>
                <span className="years">{m.born}&ndash;{m.died}</span>
                <span className="ext">{m.extensions.join(' ')}</span>
                {sample && <span className="dig">Dig up {sample.file}</span>}
              </button>
              <p className="epitaph">{m.epitaph}</p>
            </li>
          );
        })}
      </ul>

      <footer className="colophon">
        <div className="colophon-content">
          <p>
            Every decoder here was written from the published format descriptions and is checked with
            property-based tests. Open source, MIT. Built for Kiroween 2026.
          </p>
          <p>
            <a href="https://github.com/Khozhijon/exhume">Source code</a>
          </p>
        </div>
        <div className="privacy-notice" role="status">
          <p><strong>All files decoded locally. Nothing leaves your browser.</strong></p>
          <p>
            Your files are decoded in this tab. Nothing is uploaded. There is no server. There are no analytics,
            no cookies, no tracking. What you exhume stays in your hands.
          </p>
          {offline && <p className="offline-ready">✓ Offline ready: this page now works without a connection.</p>}
        </div>
      </footer>
    </main>
  );
}
