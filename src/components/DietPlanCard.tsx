import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { UtensilsCrossed, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ParsedSection } from '@/lib/dietResultParser';
import { extractTargetsFromSections } from '@/lib/dietTargets';

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface DietPlanCardProps {
  sections: ParsedSection[];
  mealsCompleted?: number[];
  onToggleMeal?: (index: number) => void;
}

const DietPlanCard: React.FC<DietPlanCardProps> = ({ sections, mealsCompleted = [], onToggleMeal }) => {
  const navigate = useNavigate();

  const mealSections = useMemo(
    () => sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0),
    [sections]
  );

  // Detect if sections are "options/cardápios" (variants of same day) instead of weekdays.
  // If titles contain "opção/opcao/cardápio/cardapio/menu", treat as options → use first only.
  const isOptions = useMemo(() => {
    if (mealSections.length <= 1) return false;
    return mealSections.every(s => {
      const t = (s.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /(opcao|cardapio|menu|opç|cardáp)/i.test(t) || t.trim() === '';
    });
  }, [mealSections]);

  const mealsByDay = useMemo(
    () => (isOptions ? mealSections.slice(0, 1) : mealSections).map(s => s.meals!),
    [mealSections, isOptions]
  );

  const hasDays = mealsByDay.length > 1;

  // Match today's meals by day name (same fix as training card)
  const dayIndex = useMemo(() => {
    if (!hasDays) return 0;
    const jsDay = new Date().getDay();
    const todayNames = jsDay === 0 ? ['domingo'] : jsDay === 1 ? ['segunda'] : jsDay === 2 ? ['terca', 'terça'] : jsDay === 3 ? ['quarta'] : jsDay === 4 ? ['quinta'] : jsDay === 5 ? ['sexta'] : ['sabado', 'sábado'];
    const matchIdx = mealSections.findIndex(s => {
      const title = (s.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return todayNames.some(n => title.includes(n));
    });
    if (matchIdx >= 0) return matchIdx;
    return (jsDay + 6) % 7 % mealsByDay.length;
  }, [hasDays, mealsByDay.length, mealSections]);

  const currentMeals = mealsByDay[dayIndex] ?? [];

  const parsedTotals = useMemo(() => ({
    kcal: currentMeals.reduce((sum, meal) => sum + parseNum(meal.totalKcal), 0),
    protein: currentMeals.reduce((sum, meal) => sum + parseNum(meal.totalP), 0),
    carbs: currentMeals.reduce((sum, meal) => sum + parseNum(meal.totalC), 0),
    fats: currentMeals.reduce((sum, meal) => sum + parseNum(meal.totalG), 0),
  }), [currentMeals]);

  // Always show the real sum from the meal table (matches admin view)
  const totalKcal = parsedTotals.kcal;
  const totalP = parsedTotals.protein;
  const totalC = parsedTotals.carbs;
  const totalG = parsedTotals.fats;

  if (currentMeals.length === 0) return null;

  return (
    <Card className="glass-card overflow-hidden">
      <div className="relative p-4">
        <div className="absolute top-0 right-0 w-24 h-24 bg-chart-3/10 rounded-full -translate-y-6 translate-x-6" />
        
        <div
          className="flex items-center justify-between relative cursor-pointer group"
          onClick={() => navigate('/minhas-dietas')}
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-chart-3/20 flex items-center justify-center">
              <UtensilsCrossed className="h-6 w-6 text-chart-3" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-chart-3 font-semibold">Plano Alimentar</p>
              <h3 className="text-base font-bold text-foreground mt-0.5">{currentMeals.length} refeições</h3>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <ChevronRight className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>

        {/* Macro pills */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <div className="text-center p-1.5 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-primary">{Math.round(totalKcal)}</p>
            <p className="text-[9px] text-muted-foreground uppercase">kcal</p>
          </div>
          <div className="text-center p-1.5 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-2">{Math.round(totalP)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase">Prot</p>
          </div>
          <div className="text-center p-1.5 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-3">{Math.round(totalC)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase">Carbs</p>
          </div>
          <div className="text-center p-1.5 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-5">{Math.round(totalG)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase">Gord</p>
          </div>
        </div>

        <p className="text-xs text-primary font-medium text-center mt-3 cursor-pointer hover:underline" onClick={() => navigate('/minhas-dietas')}>
          Ver refeições →
        </p>
      </div>
    </Card>
  );
};

export default DietPlanCard;
