import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { lazyWithRetry } from '@/lib/appUpdate/lazyWithRetry';
import { useAuth } from '@/contexts/AuthContext';
import { localDateKey } from '@/lib/localTrackingWeek';
import type { ParsedMeal } from '@/lib/dietResultParser';

const MealWeighScreen = lazyWithRetry(() => import('@/components/diet/mealWeigh/MealWeighScreen'));

/** Refeição de exemplo para o admin testar (valores da base para essas gramas). */
const SAMPLE_MEAL: ParsedMeal = {
  name: 'Almoço (teste)',
  time: '12:30',
  foods: [
    { food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '4', c: '42.3', g: '0.4' },
    { food: 'Peito de frango grelhado', qty: '120 g', kcal: '198', p: '37.2', c: '0', g: '4.3' },
    { food: 'Feijão carioca cozido', qty: '100 g', kcal: '76', p: '4.8', c: '13.6', g: '0.5' },
  ],
};

/** Acesso do admin para testar "Pesar refeição" no próprio celular; nada é salvo. */
const PesarRefeicaoTeste = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando" className="min-h-screen bg-background" />}>
      <MealWeighScreen
        meal={SAMPLE_MEAL}
        studentId={user.id}
        logDate={localDateKey()}
        mealIndex={null}
        dietPlanId={null}
        testMode
        onClose={() => navigate('/dashboard')}
      />
    </Suspense>
  );
};

export default PesarRefeicaoTeste;
