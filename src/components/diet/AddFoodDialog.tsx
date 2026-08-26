import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { ParsedFood } from '@/lib/dietResultParser';

interface AddFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (food: ParsedFood) => void;
}

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

/** Adds a food from the real foods database (no invented names). */
const AddFoodDialog: React.FC<AddFoodDialogProps> = ({ open, onOpenChange, onAdd }) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grams, setGrams] = useState<string>('100');

  const { data: foods = [] } = useQuery({
    queryKey: ['foods-for-add'],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return foods.slice(0, 60);
    const q = search.toLowerCase();
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 60);
  }, [foods, search]);

  const selected = foods.find((f) => f.id === selectedId) || null;
  const gramsNum = Number(grams.replace(',', '.'));
  const scale = selected && gramsNum > 0 ? gramsNum / (selected.portion_size || 100) : 0;

  const preview = selected && scale > 0
    ? {
        kcal: round(selected.calories * scale),
        p: round(selected.protein * scale),
        c: round(selected.carbs * scale),
        g: round(selected.fats * scale),
      }
    : null;

  const handleAdd = () => {
    if (!selected || !preview) return;
    onAdd({
      food: selected.name,
      qty: `${round(gramsNum)} g`,
      kcal: String(preview.kcal),
      p: String(preview.p),
      c: String(preview.c),
      g: String(preview.g),
    });
    onOpenChange(false);
    setSearch('');
    setSelectedId(null);
    setGrams('100');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col fixed top-[5vh] translate-y-0 sm:top-[50%] sm:-translate-y-1/2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4 text-primary" />
            Adicionar alimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar alimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: '40vh' }}>
            <div className="space-y-1 pr-2">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum alimento encontrado</p>
              ) : (
                filtered.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(food.id);
                      setGrams(String(food.portion_size || 100));
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                      selectedId === food.id ? 'bg-primary/15 border border-primary/40' : 'hover:bg-secondary'
                    }`}
                  >
                    <p className="text-sm font-medium truncate">{food.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {food.portion_size || 100}g · {food.calories} kcal · P:{food.protein} C:{food.carbs} G:{food.fats}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {selected && (
            <div className="shrink-0 rounded-lg bg-secondary/60 p-3 space-y-2">
              <p className="text-sm font-semibold">{selected.name}</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  className="h-9 w-28"
                />
                <span className="text-xs text-muted-foreground">gramas</span>
              </div>
              {preview && (
                <p className="text-[11px] text-muted-foreground">
                  {preview.kcal} kcal · P:{preview.p} C:{preview.c} G:{preview.g}
                </p>
              )}
              <Button size="sm" className="w-full" onClick={handleAdd} disabled={!preview}>
                Adicionar à refeição
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddFoodDialog;
