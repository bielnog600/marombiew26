import { useEffect } from 'react';
import { useEventTracking } from '@/hooks/useEventTracking';
import { useAuth } from '@/contexts/AuthContext';
import { resolveStaleWorkoutSessionsThrottled } from '@/lib/workoutSessionResolution';

/**
 * Registra "app_opened" para o aluno em qualquer rota (não só na Home),
 * garantindo que o uso do app seja contabilizado mesmo quando o aluno
 * abre direto no treino, dieta, etc.
 */
const StudentAppOpenTracker = () => {
  const { user, role } = useAuth();
  const { trackEvent } = useEventTracking();

  useEffect(() => {
    if (!user || role !== 'aluno') return;
    trackEvent('app_opened');
    // Resolve sessões de treino que ficaram abertas (aluno não finalizou).
    resolveStaleWorkoutSessionsThrottled(user.id);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        trackEvent('app_opened');
        resolveStaleWorkoutSessionsThrottled(user.id);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, role, trackEvent]);

  return null;
};

export default StudentAppOpenTracker;
