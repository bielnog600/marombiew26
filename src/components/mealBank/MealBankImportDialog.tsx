/**
 * Importar planilha do banco de refeições: lê o arquivo no navegador,
 * mostra a pré-visualização e só grava ao confirmar (tudo ou nada).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Loader2, Plus, Upload } from 'lucide-react';
import type { FoodRecord } from '@/lib/nutritionEngine';
import { MEAL_SLOT_LABEL, type BankMeal } from '@/lib/mealBank';
import {
  FOOD_MATCH_VIA_LABEL,
  buildFoodMatcher,
  buildImportPlan,
  defaultResolution,
  effectiveResolution,
  importSummaryText,
  isResolutionComplete,
  parseBankWorkbook,
  type FoodAliasRow,
  type FoodResolution,
  type ImportFoodEntry,
  type ImportStatus,
  type ParsedWorkbook,
} from '@/lib/mealBank/spreadsheet';
import { readBankFile } from '@/lib/mealBank/spreadsheetFile';
import CanonicalFoodPickerDialog from '@/components/diet/CanonicalFoodPickerDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bank: BankMeal[];
  foods: FoodRecord[];
  onImported: () => void;
}

const STATUS_LABEL: Record<ImportStatus, string> = {
  nova: 'Nova',
  atualizada: 'Atualizada',
  sem_mudanca: 'Sem mudança',
  erro: 'Erro',
};
const STATUS_CLASS: Record<ImportStatus, string> = {
  nova: 'border-primary/60 text-primary',
  atualizada: 'border-foreground/40 text-foreground',
  sem_mudanca: 'text-muted-foreground',
  erro: 'border-destructive/60 text-destructive',
};

type Filter = 'todas' | ImportStatus;

const numInput = (v: string): number | null => {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));

/** Ligado automaticamente: nome da planilha → alimento do banco, com opção de mudar. */
const LinkedFoodRow: React.FC<{
  item: ImportFoodEntry;
  food: FoodRecord | undefined;
  overridden: boolean;
  onChangeFood: () => void;
  onCreate: (() => void) | null;
  onUndo: () => void;
}> = ({ item, food, overridden, onChangeFood, onCreate, onUndo }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-2" data-testid="linked-food">
    <div className="min-w-0 text-xs">
      <p className="text-foreground">
        "{item.name}" <span className="text-muted-foreground">→</span> <strong className="text-primary">{food?.name ?? '—'}</strong>
      </p>
      <p className="text-[11px] text-muted-foreground">
        {overridden ? 'mudado por você' : item.auto.kind === 'link' ? FOOD_MATCH_VIA_LABEL[item.auto.via] : ''} · em {item.usedIn.join(', ')}
      </p>
    </div>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onChangeFood} aria-label={`Mudar ${item.name}`}>
        <Link2 className="h-3 w-3" /> Mudar
      </Button>
      {onCreate && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onCreate}><Plus className="h-3 w-3" /> Criar novo</Button>}
      {overridden && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onUndo}>Desfazer</Button>}
    </div>
  </div>
);

