import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Check, X, RefreshCcw, ShieldAlert, Pencil, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

const HIGH_RISK_FIELDS = new Set([
  'safe_to_failure', 'axial_load', 'lumbar_load', 'contraindications',
  'technical_complexity', 'fatigue_cost', 'balance_requirement', 'stability_level',
]);

const REQUIRED_FIELDS = new Set([
  'movement_pattern','exercise_class','equipment_type','stability_level',
  'technical_complexity','axial_load','lumbar_load','balance_requirement',
  'fatigue_cost','safe_to_failure','primary_muscles',
]);

type Suggestion = {
  id: string;
  exercise_id: string;
  proposed_metadata: Record<string, unknown>;
  confidence: number | null;
  status: string;
  source: string | null;
  reasoning: string | null;
  classifier_version: string | null;
  rules_version: string | null;
  field_confidence: Record<string, number | null> | null;
  matched_rules: string[] | null;
  approved_fields: string[] | null;
  remaining_fields: string[] | null;
  applied_metadata: Record<string, unknown> | null;
  reviewer_changes: Record<string, { from: unknown; to: unknown }> | null;
  approval_type: string | null;
  created_at: string;
};

type Exercise = Record<string, unknown> & {
  id: string;
  nome: string;
  grupo_muscular: string;
  metadata_status: string | null;
  metadata_field_source: Record<string, string> | null;
  metadata_field_confidence: Record<string, number | null> | null;
  metadata_field_verified: Record<string, boolean> | null;
};

type Completeness = {
  status: 'unclassified' | 'partial' | 'complete';
  missingRequiredFields: string[];
  missingSafetyFields: string[];
  approvedFields: string[];
  completionPercentage: number;
  canBeUsedForMethodSelection: boolean;
};

