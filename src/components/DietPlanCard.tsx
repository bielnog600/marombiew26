import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, ChevronDown, ChevronUp, Droplets, Plus, Minus } from 'lucide-react';
import type { ParsedMeal, ParsedSection } from '@/lib/dietResultParser';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface DietPlanCardProps {
  sections: ParsedSection[];
}

const DietPlanCard: React.FC<DietPlanCardProps> = ({ sections }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [waterCount, setWaterCount] = useState(0);
  const waterGoal = 8; // 8 copos de 250ml = 2L

  // Group meals by section (each section = 1 day/cardápio)
  const mealsByDay = useMemo(() => {
    const mealSections = sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0);
    if (mealSections.length === 0) return [];
    return mealSections.map((s, i) => ({
      label: s.title || `Cardápio ${i + 1}`,
      meals: s.meals!,
    }));
  }, [sections]);

  // All meals flat (for summary when only 1 day)
  const allMeals = useMemo(() => mealSections(), [sections]);
  function mealSections() {
    return sections.filter(s => s.type === 'meal' && s.meals).flatMap(s => s.meals!);
  }

  const hasDays = mealsByDay.length > 1;
  const dayIndex = hasDays ? selectedDay % mealsByDay.length : 0;
  const currentMeals = hasDays ? (mealsByDay[dayIndex]?.meals ?? []) : allMeals;

  // Totals
  const totalKcal = currentMeals.reduce((s, m) => s + parseNum(m.totalKcal), 0);
  const totalP = currentMeals.reduce((s, m) => s + parseNum(m.totalP), 0);
  const totalC = currentMeals.reduce((s, m) => s + parseNum(m.totalC), 0);
  const totalG = currentMeals.reduce((s, m) => s + parseNum(m.totalG), 0);

  if (currentMeals.length === 0) return null;

  return (
    <Card className="glass-card overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-chart-3" />
            Plano Alimentar
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7 px-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Fechar' : 'Ver Refeições'}
            {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Macro Summary Bar */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-primary">{Math.round(totalKcal)}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">kcal</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-2">{Math.round(totalP)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Proteína</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-3">{Math.round(totalC)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Carbs</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-sm font-bold text-chart-5">{Math.round(totalG)}g</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Gordura</p>
          </div>
        </div>

        {/* Day selector */}
        {hasDays && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {DAY_LABELS.map((label, i) => {
              const isActive = selectedDay === i;
              return (
                <button
                  key={label}
                  onClick={() => setSelectedDay(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Meals list (collapsed = summary, expanded = full cards) */}
        {!expanded ? (
          <div className="space-y-1.5">
            {currentMeals.slice(0, 6).map((meal, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground truncate block">{meal.name}</span>
                  {meal.time && <span className="text-[10px] text-muted-foreground">{meal.time}</span>}
                </div>
                <span className="text-xs text-primary font-medium ml-2 whitespace-nowrap">
                  {meal.totalKcal ? `${meal.totalKcal}` : `${meal.foods.length} itens`}
                </span>
              </div>
            ))}
            {currentMeals.length > 6 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{currentMeals.length - 6} refeições
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {currentMeals.map((meal, i) => (
              <MealDetailCard key={i} meal={meal} index={i} />
            ))}
          </div>
        )}

        {/* Water Counter */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-chart-2" />
            <div>
              <p className="text-xs font-medium text-foreground">Água</p>
              <p className="text-[10px] text-muted-foreground">{waterCount * 250}ml / {waterGoal * 250}ml</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress dots */}
            <div className="flex gap-0.5">
              {Array.from({ length: waterGoal }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i < waterCount ? 'bg-chart-2' : 'bg-border'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWaterCount(Math.max(0, waterCount - 1))}
                className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setWaterCount(Math.min(waterGoal, waterCount + 1))}
                className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/* ---- Meal Detail Card ---- */
const MealDetailCard: React.FC<{ meal: ParsedMeal; index: number }> = ({ meal, index }) => {
  const SURFACES = [
    'bg-gradient-to-br from-primary/10 to-accent/5 border-primary/20',
    'bg-gradient-to-br from-secondary to-accent/8 border-border',
    'bg-gradient-to-br from-accent/10 to-primary/5 border-accent/20',
  ];
  const surface = SURFACES[index % SURFACES.length];

  const totalKcal = parseNum(meal.totalKcal);
  const totalP = parseNum(meal.totalP);
  const totalC = parseNum(meal.totalC);
  const totalG = parseNum(meal.totalG);

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${surface}`}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-foreground">{meal.name}</h4>
          {meal.time && <span className="text-[10px] text-muted-foreground">{meal.time}</span>}
        </div>
        <span className="text-xs font-bold text-primary">{Math.round(totalKcal)} kcal</span>
      </div>

      {/* Foods */}
      <div className="space-y-1">
        {meal.foods.map((food, fi) => (
          <div key={fi} className="flex items-center justify-between text-[11px]">
            <span className="text-foreground/90 truncate flex-1 mr-2">{food.food}</span>
            <span className="text-muted-foreground whitespace-nowrap">{food.qty}</span>
          </div>
        ))}
      </div>

      {/* Macro footer */}
      <div className="flex gap-3 pt-1 border-t border-border/30">
        <span className="text-[10px] text-chart-2 font-medium">P: {Math.round(totalP)}g</span>
        <span className="text-[10px] text-chart-3 font-medium">C: {Math.round(totalC)}g</span>
        <span className="text-[10px] text-chart-5 font-medium">G: {Math.round(totalG)}g</span>
      </div>
    </div>
  );
};

export default DietPlanCard;