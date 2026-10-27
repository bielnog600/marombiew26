import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, EyeOff, AlertTriangle } from 'lucide-react';
import FoodScanner from '@/components/diet/FoodScanner';
import type { ScanRecord } from '@/components/diet/FoodScanResult';
import { toast } from 'sonner';
import {
  groupScans, mapGroupToFood, productKey, findDuplicates,
  type ProductGroup, type ReviewStatus, type FoodDraft, type ExistingFood, type ScanRow,
} from '@/lib/foodScanReview';

const scoreClass = (s: number | null) =>
  s == null ? 'bg-muted' : s < 25 ? 'bg-destructive' : s < 50 ? 'bg-orange-500' : s < 75 ? 'bg-lime-500' : 'bg-green-600';
const fmt = (v: number | null) => (v == null ? '–' : String(Math.round(v * 10) / 10).replace('.', ','));

export const SCANNED_FOODS_KEY = ['admin-food-scans'];

export function useScannedFoodsData() {
  return useQuery({
    queryKey: SCANNED_FOODS_KEY,
    queryFn: async () => {
      const [scans, reviews, foods] = await Promise.all([
        supabase.from('food_scans').select('id,aluno_id,barcode,product_name,brand,image_url,score,score_label,nutriments,created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('food_scan_reviews').select('*'),
        supabase.from('foods').select('id,name,brand,barcode'),
      ]);
      if (scans.error) throw scans.error;
      const ids = [...new Set((scans.data ?? []).map((s) => s.aluno_id))];
      const profs = ids.length ? await supabase.from('profiles').select('user_id,nome').in('user_id', ids) : { data: [] as any[] };
      return {
        groups: groupScans((scans.data ?? []) as ScanRow[]),
        reviews: new Map((reviews.data ?? []).map((r: any) => [r.product_key, r])),
        foods: (foods.data ?? []) as ExistingFood[],
        names: new Map((profs.data ?? []).map((p: any) => [p.user_id, p.nome || 'Aluno'])),
      };
    },
  });
}

export function usePendingScanCount(): number {
  const { data } = useScannedFoodsData();
  if (!data) return 0;
  return data.groups.filter((g) => (data.reviews.get(g.key)?.status ?? 'pendente') === 'pendente').length;
}

interface ScannedFoodsPanelProps {
  scannerOpen: boolean;
  onScannerOpenChange: (open: boolean) => void;
}

const ScannedFoodsPanel: React.FC<ScannedFoodsPanelProps> = ({ scannerOpen, onScannerOpenChange }) => {
  const qc = useQueryClient();
  const { user } = useAuth() as any;
  const [filter, setFilter] = useState<ReviewStatus>('pendente');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ group: ProductGroup; draft: FoodDraft } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useScannedFoodsData();

  const onAdminScanned = async (rec: ScanRecord) => {
    const key = productKey(rec as any);
    const res = await refetch();
    const fresh = res.data;
    const g = fresh?.groups.find((x) => x.key === key);
    if (!g) return toast.error('Produto escaneado, mas não encontrado na lista.');
    setEditing({ group: g, draft: mapGroupToFood(g) });
  };

  const statusOf = (k: string): ReviewStatus => (data?.reviews.get(k)?.status ?? 'pendente') as ReviewStatus;

  const list = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.groups.filter((g) => statusOf(g.key) === filter && (!q || `${g.name} ${g.brand ?? ''}`.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, search]);

  const counts = useMemo(() => {
    const c = { pendente: 0, adicionado: 0, ignorado: 0 } as Record<ReviewStatus, number>;
    data?.groups.forEach((g) => c[statusOf(g.key)]++);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveReview = async (g: ProductGroup, status: ReviewStatus, foodId: string | null) => {
    const { error } = await supabase.from('food_scan_reviews').upsert({
      product_key: g.key, barcode: g.barcode, status, reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(), food_id: foodId,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: SCANNED_FOODS_KEY });
  };

  const ignore = async (g: ProductGroup) => {
    try { await saveReview(g, 'ignorado', null); toast.success('Produto ignorado'); }
    catch (e: any) { toast.error(e.message ?? 'Erro ao ignorar'); }
  };

  const restore = async (g: ProductGroup) => {
    try { await saveReview(g, 'pendente', null); toast.success('Voltou para pendentes'); }
    catch (e: any) { toast.error(e.message ?? 'Erro'); }
  };

  const editingStatus: ReviewStatus = editing ? statusOf(editing.group.key) : 'pendente';
  const reviewed = editingStatus !== 'pendente';

  const ignoreEditing = async () => {
    if (!editing) return;
    await ignore(editing.group);
    setEditing(null);
  };

  const duplicates = editing && data ? findDuplicates(editing.draft, data.foods) : [];

  const linkExisting = async (foodId: string) => {
    if (!editing) return;
    try { await saveReview(editing.group, 'adicionado', foodId); toast.success('Marcado como já cadastrado'); setEditing(null); }
    catch (e: any) { toast.error(e.message ?? 'Erro'); }
  };

  const submit = async () => {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim()) return toast.error('Informe o nome');
    if (!(d.portion_size > 0)) return toast.error('Informe o tamanho da porção');
    setSaving(true);
    try {
      const { data: ins, error } = await supabase.from('foods').insert({
        ...d, name: d.name.trim(), portion: d.portion.trim() || 'gramas',
        brand: d.brand?.trim() || null, barcode: d.barcode?.trim() || null,
        source: d.source?.trim() || null, source_food_id: d.source_food_id?.trim() || null,
      }).select('id').single();
      if (error) throw error;
      await saveReview(editing.group, 'adicionado', ins.id);
      qc.invalidateQueries({ queryKey: ['foods'] });
      toast.success('Alimento adicionado ao banco');
      setEditing(null);
    } catch (e: any) { toast.error(e.message ?? 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const setDraft = (patch: Partial<FoodDraft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const numField = (k: keyof FoodDraft, label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" inputMode="decimal" step="0.1" value={String(editing?.draft[k] ?? 0)}
        onChange={(e) => setDraft({ [k]: parseFloat(e.target.value.replace(',', '.')) || 0 } as any)} />
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['pendente', 'adicionado', 'ignorado'] as ReviewStatus[]).map((s) => (
            <Button key={s} size="sm" variant={filter === s ? 'default' : 'outline'} onClick={() => setFilter(s)}>
              {s === 'pendente' ? 'Pendentes' : s === 'adicionado' ? 'Adicionados' : 'Ignorados'} ({counts[s]})
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou marca" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? <p className="text-muted-foreground">Carregando…</p> : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum produto nesta lista.</p>
        ) : list.map((g) => {
          const rev = data?.reviews.get(g.key);
          return (
            <Card key={g.key} className="glass-card">
              <CardContent className="p-4 flex gap-3">
                {g.image_url ? <img src={g.image_url} alt={g.name} loading="lazy" className="h-20 w-20 rounded-lg object-cover bg-muted shrink-0" />
                  : <div className="h-20 w-20 rounded-lg bg-muted shrink-0" />}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{g.brand ?? 'Sem marca'} · {g.barcode ?? 'sem código'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`h-3 w-3 rounded-full ${scoreClass(g.score)}`} />
                      <span className="text-sm font-semibold">{g.score ?? '–'}</span>
                      <span className="text-xs text-muted-foreground">{g.score_label ?? ''}</span>
                    </div>
                  </div>
                  <p className="text-xs">
                    100 g: {fmt(g.per100.kcal)} kcal · P {fmt(g.per100.p)} · C {fmt(g.per100.c)} · G {fmt(g.per100.g)} · Fibras {fmt(g.per100.fibras)} · Sal {fmt(g.per100.sal)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g.count}× por {g.alunoIds.map((id) => data?.names.get(id) ?? 'Aluno').join(', ')} · último em {new Date(g.lastScanAt).toLocaleDateString('pt-BR')}
                  </p>
                  {rev?.reviewed_at && <p className="text-xs text-muted-foreground">Revisado em {new Date(rev.reviewed_at).toLocaleDateString('pt-BR')}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {filter === 'pendente' && <>
                      <Button size="sm" onClick={() => setEditing({ group: g, draft: mapGroupToFood(g) })}><Plus className="h-4 w-4 mr-1" />Adicionar ao banco de alimentos</Button>
                      <Button size="sm" variant="outline" onClick={() => ignore(g)}><EyeOff className="h-4 w-4 mr-1" />Ignorar</Button>
                    </>}
                    {filter !== 'pendente' && <Button size="sm" variant="outline" onClick={() => restore(g)}>Voltar para pendentes</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisar alimento</DialogTitle></DialogHeader>
          {editing && reviewed && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm space-y-1">
              <p className="font-medium">
                {editingStatus === 'adicionado' ? 'Este produto já foi adicionado ao banco de alimentos.' : 'Este produto já foi ignorado.'}
              </p>
              {data?.reviews.get(editing.group.key)?.reviewed_at && (
                <p className="text-xs text-muted-foreground">Revisado em {new Date(data.reviews.get(editing.group.key).reviewed_at).toLocaleDateString('pt-BR')}</p>
              )}
            </div>
          )}
          {editing && !reviewed && <div className="space-y-3">
            {duplicates.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Possível duplicado no banco:</p>
                {duplicates.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{f.name}{f.brand ? ` · ${f.brand}` : ''}{f.barcode ? ` · ${f.barcode}` : ''}</span>
                    <Button size="sm" variant="outline" onClick={() => linkExisting(f.id)}>Usar este</Button>
                  </div>
                ))}
              </div>
            )}
            <div><Label className="text-xs">Nome *</Label><Input value={editing.draft.name} onChange={(e) => setDraft({ name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Marca</Label><Input value={editing.draft.brand ?? ''} onChange={(e) => setDraft({ brand: e.target.value })} /></div>
              <div><Label className="text-xs">Código de barras</Label><Input value={editing.draft.barcode ?? ''} onChange={(e) => setDraft({ barcode: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Medida (ex.: gramas, 1 pote)</Label><Input value={editing.draft.portion} onChange={(e) => setDraft({ portion: e.target.value })} /></div>
              {numField('portion_size', 'Porção (g/ml) *')}
            </div>
            {editing.group.servingQuantity && (
              <p className="text-xs text-muted-foreground">Porção do rótulo: {editing.group.servingQuantity} g{editing.group.quantity ? ` · embalagem ${editing.group.quantity}` : ''}. Os macros abaixo são da porção informada.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {numField('calories', 'Calorias (kcal)')}
              {numField('protein', 'Proteínas (g)')}
              {numField('carbs', 'Carboidratos (g)')}
              {numField('fats', 'Gorduras (g)')}
            </div>
            <p className="text-xs text-muted-foreground">Fibras, sal e nota não existem no banco de alimentos e não são salvos.</p>
            <Badge variant="outline">Origem: {editing.draft.source}</Badge>
          </div>}
          <DialogFooter className="gap-2">
            {reviewed ? (
              <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
            ) : <>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button variant="outline" onClick={ignoreEditing}><EyeOff className="h-4 w-4 mr-1" />Ignorar</Button>
              <Button onClick={submit} disabled={saving}>{duplicates.length ? 'Salvar mesmo assim' : 'Salvar alimento'}</Button>
            </>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FoodScanner open={scannerOpen} onOpenChange={onScannerOpenChange} mode="admin" onAdminScanned={onAdminScanned} />
    </>
  );
};

export default ScannedFoodsPanel;
