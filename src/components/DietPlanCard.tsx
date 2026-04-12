import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, ChevronDown, ChevronUp, Droplets, Plus, Minus, Target } from 'lucide-react';
import type { ParsedMeal, ParsedSection } from '@/lib/dietResultParser';
import MealCard from '@/components/diet/MealCard';
import { Progress } from '@/components/ui/progress';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface DietPlanCardProps {
  sections: ParsedSection[];
}

interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

const formatValue = (value: number, suffix = '') => `${Math.round(value || 0)}${suffix}`;

const extractTargetsFromSections = (sections: ParsedSection[]): DailyTargets | null => {
  const fullText = sections.map((section) => `${section.title || ''}\n${section.content || ''}`).join('\n');

  const calories = fullText.match(/(?:calorias(?:\s+alvo)?|total\s+di[aá]rio)[^\d]{0,20}(\d{3,5})\s*k?cal/i);
  const protein = fullText.match(/prote[ií]na[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);
  const carbs = fullText.match(/carbo(?:idrato|s)?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);
  const fats = fullText.match(/gordura[s]?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);

  const parsed = {
    calories: calories ? parseNum(calories[1]) : 0,
    protein: protein ? parseNum(protein[1]) : 0,
    carbs: carbs ? parseNum(carbs[1]) : 0,
    fats: fats ? parseNum(fats[1]) : 0,
  };

  return Object.values(parsed).some((value) => value > 0) ? parsed : null;
};

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
  const targets = useMemo(() => extractTargetsFromSections(sections), [sections]);
  const waterMl = waterCount * 250;
  const waterGoalMl = waterGoal * 250;
  const waterProgress = (waterCount / waterGoal) * 100;

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
        {hasDays && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {DAY_LABELS.map((label, i) => {
              const isActive = selectedDay === i;
              const hasMealsForDay = Boolean(mealsByDay[i]?.meals?.length);

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => hasMealsForDay && setSelectedDay(i)}
                  disabled={!hasMealsForDay}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : hasMealsForDay
                        ? 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                        : 'bg-secondary/30 text-muted-foreground/50 opacity-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

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
              <MealCard
                key={`${meal.name}-${meal.time || 'sem-hora'}-${i}`}
                meal={meal}
                index={i}
                onCopy={() => null}
              />
            ))}
          </div>
        )}

        {targets && (
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">Metas do dia</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-primary">{formatValue(targets.calories, ' kcal')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Calorias</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-2">{formatValue(targets.protein, 'g')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Proteína</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-3">{formatValue(targets.carbs, 'g')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbo</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-5">{formatValue(targets.fats, 'g')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gordura</p>
              </div>
            </div>
          </div>
        )}

        {/* Water Counter */}
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-chart-2" />
              <div>
                <p className="text-xs font-medium text-foreground">Quantidade de água</p>
                <p className="text-[10px] text-muted-foreground">{waterMl}ml / {waterGoalMl}ml</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWaterCount(Math.max(0, waterCount - 1))}
                className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setWaterCount(Math.min(waterGoal, waterCount + 1))}
                className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Progress value={waterProgress} className="h-2 bg-background/70" />

          <div className="flex gap-1">
            {Array.from({ length: waterGoal }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${i < waterCount ? 'bg-chart-2' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DietPlanCard;