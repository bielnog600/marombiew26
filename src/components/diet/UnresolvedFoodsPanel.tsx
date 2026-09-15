import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { foodRecordFromRow, normalizeFoodName, type FoodRecord } from '@/lib/nutritionEngine';
import { linkPlanItemsToFood } from '@/lib/dietFoodRelink';
import type { DietPlan } from '@/lib/dietSchema';

interface UnresolvedRef {
  dayIdx: number;
  mealIdx: number;
  itemIdx: number;
  dayLabel: string;
  mealName: string;
  name: string;
  qtyGrams: number;
}

export function collectUnresolvedItems(plan: any): UnresolvedRef[] {
  const out: UnresolvedRef[] = [];
  (plan?.days ?? []).forEach((day: any, dayIdx: number) => {
    (day?.meals ?? []).forEach((meal: any, mealIdx: number) => {
      (meal?.items ?? []).forEach((item: any, itemIdx: number) => {
        if (item?.resolutionStatus !== 'unresolved') return;
        out.push({
          dayIdx,
          mealIdx,
          itemIdx,
          dayLabel: String(day?.label ?? day?.weekday ?? ''),
          mealName: String(meal?.name ?? ''),
          name: String(item?.name ?? ''),
          qtyGrams: Number(item?.qtyGrams) || 0,
        });
      });
    });
  });
  return out;
}

export interface UnresolvedGroup {
  key: string;
  name: string;
  occurrences: number;
  refs: UnresolvedRef[];
}

/** HOTFIX UX — uma linha por alimento, não por ocorrência. */
export function groupUnresolvedItems(plan: any): UnresolvedGroup[] {
  const groups = new Map<string, UnresolvedGroup>();
  for (const ref of collectUnresolvedItems(plan)) {
    const key = normalizeFoodName(ref.name);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.refs.push(ref);
    } else {
      groups.set(key, { key, name: ref.name, occurrences: 1, refs: [ref] });
    }
  }
  return [...groups.values()];
}

interface Props {
  plan: DietPlan | any;
  onChange: (plan: any) => void;
}

const UnresolvedFoodsPanel: React.FC<Props> = ({ plan, onChange }) => {
  const groups = useMemo(() => groupUnresolvedItems(plan), [plan]);
  const [selection, setSelection] = useState<Record<string, string>>({});

  const { data: foods = [] } = useQuery<FoodRecord[]>({
    queryKey: ['foods-resolution-catalog'],
    enabled: groups.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, calories, protein, carbs, fats, portion, portion_size, brand, source, barcode, source_food_id')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row: any) => foodRecordFromRow(row));
    },
  });

  if (!groups.length) return null;

  return (
    <div className="glass-card rounded-2xl p-4 border border-amber-500/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Alimentos não vinculados à base</p>
          <p className="text-xs text-muted-foreground">
            Escolha o alimento correto uma única vez: o vínculo vale para todas as ocorrências,
            em todos os dias, mantendo as quantidades de cada refeição.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const chosen = selection[group.key];
          const days = [...new Set(group.refs.map((r) => r.dayLabel).filter(Boolean))];
          return (
            <div
              key={group.key}
              className="rounded-xl bg-background/40 p-3 space-y-2 border border-border/40"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-[10px]">
                  NÃO VALIDADO
                </Badge>
                <span className="text-sm font-medium">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {group.occurrences} ocorrência{group.occurrences > 1 ? 's' : ''}
                  {days.length ? ` · ${days.join(', ')}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={chosen ?? ''}
                  onValueChange={(v) => setSelection((s) => ({ ...s, [group.key]: v }))}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Escolher alimento da base..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {foods.map((f) => (
                      <SelectItem key={f.id} value={f.id} className="text-xs">
                        <span className="flex flex-col">
                          <span>
                            {f.name}
                            {f.brand ? ` · ${f.brand}` : ''}
                            {f.source ? ` · ${f.source}` : ''}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(Number(f.calories) || 0)} kcal /{' '}
                            {Math.round(Number(f.portion_size) || 100)}g ·{' '}
                            {Math.round(Number(f.protein) || 0)}P ·{' '}
                            {Math.round(Number(f.carbs) || 0)}C ·{' '}
                            {Math.round(Number(f.fats) || 0)}G
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!chosen}
                  onClick={() => {
                    const food = foods.find((f) => f.id === chosen);
                    if (!food) return;
                    const result = linkPlanItemsToFood(plan, group.name, food, foods);
                    if (result.changed) onChange(result.plan);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Resolver alimento
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UnresolvedFoodsPanel;
