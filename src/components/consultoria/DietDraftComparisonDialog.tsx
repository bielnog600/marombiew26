import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, Check, Trash2, FileText, Loader2, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { parseSections, ParsedMeal, ParsedFood } from '@/lib/dietResultParser';

interface PlanLite {
  id: string;
  titulo: string;
  conteudo: string;
  version: number;
  created_at: string;
  draft_source?: string | null;
  draft_reason?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: PlanLite | null;
  draft: PlanLite | null;
  rationale?: string | null;
  busy?: boolean;
  onPublish: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}

function num(v?: string | number | null): number {
  if (v == null) return 0;
  const s = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function extractMealsFromMarkdown(md: string): ParsedMeal[] {
  const sections = parseSections(md ?? '');
  const meals: ParsedMeal[] = [];
  for (const s of sections) if (s.type === 'meal' && s.meals) meals.push(...s.meals);
  return meals;
}

function totalsFromMeals(meals: ParsedMeal[]) {
  let kcal = 0, p = 0, c = 0, g = 0;
  for (const m of meals) {
    kcal += num(m.totalKcal);
    p += num(m.totalP);
    c += num(m.totalC);
    g += num(m.totalG);
    // fallback: sum foods
    if (!m.totalKcal) {
      for (const f of m.foods) {
        kcal += num(f.kcal);
        p += num(f.p);
        c += num(f.c);
        g += num(f.g);
      }
    }
  }
  return { kcal, p, c, g };
}

function normalizeKey(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function diffFoods(a: ParsedFood[], b: ParsedFood[]) {
  const aMap = new Map(a.map((f) => [normalizeKey(f.food), f]));
  const bMap = new Map(b.map((f) => [normalizeKey(f.food), f]));
  const removed: ParsedFood[] = [];
  const added: ParsedFood[] = [];
  const changed: { from: ParsedFood; to: ParsedFood }[] = [];
  for (const [k, f] of aMap) {
    if (!bMap.has(k)) removed.push(f);
    else {
      const bf = bMap.get(k)!;
      if (num(f.qty) !== num(bf.qty) || num(f.kcal) !== num(bf.kcal)) {
        changed.push({ from: f, to: bf });
      }
    }
  }
  for (const [k, f] of bMap) if (!aMap.has(k)) added.push(f);
  return { removed, added, changed };
}

const DeltaPill: React.FC<{ from: number; to: number; suffix?: string }> = ({ from, to, suffix = '' }) => {
  const diff = to - from;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const cls = diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-amber-500' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? '+' : ''}
      {Math.round(diff * 10) / 10}
      {suffix}
    </span>
  );
};

const DietDraftComparisonDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  current,
  draft,
  rationale,
  busy,
  onPublish,
  onKeep,
  onDiscard,
}) => {
  const currentMeals = useMemo(() => extractMealsFromMarkdown(current?.conteudo ?? ''), [current]);
  const draftMeals = useMemo(() => extractMealsFromMarkdown(draft?.conteudo ?? ''), [draft]);
  const cTot = useMemo(() => totalsFromMeals(currentMeals), [currentMeals]);
  const dTot = useMemo(() => totalsFromMeals(draftMeals), [draftMeals]);

  const mealPairs = useMemo(() => {
    const max = Math.max(currentMeals.length, draftMeals.length);
    const pairs: { name: string; cur?: ParsedMeal; nxt?: ParsedMeal }[] = [];
    for (let i = 0; i < max; i++) {
      const cur = currentMeals[i];
      const nxt = draftMeals[i];
      pairs.push({ name: nxt?.name ?? cur?.name ?? `Refeição ${i + 1}`, cur, nxt });
    }
    return pairs;
  }, [currentMeals, draftMeals]);

  const allChanges = useMemo(() => {
    const removed: string[] = [];
    const added: string[] = [];
    const changed: string[] = [];
    for (const p of mealPairs) {
      const d = diffFoods(p.cur?.foods ?? [], p.nxt?.foods ?? []);
      removed.push(...d.removed.map((f) => `${p.name}: ${f.food}`));
      added.push(...d.added.map((f) => `${p.name}: ${f.food}`));
      changed.push(...d.changed.map((c) => `${p.name}: ${c.from.food} (${c.from.qty} → ${c.to.qty})`));
    }
    return { removed, added, changed };
  }, [mealPairs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Comparar versões da dieta
          </DialogTitle>
          <DialogDescription>
            Atual <Badge variant="outline" className="mx-1">v{current?.version ?? 1}</Badge>
            <ArrowRight className="inline h-3 w-3 mx-1" />
            Rascunho <Badge variant="outline" className="mx-1">v{draft?.version ?? 2}</Badge>
            {draft?.draft_source && (
              <span className="ml-2 text-xs text-muted-foreground">
                · origem: {draft.draft_source === 'manual' ? 'manual' : 'automática'}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-6">
            {/* Bloco 1 — Resumo nutricional */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Resumo nutricional
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { label: 'Kcal', from: cTot.kcal, to: dTot.kcal, suffix: '' },
                    { label: 'Proteína', from: cTot.p, to: dTot.p, suffix: 'g' },
                    { label: 'Carbo', from: cTot.c, to: dTot.c, suffix: 'g' },
                    { label: 'Gordura', from: cTot.g, to: dTot.g, suffix: 'g' },
                  ] as const
                ).map((m) => (
                  <div key={m.label} className="rounded-lg border border-border/50 bg-secondary/30 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm text-muted-foreground line-through">
                        {Math.round(m.from)}{m.suffix}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-lg font-semibold">{Math.round(m.to)}{m.suffix}</span>
                    </div>
                    <DeltaPill from={m.from} to={m.to} suffix={m.suffix} />
                  </div>
                ))}
              </div>
            </section>

            {/* Bloco 2 — Mudanças por refeição */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Mudanças por refeição
              </h3>
              <div className="space-y-2">
                {mealPairs.map((pair, idx) => {
                  const d = diffFoods(pair.cur?.foods ?? [], pair.nxt?.foods ?? []);
                  const cKcal = num(pair.cur?.totalKcal);
                  const nKcal = num(pair.nxt?.totalKcal);
                  const noChanges = d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
                  return (
                    <div key={idx} className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-medium">
                          {pair.name}
                          {pair.cur?.time && <span className="text-xs text-muted-foreground ml-2">{pair.cur.time}</span>}
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground line-through">{Math.round(cKcal)} kcal</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium">{Math.round(nKcal)} kcal</span>
                          <DeltaPill from={cKcal} to={nKcal} />
                        </div>
                      </div>
                      {noChanges ? (
                        <p className="text-xs text-muted-foreground mt-2">Sem alterações de alimentos.</p>
                      ) : (
                        <div className="mt-2 grid sm:grid-cols-3 gap-2 text-xs">
                          {d.removed.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-amber-500 mb-1">Removidos</p>
                              <ul className="space-y-0.5">
                                {d.removed.map((f, i) => (
                                  <li key={i} className="text-muted-foreground line-through truncate">{f.food}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {d.added.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-emerald-500 mb-1">Adicionados</p>
                              <ul className="space-y-0.5">
                                {d.added.map((f, i) => (
                                  <li key={i} className="truncate">{f.food} <span className="text-muted-foreground">{f.qty}</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {d.changed.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-blue-500 mb-1">Porções alteradas</p>
                              <ul className="space-y-0.5">
                                {d.changed.map((c, i) => (
                                  <li key={i} className="truncate">
                                    {c.from.food}: <span className="text-muted-foreground">{c.from.qty}</span> → {c.to.qty}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Bloco 3 — Mudanças principais */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Mudanças principais
              </h3>
              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-amber-500 font-medium mb-1">Removidos ({allChanges.removed.length})</p>
                  <ul className="space-y-0.5 max-h-40 overflow-auto">
                    {allChanges.removed.slice(0, 30).map((s, i) => <li key={i} className="truncate">{s}</li>)}
                    {allChanges.removed.length === 0 && <li className="text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-emerald-500 font-medium mb-1">Adicionados ({allChanges.added.length})</p>
                  <ul className="space-y-0.5 max-h-40 overflow-auto">
                    {allChanges.added.slice(0, 30).map((s, i) => <li key={i} className="truncate">{s}</li>)}
                    {allChanges.added.length === 0 && <li className="text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                  <p className="text-blue-500 font-medium mb-1">Alterados ({allChanges.changed.length})</p>
                  <ul className="space-y-0.5 max-h-40 overflow-auto">
                    {allChanges.changed.slice(0, 30).map((s, i) => <li key={i} className="truncate">{s}</li>)}
                    {allChanges.changed.length === 0 && <li className="text-muted-foreground">—</li>}
                  </ul>
                </div>
              </div>
            </section>

            {/* Bloco 4 — Justificativa da IA */}
            {(rationale || draft?.draft_reason) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Justificativa da IA
                </h3>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  {rationale ?? draft?.draft_reason}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-border/50">
          <Button variant="outline" onClick={onDiscard} disabled={busy} className="text-destructive border-destructive/30">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Descartar rascunho
          </Button>
          <Button variant="outline" onClick={onKeep} disabled={busy}>
            <FileText className="h-3 w-3" />
            Manter plano atual
          </Button>
          <Button onClick={onPublish} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Publicar nova versão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DietDraftComparisonDialog;