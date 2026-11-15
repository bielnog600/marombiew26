/**
 * Banco de refeições (admin): opções 2 e 3 das refeições da dieta.
 * Macros sempre calculados pela tabela de alimentos — nada fixo aqui.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { buildFoodIndex, foodRecordFromRow, type FoodRecord } from '@/lib/nutritionEngine';
import {
  MEAL_ORIGINS,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  computeOptionItems,
  normText,
  sumOptionItems,
  type BankMeal,
  type MealOrigin,
  type MealSlot,
} from '@/lib/mealBank';
import { MEAL_BANK_QUERY_KEY, useMealBank } from '@/hooks/useMealBank';
import CanonicalFoodPickerDialog from '@/components/diet/CanonicalFoodPickerDialog';
import MealBankImportDialog from '@/components/mealBank/MealBankImportDialog';
import { buildBankExportSheets, nextBankCode } from '@/lib/mealBank/spreadsheet';
import { downloadBankWorkbook } from '@/lib/mealBank/spreadsheetFile';

/** Próximo código livre do horário (ex.: CM16). */
export { nextBankCode };

interface DraftMeal {
  id: string | null;
  code: string;
  slot: MealSlot;
  name: string;
  origin: MealOrigin;
  tags: string;
  prep: string;
  active: boolean;
  items: Array<{ foodId: string; grams: string }>;
}

const toDraft = (m: BankMeal): DraftMeal => ({
  id: m.id,
  code: m.code,
  slot: m.slot,
  name: m.name,
  origin: m.origin,
  tags: m.tags.join(', '),
  prep: m.prep ?? '',
  active: m.active,
  items: m.items.map((i) => ({ foodId: i.foodId, grams: String(i.grams) })),
});

