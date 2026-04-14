import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { UtensilsCrossed, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ParsedSection } from '@/lib/dietResultParser';

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

  // Group meals by day/cardápio section
  const mealsByDay = useMemo(() =>
    sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0).map(s => s.meals!),
    [sections]
  );

  // Show current day's meals (rotate through available days)
  const hasDays = mealsByDay.length > 1;
  const dayIndex = hasDays ? (new Date().getDay() + 6) % 7 % mealsByDay.length : 0;
  const currentMeals = mealsByDay[dayIndex] ?? [];

  const totalKcal = currentMeals.reduce((s, m) => s + parseNum(m.totalKcal), 0);
  const totalP = currentMeals.reduce((s, m) => s + parseNum(m.totalP), 0);
  const totalC = currentMeals.reduce((s, m) => s + parseNum(m.totalC), 0);
  const totalG = currentMeals.reduce((s, m) => s + parseNum(m.totalG), 0);

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
