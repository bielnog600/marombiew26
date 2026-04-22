import React, { useEffect, useState, useMemo, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UtensilsCrossed, Droplets, Plus, Minus, Target, ArrowLeft, Lightbulb, Leaf, Pill, Zap, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseSections, type ParsedSection } from '@/lib/dietResultParser';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import { extractTargetsFromSections } from '@/lib/dietTargets';
import MealCard from '@/components/diet/MealCard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import ReactMarkdown from 'react-markdown';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const OPTION_TITLE_REGEX = /(op[cç][aã]o|card[aá]pio)/i;

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const formatValue = (value: number, suffix = '') => `${Math.round(value || 0)}${suffix}`;

const MinhasDietas = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [isTrainingDay, setIsTrainingDay] = useState(false);
  const [substitutions, setSubstitutions] = useState<Record<string, any[]>>({});
  const { tracking, addWater, removeWater, toggleMeal, waterCurrentMl, waterTargetMl, waterGoalGlasses } = useDailyTracking({ isTrainingDay });

  const subsStorageKey = user ? `diet-subs-${user.id}` : '';

  // Load persisted substitutions
  useEffect(() => {
    if (!subsStorageKey) return;
    try {
      const raw = localStorage.getItem(subsStorageKey);
      if (raw) setSubstitutions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [subsStorageKey]);

  // Detecta se hoje é dia de treino agendado
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('ai_plans')
        .select('conteudo')
        .eq('student_id', user.id)
        .eq('tipo', 'treino')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const days = parseTrainingSections(data.conteudo).flatMap(s => s.days ?? []);
      if (days.length === 0) return;
      const jsDay = new Date().getDay();
      const todayNames = jsDay === 0 ? ['domingo'] : jsDay === 1 ? ['segunda'] : jsDay === 2 ? ['terca', 'terça'] : jsDay === 3 ? ['quarta'] : jsDay === 4 ? ['quinta'] : jsDay === 5 ? ['sexta'] : ['sabado', 'sábado'];
      setIsTrainingDay(days.some(d => todayNames.some(n => d.day.toLowerCase().includes(n))));
    })();
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDiet();
    }
  }, [user]);

  // Realtime: re-fetch when admin edits diet plans
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('minhas-dietas-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_plans',
          filter: `student_id=eq.${user.id}`,
        },
        () => {
          loadDiet();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    setLoading(false);
  };

  const mealGroups = useMemo(() => {
    const mealSections = sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0);
    return mealSections.map((s, i) => ({
      label: s.title?.trim() || '',
      meals: s.meals!,
    }));
  }, [sections]);

  const usesMealOptions = useMemo(
    () => mealGroups.length > 1 && mealGroups.some((group) => OPTION_TITLE_REGEX.test(group.label)),
    [mealGroups],
  );

  // When day-based (not options), always show 7 weekday buttons with independent meal copies
  const displayGroups = useMemo(() => {
    const base = (usesMealOptions || mealGroups.length === 0)
      ? mealGroups
      : WEEKDAY_LABELS.map((label, i) => ({
          label,
          meals: mealGroups[i % mealGroups.length].meals.map(m => ({
            ...m,
            foods: m.foods.map(f => ({ ...f })),
          })),
        }));
    // Apply persisted substitutions
    return base.map((group, gi) => ({
      ...group,
      meals: group.meals.map((m, mi) => {
        const saved = substitutions[`${gi}-${mi}`];
        return saved ? { ...m, foods: saved } : m;
      }),
    }));
  }, [mealGroups, usesMealOptions, substitutions]);

  const persistFoodsChange = useCallback((groupIdx: number, mealIdx: number, foods: any[]) => {
    setSubstitutions((prev) => {
      const next = { ...prev, [`${groupIdx}-${mealIdx}`]: foods };
      try { localStorage.setItem(subsStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [subsStorageKey]);

  const defaultGroupIndex = useMemo(() => {
    if (displayGroups.length === 0) return 0;
    if (usesMealOptions) return 0;
    return (new Date().getDay() + 6) % 7; // Mon=0 .. Sun=6
  }, [displayGroups.length, usesMealOptions]);

  useEffect(() => {
    setSelectedGroupIndex(defaultGroupIndex);
  }, [defaultGroupIndex]);

  const allMeals = useMemo(() =>
    sections.filter(s => s.type === 'meal' && s.meals).flatMap(s => s.meals!),
    [sections]
  );

  const hasMultipleGroups = displayGroups.length > 1;
  const activeGroupIndex = displayGroups[selectedGroupIndex] ? selectedGroupIndex : defaultGroupIndex;
  const currentMeals = displayGroups.length > 0 ? (displayGroups[activeGroupIndex]?.meals ?? []) : allMeals;

  const totalKcal = currentMeals.reduce((s, m) => s + parseNum(m.totalKcal), 0);
  const totalP = currentMeals.reduce((s, m) => s + parseNum(m.totalP), 0);
  const totalC = currentMeals.reduce((s, m) => s + parseNum(m.totalC), 0);
  const totalG = currentMeals.reduce((s, m) => s + parseNum(m.totalG), 0);
  const targets = useMemo(() => extractTargetsFromSections(sections), [sections]);
  const displaySummary = usesMealOptions || !targets
    ? { calories: totalKcal, protein: totalP, carbs: totalC, fats: totalG }
    : targets;
  const summaryTitle = usesMealOptions
    ? 'Totais da opção selecionada'
    : targets
      ? 'Metas do dia'
      : 'Totais do dia';

  const waterMl = waterCurrentMl;
  const waterGoalMl = waterTargetMl;
  const waterProgress = waterTargetMl > 0 ? (waterCurrentMl / waterTargetMl) * 100 : 0;

  if (loading) {
    return (
      <AppLayout title="Plano Alimentar">
        <div className="space-y-4">
          <Skeleton className="h-8 w-16 rounded-md" />
          <div className="rounded-xl border border-border/50 p-3 space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          </div>
          <Skeleton className="h-20 rounded-xl" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AppLayout>
    );
  }

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

        {/* Option/day selector */}
        {hasMultipleGroups && (
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide justify-center" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {displayGroups.map((group, i) => {
              const label = usesMealOptions
                ? (group.label || `Opção ${i + 1}`)
                : group.label;
              const isActive = activeGroupIndex === i;
              return (
                <button
                  key={`${label}-${i}`}
                  type="button"
                  onClick={() => setSelectedGroupIndex(i)}
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

        {/* Daily summary - TOP */}
        {displaySummary && (
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">{summaryTitle}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-primary">{formatValue(displaySummary.calories, ' kcal')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Calorias</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-2">{formatValue(displaySummary.protein, 'g')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Proteína</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-3">{formatValue(displaySummary.carbs, 'g')}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbo</p>
              </div>
              <div className="rounded-lg bg-background/70 p-2 text-center">
                <p className="text-sm font-bold text-chart-5">{formatValue(displaySummary.fats, 'g')}</p>
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
                onClick={removeWater}
                className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={addWater}
                className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <Progress value={waterProgress} className="h-2 bg-background/70" />
          <div className="flex gap-1">
            {Array.from({ length: waterGoalGlasses }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${i < tracking.water_glasses ? 'bg-chart-2' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>

        {/* Meals */}
        {currentMeals.length > 0 && (
          <div className="space-y-3">
            {currentMeals.map((meal, i) => {
              const done = tracking.meals_completed.includes(i);
              return (
                <div key={`day-${activeGroupIndex}-${meal.name}-${meal.time || 'sem-hora'}-${i}`}>
                  <MealCard
                    meal={meal}
                    index={i}
                    onCopy={() => null}
                    isCompleted={done}
                    onToggleComplete={() => toggleMeal(i)}
                    hideSubstitutions
                    onFoodsChange={(foods) => persistFoodsChange(activeGroupIndex, i, foods)}
                  />
                </div>
              );
            })}
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
