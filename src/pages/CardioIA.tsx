import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, HeartPulse, Sparkles, Bike, Activity, Footprints, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AiWizard from '@/components/AiWizard';
import {
  parseCardioPayload,
  isWeeklyPlan,
  type CardioProtocol,
  type CardioPayload,
  type CardioWeeklyPlan,
  type CardioModality,
  MODALITY_LABEL,
  STRUCTURE_LABEL,
  formatDurationFromSec,
  totalCardioDurationSec,
} from '@/lib/cardioParser';
import {
  CARDIO_INTENSITIES, CARDIO_STYLES, CARDIO_FREQUENCIES, CARDIO_DURATIONS,
  CARDIO_SPEEDS, CARDIO_INCLINES, CARDIO_TIMES, CARDIO_BIKE_LEVELS, CARDIO_ROUNDS, CARDIO_BIKE_POSITIONS,
  buildCardioRequestBody, buildCardioPlanInsert, loadCardioWizardData,
} from '@/lib/officeWizard/cardioWizard';

type StudentCtx = Record<string, any>;

const MODALITIES: { value: CardioModality; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'passadeira', label: 'Passadeira', icon: Footprints },
  { value: 'bike', label: 'Bike', icon: Bike },
  { value: 'eliptica', label: 'Elíptica', icon: Activity },
  { value: 'escada', label: 'Escada', icon: TrendingUp },
];

const INTENSITIES = CARDIO_INTENSITIES;
const STYLES = CARDIO_STYLES;
const FREQUENCIES = CARDIO_FREQUENCIES;
const DURATIONS = CARDIO_DURATIONS;

const CardioIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPlanId = searchParams.get('edit');

  const [studentCtx, setStudentCtx] = useState<StudentCtx | null>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [hrZones, setHrZones] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Multi-seleção: vazio = automático (IA escolhe entre todas)
  const [modalities, setModalities] = useState<CardioModality[]>([]);
  const [frequency, setFrequency] = useState('3');
  const [intensity, setIntensity] = useState('auto');
  const [style, setStyle] = useState('auto');
  const [duration, setDuration] = useState('auto');
  const [notes, setNotes] = useState('');
  const [eq, setEq] = useState<Record<string, string>>({});
  const setEqField = (k: string, v: string) => setEq(prev => ({ ...prev, [k]: v }));
  const [generating, setGenerating] = useState(false);
  const [payload, setPayload] = useState<CardioPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const toggleModality = (m: CardioModality) => {
    setModalities(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (editPlanId) loadEditPlan();
  }, [editPlanId]);

  useEffect(() => {
    if (payload && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [payload]);

  const loadEditPlan = async () => {
    const { data } = await supabase.from('ai_plans').select('*').eq('id', editPlanId!).maybeSingle();
    if (data?.conteudo) {
      const p = parseCardioPayload(data.conteudo);
      if (p) setPayload(p);
    }
  };

  const loadStudentData = async () => {
    setLoading(true);
    const data = await loadCardioWizardData(supabase, studentId!);
    setStudentCtx(data.studentCtx);
    setStudentName(data.studentName);
    if (data.hrZones) setHrZones(data.hrZones);
    setLoading(false);
  };

  const generateCardio = async () => {
    if (!studentCtx) return;
    setGenerating(true);
    setPayload(null);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cardio-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ ...buildCardioRequestBody({ modalities, frequency, intensity, style, duration, notes, eq }, studentCtx, hrZones), studentId }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429) toast.error('Muitas requisições. Aguarde um momento.');
        else if (resp.status === 402) toast.error('Créditos esgotados. Adicione créditos no workspace.');
        else throw new Error(data?.error || `Erro ${resp.status}`);
        return;
      }
      if (data?.weekly) {
        setPayload(data.weekly as CardioWeeklyPlan);
        toast.success(`Plano semanal gerado: ${data.weekly.protocols?.length} sessões!`);
      } else if (data?.protocol) {
        setPayload(data.protocol as CardioProtocol);
        toast.success('Cardio gerado!');
      } else {
        throw new Error('Plano não retornado');
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao gerar cardio');
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = async () => {
    if (!payload) return;
    setSaving(true);
    const isWeekly = isWeeklyPlan(payload);
    const titulo = isWeekly
      ? `Plano Semanal de Cardio (${payload.protocols.length} sessões)`
      : payload.title || `Cardio ${MODALITY_LABEL[payload.modality]} - ${new Date().toLocaleDateString('pt-BR')}`;
    const conteudo = JSON.stringify(payload, null, 2);

    if (editPlanId) {
      const { error } = await supabase.from('ai_plans').update({
        conteudo,
        titulo: `${titulo} (editado)`,
      }).eq('id', editPlanId);
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Cardio atualizado!');
    } else {
      const { error } = await supabase.from('ai_plans').insert(buildCardioPlanInsert(studentId!, payload));
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Cardio salvo!');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AppLayout title="Cardio IA">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Cardio IA - ${studentName}`}>
      <div className="space-y-6 animate-fade-in pb-24">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        <Card className="glass-card border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <HeartPulse className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Cardio IA</h2>
                <p className="text-xs text-muted-foreground">
                  Cardio personalizado para {studentName}
                  {hrZones ? ' • Zonas Karvonen carregadas ✓' : ' • sem zonas Karvonen'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {(() => {
          const STEP_TITLES = ['Modalidades', 'Frequência', 'Estilo, Intensidade e Duração', 'Observações'];
          const stepValid = [
            true, // modalidades opcional (vazio = automático)
            !!frequency,
            !!style && !!intensity && !!duration,
            true, // observações opcional
          ];
          const canGenerate = !!frequency;
          return (
            <AiWizard
              steps={STEP_TITLES}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              stepValid={stepValid}
              canGenerate={canGenerate}
              generating={generating}
              onGenerate={generateCardio}
              generateLabel="Gerar Cardio"
              generateIcon={<Sparkles className="h-4 w-4" />}
            >
              {currentStep === 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Modalidades
            </Label>
            <span className="text-[10px] text-muted-foreground">
              {modalities.length === 0 ? 'Automático (todas)' : `${modalities.length} selecionada(s)`}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Selecione uma ou mais. Se mais de uma for escolhida, a IA alternará entre elas ao longo da semana. Deixe vazio para a IA escolher livremente.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MODALITIES.map(opt => {
              const Icon = opt.icon;
              const selected = modalities.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleModality(opt.value)}
                  className={cn(
                    'p-3 rounded-xl border text-center transition-all relative',
                    selected ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card hover:border-primary/50'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mx-auto mb-1', selected ? 'text-primary' : 'text-muted-foreground')} />
                  <p className="text-xs font-bold">{opt.label}</p>
                  {selected && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
              )}

              {currentStep === 1 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Frequência semanal</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}x por semana</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
              )}

              {currentStep === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estilo</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intensidade</Label>
            <Select value={intensity} onValueChange={setIntensity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {INTENSITIES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duração</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {DURATIONS.map(d => <SelectItem key={d} value={d}>{d === 'auto' ? 'Auto' : `${d} min`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
              )}

              {currentStep === 2 && (
        <div className="space-y-4 mt-4">
          {(modalities.length === 0 || modalities.includes('passadeira')) && (
            <div className="rounded-xl border border-border p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passadeira / Esteira</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <EqSelect label="Velocidade leve" value={eq.tSpeedEasy} onChange={v => setEqField('tSpeedEasy', v)} options={SPEEDS} suffix=" km/h" />
                <EqSelect label="Velocidade forte" value={eq.tSpeedHard} onChange={v => setEqField('tSpeedHard', v)} options={SPEEDS} suffix=" km/h" />
                <EqSelect label="Inclinação leve" value={eq.tInclineEasy} onChange={v => setEqField('tInclineEasy', v)} options={INCLINES} suffix="%" />
                <EqSelect label="Inclinação forte" value={eq.tInclineHard} onChange={v => setEqField('tInclineHard', v)} options={INCLINES} suffix="%" />
                <EqSelect label="Tempo forte" value={eq.tWorkSec} onChange={v => setEqField('tWorkSec', v)} options={TIMES} fmt={fmtSec} />
                <EqSelect label="Tempo recuperação" value={eq.tRestSec} onChange={v => setEqField('tRestSec', v)} options={TIMES} fmt={fmtSec} />
              </div>
            </div>
          )}
          {(modalities.length === 0 || modalities.includes('bike')) && (
            <div className="rounded-xl border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Bike</p>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={eq.bHiit === 'sim'} onChange={e => setEqField('bHiit', e.target.checked ? 'sim' : 'auto')} />
                  HIIT na bike
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <EqSelect label="Posição" value={eq.bPosition} onChange={v => setEqField('bPosition', v)} options={BIKE_POSITIONS} fmt={fmtBikePos} />
                <EqSelect label="Tempo em pé" value={eq.bStandSec} onChange={v => setEqField('bStandSec', v)} options={TIMES} fmt={fmtSec} />
                <EqSelect label="Tempo sentado" value={eq.bSeatSec} onChange={v => setEqField('bSeatSec', v)} options={TIMES} fmt={fmtSec} />
                <EqSelect label="Tempo mais carga" value={eq.bHardSec} onChange={v => setEqField('bHardSec', v)} options={TIMES} fmt={fmtSec} />
                <EqSelect label="Tempo menos carga" value={eq.bEasySec} onChange={v => setEqField('bEasySec', v)} options={TIMES} fmt={fmtSec} />
                <EqSelect label="Carga alta (nível)" value={eq.bHardLevel} onChange={v => setEqField('bHardLevel', v)} options={LEVELS} />
                <EqSelect label="Carga baixa (nível)" value={eq.bEasyLevel} onChange={v => setEqField('bEasyLevel', v)} options={LEVELS} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <EqSelect label="Nº de ciclos (intervalado)" value={eq.rounds} onChange={v => setEqField('rounds', v)} options={ROUNDS} suffix="x" />
          </div>
        </div>
              )}

              {currentStep === 3 && (
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Observações (opcional)
          </Label>
          <Textarea
            id="notes"
            placeholder="Ex: 'evitar passadeira por dor no joelho', 'foco em queima de gordura'..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
              )}
            </AiWizard>
          );
        })()}

        {/* Resultado */}
        {payload && (
          <div ref={resultRef} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {isWeeklyPlan(payload) ? `Plano semanal (${payload.protocols.length} sessões)` : 'Protocolo gerado'}
              </h3>
              <Button onClick={savePlan} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editPlanId ? 'Atualizar' : 'Salvar'}
              </Button>
            </div>
            {isWeeklyPlan(payload) ? (
              <div className="space-y-4">
                {payload.protocols.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-[11px] uppercase tracking-widest text-primary font-bold">Sessão {i + 1}</p>
                    <CardioProtocolPreview protocol={p} />
                  </div>
                ))}
              </div>
            ) : (
              <CardioProtocolPreview protocol={payload} />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

const CardioProtocolPreview: React.FC<{ protocol: CardioProtocol }> = ({ protocol }) => {
  const totalSec = totalCardioDurationSec(protocol);
  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{protocol.title}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary">
              {MODALITY_LABEL[protocol.modality]}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
              {STRUCTURE_LABEL[protocol.structure]}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
              {protocol.intensity}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
              {protocol.frequencyPerWeek}x/sem
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
              {formatDurationFromSec(totalSec)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{protocol.objective}</p>
          {protocol.targetZoneSummary && (
            <p className="text-xs text-primary mt-1 font-semibold">🎯 {protocol.targetZoneSummary}</p>
          )}
        </div>

        {protocol.safetyNotes && protocol.safetyNotes.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold mb-1">Considerações de segurança</p>
            <ul className="text-xs space-y-1 list-disc list-inside">
              {protocol.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Etapas</p>
          {protocol.blocks.map((b, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-bold">{i + 1}. {b.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-secondary">
                    {formatDurationFromSec(b.durationSec)}
                  </span>
                  {b.targetZone && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      {b.targetZone}
                    </span>
                  )}
                </div>
              </div>
              <BlockParameters block={b} modality={protocol.modality} />
              {b.notes && <p className="text-[11px] text-muted-foreground italic mt-1">{b.notes}</p>}
            </div>
          ))}
        </div>

        {protocol.executionTips && protocol.executionTips.length > 0 && (
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Dicas</p>
            <ul className="text-xs space-y-1 list-disc list-inside">
              {protocol.executionTips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const BlockParameters: React.FC<{ block: any; modality: CardioModality }> = ({ block, modality }) => {
  const params: string[] = [];
  if (modality === 'passadeira') {
    if (block.speedKmh != null) params.push(`${block.speedKmh} km/h`);
    if (block.inclinePct != null) params.push(`${block.inclinePct}% inclinação`);
  } else if (modality === 'bike') {
    if (block.cadenceRpm != null) params.push(`${block.cadenceRpm} rpm`);
    if (block.resistanceLevel != null) params.push(`Nível ${block.resistanceLevel}`);
    if (block.bikePosition) params.push(block.bikePosition === 'em_pe' ? 'Em pé' : block.bikePosition === 'sentado' ? 'Sentado' : 'Alternado');
  } else if (modality === 'eliptica') {
    if (block.cadenceRpm != null) params.push(`${block.cadenceRpm} spm`);
    if (block.resistanceLevel != null) params.push(`Nível ${block.resistanceLevel}`);
  } else if (modality === 'escada') {
    if (block.stepsPerMin != null) params.push(`${block.stepsPerMin} degraus/min`);
    if (block.resistanceLevel != null) params.push(`Nível ${block.resistanceLevel}`);
  }
  if (block.targetHrRange) params.push(block.targetHrRange);
  if (params.length === 0) return null;
  return (
    <p className="text-[11px] text-muted-foreground mt-1">
      {params.join(' • ')}
    </p>
  );
};

const SPEEDS = CARDIO_SPEEDS;
const INCLINES = CARDIO_INCLINES;
const TIMES = CARDIO_TIMES;
const LEVELS = CARDIO_BIKE_LEVELS;
const ROUNDS = CARDIO_ROUNDS;
const BIKE_POSITIONS = CARDIO_BIKE_POSITIONS;
const fmtBikePos = (v: string) => ({ auto: 'Auto (IA)', alternado: 'Em pé e sentado', sentado: 'Apenas sentado', em_pe: 'Apenas em pé' }[v] || v);
const fmtSec = (v: string) => { const n = +v; return n < 60 ? `${n}s` : n % 60 ? `${Math.floor(n/60)}min ${n%60}s` : `${n/60} min`; };

const EqSelect: React.FC<{ label: string; value?: string; onChange: (v: string) => void; options: string[]; suffix?: string; fmt?: (v: string) => string }> = ({ label, value, onChange, options, suffix = '', fmt }) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    <Select value={value || 'auto'} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <SelectItem value="auto">Auto (IA)</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{fmt ? fmt(o) : `${o}${suffix}`}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default CardioIA;
