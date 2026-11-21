import { useCallback, useEffect, useReducer } from 'react';
import { exhume } from './core/registry.js';
import type { Exhumed } from './core/registry.js';
import { ExhumeError } from './core/types.js';
import { Graveyard } from './ui/Graveyard.js';
import { SpecimenView } from './ui/SpecimenView.js';
import { formatSize } from './ui/bytes.js';

interface Loaded {
  fileName: string;
  bytes: Uint8Array;
  exhumed: Exhumed;
}

interface State {
  phase: 'graveyard' | 'exhuming' | 'specimen';
  pending: { fileName: string; bytes: Uint8Array } | null;
  loaded: Loaded | null;
  error: { title: string; detail: string } | null;
}

type Action =
  | { type: 'dig'; fileName: string; bytes: Uint8Array }
  | { type: 'raised'; loaded: Loaded }
  | { type: 'failed'; title: string; detail: string }
  | { type: 'rebury' };

const initial: State = { phase: 'graveyard', pending: null, loaded: null, error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'dig':
      return { phase: 'exhuming', pending: { fileName: action.fileName, bytes: action.bytes }, loaded: null, error: null };
    case 'raised':
      return { phase: 'specimen', pending: null, loaded: action.loaded, error: null };
    case 'failed':
      return { phase: 'graveyard', pending: null, loaded: null, error: { title: action.title, detail: action.detail } };
    case 'rebury':
      return initial;
    default:
      return state;
  }
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);

  const onFile = useCallback((fileName: string, bytes: Uint8Array) => {
    dispatch({ type: 'dig', fileName, bytes });
  }, []);

  // Decode after the overlay has painted, so the page never looks frozen.
  useEffect(() => {
    if (state.phase !== 'exhuming' || !state.pending) return;
    const { fileName, bytes } = state.pending;
    const timer = setTimeout(() => {
      try {
        const exhumed = exhume(bytes, fileName);
        dispatch({ type: 'raised', loaded: { fileName, bytes, exhumed } });
      } catch (e) {
        const detail = e instanceof ExhumeError ? e.message : 'The decoder failed in a way it should not have.';
        dispatch({
          type: 'failed',
          title: `The coroner could not identify ${fileName}`,
          detail: `${detail} (${formatSize(bytes.length)}). Exhume reads MacPaint, PCX, IFF ILBM, Lotus 1-2-3, dBASE and WordStar files.`,
        });
      }
    }, reducedMotion() ? 0 : 650);
    return () => clearTimeout(timer);
  }, [state.phase, state.pending]);

  return (
    <>
      <div className="sky" aria-hidden="true">
        <div className="moon" />
        <div className="fog" />
        <div className="fog two" />
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {state.phase === 'exhuming' && state.pending ? `Exhuming ${state.pending.fileName}` : ''}
        {state.phase === 'specimen' && state.loaded
          ? `${state.loaded.fileName} exhumed as ${state.loaded.exhumed.module.name}, ${state.loaded.exhumed.specimen.warnings.length} warnings`
          : ''}
      </div>
      {state.phase === 'exhuming' && state.pending && (
        <div className="exhuming">
          <div>
            <div className="shaft" aria-hidden="true" />
            <h2>Exhuming {state.pending.fileName}&hellip;</h2>
            <p>{formatSize(state.pending.bytes.length)} &middot; reading the bytes, not the name</p>
          </div>
        </div>
      )}
      {state.phase === 'specimen' && state.loaded ? (
        <SpecimenView
          fileName={state.loaded.fileName}
          bytes={state.loaded.bytes}
          module={state.loaded.exhumed.module}
          specimen={state.loaded.exhumed.specimen}
          onBack={() => dispatch({ type: 'rebury' })}
          onFile={onFile}
        />
      ) : (
        <Graveyard onFile={onFile} error={state.error} />
      )}
    </>
  );
}
