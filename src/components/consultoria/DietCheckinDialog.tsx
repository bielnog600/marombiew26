import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  decideDietAction,
  scenarioLabel,
  actionLabel,
  type DietDecisionResult,
  type DietDecisionGoal,
  type DietDecisionInput,
  type DietAction,
} from '@/lib/dietDecisionEngine';
import {
  ACTION_META,
  buildApplicationRecord,
} from '@/lib/dietActionApplier';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  dietId?: string;
  goal?: DietDecisionGoal;
  onSuccess?: () => void;
}

const DietCheckinDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  studentId,
  studentName,
  dietId,
  goal,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<DietDecisionResult | null>(null);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<DietAction | null>(null);
  const [applying, setApplying] = useState(false);
  const [appliedAction, setAppliedAction] = useState<DietAction | null>(null);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fome: 'moderada',
    energia: 'normal',
    saciedade: 'ok',
    sono: 'igual',
    digestao: 'ok',
    facilidade: 'media',
    performance: 'igual',
    adesao: 'media',
    retencao: 'nenhuma',
    peso_kg: '' as string,
    cintura_cm: '' as string,
    observacoes: ''
  });

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Pull previous weight (within ~60d) for trend, if peso informado
      const pesoNum = formData.peso_kg ? Number(formData.peso_kg) : null;
      const cinturaNum = formData.cintura_cm ? Number(formData.cintura_cm) : null;
      let weightDeltaKg: number | undefined;
      let weeksBetweenWeights: number | undefined;
      if (pesoNum != null && !Number.isNaN(pesoNum)) {
        const { data: prevWeights } = await supabase
          .from('weight_logs')
          .select('peso, data')
          .eq('student_id', studentId)
          .order('data', { ascending: false })
          .limit(5);
        const prev = (prevWeights ?? []).find((w: any) => Number(w.peso) !== pesoNum);
        if (prev) {
          weightDeltaKg = pesoNum - Number(prev.peso);
          const ms = Date.now() - new Date(prev.data).getTime();
          weeksBetweenWeights = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 7)));
        }
      }

      const input: DietDecisionInput = {
        goal,
        fome: formData.fome as any,
        energia: formData.energia as any,
        saciedade: formData.saciedade as any,
        sono: formData.sono as any,
        digestao: formData.digestao as any,
        facilidade: formData.facilidade as any,
        performance: formData.performance as any,
        adesao: formData.adesao as any,
        retencao: formData.retencao as any,
        weightDeltaKg,
        weeksBetweenWeights,
      };
      const result = decideDietAction(input);

      const { data: inserted, error } = await supabase
        .from('diet_checkins')
        .insert({
          student_id: studentId,
          diet_id: dietId,
          status: 'completed',
          completed_at: new Date().toISOString(),
          fome: formData.fome,
          energia: formData.energia,
          saciedade: formData.saciedade,
          sono: formData.sono,
          digestao: formData.digestao,
          facilidade: formData.facilidade,
          performance: formData.performance,
          adesao: formData.adesao,
          retencao: formData.retencao,
          peso_kg: pesoNum,
          cintura_cm: cinturaNum,
          observacoes: formData.observacoes,
          decision_scenario: result.scenario,
          decision_action: result.action,
          decision_rationale: result.rationale,
          decision_confidence: result.confidence,
        })
        .select('id')
        .single();

      if (error) throw error;

      setDecision(result);
      setCheckinId(inserted?.id ?? null);
      toast.success('Check-in registrado. Análise gerada abaixo.');
      onSuccess?.();
    } catch (error: any) {
      console.error('Error saving checkin:', error);
      toast.error('Erro ao salvar check-in: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ============= Assisted action (Fase 4) =============
  const ACTION_PREVIEW = ACTION_META;

  const applyAction = async (action: DietAction) => {
    if (!decision || !checkinId) return;
    setApplying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const adminId = userData?.user?.id ?? null;

      // Find current active diet plan (target)
      const { data: activePlan } = await supabase
        .from('ai_plans')
        .select('id')
        .eq('student_id', studentId)
        .eq('tipo', 'dieta')
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const meta = ACTION_PREVIEW[action];
      const record = buildApplicationRecord(decision, action, {
        checkinId,
        studentId,
        adminId,
        targetPlanId: activePlan?.id ?? null,
      });

      // Persist history record (status is set inside buildApplicationRecord)
      const { data: histRow, error: histErr } = await (supabase as any)
        .from('diet_decision_applications')
        .insert(record)
        .select('id')
        .single();
      if (histErr) throw histErr;

      // If action requires generator, pre-load directive and navigate
      if (meta.needsGenerator && meta.intent) {
        try {
          sessionStorage.setItem(
            `dietDirective:${studentId}`,
            JSON.stringify({
              applicationId: histRow?.id ?? null,
              intent: meta.intent,
              action,
              actionLabel: actionLabel(action),
              rationale: decision.rationale,
              scenario: decision.scenario,
              checkinId,
              targetPlanId: activePlan?.id ?? null,
              createdAt: new Date().toISOString(),
            })
          );
        } catch {/* sessionStorage may be unavailable */}

        toast.success('Ação pendente de geração. Abrindo o gerador para revisão...');
        setAppliedAction(action);
        setConfirmAction(null);
        onOpenChange(false);
        navigate(
          `/dieta-ia?student=${studentId}&intent=${meta.intent}&checkin=${checkinId}&application=${histRow?.id ?? ''}`
        );
        return;
      }

      // Non-generator actions just close the loop
      toast.success(
        action === 'manter'
          ? 'Plano mantido. Decisão registrada no histórico.'
          : 'Caso marcado para revisão manual. Decisão registrada no histórico.'
      );
      setAppliedAction(action);
      setConfirmAction(null);
      onSuccess?.();
    } catch (err: any) {
      console.error('Erro ao aplicar ação:', err);
      toast.error('Erro ao aplicar ação: ' + (err?.message ?? 'desconhecido'));
    } finally {
      setApplying(false);
    }
  };

  const Field = ({ label, id, options, value, onChange }: any) => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-4"
      >
        {options.map((opt: any) => (
          <div key={opt.value} className="flex items-center space-x-2">
            <RadioGroupItem value={opt.value} id={`${id}-${opt.value}`} />
            <Label htmlFor={`${id}-${opt.value}`} className="text-xs cursor-pointer">{opt.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Check-in de Dieta - {studentName}
          </DialogTitle>
          <DialogDescription>
            Como o aluno sentiu a dieta nos últimos dias? (Preenchimento manual pelo consultor)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Field
            label="Fome"
            id="fome"
            value={formData.fome}
            onChange={(v: string) => setFormData(p => ({ ...p, fome: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Moderada', value: 'moderada' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <Field
            label="Energia"
            id="energia"
            value={formData.energia}
            onChange={(v: string) => setFormData(p => ({ ...p, energia: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Normal', value: 'normal' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <Field
            label="Saciedade"
            id="saciedade"
            value={formData.saciedade}
            onChange={(v: string) => setFormData(p => ({ ...p, saciedade: v }))}
            options={[
              { label: 'Ruim', value: 'ruim' },
              { label: 'Ok', value: 'ok' },
              { label: 'Boa', value: 'boa' }
            ]}
          />

          <Field
            label="Sono"
            id="sono"
            value={formData.sono}
            onChange={(v: string) => setFormData(p => ({ ...p, sono: v }))}
            options={[
              { label: 'Piorou', value: 'piorou' },
              { label: 'Igual', value: 'igual' },
              { label: 'Melhorou', value: 'melhorou' }
            ]}
          />

          <Field
            label="Digestão"
            id="digestao"
            value={formData.digestao}
            onChange={(v: string) => setFormData(p => ({ ...p, digestao: v }))}
            options={[
              { label: 'Ruim', value: 'ruim' },
              { label: 'Ok', value: 'ok' },
              { label: 'Boa', value: 'boa' }
            ]}
          />

          <Field
            label="Facilidade para seguir"
            id="facilidade"
            value={formData.facilidade}
            onChange={(v: string) => setFormData(p => ({ ...p, facilidade: v }))}
            options={[
              { label: 'Difícil', value: 'dificil' },
              { label: 'Média', value: 'media' },
              { label: 'Fácil', value: 'facil' }
            ]}
          />

          <Field
            label="Performance no treino"
            id="performance"
            value={formData.performance}
            onChange={(v: string) => setFormData(p => ({ ...p, performance: v }))}
            options={[
              { label: 'Piorou', value: 'piorou' },
              { label: 'Igual', value: 'igual' },
              { label: 'Melhorou', value: 'melhorou' }
            ]}
          />

          <Field
            label="Aderência ao plano"
            id="adesao"
            value={formData.adesao}
            onChange={(v: string) => setFormData(p => ({ ...p, adesao: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Média', value: 'media' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <Field
            label="Retenção percebida"
            id="retencao"
            value={formData.retencao}
            onChange={(v: string) => setFormData(p => ({ ...p, retencao: v }))}
            options={[
              { label: 'Nenhuma', value: 'nenhuma' },
              { label: 'Leve', value: 'leve' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="peso" className="text-sm font-semibold">Peso atual (kg)</Label>
              <Input
                id="peso"
                type="number"
                step="0.1"
                placeholder="opcional"
                value={formData.peso_kg}
                onChange={(e) => setFormData(p => ({ ...p, peso_kg: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cintura" className="text-sm font-semibold">Cintura (cm)</Label>
              <Input
                id="cintura"
                type="number"
                step="0.1"
                placeholder="opcional"
                value={formData.cintura_cm}
                onChange={(e) => setFormData(p => ({ ...p, cintura_cm: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs" className="text-sm font-semibold">Observações importantes</Label>
            <Textarea
              id="obs"
              placeholder="Ex: Teve muita fome à noite, sentiu azia com o café..."
              value={formData.observacoes}
              onChange={(e) => setFormData(p => ({ ...p, observacoes: e.target.value }))}
            />
          </div>

          {decision && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Sparkles className="h-4 w-4" />
                Análise automática
              </div>
              <div className="text-xs text-muted-foreground">
                Cenário: <span className="font-semibold text-foreground">{scenarioLabel(decision.scenario)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Ação sugerida: <span className="font-semibold text-foreground">{actionLabel(decision.action)}</span>
                <span className="ml-2 opacity-60">({Math.round(decision.confidence * 100)}% confiança)</span>
              </div>
              <p className="text-xs leading-relaxed">{decision.rationale}</p>
              {decision.signals.length > 0 && (
                <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                  {decision.signals.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}

              {/* Fase 4 — assisted action panel */}
              {!appliedAction && checkinId && (
                <div className="pt-3 mt-2 border-t border-primary/20 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Ação assistida
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setConfirmAction(decision.action)}
                      disabled={applying}
                    >
                      Aplicar: {actionLabel(decision.action)}
                    </Button>
                    {decision.action !== 'manter' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction('manter')}
                        disabled={applying}
                      >
                        Manter plano
                      </Button>
                    )}
                    {decision.action !== 'revisar_manual' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmAction('revisar_manual')}
                        disabled={applying}
                      >
                        Revisar manual
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {appliedAction && (
                <div className="pt-3 mt-2 border-t border-primary/20 text-xs text-emerald-500">
                  ✓ Ação aplicada: {actionLabel(appliedAction)}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setDecision(null); onOpenChange(false); }} disabled={loading}>
            {decision ? 'Fechar' : 'Cancelar'}
          </Button>
          {!decision && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
              Salvar e analisar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction ? ACTION_PREVIEW[confirmAction].title : ''}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {confirmAction ? ACTION_PREVIEW[confirmAction].preview : ''}
              </span>
              {decision && (
                <span className="block text-xs opacity-80 pt-2 border-t">
                  <strong>Justificativa:</strong> {decision.rationale}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) applyAction(confirmAction);
              }}
              disabled={applying}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar e aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default DietCheckinDialog;