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
import { foodRecordFromRow, type FoodRecord } from '@/lib/nutritionEngine';
import { resolveDietFoodItem } from '@/lib/dietFoodResolution';
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

interface Props {
  plan: DietPlan | any;
  onChange: (plan: any) => void;
}

const UnresolvedFoodsPanel: React.FC<Props> = ({ plan, onChange }) => {
  const unresolved = useMemo(() => collectUnresolvedItems(plan), [plan]);
  const [selection, setSelection] = useState<Record<string, string>>({});

  const { data: foods = [] } = useQuery<FoodRecord[]>({
    queryKey: ['foods-resolution-catalog'],
    enabled: unresolved.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, calories, protein, carbs, fats, portion, portion_size, brand, source, barcode, source_food_id')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row: any) => foodRecordFromRow(row));
    },
  });

  if (!unresolved.length) return null;

  return (
    <div className="glass-card rounded-2xl p-4 border border-amber-500/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Alimentos não vinculados à base</p>
          <p className="text-xs text-muted-foreground">
            Esta dieta possui alimentos que ainda não foram vinculados à base. Resolva-os antes de
            considerar os macros validados.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {unresolved.map((ref) => {
          const key = `${ref.dayIdx}-${ref.mealIdx}-${ref.itemIdx}`;
          const chosen = selection[key];
          return (
            <div
              key={key}
              className="rounded-xl bg-background/40 p-3 space-y-2 border border-border/40"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-[10px]">
                  NÃO VALIDADO
                </Badge>
                <span className="text-sm font-medium">{ref.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ref.dayLabel} · {ref.mealName} · {Math.round(ref.qtyGrams)} g
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={chosen ?? ''} onValueChange={(v) => setSelection((s) => ({ ...s, [key]: v }))}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Escolher alimento da base..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {foods.map((f) => (
                      <SelectItem key={f.id} value={f.id} className="text-xs">
                        {f.name}
                        {f.brand ? ` · ${f.brand}` : ''}
                        {f.source ? ` · ${f.source}` : ''}
                        {` — ${Math.round(Number(f.calories) || 0)} kcal / ${Math.round(Number(f.portion_size) || 100)}g`}
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
                    onChange(resolveDietFoodItem(plan, ref, food, foods));
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
