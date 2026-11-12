import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { filterFoodsBySearch } from '@/lib/foodSearch';

type Size = 'pequeno' | 'medio' | 'grande';
const SIZES: [Size, string][] = [['pequeno', 'Pequeno'], ['medio', 'Médio'], ['grande', 'Grande']];
interface Row { id: string; food_id: string; tamanho: Size; gramas: number }
interface FoodLite { id: string; name: string; brand: string | null }

export const UNIT_WEIGHTS_KEY = ['admin-food-unit-weights'];

/** Pesos médios por unidade (pequeno/médio/grande) usados pelo scanner por foto para alimentos in natura. */
const FoodUnitWeightsPanel: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<Size, string>>>>({});
  const [added, setAdded] = useState<string[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: UNIT_WEIGHTS_KEY,
    queryFn: async () => {
      const [w, f] = await Promise.all([
        supabase.from('food_unit_weights').select('id, food_id, tamanho, gramas'),
        supabase.from('foods').select('id, name, brand').order('name'),
      ]);
      if (w.error) throw w.error;
      return { rows: (w.data ?? []) as Row[], foods: (f.data ?? []) as FoodLite[] };
    },
  });
  const foods = data?.foods ?? [];
  const byFood = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data?.rows ?? []) m.set(r.food_id, [...(m.get(r.food_id) ?? []), r]);
    return m;
  }, [data]);
  const listed = useMemo(() => {
    const ids = [...new Set([...byFood.keys(), ...added])];
    return ids.map((id) => foods.find((f) => f.id === id)).filter((f): f is FoodLite => !!f).sort((a, b) => a.name.localeCompare(b.name));
  }, [byFood, added, foods]);
  const results = useMemo(() => (search.trim() ? filterFoodsBySearch(foods as any, search).slice(0, 10) as FoodLite[] : []), [foods, search]);

  const value = (foodId: string, size: Size) =>
    drafts[foodId]?.[size] ?? String(byFood.get(foodId)?.find((r) => r.tamanho === size)?.gramas ?? '');

  const save = async (foodId: string) => {
    const rows = SIZES.map(([size]) => ({ size, g: Number(String(value(foodId, size)).replace(',', '.')) }));
    const upserts = rows.filter((r) => r.g > 0).map((r) => ({ food_id: foodId, tamanho: r.size, gramas: r.g }));
    const removes = rows.filter((r) => !(r.g > 0)).map((r) => r.size);
    const { error } = upserts.length ? await supabase.from('food_unit_weights').upsert(upserts, { onConflict: 'food_id,tamanho' }) : { error: null };
    if (error) return toast.error(error.message);
    if (removes.length) await supabase.from('food_unit_weights').delete().eq('food_id', foodId).in('tamanho', removes);
    setDrafts((d) => { const n = { ...d }; delete n[foodId]; return n; });
    qc.invalidateQueries({ queryKey: UNIT_WEIGHTS_KEY });
    toast.success('Pesos salvos');
  };
  const remove = async (foodId: string) => {
    const { error } = await supabase.from('food_unit_weights').delete().eq('food_id', foodId);
    if (error) return toast.error(error.message);
    setAdded((a) => a.filter((x) => x !== foodId));
    qc.invalidateQueries({ queryKey: UNIT_WEIGHTS_KEY });
  };

  return (
    <div className="space-y-4" data-testid="food-unit-weights">
      <p className="text-sm text-muted-foreground">Peso médio de uma unidade (em gramas). O scanner por foto usa esses pesos para frutas, ovos, pães e outros alimentos in natura.</p>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Adicionar alimento da base" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Adicionar alimento" />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card divide-y divide-border/50">
            {results.map((f) => (
              <li key={f.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => { setAdded((a) => [...new Set([...a, f.id])]); setSearch(''); }}>
                <Plus className="inline h-3.5 w-3.5 mr-1" />{f.name}{f.brand ? ` · ${f.brand}` : ''}
              </button></li>
            ))}
          </ul>
        )}
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Carregando…</p> : listed.map((f) => (
        <Card key={f.id} className="glass-card">
          <CardContent className="p-3 flex flex-wrap items-end gap-2">
            <p className="w-full sm:w-48 font-semibold text-sm truncate">{f.name}</p>
            {SIZES.map(([size, label]) => (
              <label key={size} className="text-xs text-muted-foreground">
                {label}
                <Input inputMode="decimal" className="h-9 w-20 tabular-nums" value={value(f.id, size)} aria-label={`${f.name} ${label} (g)`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: { ...d[f.id], [size]: e.target.value.replace(/[^\d.,]/g, '') } }))} />
              </label>
            ))}
            <Button size="sm" className="gap-1" onClick={() => save(f.id)}><Save className="h-4 w-4" /> Salvar</Button>
            <Button size="sm" variant="ghost" aria-label={`Remover pesos de ${f.name}`} onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FoodUnitWeightsPanel;
