import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldCheck, EyeOff, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import {
  VOCABULARY_VERSION as LOCAL_VOCAB_VERSION,
  type ReviewFieldState,
} from '@/lib/metadataVocabularies';
import FixtureFinalTest from '@/components/human-first/FixtureFinalTest';
import {
  labelForValue,
  labelForField,
  labelChangedFields,
  displayValue,
} from '@/lib/metadataLabels';

const FIXTURE_STORAGE_KEY = 'human-first:fixture-passed:v1';

type ListItem = {
  exercise_id: string;
  nome: string;
  grupo_muscular: string;
  imagem_url: string | null;
  video_embed: string | null;
  ajustes: string | null;
  requires_load_logging: boolean | null;
  review_status: 'not_started' | 'human_review_draft' | 'human_first_review';
  review_version: number;
  resolved_count: number;
  total_fields: number;
};

export type Bootstrap = {
  pilot_selection_id: string;
  vocabulary_version: string;
  reviewer_kind: string;
  required_fields: string[];
  field_states: ReviewFieldState[];
  na_allowed_fields: string[];
  array_fields: string[];
  boolean_fields: string[];
  vocabulary: {
    equipment_hierarchy: { roots: string[]; parents: Record<string, string[]> };
    muscles_canonical: { canonical: string[]; forbidden_in_muscle_fields: string[] };
    movement_patterns: string[];
    not_applicable_rules: Record<string, string[]>;
    aliases: Record<string, string>;
  };
  items: ListItem[];
};

export type ReviewRow = {
  id: string;
  status: string;
  review_version: number;
  reviewed_metadata: Record<string, unknown> | null;
  field_review_status: Record<string, ReviewFieldState> | null;
  field_notes: Record<string, string> | null;
  evidence: Record<string, unknown> | null;
  previous_review_version?: number | null;
  changed_fields?: string[] | null;
  diff?: Record<string, unknown> | null;
};

const FIELD_LABELS: Record<string, string> = {
  movement_pattern: 'Padrão de movimento',
  exercise_class: 'Classe do exercício',
  equipment_type: 'Tipo de equipamento',
  primary_muscles: 'Músculos principais',
  secondary_muscles: 'Músculos secundários',
  stability_level: 'Nível de estabilidade',
  technical_complexity: 'Complexidade técnica',
  axial_load: 'Carga axial',
  lumbar_load: 'Exigência sobre a lombar',
  balance_requirement: 'Exigência de equilíbrio',
  fatigue_cost: 'Custo de fadiga',
  safe_to_failure: 'Pode ser realizado até à falha?',
  contraindications: 'Contraindicações',
};

const FIELD_HELP: Record<string, string> = {
  movement_pattern: 'Movimento principal realizado. Ex.: flexão do cotovelo, extensão do joelho, empurrar horizontalmente.',
  exercise_class: 'Composto utiliza várias articulações. Isolador concentra-se principalmente numa articulação.',
  equipment_type: 'Equipamento específico usado. Se o nome não define claramente, escolha "Preciso confirmar o equipamento".',
  primary_muscles: 'Músculos que realizam o movimento principal. Use apenas nomes canônicos; regiões anatômicas (joelho, coluna, core) não são permitidas.',
  secondary_muscles: 'Músculos que assistem o movimento. Deixe vazio se revisto e nenhum foi identificado.',
  stability_level: 'Quanto o equipamento e a posição estabilizam o corpo durante o exercício.',
  technical_complexity: 'Dificuldade de executar corretamente. Não é o mesmo que exercício pesado.',
  axial_load: 'Carga transmitida verticalmente através da coluna.',
  lumbar_load: 'Quanto a lombar precisa suportar ou estabilizar durante o movimento.',
  balance_requirement: 'Exigência de equilíbrio. Halteres bilaterais não tornam o exercício unilateral.',
  fatigue_cost: 'Custo sistêmico total. Considere a demanda cardiorrespiratória, não só a carga.',
  safe_to_failure: 'Indica se o sistema pode prescrever falha muscular automaticamente neste exercício. Não significa segurança geral.',
  contraindications: 'Condições em que o exercício não deve ser prescrito. Deixe vazio se revisto e sem contraindicações.',
};

