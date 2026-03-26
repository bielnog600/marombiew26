import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { toast } from 'sonner';
import { Loader2, CheckCircle, UtensilsCrossed } from 'lucide-react';


const ESTILO_OPTIONS: { label: string; desc: string }[] = [
  { label: 'Flexível (IIFYM)', desc: 'Você pode comer o que quiser, desde que bata os macros (proteína, carbo, gordura) do dia.' },
  { label: 'Clean eating', desc: 'Foco em alimentos naturais e minimamente processados, sem industrializados.' },
  { label: 'Low carb', desc: 'Redução de carboidratos, priorizando proteínas e gorduras boas.' },
  { label: 'Cetogênica', desc: 'Muito baixa em carboidratos e alta em gorduras, forçando o corpo a usar gordura como energia.' },
  { label: 'Vegana', desc: 'Apenas alimentos de origem vegetal, sem carne, ovos ou laticínios.' },
  { label: 'Vegetariana', desc: 'Sem carnes, mas permite ovos e laticínios.' },
  { label: 'Mediterrânea', desc: 'Rica em azeite, peixes, grãos integrais, frutas e vegetais.' },
  { label: 'Carnívora', desc: 'Baseada apenas em alimentos de origem animal: carnes, ovos e laticínios.' },
  { label: 'Sem preferência', desc: 'Deixe o treinador escolher o melhor estilo para você.' },
];

const FASE_OPTIONS: { label: string; desc: string }[] = [
  { label: 'Bulking', desc: 'Fase de ganho de massa muscular com superávit calórico (comer mais do que gasta).' },
  { label: 'Cutting', desc: 'Fase de perda de gordura com déficit calórico, mantendo o máximo de massa magra.' },
  { label: 'Manutenção', desc: 'Manter o peso e composição corporal atuais, comendo o necessário.' },
  { label: 'Recomposição', desc: 'Perder gordura e ganhar músculo ao mesmo tempo, com dieta equilibrada.' },
  { label: 'Pré-contest', desc: 'Preparação para competição: dieta restrita para máxima definição muscular.' },
  { label: 'Não sei', desc: 'Seu treinador vai definir a melhor fase para o seu objetivo.' },
];

const SINTOMAS = [
  { key: 'fraqueza', label: 'Fraqueza muscular' },
  { key: 'dor_cabeca', label: 'Dor de cabeça' },
  { key: 'reduziu_peso', label: 'Reduziu peso na última dieta' },
  { key: 'pele_fina', label: 'Sente a pele mais fina' },
  { key: 'fome_excessiva', label: 'Fome excessiva' },
  { key: 'insonia', label: 'Insônia / Dificuldade para dormir' },
  { key: 'baixa_energia', label: 'Baixa energia / Cansaço' },
  { key: 'irritabilidade', label: 'Irritabilidade' },
];

const RESTRICTION_OPTIONS = [
  'Sem lactose', 'Sem glúten', 'Sem frutos do mar', 'Sem carne suína',
  'Sem ovo', 'Sem soja', 'Sem oleaginosas',
];

