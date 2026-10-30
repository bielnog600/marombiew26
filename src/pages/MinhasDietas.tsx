import { getWeekRange, summarizeDietWeek } from '@/lib/localTrackingWeek';
import { resolveStudentDayTarget } from '@/lib/studentDietDayTarget';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/i18n';
import { translatePlanMarkdown } from '@/lib/planTranslation';
import { UtensilsCrossed } from 'lucide-react';
import { parseSections, type ParsedSection } from '@/lib/dietResultParser';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import StudentMealCard from '@/components/diet/StudentMealCard';
import DailyCaloriesCard from '@/components/diet/DailyCaloriesCard';
import HydrationCard from '@/components/diet/HydrationCard';
import {
  rebalanceFutureMeals,
  sumMealMacros,
  type Macros,
} from '@/lib/dailyDietRebalance';

import { Button } from '@/components/ui/button';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { fetchWithCache } from '@/lib/offlineCache';
import ProtocolsDialog from '@/components/diet/ProtocolsDialog';
import { protocolsToKeys, type SavedProtocols, type ProtocolKey } from '@/lib/dietProtocols';
import { ListChecks, ScanBarcode } from 'lucide-react';
import FoodScanner from '@/components/diet/FoodScanner';
import { buildCarbCycleDays } from '@/lib/dietAiActions';
import { parseDietPlanLoose } from '@/lib/dietSchema';
import {
  buildStructuredDisplayGroups,
  isStructuredPublishedDiet,
  type StudentStructuredDay,
} from '@/lib/studentStructuredDiet';
import { adjustStudentPortions, type PortionAdjustResult } from '@/lib/studentPortionAdjust';
import {
  formatSignedKcalDiff,
  mealCompletionExcess,
  rebalanceSingleMeal,
  recomputeMealTotals,
  type CompletionExcess,
  type SingleMealRebalance,
} from '@/lib/studentMealGuard';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
const WEEKDAY_KEYS_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const OPTION_TITLE_REGEX = /(op[cç][aã]o|card[aá]pio)/i;
// HOTFIX ALUNO — nova versão de schema invalida o cache antigo (sem conteudo_json).
const DIET_DISPLAY_SCHEMA_VERSION = 'structured-v1';

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
  const { language } = useLanguage();
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedWeekday, setSelectedWeekday] = useState(() => (new Date().getDay() + 6) % 7);
  // Índices dos dias (0=seg..6=dom) em que o aluno tem treino agendado.
  const [trainingDayIndices, setTrainingDayIndices] = useState<number[]>([]);
  const [substitutions, setSubstitutions] = useState<Record<string, any[]>>({});
  /** Última refeição editada pelo aluno em cada dia (estado CURRENT). */
  const [editedMealByGroup, setEditedMealByGroup] = useState<Record<number, number>>({});

  const [planVersion, setPlanVersion] = useState<string | null>(null);
  const [dietMarkdown, setDietMarkdown] = useState<string>('');
  const [protocolKeys, setProtocolKeys] = useState<ProtocolKey[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<any | null>(null);
  const [showProtocols, setShowProtocols] = useState(false);
  // HOTFIX ALUNO — dieta structured publicada (fonte de verdade do cardápio).
  const [structuredPlan, setStructuredPlan] = useState<any | null>(null);
  const [publishedTargets, setPublishedTargets] = useState<Partial<Macros> | null>(null);
  const [structuredProtocols, setStructuredProtocols] = useState<any | null>(null);
  // Alterações do aluno persistidas no banco (visíveis ao treinador).
  const [planId, setPlanId] = useState<string | null>(null);
  const remoteGroupsRef = React.useRef<Record<string, any>>({});
  const dirtyRef = React.useRef(false);
  const [overrideTick, setOverrideTick] = useState(0);

  // Key local substitutions per plan version so admin edits invalidate stale subs
  const subsStorageKey = user && planVersion ? `diet-subs-${user.id}-${planVersion}` : '';

  // Load persisted substitutions
  useEffect(() => {
    if (!subsStorageKey) return;
    try {
      const raw = localStorage.getItem(subsStorageKey);
      setSubstitutions(raw ? JSON.parse(raw) : {});
      const rawMeta = localStorage.getItem(`${subsStorageKey}-meta`);
      setEditedMealByGroup(rawMeta ? JSON.parse(rawMeta) : {});

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

  // Fonte de verdade: alterações salvas no banco (sobrepõem o cache local).
  useEffect(() => {
    if (!planId || !subsStorageKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('student_diet_overrides')
        .select('substitutions, edited_meta, groups')
        .eq('plan_id', planId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const subs = (data.substitutions as any) ?? {};
        const { __action: _ignored, ...meta } = ((data.edited_meta as any) ?? {}) as Record<string, any>;
        remoteGroupsRef.current = (data.groups as any) ?? {};
        setSubstitutions(subs);
        setEditedMealByGroup(meta);
        try {
          localStorage.setItem(subsStorageKey, JSON.stringify(subs));
          localStorage.setItem(`${subsStorageKey}-meta`, JSON.stringify(meta));
        } catch { /* ignore */ }
      } else if (Object.keys(substitutions).length > 0) {
        // Alterações antigas só locais: envia ao banco na próxima sincronização.
        dirtyRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, subsStorageKey, overrideTick]);

  useEffect(() => {
    if (!planId) return;
    const channel = supabase
      .channel(`diet-override-${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_diet_overrides', filter: `plan_id=eq.${planId}` },
        (payload: any) => {
          if (payload?.new?.updated_by_role === 'treinador') setOverrideTick((t) => t + 1);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [planId]);

  // Detecta os dias da semana em que o aluno tem treino agendado
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
      // Mon=0 .. Sun=6 (alinhado com WEEKDAY_KEYS)
      const namesByIndex: string[][] = [
        ['segunda'],
        ['terca', 'terça'],
        ['quarta'],
        ['quinta'],
        ['sexta'],
        ['sabado', 'sábado'],
        ['domingo'],
      ];
      const indices: number[] = [];
      namesByIndex.forEach((names, idx) => {
        if (days.some(d => names.some(n => d.day.toLowerCase().includes(n)))) indices.push(idx);
      });
      setTrainingDayIndices(indices);
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
    // Chave de cache versionada: o cache antigo não continha conteudo_json.
    const { data: dieta } = await fetchWithCache(
      `plan:dieta:full:${DIET_DISPLAY_SCHEMA_VERSION}:${user!.id}`,
      async () => {
        const { data } = await supabase
          .from('ai_plans')
          .select('id, titulo, conteudo, conteudo_json, protocols, version, content_revision, created_at, published_at, is_draft')
          .eq('student_id', user!.id)
          .eq('tipo', 'dieta')
          .eq('is_draft', false)
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return data;
      },
    );
    if (dieta) {
      const conteudo = await translatePlanMarkdown(dieta.conteudo, language);
      setSections(parseSections(conteudo));
      setDietMarkdown(conteudo);
      const saved = (dieta as any).protocols as SavedProtocols | null | undefined;
      setProtocolKeys(protocolsToKeys(saved));
      setWeeklySchedule((saved as any)?.weekly_energy_schedule ?? null);
      // HOTFIX ALUNO — structured publicada: o cardápio vem de conteudo_json.
      const canonical = parseDietPlanLoose((dieta as any).conteudo_json);
      const rawTargets = (dieta as any).conteudo_json?.targets ?? (canonical as any)?.targets ?? null;
      setPublishedTargets(rawTargets && Number(rawTargets.kcal) > 0 ? rawTargets : null);
      const structured = isStructuredPublishedDiet(canonical, (dieta as any).is_draft);
      setStructuredPlan(structured ? canonical : null);
      setStructuredProtocols(structured ? saved ?? null : null);
      setPlanId(dieta.id);
      // Version key combines plan id + created_at so any admin edit (which
      // bumps created_at via re-insert OR keeps it via update) is detected.
      // We hash the content length as a tiebreaker for in-place updates.
      setPlanVersion(
        `${dieta.id}-${(dieta as any).content_revision ?? 0}-${dieta.conteudo.length}-${DIET_DISPLAY_SCHEMA_VERSION}`,
      );
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

  // HOTFIX ALUNO — grupos vindos diretamente da dieta structured publicada.
  const structuredGroups = useMemo<StudentStructuredDay[]>(
    () => (structuredPlan ? buildStructuredDisplayGroups(structuredPlan, structuredProtocols) : []),
    [structuredPlan, structuredProtocols],
  );
  const isStructuredDiet = structuredGroups.length > 0;

  const usesMealOptions = useMemo(
    () =>
      !isStructuredDiet &&
      mealGroups.length > 1 &&
      mealGroups.some((group) => OPTION_TITLE_REGEX.test(group.label)),
    [mealGroups, isStructuredDiet],
  );

  // When day-based (not options), always show 7 weekday buttons with independent meal copies
  const displayGroups = useMemo(() => {
    // Structured publicada: um grupo por weekday, exatamente como publicado.
    if (structuredGroups.length > 0) {
      return structuredGroups.map((g) => ({
        label: g.tag ? `${g.label} (${g.tag})` : g.label,
        meals: g.meals,
      }));
    }
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
    // NOTE: student edits are NOT applied here. This stays the PRESCRIBED
    // plan (fonte da meta diária imutável). Edits are overlaid later, after
    // the per-day scaling, so the professor's target never changes.
    return base;
  }, [mealGroups, usesMealOptions, dietMarkdown, structuredGroups]);

  const persistFoodsChange = useCallback((groupIdx: number, mealIdx: number, foods: any[]) => {
    dirtyRef.current = true;
    setSubstitutions((prev) => {
      const next = { ...prev, [`${groupIdx}-${mealIdx}`]: foods };
      try { localStorage.setItem(subsStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setEditedMealByGroup((prev) => {
      const next = { ...prev, [groupIdx]: mealIdx };
      try { localStorage.setItem(`${subsStorageKey}-meta`, JSON.stringify(next)); } catch { /* ignore */ }
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
  const activeGroupIndex = usesMealOptions
    ? (displayGroups[selectedGroupIndex] ? selectedGroupIndex : defaultGroupIndex)
    : selectedWeekday;
  const baseMealsForDay = displayGroups.length > 0 ? (displayGroups[activeGroupIndex]?.meals ?? []) : allMeals;

  // A meta de água segue o dia selecionado: se o aluno tem treino nesse
  // dia, o alvo sobe (fórmula em useDailyTracking). Sem treino, usa a
  // meta base. Se ainda não temos treino carregado, cai no dia real.
  const isSelectedDayTraining = trainingDayIndices.includes(selectedWeekday);
  const [showScanner, setShowScanner] = useState(false);
  const selectedDate = getWeekRange().dates[selectedWeekday];
  const { tracking, weeklyTracking, weekDates, today: trackingToday, loading: trackingLoading,
    ensureCanRegister, addWaterMl, removeWater, toggleMeal, waterCurrentMl, waterTargetMl } = useDailyTracking({
      isTrainingDay: isSelectedDayTraining, date: selectedDate,
    });
  const trackingDayIndex = usesMealOptions ? selectedWeekday : activeGroupIndex;
  useEffect(() => {
    setSelectedWeekday((new Date().getDay() + 6) % 7);
    setMealRebalance(null);
    setCompletionWarning(null);
  }, [trackingToday]);
  useEffect(() => { setMealRebalance(null); setCompletionWarning(null); setPortionPreview(null); }, [selectedDate]);

  // Per-day target / adjustment from protocols.weekly_energy_schedule.
  // When present, the student sees the actual daily meta (not the flat sum
  // of the base meal block).
  const daySchedule = useMemo(() => {
    // Structured publicada: a meta teórica vem de weekly_day_targets e NUNCA
    // é usada para escalar o cardápio.
    if (isStructuredDiet) {
      const g = structuredGroups[activeGroupIndex];
      return g?.target ? { target: Math.round(g.target.kcal), adjustment: 0, instructions: null } : null;
    }
    if (!weeklySchedule || usesMealOptions) return null;
    const key = WEEKDAY_KEYS[activeGroupIndex];
    const keyEn = WEEKDAY_KEYS_EN[activeGroupIndex];
    if (!key) return null;
    const d = weeklySchedule?.days?.[key] ?? weeklySchedule?.days?.[keyEn] ?? null;
    const base = Number(weeklySchedule?.base_daily_kcal) || 0;
    let target: number | null = null;
    if (d && typeof d.target_kcal === 'number' && d.target_kcal > 0) target = Math.round(d.target_kcal);
    else if (d && typeof d.fixed_kcal === 'number' && d.fixed_kcal > 0) target = Math.round(d.fixed_kcal);
    else if (base > 0) target = Math.round(base + (Number(d?.adjustment_kcal) || 0));
    const adjustment = Number(d?.adjustment_kcal) || 0;
    const generated = weeklySchedule?.generated_adjustments;
    let dayInstructions: any = null;
    if (Array.isArray(generated?.instructions)) {
      dayInstructions = generated.instructions.find(
        (it: any) => it?.day_key === key || it?.day === key || it?.day_key === keyEn || it?.day === keyEn,
      ) ?? null;
    } else if (generated && typeof generated === 'object') {
      dayInstructions = generated[key] ?? generated[keyEn] ?? null;
    }
    return { target, adjustment, instructions: dayInstructions };
  }, [weeklySchedule, activeGroupIndex, usesMealOptions, isStructuredDiet, structuredGroups]);

  // Porções exatamente como o treinador salvou: NUNCA escalar para bater meta
  // (a escala por weekly_energy_schedule usava GET × estratégia e inflava porções).
  const prescribedMeals = baseMealsForDay;

  // META PRESCRITA PELO PROFESSOR — imutável para o aluno.
  // Fonte: meta do dia publicada (structured) ou conteudo_json.targets.
  const dailyTarget = useMemo<Macros>(() => {
    const dayTarget = isStructuredDiet ? (structuredGroups[activeGroupIndex] as any)?.target ?? null : null;
    return resolveStudentDayTarget({
      dayTarget,
      publishedTargets: publishedTargets,
      mealsTotal: sumMealMacros(prescribedMeals as any),
    });
  }, [prescribedMeals, isStructuredDiet, structuredGroups, activeGroupIndex, publishedTargets]);

  // Refeições já concluídas (registro real de consumo do dia).
  const completedIndexes = useMemo(
    () =>
      prescribedMeals
        .map((_, i) => i)
        .filter((i) => tracking.meals_completed.includes(trackingDayIndex * 1000 + i)),
    [prescribedMeals, tracking.meals_completed, trackingDayIndex],
  );

  // Overlay das edições do aluno sobre o plano prescrito.
  const studentMeals = useMemo(
    () =>
      prescribedMeals.map((m, mi) => {
        const saved = substitutions[`${activeGroupIndex}-${mi}`];
        return saved ? { ...m, foods: saved } : m;
      }),
    [prescribedMeals, substitutions, activeGroupIndex],
  );

  // Rebalanceamento determinístico: apenas refeições FUTURAS absorvem a
  // diferença; concluídas e a refeição editada permanecem congeladas.
  const rebalance = useMemo(
    () =>
      rebalanceFutureMeals({
        meals: studentMeals as any,
        completedIndexes,
        currentIndex: editedMealByGroup[activeGroupIndex] ?? -1,
        dailyTarget,
      }),
    [studentMeals, completedIndexes, editedMealByGroup, activeGroupIndex, dailyTarget],
  );

  const hasStudentEdits = useMemo(
    () => prescribedMeals.some((_, mi) => Boolean(substitutions[`${activeGroupIndex}-${mi}`])),
    [prescribedMeals, substitutions, activeGroupIndex],
  );

  const currentMeals = hasStudentEdits ? rebalance.meals : prescribedMeals;

  const resetDayEdits = useCallback(() => {
    dirtyRef.current = true;
    setSubstitutions((prev) => {
      const next = { ...prev };
      prescribedMeals.forEach((_, mi) => { delete next[`${activeGroupIndex}-${mi}`]; });
      try { localStorage.setItem(subsStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setEditedMealByGroup((prev) => {
      const next = { ...prev };
      delete next[activeGroupIndex];
      try { localStorage.setItem(`${subsStorageKey}-meta`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [prescribedMeals, activeGroupIndex, subsStorageKey]);

  // Sincroniza com o banco (debounce) o estado do dia ativo para o treinador.
  useEffect(() => {
    if (!dirtyRef.current || !planId || !user) return;
    const handle = setTimeout(async () => {
      dirtyRef.current = false;
      const groups = { ...remoteGroupsRef.current };
      const key = String(activeGroupIndex);
      if (hasStudentEdits) {
        groups[key] = {
          label: displayGroups[activeGroupIndex]?.label ?? '',
          prescribed: prescribedMeals,
          // Totais por refeição sempre recalculados a partir dos alimentos.
          student: currentMeals.map((m: any) => recomputeMealTotals(m)),
        };
      } else {
        delete groups[key];
      }
      remoteGroupsRef.current = groups;
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      await supabase.from('student_diet_overrides').upsert(
        {
          plan_id: planId,
          student_id: user.id,
          substitutions: substitutions as any,
          edited_meta: (action ? { ...editedMealByGroup, __action: action } : editedMealByGroup) as any,
          groups: groups as any,
        },
        { onConflict: 'plan_id' },
      );
    }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [substitutions, editedMealByGroup]);

  // ── Ajustar Dieta: mantém os alimentos do aluno e só recalcula porções ──
  const pendingActionRef = React.useRef<string | null>(null);
  const [portionPreview, setPortionPreview] = useState<PortionAdjustResult | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    group: number;
    subs: Record<string, any[]>;
    meta: Record<number, number>;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { setUndoSnapshot(null); }, [activeGroupIndex]);

  const openPortionPreview = useCallback(() => {
    setPortionPreview(
      adjustStudentPortions({ meals: currentMeals as any, lockedMealIndexes: completedIndexes, target: dailyTarget }),
    );
  }, [currentMeals, completedIndexes, dailyTarget]);

  const writeSubs = useCallback((subs: Record<string, any[]>, meta: Record<number, number>) => {
    dirtyRef.current = true;
    setSubstitutions(subs);
    setEditedMealByGroup(meta);
    try {
      localStorage.setItem(subsStorageKey, JSON.stringify(subs));
      localStorage.setItem(`${subsStorageKey}-meta`, JSON.stringify(meta));
    } catch { /* ignore */ }
  }, [subsStorageKey]);

  const applyPortionAdjust = useCallback(() => {
    if (!portionPreview) return;
    setUndoSnapshot({ group: activeGroupIndex, subs: substitutions, meta: editedMealByGroup });
    const nextSubs = { ...substitutions };
    portionPreview.meals.forEach((m, mi) => {
      if (completedIndexes.includes(mi)) return;
      nextSubs[`${activeGroupIndex}-${mi}`] = m.foods;
    });
    // Nenhuma refeição "congelada": o ajuste já fechou o dia.
    const nextMeta = { ...editedMealByGroup, [activeGroupIndex]: -1 };
    pendingActionRef.current = 'aluno_ajustou_porcoes';
    writeSubs(nextSubs, nextMeta);
    setPortionPreview(null);
  }, [portionPreview, activeGroupIndex, substitutions, editedMealByGroup, completedIndexes, writeSubs]);

  const undoPortionAdjust = useCallback(() => {
    if (!undoSnapshot) return;
    pendingActionRef.current = 'aluno_desfez_ajuste';
    writeSubs(undoSnapshot.subs, undoSnapshot.meta);
    setUndoSnapshot(null);
  }, [undoSnapshot, writeSubs]);

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
  void totalP; void totalC; void totalG;

  // ── Guarda da meta: refeição editada sem futuras + aviso ao registrar ──
  const [mealRebalance, setMealRebalance] = useState<{
    mealIndex: number;
    result: SingleMealRebalance;
    dayBeforeKcal: number;
    registerAfter: boolean;
  } | null>(null);
  const [completionWarning, setCompletionWarning] = useState<(CompletionExcess & { mealIndex: number }) | null>(null);

  const buildMealRebalance = useCallback(
    (mealIndex: number, foods: any[], meals: any[], countedIndexes: number[]) => {
      const others = meals.filter((_, i) => i !== mealIndex && countedIndexes.includes(i));
      const otherTotal = sumMealMacros(others as any);
      const result = rebalanceSingleMeal({
        foods,
        prescribedFoods: (prescribedMeals[mealIndex]?.foods ?? []) as any,
        otherTotal,
        dailyTarget,
      });
      const dayBeforeKcal = otherTotal.kcal + foods.reduce((s: number, f: any) => s + parseNum(f.kcal), 0);
      return { result, dayBeforeKcal };
    },
    [prescribedMeals, dailyTarget],
  );

  const handleFoodsChange = useCallback(
    (mealIndex: number, foods: any[]) => {
      persistFoodsChange(activeGroupIndex, mealIndex, foods);
      if (completedIndexes.includes(mealIndex) || dailyTarget.kcal <= 0) return;
      const hasFutureOpen = currentMeals.some((_, i) => i > mealIndex && !completedIndexes.includes(i));
      if (hasFutureOpen) return;
      // Sem refeição futura para absorver: a própria refeição fecha a meta do dia.
      const counted = currentMeals.map((_, i) => i);
      const { result, dayBeforeKcal } = buildMealRebalance(mealIndex, foods, currentMeals, counted);
      if (Math.abs(dayBeforeKcal - dailyTarget.kcal) <= 50) return;
      setMealRebalance({ mealIndex, result, dayBeforeKcal, registerAfter: false });
    },
    [persistFoodsChange, activeGroupIndex, completedIndexes, currentMeals, dailyTarget, buildMealRebalance],
  );

  const applyMealRebalance = useCallback(() => {
    if (!mealRebalance?.result.ok) return;
    const { mealIndex, result, registerAfter } = mealRebalance;
    pendingActionRef.current = 'aluno_ajustou_refeicao_meta';
    persistFoodsChange(activeGroupIndex, mealIndex, result.foods);
    if (registerAfter) toggleMeal(trackingDayIndex * 1000 + mealIndex);
    setMealRebalance(null);
  }, [mealRebalance, persistFoodsChange, activeGroupIndex, trackingDayIndex, toggleMeal]);

  const handleToggleMeal = useCallback(
    (mealIndex: number) => {
      if (!ensureCanRegister() || trackingLoading) return;
      const key = trackingDayIndex * 1000 + mealIndex;
      if (tracking.meals_completed.includes(key)) { toggleMeal(key); return; }
      const excess = mealCompletionExcess({ meals: currentMeals as any, completedIndexes, mealIndex, dailyTarget });
      if (!excess.exceeds) { toggleMeal(key); return; }
      setCompletionWarning({ ...excess, mealIndex });
    },
    [activeGroupIndex, trackingDayIndex, ensureCanRegister, trackingLoading, tracking.meals_completed, toggleMeal, currentMeals, completedIndexes, dailyTarget],
  );

  const registerAboveTarget = useCallback(() => {
    if (!completionWarning) return;
    toggleMeal(trackingDayIndex * 1000 + completionWarning.mealIndex);
    pendingActionRef.current = 'aluno_registrou_acima_meta';
    // Nova referência dispara a sincronização com o treinador.
    writeSubs({ ...substitutions }, { ...editedMealByGroup });
    setCompletionWarning(null);
  }, [completionWarning, toggleMeal, activeGroupIndex, trackingDayIndex, writeSubs, substitutions, editedMealByGroup]);

  const adjustAndRegister = useCallback(() => {
    if (!completionWarning) return;
    const mi = completionWarning.mealIndex;
    const { result, dayBeforeKcal } = buildMealRebalance(mi, (currentMeals[mi]?.foods ?? []) as any, currentMeals, completedIndexes);
    setCompletionWarning(null);
    setMealRebalance({ mealIndex: mi, result, dayBeforeKcal, registerAfter: true });
  }, [completionWarning, buildMealRebalance, currentMeals, completedIndexes]);

  // Consumo real do dia: soma apenas das refeições registradas pelo aluno.
  const consumed = useMemo(() => {
    const acc = { kcal: 0, p: 0, c: 0, g: 0 };
    currentMeals.forEach((m, i) => {
      if (!tracking.meals_completed.includes(trackingDayIndex * 1000 + i)) return;
      (m.foods ?? []).forEach((f: any) => {
        acc.kcal += parseNum(f.kcal);
        acc.p += parseNum(f.p);
        acc.c += parseNum(f.c);
        acc.g += parseNum(f.g);
      });
    });
    return acc;
  }, [currentMeals, tracking.meals_completed, trackingDayIndex]);

  const weekSummary = useMemo(() => summarizeDietWeek(weekDates.map((date, dayIndex) => {
    const groupIndex = usesMealOptions ? activeGroupIndex : dayIndex;
    const prescribed = displayGroups[groupIndex]?.meals ?? allMeals;
    const row = weeklyTracking[date];
    const done = prescribed.map((_, i) => i).filter(i => row?.meals_completed.includes(dayIndex * 1000 + i));
    const target = resolveStudentDayTarget({
      dayTarget: isStructuredDiet ? structuredGroups[groupIndex]?.target : null,
      publishedTargets, mealsTotal: sumMealMacros(prescribed as any),
    });
    const edited = prescribed.map((meal, i) => {
      const foods = substitutions[`${groupIndex}-${i}`];
      return foods ? { ...meal, foods } : meal;
    });
    const hasEdits = prescribed.some((_, i) => Boolean(substitutions[`${groupIndex}-${i}`]));
    const meals = hasEdits ? rebalanceFutureMeals({ meals: edited as any, completedIndexes: done,
      currentIndex: editedMealByGroup[groupIndex] ?? -1, dailyTarget: target }).meals : prescribed;
    return { date, tracking: row, targetKcal: target.kcal,
      consumedKcal: sumMealMacros(meals.filter((_, i) => done.includes(i)) as any).kcal };
  }), trackingToday), [weekDates.join(','), weeklyTracking, displayGroups, allMeals, usesMealOptions,
    activeGroupIndex, isStructuredDiet, structuredGroups, publishedTargets, substitutions, editedMealByGroup, trackingToday]);

  // Refeição sugerida pelo horário atual (última cujo horário já passou).
  const currentMealIndex = useMemo(() => {
    if (currentMeals.length === 0) return -1;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let best = -1;
    currentMeals.forEach((m, i) => {
      const match = String(m.time ?? '').match(/(\d{1,2})[:h](\d{2})/);
      if (!match) return;
      const min = Number(match[1]) * 60 + Number(match[2]);
      if (min <= nowMin) best = i;
    });
    if (best === -1) {
      const firstFuture = currentMeals.findIndex((m) => /(\d{1,2})[:h](\d{2})/.test(String(m.time ?? '')));
      return firstFuture >= 0 ? firstFuture : 0;
    }
    return best;
  }, [currentMeals]);

  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const [expandedTouched, setExpandedTouched] = useState(false);

  // Ao carregar a tela / trocar de dia, a refeição do momento abre sozinha.
  useEffect(() => {
    setExpandedMeal(currentMealIndex >= 0 ? currentMealIndex : null);
    setExpandedTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupIndex]);

  useEffect(() => {
    if (expandedTouched) return;
    setExpandedMeal(currentMealIndex >= 0 ? currentMealIndex : null);
  }, [currentMealIndex, expandedTouched]);

  const handleMoveFood = useCallback(
    (sourceIndex: number, food: any, targetIndex: number) => {
      const sourceFoods = (currentMeals[sourceIndex]?.foods ?? []).filter((f: any) => f !== food);
      const targetFoods = [...(currentMeals[targetIndex]?.foods ?? []), food];
      persistFoodsChange(activeGroupIndex, sourceIndex, sourceFoods);
      persistFoodsChange(activeGroupIndex, targetIndex, targetFoods);
      setExpandedMeal(targetIndex);
      setExpandedTouched(true);
    },
    [currentMeals, persistFoodsChange, activeGroupIndex],
  );

  const waterMl = waterCurrentMl;
  const waterGoalMl = waterTargetMl;

  if (loading || trackingLoading) {
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
            <Card key={i} className="glass-card-solid">
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
      <FoodScanner open={showScanner} onOpenChange={setShowScanner} dailyKcal={dailyTarget?.kcal || null} />
      <div className="space-y-4 animate-fade-in">
        {/* Protocolos */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => setShowScanner(true)}>
            <ScanBarcode className="h-4 w-4" /> Escanear alimento
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

        <p className="text-sm text-muted-foreground" aria-live="polite">
          <strong className="text-foreground">{weekSummary.within} de {weekSummary.registered}</strong> dias dentro da meta
        </p>
        <div className="grid grid-cols-7 gap-1" aria-label="Dias da semana">
          {WEEKDAY_LABELS.map((label, i) => {
            const status = weekSummary.statuses[i];
            const active = selectedWeekday === i;
            return (
              <Button key={label} variant={active ? 'default' : 'ghost'}
                aria-pressed={active} aria-label={`${label} ${weekDates[i]}`}
                onClick={() => setSelectedWeekday(i)}
                className="h-12 min-w-0 flex-col gap-1 px-1 text-xs rounded-full">
                <span>{label}</span>
                <span className="flex h-3 items-center" aria-label={status === 'within' ? 'Dentro da meta' : status === 'above' ? 'Acima da meta' : status === 'below' ? 'Abaixo da meta' : 'Sem registro'}>
                  {status === 'within' ? <span className={active ? 'text-primary-foreground' : 'text-score-good'}>✓</span>
                    : status ? <span className={`h-1.5 w-1.5 rounded-full ${status === 'above' ? 'bg-destructive' : 'bg-score-poor'}`} /> : null}
                </span>
              </Button>
            );
          })}
        </div>
        {selectedDate > trackingToday && <p role="status" className="text-xs text-muted-foreground">Esse dia ainda não chegou</p>}

        {/* Option selector (weekday selection stays independent). */}
        {hasMultipleGroups && usesMealOptions && (
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

        {/* Calorias do dia */}
        {/* Meta PRESCRITA (nunca a soma da versão editada pelo aluno). */}
        <DailyCaloriesCard
          consumed={consumed.kcal}
          target={dailyTarget.kcal}
          protein={{ current: consumed.p, target: dailyTarget.p }}
          carbs={{ current: consumed.c, target: dailyTarget.c }}
          fats={{ current: consumed.g, target: dailyTarget.g }}
        />

        {(hasStudentEdits || undoSnapshot) && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-[11px] text-foreground">
              Meta prescrita do dia:{' '}
              <strong>{formatValue(dailyTarget.kcal, ' kcal')}</strong> · P {formatValue(dailyTarget.p, 'g')} · C{' '}
              {formatValue(dailyTarget.c, 'g')} · G {formatValue(dailyTarget.g, 'g')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {Math.abs(totalKcal - dailyTarget.kcal) <= 50
                ? 'Ajuste estimado dentro da tolerância — refeições futuras rebalanceadas automaticamente.'
                : `Diferença atual: ${formatSignedKcalDiff(totalKcal - dailyTarget.kcal)}.`}
            </p>
            {hasStudentEdits && (
              <Button variant="default" size="sm" onClick={openPortionPreview} className="w-full text-xs font-semibold">
                Ajustar Dieta
              </Button>
            )}
            {undoSnapshot && (
              <Button variant="outline" size="sm" onClick={undoPortionAdjust} className="w-full text-xs">
                Desfazer ajuste
              </Button>
            )}
            {hasStudentEdits && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} className="w-full text-xs text-muted-foreground">
                Voltar à dieta do treinador
              </Button>
            )}
          </div>
        )}

        <Dialog open={!!portionPreview} onOpenChange={(o) => !o && setPortionPreview(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ajustar porções</DialogTitle>
              <DialogDescription>
                Seus alimentos continuam os mesmos; só as quantidades das refeições ainda não feitas mudam.
              </DialogDescription>
            </DialogHeader>
            {portionPreview && (
              <div className="space-y-3 text-xs">
                {portionPreview.changes.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma porção precisou mudar.</p>
                ) : (
                  <ul className="space-y-1">
                    {portionPreview.changes.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                        <span className="min-w-0">
                          <span className="text-muted-foreground">{c.mealName} · </span>
                          {c.foodName}
                        </span>
                        <span className="whitespace-nowrap">
                          {c.before} → <strong className="text-primary">{c.after}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-lg border border-border/50 p-2 space-y-0.5">
                  {(['kcal', 'p', 'c', 'g'] as const).map((k) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k === 'kcal' ? 'Calorias' : k === 'p' ? 'Proteína' : k === 'c' ? 'Carboidrato' : 'Gordura'}</span>
                      <span>
                        {Math.round(portionPreview.before[k])} → <strong>{Math.round(portionPreview.after[k])}</strong>
                        <span className="text-muted-foreground"> / meta {Math.round(portionPreview.target[k])}{k === 'kcal' ? '' : ' g'}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {!portionPreview.ok && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 space-y-1">
                    <p className="font-semibold text-destructive">Não deu para fechar a meta dentro dos limites de porção:</p>
                    {portionPreview.issues.map((s, i) => <p key={i}>• {s}</p>)}
                    {portionPreview.suggestions.map((s, i) => <p key={`s${i}`} className="text-foreground">💡 {s}</p>)}
                    <p className="text-muted-foreground">Use o botão de trocar alimento na refeição para escolher um substituto.</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPortionPreview(null)}>Cancelar</Button>
              <Button onClick={applyPortionAdjust} disabled={!portionPreview || portionPreview.changes.length === 0}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Voltar à dieta do treinador?</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as trocas e porções que você alterou neste dia serão descartadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  pendingActionRef.current = 'aluno_restaurou';
                  setUndoSnapshot(null);
                  resetDayEdits();
                }}
              >
                Voltar ao original
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!mealRebalance} onOpenChange={(o) => !o && setMealRebalance(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ajustar {mealRebalance ? currentMeals[mealRebalance.mealIndex]?.name?.toLowerCase() : ''}</DialogTitle>
              <DialogDescription>
                {mealRebalance?.result.ok
                  ? `Para bater a meta, seu ${currentMeals[mealRebalance.mealIndex]?.name?.toLowerCase() ?? 'refeição'} fica:`
                  : 'Não dá para fechar a meta só ajustando as porções desta refeição.'}
              </DialogDescription>
            </DialogHeader>
            {mealRebalance && (
              <div className="space-y-3 text-xs">
                {mealRebalance.result.ok && (
                  <ul className="space-y-1">
                    {mealRebalance.result.changes.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                        <span className="min-w-0">{c.foodName}</span>
                        <span className="whitespace-nowrap">
                          {c.before} → <strong className="text-primary">{c.after}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-muted-foreground">
                  Dia: {Math.round(mealRebalance.dayBeforeKcal)} → <strong className="text-foreground">{Math.round(mealRebalance.result.dayAfter.kcal)}</strong> / meta {Math.round(dailyTarget.kcal)} kcal
                </p>
                {!mealRebalance.result.ok && mealRebalance.result.suggestion && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-foreground">💡 {mealRebalance.result.suggestion}</p>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMealRebalance(null)}>Manter como está</Button>
              {mealRebalance?.result.ok && <Button onClick={applyMealRebalance}>Aplicar</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!completionWarning} onOpenChange={(o) => !o && setCompletionWarning(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Acima da meta do dia</AlertDialogTitle>
              <AlertDialogDescription>
                {completionWarning &&
                  `Com essa refeição seu dia fica +${Math.round(completionWarning.kcal)} kcal acima da meta${
                    completionWarning.g > 8 ? ` (G +${Math.round(completionWarning.g)} g)` : ''
                  }.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <Button variant="outline" onClick={registerAboveTarget}>Registrar mesmo assim</Button>
              <Button onClick={adjustAndRegister}>Ajustar porções desta refeição</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Hidratação */}
        <HydrationCard
          currentMl={waterMl}
          targetMl={waterGoalMl}
          onAdd={addWaterMl}
          onRemove={removeWater}
        />

        {/* Refeições */}
        {currentMeals.length > 0 && (
          <div className="space-y-2.5">
            {currentMeals.map((meal, i) => {
              const mealKey = trackingDayIndex * 1000 + i;
              const done = tracking.meals_completed.includes(mealKey);
              return (
                <StudentMealCard
                  key={`day-${activeGroupIndex}-${meal.name}-${meal.time || 'sem-hora'}-${i}`}
                  meal={meal}
                  expanded={expandedMeal === i}
                  isCurrent={selectedDate === trackingToday && currentMealIndex === i}
                  onToggleExpand={() => {
                    setExpandedTouched(true);
                    setExpandedMeal((prev) => (prev === i ? null : i));
                  }}
                  isCompleted={done}
                  onToggleComplete={() => handleToggleMeal(i)}
                  onFoodsChange={(foods) => handleFoodsChange(i, foods)}
                  moveTargets={currentMeals
                    .map((m, mi) => ({ index: mi, name: m.time ? `${m.time} · ${m.name}` : m.name }))
                    .filter((t) => t.index !== i)}
                  onMoveFood={(food, targetIndex) => handleMoveFood(i, food, targetIndex)}
                />
              );
            })}
          </div>
        )}


        {currentMeals.length === 0 && (
          <Card className="glass-card-solid">
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