/** Novo alimento: criado com os valores da aba Alimentos (ou preenchidos aqui quando faltam). */
const NewFoodRow: React.FC<{
  item: ImportFoodEntry;
  value: FoodResolution | undefined;
  overridden: boolean;
  onChange: (r: FoodResolution) => void;
  onLink: () => void;
  onUndo: () => void;
}> = ({ item, value, overridden, onChange, onLink, onUndo }) => {
  const create = value?.kind === 'create' ? value : null;
  const complete = isResolutionComplete(value);
  const [draft, setDraft] = useState({
    kcal: String(create?.kcal ?? item.def?.kcal ?? ''),
    p: String(create?.p ?? item.def?.p ?? ''),
    c: String(create?.c ?? item.def?.c ?? ''),
    g: String(create?.g ?? item.def?.g ?? ''),
  });
  const push = (d: typeof draft) => {
    setDraft(d);
    onChange({ kind: 'create', name: item.name, kcal: numInput(d.kcal), p: numInput(d.p), c: numInput(d.c), g: numInput(d.g) });
  };
  const needsValues = !item.def || [item.def.kcal, item.def.p, item.def.c, item.def.g].some((v) => v === null);
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-2" data-testid="new-food">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-foreground">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {create ? <>{fmt(create.kcal)} kcal · P {fmt(create.p)} · C {fmt(create.c)} · G {fmt(create.g)} /100 g</> : 'Faltam os valores por 100 g'} · em {item.usedIn.join(', ')}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onLink} aria-label={`Ligar ${item.name} a um alimento`}>
            <Link2 className="h-3 w-3" /> Ligar a…
          </Button>
          {overridden && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onUndo}>Desfazer</Button>}
        </div>
      </div>
      {needsValues && (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {([['kcal', 'kcal'], ['p', 'Proteína'], ['c', 'Carbo'], ['g', 'Gordura']] as const).map(([k, label]) => (
              <div key={k} className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">{label}/100 g</Label>
                <Input className="h-8 text-xs" inputMode="decimal" aria-label={`${label} por 100 g de ${item.name}`} value={draft[k]}
                  onChange={(e) => push({ ...draft, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          {!complete && <p className="text-[11px] text-destructive">A aba Alimentos não tem os valores deste alimento — preencha para importar.</p>}
        </>
      )}
    </div>
  );
};

const MealBankImportDialog: React.FC<Props> = ({ open, onOpenChange, bank, foods, onImported }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [aliases, setAliases] = useState<FoodAliasRow[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, FoodResolution | undefined>>({});
  const [deactivate, setDeactivate] = useState(false);
  const [filter, setFilter] = useState<Filter>('todas');
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(''); setParsed(null); setResolutions({}); setDeactivate(false); setFilter('todas'); setResult(null);
    supabase.from('food_aliases').select('alias, food_id').then(({ data, error }) => {
      if (error) console.error('[MealBankImport] apelidos', error);
      setAliases((data ?? []) as FoodAliasRow[]);
    });
  }, [open]);

  const matcher = useMemo(() => buildFoodMatcher(foods, aliases), [foods, aliases]);
  const plan = useMemo(
    () => (parsed ? buildImportPlan({ parsed, bank, matcher, resolutions, deactivateMissing: deactivate }) : null),
    [parsed, bank, matcher, resolutions, deactivate],
  );
  const toImport = plan ? plan.meals.filter((m) => m.status === 'nova' || m.status === 'atualizada') : [];
  const canImport = !!plan && plan.pendingCount === 0 && (toImport.length > 0 || plan.toDeactivate.length > 0) && !saving;
  const visible = plan ? plan.meals.filter((m) => filter === 'todas' || m.status === filter) : [];
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const foodRows = useMemo(() => {
    const linked: Array<{ item: ImportFoodEntry; foodId: string }> = [];
    const created: Array<{ item: ImportFoodEntry; value: FoodResolution | undefined }> = [];
    let sameName = 0;
    for (const item of plan?.foods ?? []) {
      const override = resolutions[item.key];
      const r = effectiveResolution(item, override);
      if (r?.kind === 'link') {
        if (!override && item.auto.kind === 'link' && item.auto.via === 'exato') sameName += 1;
        else linked.push({ item, foodId: r.foodId });
      } else created.push({ item, value: r });
    }
    return { linked, created, sameName };
  }, [plan, resolutions]);
  const setOverride = (key: string, r: FoodResolution | undefined) => setResolutions((prev) => {
    const next = { ...prev };
    if (r) next[key] = r; else delete next[key];
    return next;
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setFileName(file.name);
    try {
      const sheets = await readBankFile(file);
      const p = parseBankWorkbook(sheets);
      setParsed(p);
      setResolutions({});
    } catch (err) {
      console.error('[MealBankImport] leitura', err);
      setParsed({ meals: [], foodDefs: new Map(), fileErrors: ['Não consegui ler este arquivo. Use .xlsx ou .csv.'], usedIngredientsSheet: false });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirm = async () => {
    if (!plan || !canImport) return;
    setSaving(true);
    const meals = toImport.map((m) => ({
      code: m.code,
      slot: m.row.slot,
      name: m.row.name,
      origin: m.row.origin,
      tags: m.row.tags,
      prep: m.row.prep,
      items: m.items.map((i) => ({ food_id: i.foodId, grams: i.grams })),
    }));
    const { data, error } = await supabase.rpc('import_meal_bank', {
      _foods: plan.foodsToCreate.map((f) => ({ temp_id: f.tempId, name: f.name, kcal: f.kcal, p: f.p, c: f.c, g: f.g })),
      _aliases: plan.aliasesToSave,
      _meals: meals,
      _deactivate_codes: plan.toDeactivate.map((m) => m.code),
    } as any);
    setSaving(false);
    if (error) {
      console.error('[MealBankImport] importar', error);
      setResult(null);
      toast.error('Não deu para importar. Nada foi gravado — tenta de novo.');
      return;
    }
    const r = (data ?? {}) as { novas?: number; atualizadas?: number; alimentos_criados?: number; desativadas?: number };
    setResult(importSummaryText({ novas: r.novas ?? 0, atualizadas: r.atualizadas ?? 0, alimentosCriados: r.alimentos_criados ?? 0, desativadas: r.desativadas ?? 0 }));
    onImported();
  };

  const filters: Array<[Filter, string, number]> = plan
    ? [
        ['todas', 'Todas', plan.meals.length],
        ['nova', 'Novas', plan.counts.nova],
        ['atualizada', 'Atualizadas', plan.counts.atualizada],
        ['sem_mudanca', 'Sem mudança', plan.counts.sem_mudanca],
        ['erro', 'Erros', plan.counts.erro],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha</DialogTitle>
          <DialogDescription>
            Abas Refeições, Ingredientes e Alimentos (.xlsx) ou a aba Refeições em .csv. As calorias são recalculadas pela tabela de alimentos. Nada é gravado até você confirmar.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-4 text-center" data-testid="import-result">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="text-sm font-semibold text-foreground">Importação concluída</p>
            <p className="text-sm text-muted-foreground">{result}</p>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="import-file"
              onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={reading}>
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {fileName ? `Trocar arquivo (${fileName})` : 'Escolher arquivo'}
            </Button>

            {parsed?.fileErrors.map((e) => (
              <p key={e} className="flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</p>
            ))}

            {plan && plan.meals.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1.5" data-testid="import-counts">
                  <Badge variant="outline" className={STATUS_CLASS.nova}>{plan.counts.nova} novas</Badge>
                  <Badge variant="outline" className={STATUS_CLASS.atualizada}>{plan.counts.atualizada} atualizadas</Badge>
                  <Badge variant="outline" className={STATUS_CLASS.sem_mudanca}>{plan.counts.sem_mudanca} sem mudança</Badge>
                  {plan.counts.erro > 0 && <Badge variant="outline" className={STATUS_CLASS.erro}>{plan.counts.erro} com erro (não entram)</Badge>}
                  {foodRows.linked.length > 0 && <Badge variant="secondary">{foodRows.linked.length} alimentos ligados</Badge>}
                  {plan.foodsToCreate.length > 0 && <Badge variant="secondary">{plan.foodsToCreate.length} alimentos novos</Badge>}
                </div>

                {plan.foods.length > 0 && (
                  <section className="space-y-3" data-testid="import-foods">
                    <p className="text-[11px] text-muted-foreground">
                      Alimentos ligados e criados automaticamente — só para conferir.
                      {foodRows.sameName > 0 && <> {foodRows.sameName} com o mesmo nome do banco.</>}
                    </p>
                    {foodRows.linked.length > 0 && (
                      <div className="space-y-1.5" data-testid="linked-foods">
                        <h3 className="text-sm font-semibold text-foreground">Ligados automaticamente ({foodRows.linked.length})</h3>
                        {foodRows.linked.map(({ item, foodId }) => (
                          <LinkedFoodRow key={item.key} item={item} food={foodById.get(foodId)} overridden={!!resolutions[item.key]}
                            onChangeFood={() => setSearchFor(item.key)}
                            onCreate={defaultResolution(item) ? () => setOverride(item.key, defaultResolution(item)) : null}
                            onUndo={() => setOverride(item.key, undefined)} />
                        ))}
                      </div>
                    )}
                    {foodRows.created.length > 0 && (
                      <div className="space-y-1.5" data-testid="new-foods">
                        <h3 className="text-sm font-semibold text-foreground">
                          Novos alimentos ({foodRows.created.length}){plan.pendingCount > 0 && <span className="text-destructive"> · {plan.pendingCount} sem valores</span>}
                        </h3>
                        {foodRows.created.map(({ item, value }) => (
                          <NewFoodRow key={item.key} item={item} value={value} overridden={!!resolutions[item.key]}
                            onChange={(r) => setOverride(item.key, r)}
                            onLink={() => setSearchFor(item.key)}
                            onUndo={() => setOverride(item.key, undefined)} />
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <label className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-xs">
                  <Checkbox checked={deactivate} onCheckedChange={(v) => setDeactivate(v === true)} aria-label="Desativar refeições que não estão no arquivo" />
                  <span>
                    Desativar refeições que não estão no arquivo
                    {deactivate && plan.toDeactivate.length > 0 && (
                      <span className="block text-muted-foreground">{plan.toDeactivate.length}: {plan.toDeactivate.map((m) => m.code).join(', ')}</span>
                    )}
                  </span>
                </label>

                <section className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {filters.map(([k, label, n]) => (
                      <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setFilter(k)}>
                        {label} ({n})
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1.5" data-testid="import-meals">
                    {visible.map((m) => (
                      <div key={`${m.row.rowNumber}`} className="rounded-lg border border-border bg-background/60 p-2.5" data-testid={`import-meal-${m.code || m.row.rowNumber}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{m.row.name || '(sem nome)'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {m.code || `linha ${m.row.rowNumber}`}{m.codeAssigned && ' (código novo)'} · {m.row.slot ? MEAL_SLOT_LABEL[m.row.slot] : m.row.slotLabel || '—'} · {m.row.origin ?? '—'}
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</Badge>
                        </div>
                        {m.status !== 'erro' && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-primary">{Math.round(m.totals.kcal)} kcal</span> · P {Math.round(m.totals.p)} · C {Math.round(m.totals.c)} · G {Math.round(m.totals.g)}
                            {m.changes.length > 0 && <> · muda: {m.changes.join(', ')}</>}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {m.items.map((i, idx) => (
                            <span key={idx} className={i.foodId ? '' : 'text-destructive'}>{idx > 0 && ' · '}{i.name} {i.grams} g</span>
                          ))}
                        </p>
                        {m.row.errors.map((e) => <p key={e} className="mt-0.5 text-[11px] text-destructive">{e}</p>)}
                        {m.row.warnings.map((w) => <p key={w} className="mt-0.5 text-[11px] text-primary">{w}</p>)}
                        {m.status !== 'erro' && m.pendingFoods.length > 0 && <p className="mt-0.5 text-[11px] text-destructive">Faltam valores de: {m.pendingFoods.join(', ')}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {!parsed && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" /> Dica: use “Exportar planilha” para baixar o banco atual no formato certo.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={confirm} disabled={!canImport} data-testid="import-confirm">
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Importar {toImport.length} {toImport.length === 1 ? 'refeição' : 'refeições'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <CanonicalFoodPickerDialog
        open={!!searchFor}
        onOpenChange={(o) => !o && setSearchFor(null)}
        foods={foods}
        title="Ligar a…"
        onSelect={(food) => {
          const key = searchFor;
          setSearchFor(null);
          if (key) setOverride(key, { kind: 'link', foodId: food.id });
        }}
      />
    </Dialog>
  );
};

export default MealBankImportDialog;
