import { useReducer, useCallback } from 'react';
import type { Specimen, SpecimenPayload } from './core/types.js';

type Screen = 'graveyard' | 'viewer';

interface AppState {
  screen: Screen;
  specimen: Specimen | null;
}

type AppAction =
  | { type: 'load-specimen'; specimen: Specimen }
  | { type: 'return-to-graveyard' };

const initialState: AppState = {
  screen: 'graveyard',
  specimen: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'load-specimen':
      return {
        screen: 'viewer',
        specimen: action.specimen,
      };
    case 'return-to-graveyard':
      return initialState;
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const handleLoadSpecimen = useCallback((specimen: Specimen) => {
    dispatch({ type: 'load-specimen', specimen });
  }, []);

  const handleReturnToGraveyard = useCallback(() => {
    dispatch({ type: 'return-to-graveyard' });
  }, []);

  // For now, just render a heading
  return (
    <div className="app">
      <h1>Exhume</h1>
      <p>Dead files, raised from the grave.</p>
    </div>
  );
}
