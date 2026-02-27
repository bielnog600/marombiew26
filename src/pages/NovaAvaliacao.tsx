import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Loader2 } from 'lucide-react';

const steps = [
  'Anamnese',
  'Sinais Vitais',
  'Antropometria',
  'Dobras Cutâneas',
  'Testes Físicos',
  'Resumo',
];

const NovaAvaliacao = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [anamnese, setAnamnese] = useState({
    sono: '', stress: '', rotina: '', treino_atual: '', medicacao: '',
    suplementos: '', historico_saude: '', dores: '', cirurgias: '',
    tabagismo: false, alcool: '',
  });

  const [vitals, setVitals] = useState({
    pressao: '', fc_repouso: '', spo2: '', glicemia: '', observacoes: '',
  });

  const [anthro, setAnthro] = useState({
    peso: '', altura: '', cintura: '', quadril: '', pescoco: '',
    braco_direito: '', braco_esquerdo: '', antebraco: '', torax: '', abdomen: '',
    coxa_direita: '', coxa_esquerda: '', panturrilha_direita: '', panturrilha_esquerda: '',
    biceps_contraido_direito: '', biceps_contraido_esquerdo: '',
  });

  const [skinfolds, setSkinfolds] = useState({
    metodo: 'jackson_pollock_3',
    triceps: '', subescapular: '', suprailiaca: '', abdominal: '',
    peitoral: '', axilar_media: '', coxa: '',
  });

  const [performance, setPerformance] = useState({
    pushup: '', plank: '', cooper_12min: '', salto_vertical: '',
    agachamento_score: '', mobilidade_ombro: '', mobilidade_quadril: '',
    mobilidade_tornozelo: '', observacoes: '',
  });

  const [notasGerais, setNotasGerais] = useState('');

  // Cálculos
  const calcIMC = () => {
    const p = parseFloat(anthro.peso);
    const h = parseFloat(anthro.altura) / 100;
    if (p > 0 && h > 0) return (p / (h * h)).toFixed(1);
    return '-';
  };

  const calcRCQ = () => {
    const c = parseFloat(anthro.cintura);
    const q = parseFloat(anthro.quadril);
    if (c > 0 && q > 0) return (c / q).toFixed(3);
    return '-';
  };

  const calcGordura = () => {
    // Jackson & Pollock 3 dobras simplificado (masculino)
    const t = parseFloat(skinfolds.triceps);
    const si = parseFloat(skinfolds.suprailiaca);
    const ab = parseFloat(skinfolds.abdominal);
    if (t > 0 && si > 0 && ab > 0) {
      const soma = t + si + ab;
      // Fórmula simplificada
      const dc = 1.10938 - (0.0008267 * soma) + (0.0000016 * soma * soma);
      const bf = ((4.95 / dc) - 4.5) * 100;
      return bf > 0 && bf < 60 ? bf.toFixed(1) : '-';
    }
    return '-';
  };

  const handleSave = async () => {
    if (!studentId || !user) return;
    setSaving(true);

    try {
      const imc = calcIMC();
      const rcq = calcRCQ();
      const gordura = calcGordura();

      // 1. Criar avaliação
      const { data: assessment, error: aErr } = await supabase
        .from('assessments')
        .insert({ student_id: studentId, avaliador_id: user.id, notas_gerais: notasGerais })
        .select()
        .single();

      if (aErr) throw aErr;

      // 2. Inserir sub-tabelas em paralelo
      const aid = assessment.id;
      await Promise.all([
        supabase.from('anamnese').insert({ assessment_id: aid, ...anamnese }),
        supabase.from('vitals').insert({
          assessment_id: aid,
          pressao: vitals.pressao,
          fc_repouso: vitals.fc_repouso ? parseInt(vitals.fc_repouso) : null,
          spo2: vitals.spo2 ? parseFloat(vitals.spo2) : null,
          glicemia: vitals.glicemia ? parseFloat(vitals.glicemia) : null,
          observacoes: vitals.observacoes,
        }),
        supabase.from('anthropometrics').insert({
          assessment_id: aid,
          peso: anthro.peso ? parseFloat(anthro.peso) : null,
          altura: anthro.altura ? parseFloat(anthro.altura) : null,
          imc: imc !== '-' ? parseFloat(imc) : null,
          cintura: anthro.cintura ? parseFloat(anthro.cintura) : null,
          quadril: anthro.quadril ? parseFloat(anthro.quadril) : null,
          rcq: rcq !== '-' ? parseFloat(rcq) : null,
          pescoco: anthro.pescoco ? parseFloat(anthro.pescoco) : null,
          braco_direito: anthro.braco_direito ? parseFloat(anthro.braco_direito) : null,
          braco_esquerdo: anthro.braco_esquerdo ? parseFloat(anthro.braco_esquerdo) : null,
          antebraco: anthro.antebraco ? parseFloat(anthro.antebraco) : null,
          torax: anthro.torax ? parseFloat(anthro.torax) : null,
          abdomen: anthro.abdomen ? parseFloat(anthro.abdomen) : null,
          coxa_direita: anthro.coxa_direita ? parseFloat(anthro.coxa_direita) : null,
          coxa_esquerda: anthro.coxa_esquerda ? parseFloat(anthro.coxa_esquerda) : null,
          panturrilha_direita: anthro.panturrilha_direita ? parseFloat(anthro.panturrilha_direita) : null,
          panturrilha_esquerda: anthro.panturrilha_esquerda ? parseFloat(anthro.panturrilha_esquerda) : null,
          biceps_contraido_direito: anthro.biceps_contraido_direito ? parseFloat(anthro.biceps_contraido_direito) : null,
          biceps_contraido_esquerdo: anthro.biceps_contraido_esquerdo ? parseFloat(anthro.biceps_contraido_esquerdo) : null,
        } as any),
        supabase.from('skinfolds').insert({
          assessment_id: aid,
          metodo: skinfolds.metodo,
          triceps: skinfolds.triceps ? parseFloat(skinfolds.triceps) : null,
          subescapular: skinfolds.subescapular ? parseFloat(skinfolds.subescapular) : null,
          suprailiaca: skinfolds.suprailiaca ? parseFloat(skinfolds.suprailiaca) : null,
          abdominal: skinfolds.abdominal ? parseFloat(skinfolds.abdominal) : null,
          peitoral: skinfolds.peitoral ? parseFloat(skinfolds.peitoral) : null,
          axilar_media: skinfolds.axilar_media ? parseFloat(skinfolds.axilar_media) : null,
          coxa: skinfolds.coxa ? parseFloat(skinfolds.coxa) : null,
        }),
        supabase.from('composition').insert({
          assessment_id: aid,
          percentual_gordura: gordura !== '-' ? parseFloat(gordura) : null,
          massa_magra: gordura !== '-' && anthro.peso ? parseFloat((parseFloat(anthro.peso) * (1 - parseFloat(gordura) / 100)).toFixed(1)) : null,
          massa_gorda: gordura !== '-' && anthro.peso ? parseFloat((parseFloat(anthro.peso) * parseFloat(gordura) / 100).toFixed(1)) : null,
        } as any),
        supabase.from('performance_tests').insert({
          assessment_id: aid,
          pushup: performance.pushup ? parseInt(performance.pushup) : null,
          plank: performance.plank ? parseInt(performance.plank) : null,
          cooper_12min: performance.cooper_12min ? parseFloat(performance.cooper_12min) : null,
          salto_vertical: performance.salto_vertical ? parseFloat(performance.salto_vertical) : null,
          agachamento_score: performance.agachamento_score ? parseInt(performance.agachamento_score) : null,
          mobilidade_ombro: performance.mobilidade_ombro,
          mobilidade_quadril: performance.mobilidade_quadril,
          mobilidade_tornozelo: performance.mobilidade_tornozelo,
          observacoes: performance.observacoes,
        }),
      ]);

      toast.success('Avaliação salva com sucesso!');
      navigate(`/relatorio/${aid}`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const InputField = ({ label, value, onChange, unit, type = 'text', placeholder = '' }: any) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label} {unit && <span className="text-primary">({unit})</span>}</Label>
      <Input type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );

  const TextareaField = ({ label, value, onChange }: any) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea value={value} onChange={onChange} rows={2} />
    </div>
  );

  return (
    <AppLayout title="Nova Avaliação">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {/* Stepper */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {steps.map((step, i) => (
            <button
              key={step}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                i === currentStep ? 'bg-primary text-primary-foreground' : i < currentStep ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-background/20">
                {i + 1}
              </span>
              <span className="hidden sm:inline">{step}</span>
            </button>
          ))}
        </div>

        {/* Step Content */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">{steps[currentStep]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentStep === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextareaField label="Qualidade do Sono" value={anamnese.sono} onChange={(e: any) => setAnamnese({ ...anamnese, sono: e.target.value })} />
                <TextareaField label="Nível de Stress" value={anamnese.stress} onChange={(e: any) => setAnamnese({ ...anamnese, stress: e.target.value })} />
                <TextareaField label="Rotina Diária" value={anamnese.rotina} onChange={(e: any) => setAnamnese({ ...anamnese, rotina: e.target.value })} />
                <TextareaField label="Treino Atual" value={anamnese.treino_atual} onChange={(e: any) => setAnamnese({ ...anamnese, treino_atual: e.target.value })} />
                <TextareaField label="Medicação" value={anamnese.medicacao} onChange={(e: any) => setAnamnese({ ...anamnese, medicacao: e.target.value })} />
                <TextareaField label="Suplementos" value={anamnese.suplementos} onChange={(e: any) => setAnamnese({ ...anamnese, suplementos: e.target.value })} />
                <TextareaField label="Histórico de Saúde" value={anamnese.historico_saude} onChange={(e: any) => setAnamnese({ ...anamnese, historico_saude: e.target.value })} />
                <TextareaField label="Dores" value={anamnese.dores} onChange={(e: any) => setAnamnese({ ...anamnese, dores: e.target.value })} />
                <TextareaField label="Cirurgias" value={anamnese.cirurgias} onChange={(e: any) => setAnamnese({ ...anamnese, cirurgias: e.target.value })} />
                <TextareaField label="Álcool" value={anamnese.alcool} onChange={(e: any) => setAnamnese({ ...anamnese, alcool: e.target.value })} />
                <div className="flex items-center gap-3">
                  <Switch checked={anamnese.tabagismo} onCheckedChange={(v) => setAnamnese({ ...anamnese, tabagismo: v })} />
                  <Label>Tabagismo</Label>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Pressão Arterial" value={vitals.pressao} onChange={(e: any) => setVitals({ ...vitals, pressao: e.target.value })} placeholder="120/80" />
                <InputField label="FC Repouso" value={vitals.fc_repouso} onChange={(e: any) => setVitals({ ...vitals, fc_repouso: e.target.value })} unit="bpm" type="number" />
                <InputField label="SpO2" value={vitals.spo2} onChange={(e: any) => setVitals({ ...vitals, spo2: e.target.value })} unit="%" type="number" />
                <InputField label="Glicemia" value={vitals.glicemia} onChange={(e: any) => setVitals({ ...vitals, glicemia: e.target.value })} unit="mg/dL" type="number" />
                <div className="col-span-full">
                  <TextareaField label="Observações" value={vitals.observacoes} onChange={(e: any) => setVitals({ ...vitals, observacoes: e.target.value })} />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InputField label="Peso" value={anthro.peso} onChange={(e: any) => setAnthro({ ...anthro, peso: e.target.value })} unit="kg" type="number" />
                  <InputField label="Altura" value={anthro.altura} onChange={(e: any) => setAnthro({ ...anthro, altura: e.target.value })} unit="cm" type="number" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">IMC <span className="text-primary">(calculado)</span></Label>
                    <div className="h-10 flex items-center px-3 rounded-md bg-secondary text-sm font-medium">
                      {calcIMC()}
                      {parseFloat(calcIMC()) > 30 && <span className="ml-2 text-destructive text-xs">⚠ Alto</span>}
                    </div>
                  </div>
                  <InputField label="Cintura" value={anthro.cintura} onChange={(e: any) => setAnthro({ ...anthro, cintura: e.target.value })} unit="cm" type="number" />
                  <InputField label="Quadril" value={anthro.quadril} onChange={(e: any) => setAnthro({ ...anthro, quadril: e.target.value })} unit="cm" type="number" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">RCQ <span className="text-primary">(calculado)</span></Label>
                    <div className="h-10 flex items-center px-3 rounded-md bg-secondary text-sm font-medium">
                      {calcRCQ()}
                      {parseFloat(calcRCQ()) > 0.9 && <span className="ml-2 text-destructive text-xs">⚠ Elevado</span>}
                    </div>
                  </div>
                  <InputField label="Pescoço" value={anthro.pescoco} onChange={(e: any) => setAnthro({ ...anthro, pescoco: e.target.value })} unit="cm" type="number" />
                  <InputField label="Braço Direito" value={anthro.braco_direito} onChange={(e: any) => setAnthro({ ...anthro, braco_direito: e.target.value })} unit="cm" type="number" />
                  <InputField label="Braço Esquerdo" value={anthro.braco_esquerdo} onChange={(e: any) => setAnthro({ ...anthro, braco_esquerdo: e.target.value })} unit="cm" type="number" />
                  <InputField label="Bíceps Contraído Dir." value={anthro.biceps_contraido_direito} onChange={(e: any) => setAnthro({ ...anthro, biceps_contraido_direito: e.target.value })} unit="cm" type="number" />
                  <InputField label="Bíceps Contraído Esq." value={anthro.biceps_contraido_esquerdo} onChange={(e: any) => setAnthro({ ...anthro, biceps_contraido_esquerdo: e.target.value })} unit="cm" type="number" />
                  <InputField label="Antebraço" value={anthro.antebraco} onChange={(e: any) => setAnthro({ ...anthro, antebraco: e.target.value })} unit="cm" type="number" />
                  <InputField label="Tórax" value={anthro.torax} onChange={(e: any) => setAnthro({ ...anthro, torax: e.target.value })} unit="cm" type="number" />
                  <InputField label="Abdômen" value={anthro.abdomen} onChange={(e: any) => setAnthro({ ...anthro, abdomen: e.target.value })} unit="cm" type="number" />
                  <InputField label="Coxa Direita" value={anthro.coxa_direita} onChange={(e: any) => setAnthro({ ...anthro, coxa_direita: e.target.value })} unit="cm" type="number" />
                  <InputField label="Coxa Esquerda" value={anthro.coxa_esquerda} onChange={(e: any) => setAnthro({ ...anthro, coxa_esquerda: e.target.value })} unit="cm" type="number" />
                  <InputField label="Panturrilha Direita" value={anthro.panturrilha_direita} onChange={(e: any) => setAnthro({ ...anthro, panturrilha_direita: e.target.value })} unit="cm" type="number" />
                  <InputField label="Panturrilha Esquerda" value={anthro.panturrilha_esquerda} onChange={(e: any) => setAnthro({ ...anthro, panturrilha_esquerda: e.target.value })} unit="cm" type="number" />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Método de Cálculo</Label>
                  <Select value={skinfolds.metodo} onValueChange={(v) => setSkinfolds({ ...skinfolds, metodo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jackson_pollock_3">Jackson & Pollock 3 Dobras</SelectItem>
                      <SelectItem value="jackson_pollock_7">Jackson & Pollock 7 Dobras</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InputField label="Tríceps" value={skinfolds.triceps} onChange={(e: any) => setSkinfolds({ ...skinfolds, triceps: e.target.value })} unit="mm" type="number" />
                  <InputField label="Subescapular" value={skinfolds.subescapular} onChange={(e: any) => setSkinfolds({ ...skinfolds, subescapular: e.target.value })} unit="mm" type="number" />
                  <InputField label="Suprailíaca" value={skinfolds.suprailiaca} onChange={(e: any) => setSkinfolds({ ...skinfolds, suprailiaca: e.target.value })} unit="mm" type="number" />
                  <InputField label="Abdominal" value={skinfolds.abdominal} onChange={(e: any) => setSkinfolds({ ...skinfolds, abdominal: e.target.value })} unit="mm" type="number" />
                  <InputField label="Peitoral" value={skinfolds.peitoral} onChange={(e: any) => setSkinfolds({ ...skinfolds, peitoral: e.target.value })} unit="mm" type="number" />
                  <InputField label="Axilar Média" value={skinfolds.axilar_media} onChange={(e: any) => setSkinfolds({ ...skinfolds, axilar_media: e.target.value })} unit="mm" type="number" />
                  <InputField label="Coxa" value={skinfolds.coxa} onChange={(e: any) => setSkinfolds({ ...skinfolds, coxa: e.target.value })} unit="mm" type="number" />
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <span className="text-xs text-muted-foreground">% Gordura Estimado: </span>
                  <span className="font-bold text-primary">{calcGordura()}%</span>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Flexões (repetições)" value={performance.pushup} onChange={(e: any) => setPerformance({ ...performance, pushup: e.target.value })} type="number" />
                <InputField label="Prancha (segundos)" value={performance.plank} onChange={(e: any) => setPerformance({ ...performance, plank: e.target.value })} unit="seg" type="number" />
                <InputField label="Cooper 12min (distância)" value={performance.cooper_12min} onChange={(e: any) => setPerformance({ ...performance, cooper_12min: e.target.value })} unit="m" type="number" />
                <InputField label="Salto Vertical" value={performance.salto_vertical} onChange={(e: any) => setPerformance({ ...performance, salto_vertical: e.target.value })} unit="cm" type="number" />
                <InputField label="Agachamento Score (1-5)" value={performance.agachamento_score} onChange={(e: any) => setPerformance({ ...performance, agachamento_score: e.target.value })} type="number" />
                <InputField label="Mobilidade Ombro" value={performance.mobilidade_ombro} onChange={(e: any) => setPerformance({ ...performance, mobilidade_ombro: e.target.value })} />
                <InputField label="Mobilidade Quadril" value={performance.mobilidade_quadril} onChange={(e: any) => setPerformance({ ...performance, mobilidade_quadril: e.target.value })} />
                <InputField label="Mobilidade Tornozelo" value={performance.mobilidade_tornozelo} onChange={(e: any) => setPerformance({ ...performance, mobilidade_tornozelo: e.target.value })} />
                <div className="col-span-full">
                  <TextareaField label="Observações" value={performance.observacoes} onChange={(e: any) => setPerformance({ ...performance, observacoes: e.target.value })} />
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Peso</span>
                    <span className="font-bold">{anthro.peso || '-'} kg</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">IMC</span>
                    <span className="font-bold">{calcIMC()}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">% Gordura</span>
                    <span className="font-bold text-primary">{calcGordura()}%</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Cintura</span>
                    <span className="font-bold">{anthro.cintura || '-'} cm</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Quadril</span>
                    <span className="font-bold">{anthro.quadril || '-'} cm</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">RCQ</span>
                    <span className="font-bold">{calcRCQ()}</span>
                  </div>
                </div>
                <TextareaField label="Notas Gerais" value={notasGerais} onChange={(e: any) => setNotasGerais(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)}>
              Próximo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="font-semibold">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Avaliação
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default NovaAvaliacao;
