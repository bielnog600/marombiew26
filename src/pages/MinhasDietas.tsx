import React, { useEffect, useState, useMemo, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UtensilsCrossed, Droplets, Plus, Minus, Target, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseSections, type ParsedSection } from '@/lib/dietResultParser';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import { extractTargetsFromSections } from '@/lib/dietTargets';
import MealCard from '@/components/diet/MealCard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchWithCache } from '@/lib/offlineCache';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProtocolsDialog from '@/components/diet/ProtocolsDialog';
import { protocolsToKeys, type SavedProtocols, type ProtocolKey } from '@/lib/dietProtocols';
import { ListChecks } from 'lucide-react';
import { buildCarbCycleDays } from '@/lib/dietAiActions';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const OPTION_TITLE_REGEX = /(op[cç][aã]o|card[aá]pio)/i;

/**
 * Recover a previously-applied carb cycle saved in the diet markdown notes
 * (format: "🔄 Ciclo de Carboidratos" + "Low Carb: ..." / "High Carb: ...").
 */
const extractCarbCycleFromMarkdown = (
  markdown: string,
): { lowCarbDays: string[]; highCarbDays: string[] } | undefined => {
  if (!markdown) return undefined;
  if (!markdown.toLowerCase().includes('ciclo de carbo')) return undefined;
  const parseDays = (label: 'low carb' | 'high carb'): string[] => {
    const re = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i');
    const m = markdown.match(re);
    if (!m) return [];
    return m[1]
      .split(/[,;/]/)
      .map((s) => s.trim().toLowerCase().replace(/\(.*$/, '').trim())
      .filter(Boolean)
      .map((s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  };
  const low = parseDays('low carb');
  const high = parseDays('high carb');
  if (low.length === 0 && high.length === 0) return undefined;
  return { lowCarbDays: low, highCarbDays: high };
};

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const formatValue = (value: number, suffix = '') => `${Math.round(value || 0)}${suffix}`;

const cleanMarkdownContent = (raw: string) =>
  raw
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\r/g, '')
    .trim();

const extractLooseMarkdownTable = (raw: string): { headers: string[]; rows: string[][] } | null => {
  const cleaned = cleanMarkdownContent(raw);
  const separatorMatch = cleaned.match(/\|(?:\s*:?-{3,}:?\s*\|){2,}/);

  if (!separatorMatch || separatorMatch.index === undefined) return null;

  const columnCount = (separatorMatch[0].match(/\|/g)?.length ?? 0) - 1;
  if (columnCount < 2) return null;

  const splitCells = (value: string) =>
    value
      .split('|')
      .map((cell) => cell.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

  const beforeSeparator = cleaned.slice(0, separatorMatch.index).trim();
  const afterSeparator = cleaned.slice(separatorMatch.index + separatorMatch[0].length).trim();
  const headers = splitCells(beforeSeparator).slice(-columnCount);
  const cells = splitCells(afterSeparator);
  const rows: string[][] = [];

  for (let index = 0; index < cells.length; index += columnCount) {
    const row = cells.slice(index, index + columnCount);
    if (row.length === columnCount) rows.push(row);
  }

  return headers.length === columnCount && rows.length > 0 ? { headers, rows } : null;
};

const MinhasDietas = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [isTrainingDay, setIsTrainingDay] = useState(false);
  const [substitutions, setSubstitutions] = useState<Record<string, any[]>>({});
  const [planVersion, setPlanVersion] = useState<string | null>(null);
  const [dietMarkdown, setDietMarkdown] = useState<string>('');
  const [protocolKeys, setProtocolKeys] = useState<ProtocolKey[]>([]);
  const [showProtocols, setShowProtocols] = useState(false);
  const { tracking, addWater, removeWater, toggleMeal, waterCurrentMl, waterTargetMl, waterGoalGlasses } = useDailyTracking({ isTrainingDay });

  // Key local substitutions per plan version so admin edits invalidate stale subs
  const subsStorageKey = user && planVersion ? `diet-subs-${user.id}-${planVersion}` : '';

  // Load persisted substitutions
  useEffect(() => {
    if (!subsStorageKey) return;
    try {
      const raw = localStorage.getItem(subsStorageKey);
      setSubstitutions(raw ? JSON.parse(raw) : {});
      // Cleanup old subs from previous plan versions for this user
      if (user) {
        const prefix = `diet-subs-${user.id}-`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix) && k !== subsStorageKey) {
            localStorage.removeItem(k);
          }
        }
        // Also remove legacy key without version
        localStorage.removeItem(`diet-subs-${user.id}`);
      }
    } catch { /* ignore */ }
  }, [subsStorageKey]);

  // Detecta se hoje é dia de treino agendado
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await fetchWithCache(`plan:treino:${user.id}`, async () => {
        const { data } = await supabase.from('ai_plans').select('conteudo').eq('student_id', user.id).eq('tipo', 'treino').order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data;
      });
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
    const { data: dieta } = await fetchWithCache(`plan:dieta:full:${user!.id}`, async () => {
      const { data } = await supabase.from('ai_plans').select('id, conteudo, created_at, protocols').eq('student_id', user!.id).eq('tipo', 'dieta').order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data;
    });
    if (dieta) {
      setSections(parseSections(dieta.conteudo));
      setDietMarkdown(dieta.conteudo);
      const saved = (dieta as any).protocols as SavedProtocols | null | undefined;
      setProtocolKeys(protocolsToKeys(saved));
      // Version key combines plan id + created_at so any admin edit (which
      // bumps created_at via re-insert OR keeps it via update) is detected.
      // We hash the content length as a tiebreaker for in-place updates.
      setPlanVersion(`${dieta.id}-${dieta.conteudo.length}`);
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
    let base: { label: string; meals: any[] }[];
    if (usesMealOptions || mealGroups.length === 0) {
      base = mealGroups;
    } else if (mealGroups.length === 1) {
      // Single meal block → expand to 7 weekdays. If a carb cycle is saved in
      // the markdown notes, re-apply it so each day shows its real carbs.
      const cc = extractCarbCycleFromMarkdown(dietMarkdown);
      const baseMeals = mealGroups[0].meals;
      if (cc) {
        const cycled = buildCarbCycleDays(baseMeals as any, cc);
        base = WEEKDAY_LABELS.map((label, i) => ({
          label: cycled[i]?.label?.includes('(') ? `${label} ${cycled[i].label.replace(/^[^(]+/, '').trim()}` : label,
          meals: (cycled[i]?.meals ?? baseMeals).map(m => ({
            ...m,
            foods: m.foods.map(f => ({ ...f })),
          })),
        }));
      } else {
        base = WEEKDAY_LABELS.map((label) => ({
          label,
          meals: baseMeals.map(m => ({
            ...m,
            foods: m.foods.map(f => ({ ...f })),
          })),
        }));
      }
    } else {
      // Multiple meal sections already (e.g. per-day from carb cycle save).
      base = WEEKDAY_LABELS.map((label, i) => {
        const src = mealGroups[i % mealGroups.length];
        const srcLabel = (src.label || '').trim();
        const tag = srcLabel.match(/\(([^)]+)\)/);
        return {
          label: tag ? `${label} (${tag[1]})` : label,
          meals: src.meals.map(m => ({
            ...m,
            foods: m.foods.map(f => ({ ...f })),
          })),
        };
      });
    }
    // Apply persisted substitutions
    return base.map((group, gi) => ({
      ...group,
      meals: group.meals.map((m, mi) => {
        const saved = substitutions[`${gi}-${mi}`];
        return saved ? { ...m, foods: saved } : m;
      }),
    }));
  }, [mealGroups, usesMealOptions, substitutions, dietMarkdown]);

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

  // Extra sections to show to the student (suplementação, fitoterapia,
  // ajustes do protocolo, dicas, emagrecimento rápido, etc.).
  // We skip pure meal tables (already rendered), WhatsApp messages
  // (admin-only) and any theoretical/calculation content like TMB, GET,
  // Harris Benedict, distribuição de macros, fórmulas, justificativas etc.
  // The student should only see PRACTICAL items: nomes de suplementos,
  // fitoterápicos, e os ajustes ativados pelo admin (carb cycling,
  // refeed, diet break, sódio, água, mudança de refeições, platô...).


  const hasMultipleGroups = displayGroups.length > 1;
  const activeGroupIndex = displayGroups[selectedGroupIndex] ? selectedGroupIndex : defaultGroupIndex;
  const currentMeals = displayGroups.length > 0 ? (displayGroups[activeGroupIndex]?.meals ?? []) : allMeals;

  // Sum directly from foods so totals reflect any carb-cycle scaling or
  // student substitutions instead of the cached meal totals from the parser.
  const sumFoods = (key: 'kcal' | 'p' | 'c' | 'g') =>
    currentMeals.reduce((s, m) => s + (m.foods?.reduce((fs: number, f: any) => fs + parseNum(f[key]), 0) ?? 0), 0);
  const totalKcal = sumFoods('kcal');
  const totalP = sumFoods('p');
  const totalC = sumFoods('c');
  const totalG = sumFoods('g');
  // Always show the REAL sum of foods on the table — never the theoretical
  // "calorias alvo" written by the AI in the preamble, because the two often
  // diverge (ex: meta 1455 kcal mas alimentos somam 1830 kcal). The student
  // must see what they will actually eat, matching what the admin sees.
  const displaySummary = { calories: totalKcal, protein: totalP, carbs: totalC, fats: totalG };
  const summaryTitle = usesMealOptions ? 'Totais da opção selecionada' : 'Totais do dia';

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
        {/* Back + Protocolos */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2"
            onClick={() => navigate('/minha-area')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          {protocolKeys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => setShowProtocols(true)}
            >
              <ListChecks className="h-4 w-4" />
              Protocolos
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {protocolKeys.length}
              </span>
            </Button>
          )}
        </div>

        {/* Option/day selector */}
        {hasMultipleGroups && (
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide justify-center" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {displayGroups.map((group, i) => {
              const rawLabel = usesMealOptions
                ? (group.label || `Opção ${i + 1}`)
                : group.label;
              const tagMatch = rawLabel.match(/\(([^)]+)\)$/);
              const dayName = tagMatch ? rawLabel.replace(/\s*\([^)]+\)$/, '') : rawLabel;
              const tag = tagMatch ? tagMatch[1] : '';
              const isActive = activeGroupIndex === i;
              return (
                <button
                  key={`${rawLabel}-${i}`}
                  type="button"
                  onClick={() => setSelectedGroupIndex(i)}
                  className={`flex-shrink-0 flex flex-col items-center justify-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span>{dayName}</span>
                  {tag && (
                    <span className={`text-[10px] leading-none mt-0.5 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/80'}`}>
                      {tag}
                    </span>
                  )}
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

      <ProtocolsDialog
        open={showProtocols}
        onOpenChange={setShowProtocols}
        keys={protocolKeys}
        markdown={dietMarkdown}
      />
    </AppLayout>
  );
};

export default MinhasDietas;