export default function ExerciseMetadataReview() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [editingField, setEditingField] = useState<Record<string, string | null>>({});

  const { data: suggestions = [], isLoading, refetch } = useQuery({
    queryKey: ['ems', filterStatus, filterGroup, minConfidence],
    queryFn: async () => {
      let q = supabase
        .from('exercise_metadata_suggestions' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filterStatus && filterStatus !== 'actionable') {
        q = q.eq('status', filterStatus);
      } else if (filterStatus === 'actionable') {
        q = q.in('status', ['pending','partially_approved']);
      }
      if (minConfidence) q = q.gte('confidence', Number(minConfidence));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  const exerciseIds = useMemo(
    () => Array.from(new Set(suggestions.map((s) => s.exercise_id))),
    [suggestions],
  );

  const { data: exercises = [] } = useQuery({
    enabled: exerciseIds.length > 0,
    queryKey: ['ems-exercises', exerciseIds.sort().join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .in('id', exerciseIds);
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
  });

  const exMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const e of exercises) s.add(e.grupo_muscular);
    return Array.from(s).sort();
  }, [exercises]);

  const visible = useMemo(() => {
    return suggestions.filter((s) => {
      const ex = exMap.get(s.exercise_id);
      if (filterGroup && ex?.grupo_muscular !== filterGroup) return false;
      return true;
    });
  }, [suggestions, exMap, filterGroup]);

  const classifyMutation = useMutation({
    mutationFn: async (action: 'classify_unclassified' | 'classify_group') => {
      const body: Record<string, unknown> = { action };
      if (action === 'classify_group') body.grupo_muscular = filterGroup;
      const { data, error } = await supabase.functions.invoke('exercise-metadata', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: { inserted?: number; skipped?: number }) => {
      toast.success(`Sugestões geradas: ${data?.inserted ?? 0} (ignoradas: ${data?.skipped ?? 0})`);
      qc.invalidateQueries({ queryKey: ['ems'] });
    },
    onError: (e: Error) => toast.error(`Falha na classificação: ${e.message}`),
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id, fields, overridesJson,
    }: {
      id: string; fields: string[] | null;
      overridesJson?: Record<string, unknown> | null;
    }) => {
      const rpc = supabase.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: Error | null }>;
      const { data, error } = await rpc('approve_exercise_metadata_suggestion', {
        _suggestion_id: id,
        _fields: fields,
        _overrides: overridesJson && Object.keys(overridesJson).length ? overridesJson : null,
        _override_confidences: null,
      });
      if (error) throw error;
      // Then fetch completeness for the exercise
      const sug = suggestions.find((s) => s.id === id);
      if (sug) {
        await rpc('evaluate_metadata_completeness', { _exercise_id: sug.exercise_id });
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success('Sugestão aplicada');
      setOverrides((prev) => { const c = { ...prev }; delete c[vars.id]; return c; });
      setSelectedFields((prev) => { const c = { ...prev }; delete c[vars.id]; return c; });
      qc.invalidateQueries({ queryKey: ['ems'] });
      qc.invalidateQueries({ queryKey: ['ems-exercises'] });
      qc.invalidateQueries({ queryKey: ['ems-completeness'] });
    },
    onError: (e: Error) => toast.error(`Falha ao aprovar: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: Error | null }>)(
        'reject_exercise_metadata_suggestion',
        { _suggestion_id: id, _reason: reason },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Sugestão rejeitada');
      qc.invalidateQueries({ queryKey: ['ems'] });
    },
    onError: (e: Error) => toast.error(`Falha ao rejeitar: ${e.message}`),
  });

  const toggleField = (sugId: string, field: string) => {
    setSelectedFields((prev) => {
      const cur = new Set(prev[sugId] ?? []);
      if (cur.has(field)) cur.delete(field); else cur.add(field);
      return { ...prev, [sugId]: cur };
    });
  };

  const setOverride = (sugId: string, field: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [sugId]: { ...(prev[sugId] ?? {}), [field]: value },
    }));
  };
  const removeOverride = (sugId: string, field: string) => {
    setOverrides((prev) => {
      const cur = { ...(prev[sugId] ?? {}) };
      delete cur[field];
      return { ...prev, [sugId]: cur };
    });
  };

  const buildOverrideJson = (sugId: string, meta: Record<string, unknown>) => {
    const raw = overrides[sugId] ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === '' || v == null) continue;
      const orig = meta[k];
      let parsed: unknown = v;
      if (Array.isArray(orig)) parsed = v.split(',').map((x) => x.trim()).filter(Boolean);
      else if (typeof orig === 'boolean') parsed = v === 'true';
      out[k] = parsed;
    }
    return out;
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Revisão de Metadados de Exercícios
            </h1>
            <p className="text-sm text-muted-foreground">
              Fase 2B — regras determinísticas. Sugestões nunca alteram a tabela de exercícios sem aprovação humana.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => classifyMutation.mutate('classify_unclassified')}
              disabled={classifyMutation.isPending}
            >
              {classifyMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-2" />}
              Classificar não classificados
            </Button>
            <Button
              variant="outline"
              disabled={!filterGroup || classifyMutation.isPending}
              onClick={() => classifyMutation.mutate('classify_group')}
            >
              Classificar grupo filtrado
            </Button>
            <Button variant="ghost" onClick={() => refetch()}>
              <RefreshCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="approved">approved</SelectItem>
                  <SelectItem value="rejected">rejected</SelectItem>
                  <SelectItem value="superseded">superseded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Grupo muscular</label>
              <Select value={filterGroup || 'all'} onValueChange={(v) => setFilterGroup(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Confiança mínima</label>
              <Input
                type="number"
                step="0.05"
                min="0" max="1"
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value)}
                className="w-32"
                placeholder="0.0"
              />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {visible.length} sugestão(ões)
            </div>
          </CardContent>
        </Card>

        {isLoading && <div className="text-center py-8"><Loader2 className="animate-spin inline" /></div>}

        <div className="space-y-4">
          {visible.map((s) => {
            const ex = exMap.get(s.exercise_id);
            const meta = s.proposed_metadata ?? {};
            const fc = s.field_confidence ?? {};
            const selected = selectedFields[s.id] ?? new Set<string>();
            const proposedKeys = Object.keys(meta);
            const isActionable = s.status === 'pending' || s.status === 'partially_approved';
            const alreadyApproved = new Set(s.approved_fields ?? []);
            const ovMap = overrides[s.id] ?? {};
            const overrideJson = buildOverrideJson(s.id, meta as Record<string, unknown>);
            const willApplyFields = selected.size > 0 ? Array.from(selected) : proposedKeys;
            const willResultInFullApproval = REQUIRED_FIELDS_MET(ex, meta, willApplyFields);
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg">{ex?.nome ?? s.exercise_id}</CardTitle>
                      <div className="text-xs text-muted-foreground">
                        {ex?.grupo_muscular} · status atual: <b>{ex?.metadata_status ?? 'unclassified'}</b>
                        {' · '}sugestão: {s.status} · classifier {s.classifier_version} · rules {s.rules_version}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.confidence != null && s.confidence >= 0.9 ? 'default' : 'secondary'}>
                        conf. média {(s.confidence ?? 0).toFixed(2)}
                      </Badge>
                      <CompletenessBadge exerciseId={s.exercise_id} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        Metadados atuais (na tabela exercises)
                      </div>
                      <div className="text-xs bg-muted/40 rounded p-2 font-mono max-h-40 overflow-auto">
                        {ex ? proposedKeys.map((k) => {
                          const src = ex.metadata_field_source?.[k];
                          const ver = ex.metadata_field_verified?.[k];
                          const conf = ex.metadata_field_confidence?.[k];
                          return (
                            <div key={k} className="flex justify-between gap-2">
                              <span>{k}: {JSON.stringify((ex as Record<string, unknown>)[k]) ?? 'null'}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {src ?? '—'}{ver ? ' ✓' : ''}{conf != null ? ` c=${Number(conf).toFixed(2)}` : ''}
                              </span>
                            </div>
                          );
                        }) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Metadados propostos</div>
                      <div className="space-y-1 text-xs">
                        {proposedKeys.map((k) => {
                          const isHigh = HIGH_RISK_FIELDS.has(k);
                          const conf = fc[k];
                          const done = alreadyApproved.has(k);
                          const overridden = k in ovMap && ovMap[k] !== '';
                          const editing = editingField[s.id] === k;
                          return (
                            <div
                              key={k}
                              className={`rounded px-2 py-1 ${isHigh ? 'bg-amber-500/10' : 'bg-emerald-500/5'} ${done ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={selected.has(k)}
                                  onCheckedChange={() => toggleField(s.id, k)}
                                  disabled={!isActionable || done}
                                />
                                <span className="font-mono">{k}</span>
                                {REQUIRED_FIELDS.has(k) && <Badge variant="outline" className="text-[9px]">req</Badge>}
                                {isHigh && <ShieldAlert className="w-3 h-3 text-amber-500" />}
                                <span className="text-muted-foreground">→</span>
                                {editing ? (
                                  <Input
                                    autoFocus
                                    defaultValue={ovMap[k] ?? String(meta[k] ?? '')}
                                    onBlur={(e) => {
                                      setOverride(s.id, k, e.target.value);
                                      setEditingField((p) => ({ ...p, [s.id]: null }));
                                    }}
                                    className="h-6 text-xs font-mono flex-1"
                                  />
                                ) : (
                                  <span className={`font-mono ${overridden ? 'text-amber-600 font-semibold' : ''}`}>
                                    {overridden
                                      ? JSON.stringify(ovMap[k])
                                      : JSON.stringify(meta[k])}
                                  </span>
                                )}
                                {isActionable && !done && (
                                  <div className="ml-auto flex items-center gap-1">
                                    {overridden && (
                                      <button
                                        type="button"
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => removeOverride(s.id, k)}
                                        title="Remover override"
                                      >
                                        <Undo2 className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="text-xs text-muted-foreground hover:text-foreground"
                                      onClick={() => setEditingField((p) => ({ ...p, [s.id]: editing ? null : k }))}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                {conf != null && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {conf.toFixed(2)}
                                  </Badge>
                                )}
                                {done && <Badge className="text-[10px]">já aprovado</Badge>}
                              </div>
                              {overridden && (
                                <div className="text-[10px] text-muted-foreground pl-8">
                                  original: <span className="font-mono">{JSON.stringify(meta[k])}</span>
                                  {' → '}confidence será <b>indefinida</b> (revisão manual)
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {s.matched_rules && s.matched_rules.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <b>Regras:</b> {s.matched_rules.join(', ')}
                    </div>
                  )}
                  {s.reasoning && (
                    <div className="text-xs text-muted-foreground italic">{s.reasoning}</div>
                  )}

                  {s.approved_fields && s.approved_fields.length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Histórico desta sugestão — aprovado: {s.approved_fields.join(', ')}
                      {s.remaining_fields && s.remaining_fields.length > 0
                        ? ` · pendente: ${s.remaining_fields.join(', ')}`
                        : ''}
                    </div>
                  )}

                  {isActionable && (
                    <div className="rounded border p-2 bg-muted/30 text-xs space-y-1">
                      <div className="font-semibold">Resumo antes de aprovar</div>
                      <div>Campos a aplicar: <b>{willApplyFields.join(', ') || '—'}</b></div>
                      <div>Overrides manuais: <b>{Object.keys(overrideJson).length}</b></div>
                      <div>
                        Status resultante do exercício:{' '}
                        <b>{willResultInFullApproval ? 'approved' : 'pending_review'}</b>
                        {' · '}utilizável pelo motor:{' '}
                        <b>{willResultInFullApproval ? 'sim' : 'não'}</b>
                      </div>
                    </div>
                  )}

                  {isActionable && (
                    <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({
                          id: s.id, fields: null, overridesJson: overrideJson,
                        })}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending
                          ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          : <Check className="w-4 h-4 mr-1" />}
                        {s.status === 'partially_approved' ? 'Aprovar restantes' : 'Aprovar tudo'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.size === 0 || approveMutation.isPending}
                        onClick={() => approveMutation.mutate({
                          id: s.id,
                          fields: Array.from(selected),
                          overridesJson: overrideJson,
                        })}
                      >
                        Aprovar {selected.size} campo(s)
                      </Button>
                      <div className="flex-1 min-w-[240px] flex gap-2">
                        <Textarea
                          placeholder="Motivo da rejeição (obrigatório)"
                          value={rejectionReasons[s.id] ?? ''}
                          onChange={(e) =>
                            setRejectionReasons((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          rows={1}
                          className="min-h-[36px]"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!rejectionReasons[s.id] || rejectMutation.isPending}
                          onClick={() =>
                            rejectMutation.mutate({ id: s.id, reason: rejectionReasons[s.id] })
                          }
                        >
                          <X className="w-4 h-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!isLoading && visible.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma sugestão. Clique em <b>Classificar não classificados</b> para gerar.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}