const BancoRefeicoes: React.FC = () => {
  const qc = useQueryClient();
  const { data: bank, isLoading } = useMealBank();
  const { data: foods = [] } = useQuery({
    queryKey: ['canonical-editor-foods'],
    queryFn: async (): Promise<FoodRecord[]> => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, calories, protein, carbs, fats, portion, portion_size, brand, source')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row: any) => foodRecordFromRow(row));
    },
  });
  const index = useMemo(() => buildFoodIndex(foods), [foods]);

  const [slot, setSlot] = useState<'all' | MealSlot>('all');
  const [origin, setOrigin] = useState<'all' | MealOrigin>('all');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [draft, setDraft] = useState<DraftMeal | null>(null);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportSheet = async () => {
    if (!bank || bank.length === 0 || foods.length === 0) { toast.warning('O banco ainda está carregando.'); return; }
    setExporting(true);
    try {
      const day = new Date().toLocaleDateString('sv-SE');
      await downloadBankWorkbook(buildBankExportSheets(bank, foods), `banco-de-refeicoes-${day}.xlsx`);
    } catch (err) {
      console.error('[BancoRefeicoes] exportar', err);
      toast.error('Não deu para gerar a planilha. Tenta de novo.');
    } finally {
      setExporting(false);
    }
  };

  const rows = useMemo(() => {
    const q = normText(query);
    return (bank ?? [])
      .filter((m) => slot === 'all' || m.slot === slot)
      .filter((m) => origin === 'all' || m.origin === origin)
      .filter((m) => showInactive || m.active)
      .filter((m) => !q || normText(`${m.code} ${m.name} ${m.tags.join(' ')}`).includes(q))
      .map((m) => ({ meal: m, totals: sumOptionItems(computeOptionItems(m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })), index)) }));
  }, [bank, slot, origin, query, showInactive, index]);

  const draftTotals = useMemo(() => {
    if (!draft) return null;
    return sumOptionItems(computeOptionItems(
      draft.items.map((i) => ({ foodId: i.foodId, grams: Number(String(i.grams).replace(',', '.')) || 0 })),
      index,
    ));
  }, [draft, index]);

  const refresh = () => qc.invalidateQueries({ queryKey: MEAL_BANK_QUERY_KEY });

  const toggleActive = async (m: BankMeal, active: boolean) => {
    const { error } = await supabase.from('meal_bank').update({ active }).eq('id', m.id);
    if (error) { toast.error('Não deu para salvar. Tenta de novo.'); return; }
    refresh();
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();
    const items = draft.items
      .map((i, ordem) => ({ food_id: i.foodId, grams: Number(String(i.grams).replace(',', '.')), ordem }))
      .filter((i) => i.food_id && i.grams > 0);
    if (!name || !code) { toast.warning('Preencha o código e o nome.'); return; }
    if (items.length === 0) { toast.warning('Adicione ao menos um alimento com gramas.'); return; }
    setSaving(true);
    const payload = {
      code,
      slot: draft.slot,
      name,
      origin: draft.origin,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      prep: draft.prep.trim() || null,
      active: draft.active,
    };
    let mealId = draft.id;
    if (mealId) {
      const { error } = await supabase.from('meal_bank').update(payload).eq('id', mealId);
      if (error) { setSaving(false); toast.error(error.code === '23505' ? 'Esse código já existe.' : 'Não deu para salvar. Tenta de novo.'); return; }
    } else {
      const { data, error } = await supabase.from('meal_bank').insert(payload).select('id').single();
      if (error || !data) { setSaving(false); toast.error(error?.code === '23505' ? 'Esse código já existe.' : 'Não deu para salvar. Tenta de novo.'); return; }
      mealId = data.id;
    }
    // Itens: apaga e grava de novo na ordem da lista.
    const del = await supabase.from('meal_bank_items').delete().eq('meal_id', mealId);
    const ins = del.error ? del : await supabase.from('meal_bank_items').insert(items.map((i) => ({ ...i, meal_id: mealId! })));
    setSaving(false);
    if (ins.error) { console.error('[BancoRefeicoes] itens', ins.error); toast.error('Refeição salva, mas os alimentos não. Tenta de novo.'); refresh(); return; }
    toast.success('Refeição salva.');
    setDraft(null);
    refresh();
  };

  const newMeal = () => {
    const s: MealSlot = slot === 'all' ? 'cafe_manha' : slot;
    setDraft({ id: null, code: nextBankCode(bank ?? [], s), slot: s, name: '', origin: 'BR/PT', tags: '', prep: '', active: true, items: [] });
  };

  return (
    <AppLayout title="Banco de refeições">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar refeição, código ou etiqueta" className="pl-8" />
          </div>
          <Select value={slot} onValueChange={(v) => setSlot(v as any)}>
            <SelectTrigger className="w-40" aria-label="Horário"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os horários</SelectItem>
              {MEAL_SLOTS.map((s) => <SelectItem key={s} value={s}>{MEAL_SLOT_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={origin} onValueChange={(v) => setOrigin(v as any)}>
            <SelectTrigger className="w-32" aria-label="Origem"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              {MEAL_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-1">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-xs">Mostrar inativas</Label>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5" disabled={isLoading || foods.length === 0}>
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
          <Button variant="outline" onClick={exportSheet} className="gap-1.5" disabled={isLoading || exporting || foods.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar planilha
          </Button>
          <Button onClick={newMeal} className="gap-1.5"><Plus className="h-4 w-4" /> Nova refeição</Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {rows.length} refeições · usadas como Opção 2 e 3 das refeições da dieta (mesmo horário, ficha e país do aluno). As gramas são ajustadas às calorias de cada refeição do plano.
        </p>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ meal, totals }) => (
              <Card key={meal.id} className={`glass-card ${meal.active ? '' : 'opacity-60'}`}>
                <CardContent className="flex items-start gap-3 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft(toDraft(meal))}>
                    <p className="text-sm font-semibold text-foreground">{meal.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{meal.code}</Badge>
                      <Badge variant="outline" className="text-[10px]">{MEAL_SLOT_LABEL[meal.slot]}</Badge>
                      <Badge variant="outline" className="text-[10px]">{meal.origin}</Badge>
                      {meal.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-primary">{Math.round(totals.kcal)} kcal</span> · P {Math.round(totals.p)} · C {Math.round(totals.c)} · G {Math.round(totals.g)} · {meal.items.length} itens
                    </p>
                  </button>
                  <Switch checked={meal.active} onCheckedChange={(v) => toggleActive(meal, v)} aria-label={`Ativa: ${meal.name}`} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Editar refeição' : 'Nova refeição'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Código</Label>
                  <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Horário</Label>
                  <Select value={draft.slot} onValueChange={(v) => setDraft({ ...draft, slot: v as MealSlot, code: draft.id ? draft.code : nextBankCode(bank ?? [], v as MealSlot) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEAL_SLOTS.map((s) => <SelectItem key={s} value={s}>{MEAL_SLOT_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Origem</Label>
                  <Select value={draft.origin} onValueChange={(v) => setDraft({ ...draft, origin: v as MealOrigin })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEAL_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Etiquetas (separadas por vírgula)</Label>
                <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Como preparar</Label>
                <Textarea rows={3} value={draft.prep} onChange={(e) => setDraft({ ...draft, prep: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Alimentos</Label>
                {draft.items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum alimento ainda.</p>}
                {draft.items.map((it, i) => {
                  const food = index.byId.get(it.foodId);
                  return (
                    <div key={`${it.foodId}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate">{food?.name ?? 'Alimento não encontrado'}</span>
                      <Input className="h-7 w-20 text-xs" inputMode="decimal" aria-label={`Gramas de ${food?.name ?? ''}`} value={it.grams}
                        onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)) })} />
                      <span className="text-muted-foreground">{food?.portion === 'ml' ? 'ml' : 'g'}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover ${food?.name ?? ''}`}
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPicker(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar alimento
                </Button>
                {draftTotals && (
                  <p className="text-xs text-muted-foreground">
                    Total: <strong className="text-primary">{Math.round(draftTotals.kcal)} kcal</strong> · P {Math.round(draftTotals.p)} · C {Math.round(draftTotals.c)} · G {Math.round(draftTotals.g)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch id="draft-active" checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                <Label htmlFor="draft-active" className="text-xs">Ativa (pode ser escolhida nas dietas)</Label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MealBankImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        bank={bank ?? []}
        foods={foods}
        onImported={() => {
          refresh();
          qc.invalidateQueries({ queryKey: ['canonical-editor-foods'] });
          qc.invalidateQueries({ queryKey: ['foods'] });
        }}
      />

      <CanonicalFoodPickerDialog
        open={picker}
        onOpenChange={setPicker}
        foods={foods}
        title="Adicionar alimento"
        onSelect={(food) => {
          setPicker(false);
          setDraft((d) => (d ? { ...d, items: [...d.items, { foodId: food.id, grams: '100' }] } : d));
        }}
      />
    </AppLayout>
  );
};

export default BancoRefeicoes;
