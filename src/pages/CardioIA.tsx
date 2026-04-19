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

type StudentCtx = Record<string, any>;

const MODALITIES: { value: CardioModality; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'passadeira', label: 'Passadeira', icon: Footprints },
  { value: 'bike', label: 'Bike', icon: Bike },
  { value: 'eliptica', label: 'Elíptica', icon: Activity },
  { value: 'escada', label: 'Escada', icon: TrendingUp },
];

const INTENSITIES = [
  { value: 'auto', label: 'Auto' },
  { value: 'leve', label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'intensa', label: 'Intensa' },
];

const STYLES = [
  { value: 'auto', label: 'Automático (IA decide)' },
  { value: 'continuo', label: 'Contínuo (intensidade constante)' },
  { value: 'intervalado', label: 'Intervalado (blocos alternados)' },
  { value: 'hiit', label: 'HIIT (picos curtos e intensos)' },
  { value: 'zona2', label: 'Zona 2 pura (queima de gordura)' },
];

const FREQUENCIES = ['1', '2', '3', '4', '5', '6'];
const DURATIONS = ['auto', '15', '20', '25', '30', '40', '45', '60'];

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
  const [generating, setGenerating] = useState(false);
  const [payload, setPayload] = useState<CardioPayload | null>(null);
  const [saving, setSaving] = useState(false);
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
    const [profileRes, spRes, assessRes, hrRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('assessments').select('id').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
      supabase.from('hr_zones').select('*').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;

    let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null, performance: any = null;
    if (latestAssessmentId) {
      const [a, c, v, an, pf] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      ]);
      anthro = a.data; comp = c.data; vitals = v.data; anamnese = an.data; performance = pf.data;
    }

    setStudentCtx({
      nome: profile?.nome,
      sexo: sp?.sexo,
      data_nascimento: sp?.data_nascimento,
      altura: sp?.altura || anthro?.altura,
      objetivo: sp?.objetivo,
      restricoes: sp?.restricoes,
      lesoes: sp?.lesoes,
      observacoes: sp?.observacoes,
      peso: anthro?.peso,
      imc: anthro?.imc,
      percentual_gordura: comp?.percentual_gordura,
      vitals,
      anamnese,
      performance,
    });
    setStudentName(profile?.nome || 'Aluno');

    if (hrRes.data) {
      setHrZones({
        fcMax: hrRes.data.fcmax_estimada,
        fcRepouso: hrRes.data.fc_repouso,
        hrr: hrRes.data.hrr,
        zones: hrRes.data.zonas_karvonen,
      });
    }
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
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            studentContext: studentCtx,
            modalities, // [] = automático (IA escolhe entre todas)
            frequencyPerWeek: parseInt(frequency, 10),
            intensity,
            style,
            durationMinutes: duration === 'auto' ? 'auto' : parseInt(duration, 10),
            notes,
            hrZones,
          }),
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
      const { error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'cardio',
        titulo,
        conteudo,
      });
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
        <Button variant="ghost" onClick={() => navigate(`/alunos/${studentId}`)} className="mb-2">
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

        {/* Modalidade */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Modalidade</Label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {MODALITIES.map(opt => {
              const Icon = opt.icon;
              const selected = modality === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModality(opt.value)}
                  className={cn(
                    'p-3 rounded-xl border text-center transition-all',
                    selected ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card hover:border-primary/50'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mx-auto mb-1', selected ? 'text-primary' : 'text-muted-foreground')} />
                  <p className="text-xs font-bold">{opt.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequência */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Frequência semanal</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}x por semana</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Estilo + Intensidade + Duração */}
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

        {/* Observações */}
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

        {/* Botão gerar */}
        <Button size="lg" className="w-full font-bold gap-2" onClick={generateCardio} disabled={generating}>
          {generating ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Gerando cardio...</>
          ) : (
            <><Sparkles className="h-5 w-5" /> Gerar Cardio com IA</>
          )}
        </Button>

        {/* Resultado */}
        {protocol && (
          <div ref={resultRef} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Protocolo gerado</h3>
              <Button onClick={savePlan} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editPlanId ? 'Atualizar' : 'Salvar'}
              </Button>
            </div>
            <CardioProtocolPreview protocol={protocol} />
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

export default CardioIA;
