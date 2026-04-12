import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UtensilsCrossed, Droplets, Plus, Minus, Target, ArrowLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseSections, type ParsedMeal, type ParsedSection } from '@/lib/dietResultParser';
import MealCard from '@/components/diet/MealCard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useDailyTracking } from '@/hooks/useDailyTracking';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const formatValue = (value: number, suffix = '') => `${Math.round(value || 0)}${suffix}`;

const extractTargetsFromSections = (sections: ParsedSection[]) => {
  const fullText = sections.map((s) => `${s.title || ''}\n${s.content || ''}`).join('\n');
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
  return Object.values(parsed).some((v) => v > 0) ? parsed : null;
};

const MinhasDietas = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const { tracking, addWater, removeWater, toggleMeal } = useDailyTracking();
  const waterGoal = 8;

  useEffect(() => {
    if (user) loadDiet();
  }, [user]);

  const loadDiet = async () => {
    const { data: dieta } = await supabase
      .from('ai_plans')
      .select('conteudo')
      .eq('student_id', user!.id)
      .eq('tipo', 'dieta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dieta) {
      setSections(parseSections(dieta.conteudo));
    }
  };

  const mealsByDay = useMemo(() => {
    const mealSections = sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0);
    return mealSections.map((s, i) => ({
      label: s.title || `Cardápio ${i + 1}`,
      meals: s.meals!,
    }));
  }, [sections]);

  const allMeals = useMemo(() =>
    sections.filter(s => s.type === 'meal' && s.meals).flatMap(s => s.meals!),
    [sections]
  );

  const hasDays = mealsByDay.length > 1;
  const dayIndex = hasDays ? selectedDay % mealsByDay.length : 0;
  const currentMeals = hasDays ? (mealsByDay[dayIndex]?.meals ?? []) : allMeals;

  const totalKcal = currentMeals.reduce((s, m) => s + parseNum(m.totalKcal), 0);
  const totalP = currentMeals.reduce((s, m) => s + parseNum(m.totalP), 0);
  const totalC = currentMeals.reduce((s, m) => s + parseNum(m.totalC), 0);
  const totalG = currentMeals.reduce((s, m) => s + parseNum(m.totalG), 0);
  const targets = useMemo(() => extractTargetsFromSections(sections), [sections]);

  const waterMl = tracking.water_glasses * 250;
  const waterGoalMl = waterGoal * 250;
  const waterProgress = (tracking.water_glasses / waterGoal) * 100;

  return (
    <AppLayout title="Plano Alimentar">
      <div className="space-y-4 animate-fade-in">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2"
          onClick={() => navigate('/minha-area')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        {/* Day selector */}
        {hasDays && (
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {DAY_LABELS.map((label, i) => {
              const isActive = dayIndex === i;
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

        {/* Daily targets - TOP */}
        {targets && (
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">Metas do dia</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
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

        {/* Macro summary (fallback when no targets parsed) */}
        {!targets && currentMeals.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">Totais do dia</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-primary">{Math.round(totalKcal)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">kcal</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-2">{Math.round(totalP)}g</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Proteína</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-3">{Math.round(totalC)}g</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbs</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-5">{Math.round(totalG)}g</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gordura</p>
              </div>
            </div>
          </div>
        )}

        {/* Water counter - TOP */}
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

        {/* Meals */}
        {currentMeals.length > 0 && (
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

        {currentMeals.length === 0 && (
          <Card className="glass-card">
            <CardContent className="p-6 text-center">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum plano alimentar disponível.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default MinhasDietas;
