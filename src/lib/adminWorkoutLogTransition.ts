import { buildActivityExercises } from '@/lib/adminActivityExercises';

const completedCount = (session: any) => buildActivityExercises(session, [], null)
  .reduce((total, exercise) => total + exercise.sets.filter(set => set.completed).length, 0);

/** Read-only bridge between the final live snapshot and asynchronously persisted logs. */
export function createWorkoutLogTransition(
  publishSession: (session: any) => void,
  reload: () => void,
) {
  let current: any = null;
  let snapshot: any = null;
  let expected = 0;
  let retryScheduled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const clearRetries = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
  };
  return {
    receiveSession(session: any) {
      current = session;
      if (session.status === 'in_progress') {
        snapshot = session;
        expected = completedCount(session);
      }
      publishSession(session.status === 'completed' && snapshot && completedCount(session) < expected
        ? { ...session, session_state: snapshot.session_state }
        : session);
    },
    receiveLogs(count: number) {
      if (current?.status !== 'completed') return true;
      if (count === 0 || count < expected) {
        if (!retryScheduled) {
          retryScheduled = true;
          for (const delay of [2000, 5000]) timers.push(setTimeout(reload, delay));
        }
        return false;
      }
      clearRetries();
      publishSession(current);
      return true;
    },
    dispose: clearRetries,
  };
}