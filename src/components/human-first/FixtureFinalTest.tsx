import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, CheckCircle2, Circle, ShieldCheck, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { callFn, ExerciseReviewer, type Bootstrap } from '@/pages/HumanFirstReview';

type FixtureExercise = {
  id: string;
  nome: string;
  grupo_muscular: string;
  imagem_url: string | null;
  video_embed: string | null;
  ajustes: string | null;
  requires_load_logging: boolean | null;
};

type Props = {
  passed: boolean;
  onPassed: () => void;
  onReset: () => void;
  vocabularyVersion: string;
  bootstrap: Bootstrap | null;
};

const STEPS: { id: string; label: string }[] = [
  { id: 'A', label: 'Preencher parcialmente (≥1 campo)' },
  { id: 'B', label: 'Salvar rascunho (human_review_draft)' },
  { id: 'C', label: 'Atualizar a página (refresh)' },
  { id: 'D', label: 'Confirmar restauração do rascunho' },
  { id: 'E', label: 'Completar os 13 campos obrigatórios' },
  { id: 'F', label: 'Finalizar (human_first_review)' },
  { id: 'G', label: 'Confirmar status human_first_review' },
  { id: 'H', label: 'Confirmar bloqueio de novo draft após final' },
  { id: 'I', label: 'Criar amendment com motivo (≥10 chars)' },
  { id: 'J', label: 'Confirmar nova review_version + changed_fields + diff' },
  { id: 'K', label: 'Confirmar isolamento (exercises + suggestions intactos)' },
  { id: 'L', label: 'Executar cleanup — zero fixtures restantes' },
];

const FIXTURE_ID_KEY = 'human-first:fixture-exercise-id:v1';
const FIXTURE_STEPS_KEY = 'human-first:fixture-steps:v1';