const EVIDENCE_OPTIONS = [
  'exercise_name', 'legacy_muscle_group', 'image', 'video',
  'adjustments', 'professional_knowledge', 'equipment_documentation', 'insufficient_evidence',
];

const EVIDENCE_LABELS: Record<string, string> = {
  exercise_name: 'Nome do exercício',
  legacy_muscle_group: 'Grupo muscular cadastrado',
  image: 'Imagem',
  video: 'Vídeo',
  adjustments: 'Ajustes do equipamento',
  professional_knowledge: 'Conhecimento profissional',
  equipment_documentation: 'Documentação do equipamento',
  insufficient_evidence: 'Evidência insuficiente',
};

const STATE_LABELS: Record<ReviewFieldState, string> = {
  resolved: 'Sim, campo avaliado',
  not_applicable: 'Não se aplica a este exercício',
  insufficient_information: 'Não tenho informação suficiente',
  requires_video_review: 'Preciso analisar o vídeo',
  requires_equipment_confirmation: 'Preciso confirmar o equipamento',
};

const VALUE_LABELS: Record<string, string> = {
  // Exercise class
  compound: 'Composto',
  isolation: 'Isolador',
  cardio_cyclic: 'Cardio cíclico',
  metabolic_conditioning: 'Condicionamento metabólico',
  mobility: 'Mobilidade',
  core_stability: 'Estabilidade de core',
  plyometric: 'Pliométrico',
  power: 'Potência',
  cardio: 'Cardio',
  core: 'Core',
  rehabilitation: 'Reabilitação',
  other: 'Outro',
  // Levels
  none: 'Nenhuma',
  low: 'Baixa',
  moderate: 'Moderada',
  high: 'Alta',
  very_high: 'Muito alta',
  // Equipment
  barbell: 'Barra',
  dumbbell: 'Halteres',
  cable: 'Polia/Cabo',
  machine: 'Máquina',
  smith_machine: 'Smith',
  bodyweight: 'Peso corporal',
  cardio_machine: 'Máquina de cardio',
  kettlebell: 'Kettlebell',
  band: 'Elástico',
  medicine_ball: 'Medicine ball',
  bench: 'Banco',
  bar: 'Barra fixa',
  unknown: 'Não identificado',
};

// labelFor legado — mantido para retrocompatibilidade de evidências/estados.
const labelFor = (raw: string) => VALUE_LABELS[raw] ?? raw.replace(/_/g, ' ');

const EXERCISE_CLASS_OPTIONS = [
  'compound', 'isolation', 'cardio_cyclic', 'metabolic_conditioning',
  'mobility', 'core_stability', 'plyometric', 'other',
];

const LEVEL_OPTIONS = ['none', 'low', 'moderate', 'high', 'very_high'];

export async function callFn(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('human-first-review', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error) + (data.details ? ': ' + JSON.stringify(data.details) : ''));
  return data;
}