const DietQuestionnaire = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [questionnaire, setQuestionnaire] = useState<any>(null);
  const [error, setError] = useState('');
  const [foodOptions, setFoodOptions] = useState<string[]>([]);
  // Form state
  const [estiloDieta, setEstiloDieta] = useState('');
  const [numRefeicoes, setNumRefeicoes] = useState(5);
  const [faseAtual, setFaseAtual] = useState('');
  const [horarioTreino, setHorarioTreino] = useState('');
  const [diasTreino, setDiasTreino] = useState('');
  const [usaHormonios, setUsaHormonios] = useState('');
  const [selectedFoods, setSelectedFoods] = useState<string[]>([]);
  const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>([]);
  const [customRestriction, setCustomRestriction] = useState('');
  const [sintomas, setSintomas] = useState<Record<string, boolean>>({});
  const [comoSeSente, setComoSeSente] = useState('');
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Link inválido. Token não encontrado.');
      setLoading(false);
      return;
    }
    loadQuestionnaire();
  }, [token]);

  const loadQuestionnaire = async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-questionnaire?token=${token}`;
      const res = await fetch(url);
      const result = await res.json();
      
      if (!res.ok || result.error) {
        if (result.error === 'Questionário já respondido') {
          setSubmitted(true);
        } else {
          setError(result.error || 'Erro ao carregar questionário');
        }
      } else {
        setQuestionnaire(result);
        if (result.foods) setFoodOptions(result.foods);
        if (result.status === 'completed') {
          setSubmitted(true);
        }
      }
    } catch {
      setError('Erro ao carregar questionário');
    }
    setLoading(false);
  };

  const toggleFood = (food: string) => {
    setSelectedFoods(prev => prev.includes(food) ? prev.filter(f => f !== food) : [...prev, food]);
  };

  const toggleRestriction = (r: string) => {
    setSelectedRestrictions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const handleSubmit = async () => {
    if (!estiloDieta) { toast.error('Selecione o estilo de dieta'); return; }
    if (!faseAtual) { toast.error('Selecione a fase atual'); return; }

    setSubmitting(true);
    try {
      const restrictionsText = [
        ...selectedRestrictions,
        ...(customRestriction.trim() ? [customRestriction.trim()] : []),
      ].join(', ');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-questionnaire`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          estilo_dieta: estiloDieta,
          num_refeicoes: numRefeicoes,
          fase_atual: faseAtual,
          horario_treino: horarioTreino,
          dias_treino: diasTreino,
          usa_hormonios: usaHormonios,
          restricoes_alimentares: restrictionsText,
          preferencias_alimentares: selectedFoods.join(', '),
          alimentos_por_refeicao: { alimentos: selectedFoods },
          como_se_sente: comoSeSente,
          ...Object.fromEntries(SINTOMAS.map(s => [s.key, sintomas[s.key] || false])),
          observacoes,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || 'Erro ao enviar');
      } else {
        setSubmitted(true);
        toast.success('Questionário enviado com sucesso!');
      }
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + err.message);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="text-destructive text-lg">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-primary" />
            <h2 className="text-2xl font-bold">Obrigado!</h2>
            <p className="text-muted-foreground">Seu questionário de dieta foi enviado com sucesso. Seu treinador irá analisar suas respostas.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2 py-4">
          <UtensilsCrossed className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Questionário de Dieta</h1>
          {questionnaire?.student_name && (
            <p className="text-muted-foreground">Olá, {questionnaire.student_name}!</p>
          )}
          <p className="text-sm text-muted-foreground">Preencha as informações abaixo para seu treinador montar sua dieta personalizada.</p>
        </div>

        {/* Estilo de dieta */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Estilo de Dieta</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ESTILO_OPTIONS.map(e => (
                <Button key={e.label} type="button" variant={estiloDieta === e.label ? 'default' : 'outline'} size="sm" className="h-auto py-3 px-4 text-left justify-start flex-col items-start whitespace-normal overflow-hidden w-full" onClick={() => setEstiloDieta(e.label)}>
                  <span className="font-medium">{e.label}</span>
                  <span className={`text-xs ${estiloDieta === e.label ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{e.desc}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fase atual */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Fase Atual</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FASE_OPTIONS.map(f => (
                <Button key={f.label} type="button" variant={faseAtual === f.label ? 'default' : 'outline'} size="sm" className="h-auto py-3 px-4 text-left justify-start flex-col items-start whitespace-normal overflow-hidden w-full" onClick={() => setFaseAtual(f.label)}>
                  <span className="font-medium">{f.label}</span>
                  <span className={`text-xs ${faseAtual === f.label ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{f.desc}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Refeições e treino */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Rotina</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantas refeições por dia?</Label>
                <Select value={String(numRefeicoes)} onValueChange={v => setNumRefeicoes(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7, 8].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} refeições</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário do treino</Label>
                <Select value={horarioTreino} onValueChange={setHorarioTreino}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dias de treino por semana</Label>
                <Select value={diasTreino} onValueChange={setDiasTreino}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {['2x', '3x', '4x', '5x', '6x', '7x'].map(d => (
                      <SelectItem key={d} value={d}>{d} por semana</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Usa hormônios?</Label>
                <Select value={usaHormonios} onValueChange={setUsaHormonios}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Não">Não</SelectItem>
                    <SelectItem value="Sim">Sim</SelectItem>
                    <SelectItem value="TRT">TRT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Restrições */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Restrições Alimentares</h3>
            <div className="flex flex-wrap gap-2">
              {RESTRICTION_OPTIONS.map(r => (
                <Button key={r} type="button" variant={selectedRestrictions.includes(r) ? 'default' : 'outline'} size="sm" onClick={() => toggleRestriction(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <Input placeholder="Outra restrição..." value={customRestriction} onChange={e => setCustomRestriction(e.target.value)} />
          </CardContent>
        </Card>

        {/* Alimentos preferidos */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Alimentos que gostaria na dieta</h3>
            <p className="text-sm text-muted-foreground">Selecione os alimentos que você gosta e gostaria de ter no plano.</p>
            <div className="flex flex-wrap gap-2">
              {foodOptions.map(f => (
                <Button key={f} type="button" variant={selectedFoods.includes(f) ? 'default' : 'outline'} size="sm" onClick={() => toggleFood(f)}>
                  {f}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Como se sente */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Como se sentiu na última dieta?</h3>
            <div className="space-y-3">
              {SINTOMAS.map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <Checkbox
                    id={s.key}
                    checked={sintomas[s.key] || false}
                    onCheckedChange={(checked) => setSintomas(prev => ({ ...prev, [s.key]: !!checked }))}
                  />
                  <Label htmlFor={s.key} className="cursor-pointer">{s.label}</Label>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <Label>Descreva como se sente (opcional)</Label>
              <Textarea placeholder="Ex: Me sinto cansado durante o treino, tenho muita fome à noite..." value={comoSeSente} onChange={e => setComoSeSente(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">Observações</h3>
            <Textarea placeholder="Algo mais que gostaria de informar ao seu treinador..." value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </CardContent>
        </Card>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-lg font-semibold">
          {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Enviando...</> : 'Enviar Questionário'}
        </Button>

        <div className="h-8" />
      </div>
    </div>
  );
};

export default DietQuestionnaire;
