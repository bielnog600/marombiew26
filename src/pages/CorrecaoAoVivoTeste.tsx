import React, { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const LiveCorrectionScreen = lazy(() => import('@/components/liveCorrection/LiveCorrectionScreen'));

/** Acesso do admin para testar a Correção ao vivo no próprio celular. */
const CorrecaoAoVivoTeste = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>}>
      <LiveCorrectionScreen
        studentId={user.id}
        exerciseName="Agachamento (teste)"
        onClose={() => navigate('/dashboard')}
      />
    </Suspense>
  );
};

export default CorrecaoAoVivoTeste;
