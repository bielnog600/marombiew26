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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Check, X, RefreshCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const LOW_RISK_FIELDS = new Set([
  'movement_pattern', 'exercise_class', 'equipment_type',
  'primary_muscles', 'secondary_muscles',
]);

const HIGH_RISK_FIELDS = new Set([
  'safe_to_failure', 'axial_load', 'lumbar_load', 'contraindications',
  'technical_complexity', 'fatigue_cost', 'balance_requirement', 'stability_level',
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
  field_confidence: Record<string, number> | null;
  matched_rules: string[] | null;
  created_at: string;
};

type Exercise = Record<string, unknown> & {
  id: string;
  nome: string;
  grupo_muscular: string;
  metadata_status: string | null;
};

export default function ExerciseMetadataReview() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const { data: suggestions = [], isLoading, refetch } = useQuery({
    queryKey: ['ems', filterStatus, filterGroup, minConfidence],
    queryFn: async () => {
      let q = supabase
        .from('exercise_metadata_suggestions' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filterStatus) q = q.eq('status', filterStatus);
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
    mutationFn: async ({ id, fields }: { id: string; fields: string[] | null }) => {
      const { data, error } = await supabase.rpc(
        'approve_exercise_metadata_suggestion' as never,
        { _suggestion_id: id, _fields: fields },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Sugestão aprovada');
      qc.invalidateQueries({ queryKey: ['ems'] });
      qc.invalidateQueries({ queryKey: ['ems-exercises'] });
    },
    onError: (e: Error) => toast.error(`Falha ao aprovar: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc(
        'reject_exercise_metadata_suggestion' as never,
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
                    <Badge variant={s.confidence != null && s.confidence >= 0.9 ? 'default' : 'secondary'}>
                      confiança {(s.confidence ?? 0).toFixed(2)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Metadados atuais</div>
                      <div className="text-xs bg-muted/40 rounded p-2 font-mono max-h-40 overflow-auto">
                        {ex ? proposedKeys.map((k) => (
                          <div key={k}>{k}: {JSON.stringify((ex as Record<string, unknown>)[k]) ?? 'null'}</div>
                        )) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Metadados propostos</div>
                      <div className="space-y-1 text-xs">
                        {proposedKeys.map((k) => {
                          const isHigh = HIGH_RISK_FIELDS.has(k);
                          const conf = fc[k];
                          return (
                            <label key={k} className={`flex items-center gap-2 rounded px-2 py-1 ${isHigh ? 'bg-amber-500/10' : 'bg-emerald-500/5'}`}>
                              <Checkbox
                                checked={selected.has(k)}
                                onCheckedChange={() => toggleField(s.id, k)}
                                disabled={s.status !== 'pending'}
                              />
                              <span className="font-mono">{k}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-mono">{JSON.stringify(meta[k])}</span>
                              {conf != null && (
                                <Badge variant="outline" className="ml-auto text-[10px]">
                                  {conf.toFixed(2)}
                                </Badge>
                              )}
                              {isHigh && <ShieldAlert className="w-3 h-3 text-amber-500" />}
                            </label>
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

                  {s.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ id: s.id, fields: null })}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="w-4 h-4 mr-1" /> Aprovar tudo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.size === 0 || approveMutation.isPending}
                        onClick={() => approveMutation.mutate({ id: s.id, fields: Array.from(selected) })}
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