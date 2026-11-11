import { useEffect } from 'react';
import { useEventTracking } from '@/hooks/useEventTracking';
import { useAuth } from '@/contexts/AuthContext';
import { resolveStaleWorkoutSessionsThrottled } from '@/lib/workoutSessionResolution';
import ForgottenWorkoutPrompt from '@/components/training/ForgottenWorkoutPrompt';
import { useLanguage } from '@/i18n';
import { syncStudentAppLanguage } from '@/lib/studentAppLanguage';

/**
 * Registra "app_opened" para o aluno em qualquer rota (não só na Home),
 * garantindo que o uso do app seja contabilizado mesmo quando o aluno
 * abre direto no treino, dieta, etc.
 */
const StudentAppOpenTracker = () => {
  const { user, role } = useAuth();
  const { trackEvent } = useEventTracking();
  const { language } = useLanguage();

  // Idioma do aparelho no perfil: permite traduzir o plano assim que for publicado.
  useEffect(() => {
    if (!user || role !== 'aluno') return;
    void syncStudentAppLanguage(language);
  }, [user?.id, role, language]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!user || role !== 'aluno') return null;
  return <ForgottenWorkoutPrompt />;
};

export default StudentAppOpenTracker;
