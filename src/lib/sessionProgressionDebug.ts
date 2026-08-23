import { PROGRESSION_SNAPSHOT_VERSION } from '../lib/sessionProgression';

/** Lê um snapshot já persistido no session_state (tolerante a formatos antigos e Duo). */
export const readProgressionSnapshot = (stateOrSnapshot: any): any | null => {
  if (!stateOrSnapshot || typeof stateOrSnapshot !== 'object') return null;
  
  // Se for o snapshot diretamente (Duo passa snapshot[studentId])
  if (stateOrSnapshot.recommendations && typeof stateOrSnapshot.recommendations === 'object' && Number(stateOrSnapshot.version) === PROGRESSION_SNAPSHOT_VERSION) {
    return stateOrSnapshot;
  }

  // Se for o session_state inteiro (Individual passa active.sessionState)
  const snap = stateOrSnapshot?.progressionRecommendations;
  if (snap && typeof snap === 'object' && snap.recommendations && typeof snap.recommendations === 'object' && Number(snap.version) === PROGRESSION_SNAPSHOT_VERSION) {
    return snap;
  }
  
  return null;
};
