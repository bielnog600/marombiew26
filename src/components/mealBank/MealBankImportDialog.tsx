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
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Loader2, Plus, Upload } from 'lucide-react';
import type { FoodRecord } from '@/lib/nutritionEngine';
import { MEAL_SLOT_LABEL, type BankMeal } from '@/lib/mealBank';
import {
  buildFoodMatcher,
  buildImportPlan,
  defaultResolution,
  importSummaryText,
  isResolutionComplete,
  parseBankWorkbook,
  suggestFoods,
  unmatchedFoods,
  type FoodAliasRow,
  type FoodResolution,
  type ImportStatus,
  type ParsedWorkbook,
  type UnmatchedFood,
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
  atualizada: 'border-accent-foreground/40 text-foreground',
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

const UnmatchedFoodRow: React.FC<{
  item: UnmatchedFood;
  foods: FoodRecord[];
  value: FoodResolution | undefined;
  onChange: (r: FoodResolution | undefined) => void;
  onSearch: () => void;
}> = ({ item, foods, value, onChange, onSearch }) => {
  const suggestions = useMemo(() => suggestFoods(item.name, foods), [item.name, foods]);
  const linked = value?.kind === 'link' ? foods.find((f) => f.id === value.foodId) : null;
  const done = isResolutionComplete(value);
  const create = value?.kind === 'create' ? value : null;
  const [draft, setDraft] = useState({
    name: create?.name ?? item.name,
    kcal: String(create?.kcal ?? item.def?.kcal ?? ''),
    p: String(create?.p ?? item.def?.p ?? ''),
    c: String(create?.c ?? item.def?.c ?? ''),
    g: String(create?.g ?? item.def?.g ?? ''),
  });
  const pushCreate = (d: typeof draft) => {
    setDraft(d);
    onChange({ kind: 'create', name: d.name, kcal: numInput(d.kcal), p: numInput(d.p), c: numInput(d.c), g: numInput(d.g) });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/60 p-2.5" data-testid="unmatched-food">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">"{item.name}"</p>
          <p className="text-[11px] text-muted-foreground">Em {item.usedIn.join(', ')}</p>
        </div>
        <Badge variant="outline" className={done ? 'border-primary/60 text-primary' : 'border-destructive/60 text-destructive'}>
          {done ? (value?.kind === 'link' ? 'Ligado' : 'Será criado') : 'Pendente'}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={value?.kind === 'link' || !value ? 'secondary' : 'ghost'} className="h-7 gap-1 text-xs"
          onClick={() => onChange(linked ? value : undefined)}>
          <Link2 className="h-3 w-3" /> Ligar a…
        </Button>
        <Button size="sm" variant={value?.kind === 'create' ? 'secondary' : 'ghost'} className="h-7 gap-1 text-xs"
          onClick={() => pushCreate(draft)}>
          <Plus className="h-3 w-3" /> Criar alimento
        </Button>
      </div>
      {value?.kind !== 'create' ? (
        <div className="space-y-1.5">
          {linked && <p className="text-xs">Ligado a <strong className="text-primary">{linked.name}</strong></p>}
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((f) => (
              <Button key={f.id} size="sm" variant={linked?.id === f.id ? 'default' : 'outline'} className="h-7 text-xs"
                onClick={() => onChange({ kind: 'link', foodId: f.id })}>
                {f.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onSearch}>Buscar outro…</Button>
          </div>
          {suggestions.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum alimento parecido. Busque outro ou crie um novo.</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Input className="h-8 text-xs" aria-label={`Nome do alimento novo ${item.name}`} value={draft.name}
            onChange={(e) => pushCreate({ ...draft, name: e.target.value })} />
          <div className="grid grid-cols-4 gap-1.5">
            {([['kcal', 'kcal'], ['p', 'Proteína'], ['c', 'Carbo'], ['g', 'Gordura']] as const).map(([k, label]) => (
              <div key={k} className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">{label}/100 g</Label>
                <Input className="h-8 text-xs" inputMode="decimal" aria-label={`${label} por 100 g de ${item.name}`} value={draft[k]}
                  onChange={(e) => pushCreate({ ...draft, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          {!item.def && <p className="text-[11px] text-muted-foreground">A planilha não tem este alimento na aba Alimentos — preencha os valores por 100 g.</p>}
        </div>
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
  const unmatched = useMemo(() => (parsed ? unmatchedFoods(parsed, matcher) : []), [parsed, matcher]);
  const plan = useMemo(
    () => (parsed ? buildImportPlan({ parsed, bank, matcher, resolutions, deactivateMissing: deactivate }) : null),
    [parsed, bank, matcher, resolutions, deactivate],
  );
  const toImport = plan ? plan.meals.filter((m) => m.status === 'nova' || m.status === 'atualizada') : [];
  const canImport = !!plan && plan.pendingCount === 0 && (toImport.length > 0 || plan.toDeactivate.length > 0) && !saving;
  const visible = plan ? plan.meals.filter((m) => filter === 'todas' || m.status === filter) : [];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setFileName(file.name);
    try {
      const sheets = await readBankFile(file);
      const p = parseBankWorkbook(sheets);
      setParsed(p);
      const initial: Record<string, FoodResolution | undefined> = {};
      for (const u of unmatchedFoods(p, matcher)) initial[u.key] = defaultResolution(u);
      setResolutions(initial);
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
      import('sonner').then(({ toast }) => toast.error('Não deu para importar. Nada foi gravado — tenta de novo.'));
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
                  {plan.foodsToCreate.length > 0 && <Badge variant="secondary">{plan.foodsToCreate.length} alimentos a criar</Badge>}
                </div>

                {unmatched.length > 0 && (
                  <section className="space-y-2" data-testid="unmatched-foods">
                    <h3 className="text-sm font-semibold text-foreground">
                      Alimentos não encontrados ({unmatched.length}){plan.pendingCount > 0 && <span className="text-destructive"> · {plan.pendingCount} pendente(s)</span>}
                    </h3>
                    {unmatched.map((u) => (
                      <UnmatchedFoodRow key={u.key} item={u} foods={foods} value={resolutions[u.key]}
                        onChange={(r) => setResolutions((prev) => ({ ...prev, [u.key]: r }))}
                        onSearch={() => setSearchFor(u.key)} />
                    ))}
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
                        {m.status !== 'erro' && m.pendingFoods.length > 0 && <p className="mt-0.5 text-[11px] text-destructive">Falta ligar: {m.pendingFoods.join(', ')}</p>}
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
          if (key) setResolutions((prev) => ({ ...prev, [key]: { kind: 'link', foodId: food.id } }));
        }}
      />
    </Dialog>
  );
};

export default MealBankImportDialog;
