import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Toaster } from 'sonner';
import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
const meal = { name: 'Almoço', time: '12:30', foods: [
  { food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '4', c: '42.3', g: '0.4' },
  { food: 'Peito de frango grelhado', qty: '120 g', kcal: '198', p: '37.2', c: '0', g: '4.3' },
] };
createRoot(document.getElementById('root')!).render(<><Toaster /><MealWeighScreen meal={meal} studentId="x" logDate="2026-11-11" mealIndex={0} dietPlanId={null} testMode onClose={() => {}} /></>);
