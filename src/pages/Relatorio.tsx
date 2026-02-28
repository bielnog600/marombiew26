import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import BodyModel3D from '@/components/BodyModel3D';

const classifyIMC = (imc: number) => {
  if (imc < 18.5) return { label: 'Abaixo do peso', color: 'text-yellow-500' };
  if (imc < 25) return { label: 'Peso normal', color: 'text-green-500' };
  if (imc < 30) return { label: 'Sobrepeso', color: 'text-yellow-500' };
  if (imc < 35) return { label: 'Obesidade I', color: 'text-orange-500' };
  if (imc < 40) return { label: 'Obesidade II', color: 'text-red-500' };
  return { label: 'Obesidade III', color: 'text-destructive' };
};

const classifyRCQ = (rcq: number) => {
  if (rcq < 0.80) return { label: 'Baixo risco', color: 'text-green-500' };
  if (rcq < 0.86) return { label: 'Risco moderado', color: 'text-yellow-500' };
  if (rcq < 0.95) return { label: 'Risco alto', color: 'text-orange-500' };
  return { label: 'Risco muito alto', color: 'text-destructive' };
};

const Relatorio = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<any>(null);
  const [anthro, setAnthro] = useState<any>(null);
  const [skinfolds, setSkinfolds] = useState<any>(null);
  const [comp, setComp] = useState<any>(null);
  const [vitals, setVitals] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [anamnese, setAnamnese] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (id) loadReport();
  }, [id]);

  const loadReport = async () => {
    const { data: a } = await supabase.from('assessments').select('*').eq('id', id).maybeSingle();
    setAssessment(a);

    if (!a) return;

    const [anthroR, sfR, compR, vR, pR, anR] = await Promise.all([
      supabase.from('anthropometrics').select('*').eq('assessment_id', id).maybeSingle(),
      supabase.from('skinfolds').select('*').eq('assessment_id', id).maybeSingle(),
      supabase.from('composition').select('*').eq('assessment_id', id).maybeSingle(),
      supabase.from('vitals').select('*').eq('assessment_id', id).maybeSingle(),
      supabase.from('performance_tests').select('*').eq('assessment_id', id).maybeSingle(),
      supabase.from('anamnese').select('*').eq('assessment_id', id).maybeSingle(),
    ]);

    setAnthro(anthroR.data);
    setSkinfolds(sfR.data);
    setComp(compR.data);
    setVitals(vR.data);
    setPerf(pR.data);
    setAnamnese(anR.data);

    const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', a.student_id).maybeSingle();
    setProfile(prof);

    // Histórico para gráficos
    const { data: allAssessments } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', a.student_id)
      .order('created_at', { ascending: true });

    if (allAssessments) {
      const histPromises = allAssessments.map(async (ass) => {
        const { data: an } = await supabase.from('anthropometrics').select('peso, imc, cintura').eq('assessment_id', ass.id).maybeSingle();
        const { data: co } = await supabase.from('composition').select('percentual_gordura').eq('assessment_id', ass.id).maybeSingle();
        return {
          data: new Date(ass.created_at).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
          peso: an?.peso,
          imc: an?.imc,
          cintura: an?.cintura,
          gordura: co?.percentual_gordura,
        };
      });
      setHistory(await Promise.all(histPromises));
    }
  };

  const DataRow = ({ label, value, unit = '' }: { label: string; value: any; unit?: string }) => (
    <div className="flex justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm">{value ?? '-'} {value ? unit : ''}</span>
    </div>
  );

  if (!assessment) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Relatório de Avaliação">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in" id="report-content">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
        </div>

        {/* Header */}
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{profile?.nome || 'Aluno'}</h2>
                <p className="text-sm text-muted-foreground">
                  Avaliação em {new Date(assessment.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="text-2xl font-bold text-gradient">MarombiewPro</div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Peso', value: anthro?.peso, unit: 'kg', sub: '' },
            { label: 'IMC', value: anthro?.imc, unit: '', sub: anthro?.imc ? classifyIMC(anthro.imc).label : '' },
            { label: '% Gordura', value: comp?.percentual_gordura, unit: '%', sub: '' },
            { label: 'Cintura', value: anthro?.cintura, unit: 'cm', sub: '' },
            { label: 'Quadril', value: anthro?.quadril, unit: 'cm', sub: '' },
            { label: 'RCQ', value: anthro?.rcq, unit: '', sub: anthro?.rcq ? classifyRCQ(anthro.rcq).label : '' },
          ].map((item) => (
            <Card key={item.label} className="glass-card">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold text-primary">{item.value ?? '-'}</p>
                {item.unit && <p className="text-xs text-muted-foreground">{item.unit}</p>}
                {item.sub && (
                  <p className={`text-xs font-medium mt-1 ${
                    item.label === 'IMC' && anthro?.imc ? classifyIMC(anthro.imc).color :
                    item.label === 'RCQ' && anthro?.rcq ? classifyRCQ(anthro.rcq).color : ''
                  }`}>{item.sub}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alertas */}
        {(anthro?.imc > 25 || anthro?.rcq > 0.80) && (
          <Card className="border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="p-4 space-y-1">
              {anthro?.imc && (
                <p className={`text-sm font-medium ${classifyIMC(anthro.imc).color}`}>
                  • IMC {anthro.imc}: {classifyIMC(anthro.imc).label}
                </p>
              )}
              {anthro?.rcq && (
                <p className={`text-sm font-medium ${classifyRCQ(anthro.rcq).color}`}>
                  • RCQ {anthro.rcq}: {classifyRCQ(anthro.rcq).label}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Este é apenas um indicador, não um diagnóstico médico.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Boneco 3D */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Mapa Corporal — Pontos de Atenção</CardTitle></CardHeader>
          <CardContent>
        <BodyModel3D measurements={(() => {
              const m: import('@/components/BodyModel3D').BodyMeasurement[] = [];
              const add = (key: string, label: string, value: number | null, unit: string, status: 'ok' | 'attention' | 'risk' | 'strength' | 'cardio' | 'core', hist?: { date: string; value: number }[]) => {
                if (value !== null && value !== undefined) m.push({ key, label, value, unit, status, history: hist });
              };
              const getCircHistory = (field: string) => history.filter(h => (h as any)[field] != null).map(h => ({ date: h.data, value: (h as any)[field] }));

              add('pescoco', 'Pescoço', anthro?.pescoco, 'cm', 'ok');
              add('ombro', 'Ombro', anthro?.ombro, 'cm', 'ok');
              add('torax', 'Tórax', anthro?.torax, 'cm', comp?.percentual_gordura > 25 ? 'attention' : 'ok');
              add('abdomen', 'Abdômen', anthro?.abdomen, 'cm',
                anthro?.imc > 30 ? 'risk' : anthro?.imc > 25 ? 'attention' : perf?.plank !== null && perf?.plank < 30 ? 'core' : 'ok');
              add('cintura', 'Cintura', anthro?.cintura, 'cm',
                anthro?.rcq > 0.95 ? 'risk' : anthro?.rcq > 0.85 ? 'attention' : 'ok', getCircHistory('cintura'));
              add('quadril', 'Quadril', anthro?.quadril, 'cm',
                anthro?.rcq > 0.95 ? 'risk' : anthro?.rcq > 0.85 ? 'attention' : 'ok');
              add('braco_direito', 'Braço Dir.', anthro?.braco_direito, 'cm',
                perf?.pushup !== null && perf?.pushup < 15 ? 'strength' : 'ok');
              add('braco_esquerdo', 'Braço Esq.', anthro?.braco_esquerdo, 'cm',
                perf?.pushup !== null && perf?.pushup < 15 ? 'strength' : 'ok');
              add('antebraco', 'Antebraço', anthro?.antebraco, 'cm', 'ok');
              add('coxa_direita', 'Coxa Dir.', anthro?.coxa_direita, 'cm',
                perf?.cooper_12min !== null && perf?.cooper_12min < 1600 ? 'cardio' : 'ok');
              add('coxa_esquerda', 'Coxa Esq.', anthro?.coxa_esquerda, 'cm',
                perf?.cooper_12min !== null && perf?.cooper_12min < 1600 ? 'cardio' : 'ok');
              add('panturrilha_direita', 'Panturrilha Dir.', anthro?.panturrilha_direita, 'cm',
                perf?.cooper_12min !== null && perf?.cooper_12min < 1600 ? 'cardio' : 'ok');
              add('panturrilha_esquerda', 'Panturrilha Esq.', anthro?.panturrilha_esquerda, 'cm',
                perf?.cooper_12min !== null && perf?.cooper_12min < 1600 ? 'cardio' : 'ok');
              return m;
            })()} />
            <div className="flex flex-wrap gap-3 mt-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Risco elevado</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Atenção</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" /> Força</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-500" /> Cardio</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500" /> Core</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Medidas */}
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Medidas Corporais</CardTitle></CardHeader>
            <CardContent>
              <DataRow label="Pescoço" value={anthro?.pescoco} unit="cm" />
              <DataRow label="Tórax" value={anthro?.torax} unit="cm" />
              <DataRow label="Ombro" value={anthro?.ombro} unit="cm" />
              <DataRow label="Abdômen" value={anthro?.abdomen} unit="cm" />
              <DataRow label="Braço Dir." value={anthro?.braco_direito} unit="cm" />
              <DataRow label="Braço Esq." value={anthro?.braco_esquerdo} unit="cm" />
              <DataRow label="Bíceps Contr. Dir." value={anthro?.biceps_contraido_direito} unit="cm" />
              <DataRow label="Bíceps Contr. Esq." value={anthro?.biceps_contraido_esquerdo} unit="cm" />
              <DataRow label="Antebraço Dir." value={anthro?.antebraco} unit="cm" />
              <DataRow label="Antebraço Esq." value={anthro?.antebraco_esquerdo} unit="cm" />
              <DataRow label="Coxa Dir." value={anthro?.coxa_direita} unit="cm" />
              <DataRow label="Coxa Esq." value={anthro?.coxa_esquerda} unit="cm" />
              <DataRow label="Panturrilha Dir." value={anthro?.panturrilha_direita} unit="cm" />
              <DataRow label="Panturrilha Esq." value={anthro?.panturrilha_esquerda} unit="cm" />
            </CardContent>
          </Card>

          {/* Dobras */}
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Dobras Cutâneas ({skinfolds?.metodo?.replace(/_/g, ' ') || '-'})</CardTitle></CardHeader>
            <CardContent>
              <DataRow label="Tríceps" value={skinfolds?.triceps} unit="mm" />
              <DataRow label="Subescapular" value={skinfolds?.subescapular} unit="mm" />
              <DataRow label="Suprailíaca" value={skinfolds?.suprailiaca} unit="mm" />
              <DataRow label="Abdominal" value={skinfolds?.abdominal} unit="mm" />
              <DataRow label="Peitoral" value={skinfolds?.peitoral} unit="mm" />
              <DataRow label="Axilar Média" value={skinfolds?.axilar_media} unit="mm" />
              <DataRow label="Coxa" value={skinfolds?.coxa} unit="mm" />
            </CardContent>
          </Card>

          {/* Composição */}
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Composição Corporal</CardTitle></CardHeader>
            <CardContent>
              <DataRow label="% Gordura" value={comp?.percentual_gordura} unit="%" />
              <DataRow label="Massa Magra" value={comp?.massa_magra} unit="kg" />
              <DataRow label="Massa Gorda" value={comp?.massa_gorda} unit="kg" />
            </CardContent>
          </Card>

          {/* Testes */}
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Testes Físicos</CardTitle></CardHeader>
            <CardContent>
              <DataRow label="Flexões" value={perf?.pushup} unit="rep" />
              <DataRow label="Prancha" value={perf?.plank} unit="seg" />
              <DataRow label="Cooper 12min" value={perf?.cooper_12min} unit="m" />
              <DataRow label="Salto Vertical" value={perf?.salto_vertical} unit="cm" />
              <DataRow label="Agachamento" value={perf?.agachamento_score} unit="/5" />
            </CardContent>
          </Card>
        </div>

        {/* Gráficos de Evolução */}
        {history.length > 1 && (
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Evolução</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: 'peso', label: 'Peso (kg)', color: 'hsl(45 100% 50%)' },
                  { key: 'gordura', label: '% Gordura', color: 'hsl(200 80% 50%)' },
                ].map(chart => (
                  <div key={chart.key}>
                    <p className="text-sm text-muted-foreground mb-2">{chart.label}</p>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                          <XAxis dataKey="data" stroke="hsl(220 10% 55%)" fontSize={11} />
                          <YAxis stroke="hsl(220 10% 55%)" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(220 18% 10%)', border: '1px solid hsl(220 14% 18%)', borderRadius: '8px', color: 'hsl(0 0% 95%)' }} />
                          <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {assessment.notas_gerais && (
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Notas Gerais</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{assessment.notas_gerais}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Relatorio;
