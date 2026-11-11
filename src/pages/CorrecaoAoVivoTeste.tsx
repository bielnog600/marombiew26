import React, { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/appUpdate/lazyWithRetry';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const LiveCorrectionScreen = lazyWithRetry(() => import('@/components/liveCorrection/LiveCorrectionScreen'));

/** Acesso do admin para testar a Correção ao vivo no próprio celular. */
const CorrecaoAoVivoTeste = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando" className="min-h-screen bg-background" />}>
      <LiveCorrectionScreen
        studentId={user.id}
        exerciseName="Agachamento (teste)"
        depthLevelPicker
        onClose={() => navigate('/dashboard')}
      />
    </Suspense>
  );
};

export default CorrecaoAoVivoTeste;