export default function HumanFirstReview() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'draft' | 'done'>('all');
  const [fixturePassed, setFixturePassed] = useState<boolean>(() => {
    try { return localStorage.getItem(FIXTURE_STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const markFixturePassed = () => {
    try { localStorage.setItem(FIXTURE_STORAGE_KEY, 'true'); } catch {}
    setFixturePassed(true);
  };

  const bootstrap = useQuery({
    queryKey: ['human-first-review', 'bootstrap'],
    queryFn: () => callFn('bootstrap') as Promise<Bootstrap>,
  });

  const data = bootstrap.data;

  // Blocking guard: vocabulary version mismatch
  const vocabMismatch = data && data.vocabulary_version !== LOCAL_VOCAB_VERSION;

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((it) => {
      if (filter === 'pending') return it.review_status === 'not_started';
      if (filter === 'draft') return it.review_status === 'human_review_draft';
      if (filter === 'done') return it.review_status === 'human_first_review';
      return true;
    });
  }, [data, filter]);

  useEffect(() => {
    if (!selectedId && data?.items.length) setSelectedId(data.items[0].exercise_id);
  }, [data, selectedId]);

  const totalResolved = data?.items.reduce((s, it) => s + it.resolved_count, 0) ?? 0;
  const totalFields = data ? data.items.length * data.required_fields.length : 0;

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-4">
        <FixtureFinalTest
          passed={fixturePassed}
          onPassed={markFixturePassed}
          onReset={() => {
            try { localStorage.removeItem(FIXTURE_STORAGE_KEY); } catch {}
            setFixturePassed(false);
          }}
          vocabularyVersion={data?.vocabulary_version ?? '—'}
          bootstrap={data ?? null}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <EyeOff className="w-5 h-5" /> Revisão Humana Cega — Etapa 1
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Piloto: pilot-2c-2026-07-12-02 · Vocabulário: {data?.vocabulary_version ?? '—'} ·
              Revisor: {data?.reviewer_kind ?? '—'}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs">
              Progresso global:{' '}
              <span className="font-mono">{totalResolved} / {totalFields}</span> campos resolvidos
            </div>
            <Progress value={totalFields ? (totalResolved / totalFields) * 100 : 0} />
            {vocabMismatch && (
              <div className="rounded-md bg-destructive/10 text-destructive p-2 text-xs">
                Versão de vocabulário divergente (servidor: {data?.vocabulary_version}, cliente: {LOCAL_VOCAB_VERSION}).
                Salvamento bloqueado.
              </div>
            )}
            {!fixturePassed && (
              <div className="rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 p-2 text-xs border border-amber-500/30">
                🔒 Conclua o <strong>Teste Final</strong> acima antes de iniciar a revisão dos 30 exercícios.
              </div>
            )}
          </CardContent>
        </Card>

        <div className={`grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 relative ${!fixturePassed ? 'pointer-events-none opacity-50 select-none' : ''}`}>
          {!fixturePassed && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto">
              <div className="bg-background/90 border rounded-lg px-4 py-2 text-xs font-medium shadow">
                Conclua o teste final antes de iniciar
              </div>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Exercícios ({data?.items.length ?? 0})</CardTitle>
              <div className="flex gap-1 flex-wrap pt-1">
                {(['all','pending','draft','done'] as const).map(f => (
                  <Button key={f} size="sm" variant={filter===f?'default':'outline'}
                          className="h-6 text-[10px] px-2" onClick={() => setFilter(f)}>{f}</Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-2 max-h-[70vh] overflow-y-auto space-y-1">
              {bootstrap.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {filteredItems.map(it => (
                <button key={it.exercise_id}
                        onClick={() => setSelectedId(it.exercise_id)}
                        className={`w-full text-left rounded-md p-2 text-xs border transition-colors ${
                          selectedId === it.exercise_id ? 'bg-muted border-primary' : 'border-transparent hover:bg-muted/50'
                        }`}>
                  <div className="font-medium truncate">{it.nome}</div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <Badge variant="outline" className="text-[9px]">{it.grupo_muscular}</Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {it.resolved_count}/{it.total_fields}
                    </span>
                  </div>
                  <StatusPill status={it.review_status} />
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedId && data ? (
            <ExerciseReviewer key={selectedId}
              exerciseId={selectedId}
              bootstrap={data}
              blocked={!!vocabMismatch}
              onSaved={() => qc.invalidateQueries({ queryKey: ['human-first-review'] })}
            />
          ) : (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Selecione um exercício.</CardContent></Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function StatusPill({ status }: { status: ListItem['review_status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: 'não iniciado', cls: 'bg-muted text-muted-foreground' },
    human_review_draft: { label: 'draft', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
    human_first_review: { label: 'finalizado', cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  };
  const s = map[status] ?? map.not_started;
  return <div className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[9px] ${s.cls}`}>{s.label}</div>;
}

export function ExerciseReviewer({
  exerciseId, bootstrap, blocked, onSaved, mode = 'pilot', hideHeader = false,
}: {
  exerciseId: string;
  bootstrap: Bootstrap;
  blocked: boolean;
  onSaved: () => void;
  mode?: 'pilot' | 'fixture';
  hideHeader?: boolean;
}) {
  const qc = useQueryClient();
  const getAction = mode === 'fixture' ? 'fixture_get' : 'get_exercise';
  const saveDraftAction = mode === 'fixture' ? 'fixture_save_draft' : 'save_draft';
  const finalizeAction = mode === 'fixture' ? 'fixture_finalize' : 'finalize';
  const amendAction = mode === 'fixture' ? 'fixture_amend_after_final' : 'amend_after_final';
  const queryKeyRoot = mode === 'fixture' ? 'human-first-fixture' : 'human-first-review';
  const detail = useQuery({
    queryKey: [queryKeyRoot, 'exercise', exerciseId],
    queryFn: () => callFn(getAction, { exercise_id: exerciseId }) as Promise<{
      exercise: {
        id: string; nome: string; grupo_muscular: string;
        imagem_url: string | null; video_embed: string | null;
        ajustes: string | null; requires_load_logging: boolean | null;
      };
      review: ReviewRow | null;
      vocabulary_version: string;
    }>,
  });

  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<Record<string, ReviewFieldState>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string[]>>({});
  const [generalNote, setGeneralNote] = useState('');
  const [version, setVersion] = useState(0);
  const [amendMode, setAmendMode] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [lastSaveResult, setLastSaveResult] = useState<any>(null);
  const isFinalized = detail.data?.review?.status === 'human_first_review';
  const editingDisabled = isFinalized && !amendMode;

  useEffect(() => {
    const r = detail.data?.review;
    setMetadata((r?.reviewed_metadata ?? {}) as Record<string, unknown>);
    setStatus((r?.field_review_status ?? {}) as Record<string, ReviewFieldState>);
    setNotes((r?.field_notes ?? {}) as Record<string, string>);
    const ev = (r?.evidence ?? {}) as Record<string, unknown>;
    setEvidence(Object.fromEntries(Object.entries(ev).filter(([k]) => k !== '_general').map(([k,v]) => [k, Array.isArray(v) ? v as string[] : []])));
    setGeneralNote(typeof (ev as any)?._general === 'string' ? (ev as any)._general : '');
    setVersion(r?.review_version ?? 0);
  }, [detail.data?.review]);

  const setField = (field: string, value: unknown) =>
    setMetadata(m => ({ ...m, [field]: value }));
  const setState = (field: string, s: ReviewFieldState) => {
    setStatus(st => ({ ...st, [field]: s }));
    if (s !== 'resolved' && s !== 'not_applicable') setField(field, null);
    if (s === 'not_applicable') setField(field, null);
  };

  const save = useMutation({
    mutationFn: async (kind: 'draft' | 'finalize' | 'amend') => {
      const payload = {
        exercise_id: exerciseId,
        reviewed_metadata: metadata,
        field_review_status: status,
        field_notes: notes,
        evidence: { ...evidence, _general: generalNote },
        expected_version: version,
        vocabulary_version: LOCAL_VOCAB_VERSION,
        ...(kind === 'amend' ? { change_reason: changeReason } : {}),
      };
      const action = kind === 'draft' ? saveDraftAction
        : kind === 'finalize' ? finalizeAction
        : amendAction;
      return callFn(action, payload);
    },
    onSuccess: (d) => {
      toast.success(`Salvo · versão ${d.new_version}`);
      setVersion(d.new_version);
      setLastSaveResult(d);
      setAmendMode(false);
      setChangeReason('');
      qc.invalidateQueries({ queryKey: [queryKeyRoot] });
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao salvar'),
  });

  if (detail.isLoading || !detail.data) {
    return <Card><CardContent className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></CardContent></Card>;
  }
  const ex = detail.data.exercise;
  const eqOptions = [
    ...bootstrap.vocabulary.equipment_hierarchy.roots,
    ...Object.values(bootstrap.vocabulary.equipment_hierarchy.parents).flat(),
  ];
  const muscles = bootstrap.vocabulary.muscles_canonical.canonical;
  const forbidden = new Set(bootstrap.vocabulary.muscles_canonical.forbidden_in_muscle_fields);
  const movementPatterns = bootstrap.vocabulary.movement_patterns;

  return (
    <Card>
      {!hideHeader && <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {ex.nome}
          <Badge variant="outline">{ex.grupo_muscular}</Badge>
          {isFinalized && (
            <Badge className="bg-emerald-600 text-white gap-1"><Lock className="w-3 h-3" />finalizado v{version}</Badge>
          )}
        </CardTitle>
        <div className="text-[11px] text-muted-foreground">
          Nenhuma previsão do classificador é exibida. Julgue apenas com nome, grupo, imagem, vídeo e ajustes.
        </div>
      </CardHeader>}
      <CardContent className="space-y-4">
        {hideHeader && (
          <div className="flex items-center gap-2 text-sm font-medium">
            {ex.nome}
            <Badge variant="outline">{ex.grupo_muscular}</Badge>
            {isFinalized && (
              <Badge className="bg-emerald-600 text-white gap-1"><Lock className="w-3 h-3" />finalizado v{version}</Badge>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="space-y-2">
            {ex.imagem_url && <img src={ex.imagem_url} alt={ex.nome} className="rounded max-h-48 object-contain bg-muted" />}
            <div><span className="text-muted-foreground">Ajustes: </span>{ex.ajustes || '—'}</div>
            <div><span className="text-muted-foreground">requires_load_logging: </span>{String(ex.requires_load_logging)}</div>
          </div>
          {ex.video_embed && (
            <div className="aspect-video">
              <iframe src={ex.video_embed} className="w-full h-full rounded" allowFullScreen />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {bootstrap.required_fields.map(field => (
            <FieldRow key={field}
              field={field}
              state={status[field]}
              value={metadata[field]}
              note={notes[field] ?? ''}
              evidence={evidence[field] ?? []}
              vocab={{ eqOptions, muscles, forbidden: Array.from(forbidden), movementPatterns }}
              naAllowed={bootstrap.na_allowed_fields.includes(field)}
              disabled={editingDisabled}
              onState={(s) => setState(field, s)}
              onValue={(v) => setField(field, v)}
              onNote={(n) => setNotes(nn => ({ ...nn, [field]: n }))}
              onEvidence={(ev) => setEvidence(e => ({ ...e, [field]: ev }))}
            />
          ))}
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Nota geral do exercício</div>
          <Textarea value={generalNote} disabled={editingDisabled}
            onChange={(e) => setGeneralNote(e.target.value)}
            placeholder="Observações gerais, dúvidas, evidências transversais…" />
        </div>

        {isFinalized && amendMode && (
          <div className="space-y-1">
            <div className="text-xs font-medium">Motivo do amendment (mínimo 10 caracteres)</div>
            <Textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Descreva o motivo desta alteração após finalização…" />
          </div>
        )}

        <div className="flex gap-2 items-center flex-wrap">
          {!isFinalized && (
            <>
              <Button variant="outline" size="sm" disabled={blocked || save.isPending}
                      onClick={() => save.mutate('draft')}>
                <Save className="w-4 h-4 mr-1" /> Salvar rascunho
              </Button>
              <Button size="sm" disabled={blocked || save.isPending}
                      onClick={() => save.mutate('finalize')}>
                <ShieldCheck className="w-4 h-4 mr-1" /> Finalizar revisão
              </Button>
            </>
          )}
          {isFinalized && !amendMode && (
            <Button variant="outline" size="sm" onClick={() => setAmendMode(true)}>
              Iniciar amendment
            </Button>
          )}
          {isFinalized && amendMode && (
            <>
              <Button size="sm" disabled={blocked || save.isPending || changeReason.trim().length < 10}
                      onClick={() => save.mutate('amend')}>
                <Save className="w-4 h-4 mr-1" /> Salvar amendment
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setAmendMode(false); setChangeReason(''); }}>
                Cancelar
              </Button>
            </>
          )}
          <span className="text-[10px] text-muted-foreground ml-2">versão atual: v{version}</span>
        </div>

        {lastSaveResult && (lastSaveResult.changed_fields?.length || lastSaveResult.diff) && (
          <div className="rounded-md border p-2 text-[11px] bg-muted/40 space-y-1">
            <div>Última operação: v{lastSaveResult.previous_version ?? 0} → v{lastSaveResult.new_version}</div>
            <div>
              Campos alterados:{' '}
              {labelChangedFields(lastSaveResult.changed_fields).length > 0 ? (
                <span>{labelChangedFields(lastSaveResult.changed_fields).join(', ')}</span>
              ) : (
                <span className="text-muted-foreground">nenhum</span>
              )}
            </div>
            {lastSaveResult.diff && (
              <details>
                <summary className="cursor-pointer">Diferenças (clique para expandir)</summary>
                <div className="space-y-1 mt-1">
                  {Object.entries(lastSaveResult.diff as Record<string, any>).map(([field, change]) => {
                    const before = (change as any)?.before;
                    const after = (change as any)?.after;
                    return (
                      <div key={field} className="border-l-2 border-muted pl-2">
                        <div className="font-medium">{labelForField(field)}</div>
                        <div className="text-muted-foreground">
                          <span className="line-through">{displayValue(field, before)}</span>
                          {' → '}
                          <span className="text-foreground">{displayValue(field, after)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldRow({
  field, state, value, note, evidence, vocab, naAllowed, disabled,
  onState, onValue, onNote, onEvidence,
}: {
  field: string;
  state: ReviewFieldState | undefined;
  value: unknown;
  note: string;
  evidence: string[];
  vocab: { eqOptions: string[]; muscles: string[]; forbidden: string[]; movementPatterns: string[] };
  naAllowed: boolean;
  disabled: boolean;
  onState: (s: ReviewFieldState) => void;
  onValue: (v: unknown) => void;
  onNote: (n: string) => void;
  onEvidence: (ev: string[]) => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2 text-xs">
      <div>
        <div className="flex items-center gap-1.5">
          <div className="font-semibold text-sm">{FIELD_LABELS[field] ?? field}</div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {FIELD_HELP[field]}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium">Consegue avaliar este campo?</div>
        <Select value={state ?? ''} onValueChange={(v) => onState(v as ReviewFieldState)} disabled={disabled}>
          <SelectTrigger className="w-full max-w-md h-8 text-xs"><SelectValue placeholder="Selecione uma opção…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="resolved">{STATE_LABELS.resolved}</SelectItem>
            {naAllowed && <SelectItem value="not_applicable">{STATE_LABELS.not_applicable}</SelectItem>}
            <SelectItem value="insufficient_information">{STATE_LABELS.insufficient_information}</SelectItem>
            <SelectItem value="requires_video_review">{STATE_LABELS.requires_video_review}</SelectItem>
            <SelectItem value="requires_equipment_confirmation">{STATE_LABELS.requires_equipment_confirmation}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state === 'resolved' && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium">Valor</div>
          <FieldValueEditor field={field} value={value} vocab={vocab} disabled={disabled} onValue={onValue} />
        </div>
      )}

      <div>
        <div className="text-[11px] font-medium">Em que informação você se baseou?</div>
        <div className="text-[10px] text-muted-foreground mb-1">Pode selecionar mais de uma opção.</div>
        <div className="flex gap-1 flex-wrap">
          {EVIDENCE_OPTIONS.map(opt => {
            const active = evidence.includes(opt);
            return (
              <Button key={opt} size="sm" variant={active ? 'default' : 'outline'}
                      className="h-7 text-[11px] px-2" disabled={disabled}
                      onClick={() => onEvidence(active ? evidence.filter(e => e !== opt) : [...evidence, opt])}>
                {EVIDENCE_LABELS[opt] ?? opt}
              </Button>
            );
          })}
        </div>
      </div>

      <Input placeholder="Nota do campo (opcional)" value={note} disabled={disabled}
             onChange={(e) => onNote(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

function FieldValueEditor({
  field, value, vocab, disabled, onValue,
}: {
  field: string;
  value: unknown;
  vocab: { eqOptions: string[]; muscles: string[]; forbidden: string[]; movementPatterns: string[] };
  disabled: boolean;
  onValue: (v: unknown) => void;
}) {
  if (field === 'safe_to_failure') {
    return (
      <Select value={value === true ? 'true' : value === false ? 'false' : ''}
              onValueChange={(v) => onValue(v === 'true')} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Sim / Não" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Sim</SelectItem>
          <SelectItem value="false">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (field === 'equipment_type') {
    return <SingleSelect options={vocab.eqOptions} value={value as string} disabled={disabled} onValue={onValue} />;
  }
  if (field === 'movement_pattern') {
    return <SingleSelect options={vocab.movementPatterns} value={value as string} disabled={disabled} onValue={onValue} />;
  }
  if (field === 'exercise_class') {
    return <SingleSelect options={EXERCISE_CLASS_OPTIONS} value={value as string} disabled={disabled} onValue={onValue} />;
  }
  if (['stability_level','technical_complexity','axial_load','lumbar_load','balance_requirement','fatigue_cost'].includes(field)) {
    return <SingleSelect options={LEVEL_OPTIONS} value={value as string} disabled={disabled} onValue={onValue} />;
  }
  if (field === 'primary_muscles' || field === 'secondary_muscles') {
    const arr = Array.isArray(value) ? value as string[] : [];
    return (
      <div className="space-y-1">
        <div className="flex gap-1 flex-wrap">
          {vocab.muscles.map(m => {
            const active = arr.includes(m);
            return (
              <Button key={m} size="sm" variant={active ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2" disabled={disabled}
                      onClick={() => onValue(active ? arr.filter(x => x !== m) : [...arr, m])}>
                {labelFor(m)}
              </Button>
            );
          })}
        </div>
        <div className="text-[9px] text-muted-foreground">
          Proibidos (regiões anatômicas): {vocab.forbidden.map(labelFor).join(', ')}
        </div>
        <div className="text-[9px] text-muted-foreground">
          Vazio = revisto e sem músculos identificados. Clique nos músculos aplicáveis. Selecionados: [{arr.map(labelFor).join(', ')}]
        </div>
      </div>
    );
  }
  if (field === 'contraindications') {
    const arr = Array.isArray(value) ? value as string[] : [];
    return (
      <div className="space-y-1">
        <Input placeholder="digite e Enter para adicionar (ou deixe vazio)" disabled={disabled}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   const v = (e.target as HTMLInputElement).value.trim();
                   if (v) { onValue([...arr, v]); (e.target as HTMLInputElement).value = ''; }
                 }
               }} className="h-8 text-xs" />
        <div className="flex gap-1 flex-wrap">
          {arr.length === 0 && <span className="text-[10px] text-muted-foreground">[] — revisto e sem contraindicações</span>}
          {arr.map((c, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] cursor-pointer"
                   onClick={() => !disabled && onValue(arr.filter((_, j) => j !== i))}>{c} ✕</Badge>
          ))}
        </div>
      </div>
    );
  }
  return <Input value={String(value ?? '')} disabled={disabled} onChange={(e) => onValue(e.target.value)} className="h-8 text-xs" />;
}

function SingleSelect({ options, value, disabled, onValue }: {
  options: string[]; value: string | undefined; disabled: boolean; onValue: (v: string) => void;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onValue} disabled={disabled}>
      <SelectTrigger className="h-8 text-xs w-60"><SelectValue placeholder="Selecione…" /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{labelFor(o)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}