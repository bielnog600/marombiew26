import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { loadPrices, type PriceRow } from './aiCostsApi';

const db = supabase as any;
type Field = 'input_per_mtok' | 'output_per_mtok' | 'cache_write_per_mtok' | 'cache_read_per_mtok' | 'per_1k_chars'
  | 'long_context_threshold' | 'long_input_per_mtok' | 'long_output_per_mtok';
const FIELDS: { key: Field; label: string; nullable: boolean }[] = [
  { key: 'input_per_mtok', label: 'Entrada /1M', nullable: false },
  { key: 'output_per_mtok', label: 'Saída /1M', nullable: false },
  { key: 'cache_write_per_mtok', label: 'Cache grava /1M', nullable: true },
  { key: 'cache_read_per_mtok', label: 'Cache lê /1M', nullable: true },
  { key: 'per_1k_chars', label: '/1k caracteres', nullable: true },
  { key: 'long_context_threshold', label: 'Longo acima de (tokens)', nullable: true },
  { key: 'long_input_per_mtok', label: 'Entrada longa /1M', nullable: true },
  { key: 'long_output_per_mtok', label: 'Saída longa /1M', nullable: true },
];
type Draft = Record<Field, string>;
const toDraft = (r: PriceRow): Draft => Object.fromEntries(FIELDS.map((f) => [f.key, r[f.key] == null ? '' : String(r[f.key])])) as Draft;

/** Editable price list (USD). Changes apply to calls made from now on. */
export default function AiPriceTable() {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState({ provider: 'anthropic', model: '' });

  const reload = async () => {
    const list = await loadPrices();
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.id, toDraft(r)])));
  };
  useEffect(() => { void reload(); }, []);

  const save = async (r: PriceRow) => {
    const d = drafts[r.id];
    const patch: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const raw = d[f.key].replace(',', '.').trim();
      if (raw === '') {
        if (!f.nullable) { toast.error(`Preencha "${f.label}" de ${r.model}.`); return; }
        patch[f.key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { toast.error(`"${f.label}" de ${r.model} precisa ser um número.`); return; }
      patch[f.key] = f.key === 'long_context_threshold' ? Math.round(n) : n;
    }
    const { error } = await db.from('ai_model_prices').update(patch).eq('id', r.id);
    if (error) toast.error('Não foi possível salvar o preço.');
    else { toast.success(`Preço de ${r.model} salvo.`); void reload(); }
  };

  const add = async () => {
    const model = adding.model.trim();
    if (!model) { toast.error('Escreva o nome do modelo.'); return; }
    const { error } = await db.from('ai_model_prices').insert({ provider: adding.provider, model });
    if (error) toast.error('Não foi possível adicionar (já existe?).');
    else { setAdding({ ...adding, model: '' }); void reload(); }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="font-semibold">Tabela de preços (US$)</p>
          <p className="text-xs text-muted-foreground">Preços oficiais de hoje já preenchidos. Ao mudar, só as próximas chamadas usam o novo valor.</p>
        </div>
        {!rows ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3 space-y-2" data-testid="ai-price-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-all">{r.model}</p>
                    <p className="text-xs text-muted-foreground">{r.provider}{r.notes ? ` · ${r.notes}` : ''}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => save(r)} aria-label={`Salvar preço de ${r.model}`}>
                    <Save className="h-3.5 w-3.5" /> Salvar
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">{f.label}</span>
                      <Input inputMode="decimal" className="h-8" value={drafts[r.id]?.[f.key] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: { ...prev[r.id], [f.key]: e.target.value } }))} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Fornecedor</span>
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={adding.provider}
                  onChange={(e) => setAdding({ ...adding, provider: e.target.value })}>
                  <option value="anthropic">anthropic</option>
                  <option value="openai">openai</option>
                  <option value="lovable_ai">lovable_ai</option>
                  <option value="elevenlabs">elevenlabs</option>
                </select>
              </label>
              <label className="space-y-1 flex-1 min-w-[10rem]">
                <span className="text-[11px] text-muted-foreground">Modelo</span>
                <Input className="h-9" value={adding.model} onChange={(e) => setAdding({ ...adding, model: e.target.value })} placeholder="ex.: claude-sonnet-5-5" />
              </label>
              <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={add}><Plus className="h-3.5 w-3.5" /> Adicionar modelo</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
