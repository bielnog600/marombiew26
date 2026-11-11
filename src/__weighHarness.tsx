import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import BottomNav from '@/components/BottomNav';
import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';

const meal = { name: 'Lanche', time: '16:00', foods: [
  { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7', g: '4.5' },
  { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '3', g: '1.5' },
  { food: 'Chia', qty: '15 g', kcal: '73', p: '2.5', c: '6.3', g: '4.6' },
] };
const App = () => {
  const [open, setOpen] = useState(false);
  return (
    <BrowserRouter>
      <div className="min-h-screen flex"><main className="flex-1 overflow-auto p-4"><div className="animate-fade-in">
        <button onClick={() => setOpen(true)}>Abrir pesagem</button>
        {open && <MealWeighScreen meal={meal as any} studentId="x" logDate="2026-11-11" mealIndex={0} dietPlanId={null} testMode initialMode="scan" onClose={() => setOpen(false)} />}
      </div></main><BottomNav /></div>
      <Toaster />
    </BrowserRouter>
  );
};
createRoot(document.getElementById('root')!).render(<App />);
