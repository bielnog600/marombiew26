import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Sparkles, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import type { NewFoodCandidate } from '@/lib/newFoodsDetector';

interface Row extends NewFoodCandidate {
  key: string;              // stable identifier
  portion: string;          // 'gramas' | 'ml' | 'unidade'
  portion_size: number;     // reference portion size
  approved?: boolean;
  loading?: boolean;
}

interface Props {
  candidates: NewFoodCandidate[];
  onDismissAll: () => void;
  onRemoveFromPlan?: (candidate: NewFoodCandidate) => void;
}

const NewFoodsFromPlanCard: React.FC<Props> = ({ candidates, onDismissAll, onRemoveFromPlan }) => {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() =>
    candidates.map((c, i) => ({
      ...c,
      key: `${i}-${c.name}`,
      portion: 'gramas',
      portion_size: c.qtyGrams && c.qtyGrams > 0 ? c.qtyGrams : 100,
    }))
  );

  if (rows.length === 0) return null;

  const pending = rows.filter((r) => !r.approved);
  const approvedCount = rows.length - pending.length;

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const fetchFromAi = async (row: Row) => {
    updateRow(row.key, { loading: true });
    try {
      const { data, error } = await supabase.functions.invoke('food-search-ai', {
        body: { query: row.name },
      });
      if (error) throw error;
      if (data) {
        updateRow(row.key, {
          name: data.name || row.name,
          portion: data.portion || 'gramas',
          portion_size: Number(data.portion_size) || row.portion_size,
          kcal: Number(data.calories) || 0,
          protein: Number(data.protein) || 0,
          carbs: Number(data.carbs) || 0,
          fats: Number(data.fats) || 0,
          loading: false,
        });
        toast.success(`Dados nutricionais atualizados para ${row.name}`);
      } else {
        updateRow(row.key, { loading: false });
      }
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível buscar dados na IA');
      updateRow(row.key, { loading: false });
    }
  };

  const approve = async (row: Row) => {
    updateRow(row.key, { loading: true });
    try {
      const { error } = await supabase.from('foods').insert({
        name: row.name,
        portion: row.portion,
        portion_size: row.portion_size,
        calories: row.kcal,
        protein: row.protein,
        carbs: row.carbs,
        fats: row.fats,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      updateRow(row.key, { approved: true, loading: false });
      toast.success(`${row.name} adicionado à base de alimentos`);
    } catch (e: any) {
      console.error(e);
      toast.error(`Erro ao adicionar: ${e?.message || 'desconhecido'}`);
      updateRow(row.key, { loading: false });
    }
  };

  const remove = (key: string) => {
    const target = rows.find((r) => r.key === key);
    setRows((prev) => prev.filter((r) => r.key !== key));
    if (target && !target.approved && onRemoveFromPlan) {
      onRemoveFromPlan(target);
    }
  };

  return (
    <Card className="glass-card border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Novos alimentos detectados no plano
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pending.length} pendente(s){approvedCount > 0 ? ` · ${approvedCount} aprovado(s)` : ''}. Revise os macros e aprove para adicionar à base.
            </p>
          </div>
          {pending.length === 0 && (
            <Button size="sm" variant="ghost" onClick={onDismissAll}>Fechar</Button>
          )}
        </div>

        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className={`rounded-lg border p-3 space-y-2 ${r.approved ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70' : 'border-border bg-background/40'}`}
            >
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={r.name}
                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    disabled={r.approved}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Porção</Label>
                  <Input
                    value={r.portion}
                    onChange={(e) => updateRow(r.key, { portion: e.target.value })}
                    disabled={r.approved}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-20">
                  <Label className="text-xs">Qtd</Label>
                  <Input
                    type="number"
                    value={r.portion_size}
                    onChange={(e) => updateRow(r.key, { portion_size: Number(e.target.value) || 0 })}
                    disabled={r.approved}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Kcal</Label>
                  <Input type="number" value={r.kcal} onChange={(e) => updateRow(r.key, { kcal: Number(e.target.value) || 0 })} disabled={r.approved} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Prot (g)</Label>
                  <Input type="number" value={r.protein} onChange={(e) => updateRow(r.key, { protein: Number(e.target.value) || 0 })} disabled={r.approved} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Carb (g)</Label>
                  <Input type="number" value={r.carbs} onChange={(e) => updateRow(r.key, { carbs: Number(e.target.value) || 0 })} disabled={r.approved} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Gord (g)</Label>
                  <Input type="number" value={r.fats} onChange={(e) => updateRow(r.key, { fats: Number(e.target.value) || 0 })} disabled={r.approved} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {r.approved ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Adicionado à base
                  </span>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => fetchFromAi(r)} disabled={r.loading}>
                      {r.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      <span className="ml-1">Buscar dados por IA</span>
                    </Button>
                    <Button size="sm" onClick={() => approve(r)} disabled={r.loading || !r.name.trim()}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Aprovar e adicionar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.key)} className="text-muted-foreground">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default NewFoodsFromPlanCard;