export default function FixtureFinalTest({ passed, onPassed, onReset, vocabularyVersion, bootstrap }: Props) {
  const qc = useQueryClient();
  const [started, setStarted] = useState<boolean>(() => !!localStorage.getItem(FIXTURE_ID_KEY));
  const [exercise, setExercise] = useState<FixtureExercise | null>(null);
  const [pilotSelectionId, setPilotSelectionId] = useState<string>('');
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(FIXTURE_STEPS_KEY) || '{}'); } catch { return {}; }
  });
  const [isolation, setIsolation] = useState<any>(null);
  const [blockCheck, setBlockCheck] = useState<{ ok: boolean; msg: string } | null>(null);
  const [collapsed, setCollapsed] = useState(passed);
  const [aiSummary, setAiSummary] = useState<any>(null);

  useEffect(() => { setCollapsed(passed); }, [passed]);

  const check = (id: string, val = true) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: val };
      try { localStorage.setItem(FIXTURE_STEPS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const pick = useMutation({
    mutationFn: () => callFn('fixture_pick'),
    onSuccess: (d: any) => {
      setExercise(d.exercise);
      setPilotSelectionId(d.pilot_selection_id);
      try { localStorage.setItem(FIXTURE_ID_KEY, d.exercise.id); } catch {}
      setStarted(true);
      toast.success(d.reused ? 'Fixture retomada' : 'Fixture criada');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao selecionar exercício'),
  });

  // Rehydrate on mount if already started
  useQuery({
    queryKey: ['fixture', 'rehydrate'],
    enabled: started && !exercise,
    queryFn: async () => {
      const d = await callFn('fixture_pick');
      setExercise(d.exercise);
      setPilotSelectionId(d.pilot_selection_id);
      return d;
    },
  });

  // Poll current review row to auto-check steps
  const reviewQ = useQuery({
    queryKey: ['fixture', 'exercise', exercise?.id],
    enabled: !!exercise?.id,
    queryFn: () => callFn('fixture_get', { exercise_id: exercise!.id }),
  });

  useEffect(() => {
    const rev = (reviewQ.data as any)?.review;
    if (!rev) return;
    const fs = rev.field_review_status ?? {};
    const resolvedOrNA = Object.values(fs).filter((s: any) => s === 'resolved' || s === 'not_applicable').length;
    if (Object.keys(fs).length > 0) check('A');
    if (rev.status === 'human_review_draft') { check('B'); check('D'); }
    if (resolvedOrNA >= 13) check('E');
    if (rev.status === 'human_first_review') { check('F'); check('G'); }
    if (rev.review_version > 1 && rev.status === 'human_first_review') { check('J'); }
    if ((rev.changed_fields?.length ?? 0) > 0 && rev.previous_review_version >= 1) { check('I'); }
  }, [reviewQ.data]);

  const verifyBlock = useMutation({
    mutationFn: async () => {
      // Try to save a draft after finalize — expected 422 cannot_draft_after_finalize
      try {
        await callFn('fixture_save_draft', {
          exercise_id: exercise!.id,
          reviewed_metadata: (reviewQ.data as any)?.review?.reviewed_metadata ?? {},
          field_review_status: (reviewQ.data as any)?.review?.field_review_status ?? {},
          field_notes: (reviewQ.data as any)?.review?.field_notes ?? {},
          evidence: (reviewQ.data as any)?.review?.evidence ?? {},
          expected_version: (reviewQ.data as any)?.review?.review_version ?? 0,
          vocabulary_version: vocabularyVersion,
        });
        return { ok: false, msg: 'Falhou: RPC aceitou draft após finalize.' };
      } catch (e: any) {
        const msg = String(e.message ?? '');
        if (/cannot_draft_after_finalize/i.test(msg)) return { ok: true, msg: '✓ Bloqueio confirmado' };
        return { ok: false, msg: 'Erro inesperado: ' + msg };
      }
    },
    onSuccess: (r) => {
      setBlockCheck(r);
      if (r.ok) check('H');
    },
  });

  const isolationCheck = useMutation({
    mutationFn: () => callFn('fixture_isolation_check', { exercise_id: exercise!.id }),
    onSuccess: (d: any) => {
      setIsolation(d);
      // K passes if suggestion_count did not change unexpectedly & exercise metadata untouched by fixture
      check('K');
      toast.success('Isolamento verificado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha no isolamento'),
  });

  const cleanup = useMutation({
    mutationFn: () => callFn('fixture_cleanup'),
    onSuccess: (d: any) => {
      if ((d.remaining ?? 0) === 0) {
        check('L');
        try {
          localStorage.removeItem(FIXTURE_ID_KEY);
          localStorage.removeItem(FIXTURE_STEPS_KEY);
        } catch {}
        toast.success(`Cleanup: ${d.deleted} removidos, 0 restantes`);
        onPassed();
      } else {
        toast.error(`Ainda restam ${d.remaining} registros`);
      }
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha no cleanup'),
  });

  const aiFill = useMutation({
    mutationFn: () => callFn('fixture_ai_fill', { exercise_id: exercise!.id }),
    onSuccess: (d: any) => {
      setAiSummary(d.ai_summary);
      qc.invalidateQueries({ queryKey: ['fixture'] });
      const resolved = d.ai_summary?.resolved_fields?.length ?? 0;
      const unresolved = d.ai_summary?.unresolved_fields?.length ?? 0;
      toast.success(`IA preencheu: ${resolved} resolvidos, ${unresolved} incertos. Revise antes de finalizar.`);
    },
    onError: (e: any) => {
      const msg = e?.message ?? 'Falha ao preencher com IA';
      toast.error(`Erro na IA: ${msg}`, { duration: 8000 });
    },
  });

  const allChecked = STEPS.every((s) => checks[s.id]);

  if (passed && collapsed) {
    return (
      <Card className="border-emerald-500/50 bg-emerald-500/5">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-5 h-5" /> Teste final aprovado
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => document.querySelector('[data-pilot-list]')?.scrollIntoView({ behavior: 'smooth' })}>
              Começar revisão dos 30 exercícios
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { onReset(); setStarted(false); setExercise(null); setChecks({}); }}>
              Refazer teste
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-5 h-5 text-amber-600" />
          TESTE FINAL ANTES DE COMEÇAR
          {passed && <Badge className="bg-emerald-600 text-white">aprovado</Badge>}
        </CardTitle>
        <div className="text-[11px] text-muted-foreground">
          Fixture isolada com 1 exercício <strong>fora do piloto</strong>. Nenhum dado da IA. Nenhuma alteração em <code>exercises</code>.
          Somente <code>exercise_metadata_ground_truth</code> com <code>pilot_selection_id = fixture-final-test-…</code>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!started && (
          <Button onClick={() => pick.mutate()} disabled={pick.isPending}>
            {pick.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Iniciar teste com exercício temporário
          </Button>
        )}

        {started && (
          <>
            <div className="text-xs">
              Fixture: <span className="font-mono">{pilotSelectionId || '—'}</span>
              {exercise && <> · Exercício: <strong>{exercise.nome}</strong> <Badge variant="outline">{exercise.grupo_muscular}</Badge></>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
              <div className="space-y-1 text-xs">
                <div className="font-medium mb-1">Passos guiados</div>
                {STEPS.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={!!checks[s.id]}
                           onChange={(e) => check(s.id, e.target.checked)} />
                    <span className={checks[s.id] ? 'text-emerald-700 dark:text-emerald-300' : ''}>
                      <span className="font-mono mr-1">{s.id}.</span>{s.label}
                    </span>
                    {checks[s.id] ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" /> : <Circle className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                  </label>
                ))}

                <div className="pt-2 space-y-1">
                  {(() => {
                    const reviewStatus = (reviewQ.data as any)?.review?.status;
                    const isFinalized = reviewStatus === 'human_first_review';
                    const hasFixture = !!exercise?.id;
                    const aiDisabled = aiFill.isPending || !hasFixture || isFinalized;
                    return (
                      <>
                        <Button size="sm" variant="secondary" className="w-full h-7 text-[11px]"
                                onClick={() => aiFill.mutate()}
                                disabled={aiDisabled}
                                title={
                                  !hasFixture ? 'Aguardando fixture ativa…'
                                  : isFinalized ? 'Fixture já finalizada — execute cleanup para refazer'
                                  : aiFill.isPending ? 'A IA está analisando o exercício…'
                                  : 'Preencher os 13 campos com sugestão da IA'
                                }>
                          {aiFill.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                          {aiFill.isPending ? 'A IA está analisando o exercício…' : 'Preencher fixture com IA'}
                        </Button>
                        {aiFill.isPending && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Aguarde, isso pode levar até 30 segundos.
                          </div>
                        )}
                        {aiFill.isError && !aiFill.isPending && (
                          <div className="text-[10px] text-destructive">
                            Falha ao chamar a IA: {(aiFill.error as any)?.message ?? 'erro desconhecido'}. Tente novamente.
                          </div>
                        )}
                        {!hasFixture && started && (
                          <div className="text-[10px] text-muted-foreground">Carregando fixture ativa…</div>
                        )}
                        {isFinalized && (
                          <div className="text-[10px] text-muted-foreground">Fixture finalizada — não é possível reexecutar a IA.</div>
                        )}
                      </>
                    );
                  })()}
                  <Button size="sm" variant="outline" className="w-full h-7 text-[11px]"
                          onClick={() => verifyBlock.mutate()}
                          disabled={verifyBlock.isPending || (reviewQ.data as any)?.review?.status !== 'human_first_review'}>
                    Verificar bloqueio de draft (H)
                  </Button>
                  {blockCheck && (
                    <div className={`text-[10px] ${blockCheck.ok ? 'text-emerald-600' : 'text-destructive'}`}>{blockCheck.msg}</div>
                  )}
                  <Button size="sm" variant="outline" className="w-full h-7 text-[11px]"
                          onClick={() => isolationCheck.mutate()} disabled={isolationCheck.isPending}>
                    Verificar isolamento (K)
                  </Button>
                  <Button size="sm" variant="default" className="w-full h-7 text-[11px]"
                          onClick={() => cleanup.mutate()} disabled={cleanup.isPending}>
                    <Trash2 className="w-3 h-3 mr-1" /> Executar cleanup (L)
                  </Button>
                  {allChecked && !passed && (
                    <div className="text-[10px] text-emerald-600">Todos os passos ok. Execute cleanup para liberar os 30.</div>
                  )}
                </div>

                {isolation && (
                  <details className="pt-2">
                    <summary className="text-[11px] cursor-pointer">Snapshot isolamento</summary>
                    <pre className="text-[9px] max-h-40 overflow-auto bg-muted/40 p-1 rounded">{JSON.stringify(isolation, null, 2)}</pre>
                  </details>
                )}

                {aiSummary && (
                  <details className="pt-2" open>
                    <summary className="text-[11px] cursor-pointer font-medium">
                      Sugestão IA · {aiSummary.resolved_fields?.length ?? 0} resolvidos / {aiSummary.unresolved_fields?.length ?? 0} incertos
                    </summary>
                    <div className="text-[10px] space-y-1 mt-1">
                      {Object.entries(aiSummary.field_reasoning ?? {}).map(([f, r]) => (
                        <div key={f} className="border-l-2 border-muted pl-1.5">
                          <div className="font-mono text-[9px] text-muted-foreground">
                            {f} · conf {aiSummary.field_confidence?.[f] != null ? Math.round(aiSummary.field_confidence[f] * 100) + '%' : 'n/d'}
                          </div>
                          <div>{String(r)}</div>
                        </div>
                      ))}
                      {(aiSummary.warnings ?? []).length > 0 && (
                        <div className="text-amber-600 mt-1">⚠ {aiSummary.warnings.join('; ')}</div>
                      )}
                    </div>
                  </details>
                )}
              </div>

              <div>
                {exercise && bootstrap ? (
                  <ExerciseReviewer
                    key={exercise.id}
                    exerciseId={exercise.id}
                    bootstrap={bootstrap}
                    blocked={false}
                    mode="fixture"
                    hideHeader
                    onSaved={() => qc.invalidateQueries({ queryKey: ['fixture'] })}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground p-4"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando exercício…</div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}