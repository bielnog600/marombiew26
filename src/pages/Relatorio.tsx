import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Download, Eye, AlertTriangle, Loader2 } from 'lucide-react';
import { generatePDF } from '@/lib/generatePDF';
import KarvonenZones from '@/components/KarvonenZones';
import BeforeAfterPhotos from '@/components/BeforeAfterPhotos';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { drawPoseOverlay, analyzePostureConditions, type PoseKeypoint, type RegionScore, type PostureCondition, type PostureAngles } from '@/lib/postureUtils';


const statusColor = (status: string) =>
  status === 'risk' ? 'hsl(0 72% 51%)' : status === 'attention' ? 'hsl(45 100% 50%)' : 'hsl(142 71% 45%)';
const statusLabel = (status: string) =>
  status === 'risk' ? 'Risco' : status === 'attention' ? 'Atenção' : 'OK';

// Photo with pose overlay + analysis grid
const PosturePhotoWithGrid = ({ photoUrl, label, keypoints, scores }: {
  photoUrl: string | null; label: string;
  keypoints: PoseKeypoint[] | null; scores: RegionScore[];
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!photoUrl || !imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const draw = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // Draw analysis grid
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      const cols = 24;
      const rows = 32;
      // Vertical lines
      for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo((w / cols) * i, 0);
        ctx.lineTo((w / cols) * i, h);
        ctx.stroke();
      }
      // Horizontal lines
      for (let i = 1; i < rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / rows) * i);
        ctx.lineTo(w, (h / rows) * i);
        ctx.stroke();
      }
      // Center vertical line (symmetry)
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      // Center horizontal line
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw pose overlay if keypoints exist
      if (keypoints && keypoints.length >= 29) {
        drawPoseOverlay(ctx, keypoints, w, h, scores);
      }
    };
    if (img.complete) draw(); else img.onload = draw;
  }, [photoUrl, keypoints, scores]);

  if (!photoUrl) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground text-center">{label}</p>
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-secondary/30">
        <img ref={imgRef} src={photoUrl} className="hidden" crossOrigin="anonymous" />
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
      </div>
    </div>
  );
};

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
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [postureScan, setPostureScan] = useState<any>(null);
  const [hrZones, setHrZones] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

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

    const { data: sp } = await supabase.from('students_profile').select('*').eq('user_id', a.student_id).maybeSingle();
    setStudentProfile(sp);

    // Posture scan mais recente do aluno (vinculada ou não a esta avaliação)
    const { data: scan } = await supabase
      .from('posture_scans')
      .select('*')
      .eq('student_id', a.student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPostureScan(scan);

    // HR Zones (Karvonen)
    const { data: hz } = await supabase
      .from('hr_zones')
      .select('*')
      .eq('student_id', a.student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setHrZones(hz);


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
          <Button variant="outline" disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              await generatePDF({ profile, assessment, anthro, comp, skinfolds, vitals, perf, anamnese, postureScan, studentProfile, hrZones });
            } catch (err) { console.error(err); }
            finally { setExporting(false); }
          }}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {exporting ? 'Gerando...' : 'Exportar PDF'}
          </Button>
        </div>

        {/* Header */}
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{profile?.nome || 'Aluno'}</h2>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    if (studentProfile?.data_nascimento) {
                      const birth = new Date(studentProfile.data_nascimento + 'T00:00:00');
                      const today = new Date();
                      let age = today.getFullYear() - birth.getFullYear();
                      if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
                      return `${age} anos`;
                    }
                    return 'Idade não informada';
                  })()}
                  {' · '}Avaliação em {new Date(assessment.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {/* branding removido */}
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        {(() => {
          const pesoIdeal = anthro?.altura ? (22 * Math.pow(anthro.altura / 100, 2)).toFixed(1) : null;
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Card combinado Peso + Altura */}
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Peso / Altura</p>
                  <p className="text-xl font-bold text-primary">{anthro?.peso ?? '-'} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
                  <p className="text-base font-semibold text-primary">
                    {anthro?.altura ? (anthro.altura / 100).toFixed(2) : (studentProfile?.altura ? (studentProfile.altura / 100).toFixed(2) : '-')} <span className="text-sm font-normal text-muted-foreground">m</span>
                  </p>
                </CardContent>
              </Card>
              {[
                { label: 'Peso Ideal', value: pesoIdeal, unit: 'kg', sub: 'IMC 22' },
                { label: 'IMC', value: anthro?.imc, unit: '', sub: anthro?.imc ? classifyIMC(anthro.imc).label : '' },
                { label: '% Gordura', value: comp?.percentual_gordura, unit: '%', sub: '' },
                { label: 'Massa Magra', value: comp?.massa_magra, unit: 'kg', sub: '' },
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
                        item.label === 'RCQ' && anthro?.rcq ? classifyRCQ(anthro.rcq).color : 'text-muted-foreground'
                      }`}>{item.sub}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

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
              {(() => {
                const sexo = studentProfile?.sexo;
                const idealFat = sexo === 'feminino' ? 20 : 15;
                const idealFatWeight = anthro?.peso && idealFat ? (anthro.peso * idealFat / 100).toFixed(1) : null;
                return (
                  <>
                    <DataRow label="% Gordura" value={comp?.percentual_gordura} unit="%" />
                    <DataRow label="% Gordura Ideal" value={idealFat} unit={`% (${sexo === 'feminino' ? 'feminino' : 'masculino'})`} />
                    <DataRow label="Massa Magra" value={comp?.massa_magra} unit="kg" />
                    <DataRow label="Massa Gorda" value={comp?.massa_gorda} unit="kg" />
                    <DataRow label="Peso de Gordura Ideal" value={idealFatWeight} unit="kg" />
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Testes */}
          {perf && (perf.pushup || perf.plank || perf.cooper_12min || perf.salto_vertical || perf.agachamento_score) && (
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
          )}

          {/* Composição Corporal - Gráfico de Pizza */}
          {comp && comp.massa_magra && comp.massa_gorda && (
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Composição Corporal — Gráfico</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-6 mb-4 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Peso Total</p>
                    <p className="font-bold text-lg">{(comp.massa_magra + comp.massa_gorda).toFixed(1)} kg</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Massa Magra</p>
                    <p className="font-bold text-lg" style={{ color: 'hsl(142 71% 45%)' }}>{comp.massa_magra.toFixed(1)} kg</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Massa Gorda</p>
                    <p className="font-bold text-lg" style={{ color: 'hsl(0 72% 51%)' }}>{comp.massa_gorda.toFixed(1)} kg</p>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: `Massa Magra (${comp.massa_magra.toFixed(1)} kg)`, value: comp.massa_magra },
                          { name: `Massa Gorda (${comp.massa_gorda.toFixed(1)} kg)`, value: comp.massa_gorda },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                      >
                        <Cell fill="hsl(142 71% 45%)" />
                        <Cell fill="hsl(0 72% 51%)" />
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(value: number) => `${value.toFixed(1)} kg`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Zonas de Frequência Cardíaca (Karvonen) */}
          <KarvonenZones
            studentId={assessment.student_id}
            birthDate={studentProfile?.data_nascimento}
            fcRepouso={vitals?.fc_repouso}
          />

          {/* Hidratação Recomendada */}
          {anthro?.peso && (
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Hidratação Recomendada</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const waterMl = Math.round(anthro.peso * 50);
                  const waterL = (waterMl / 1000).toFixed(1);
                  return (
                    <>
                      <DataRow label="Peso corporal" value={anthro.peso} unit="kg" />
                      <DataRow label="Fórmula" value="50 ml por kg" />
                      <DataRow label="Consumo diário recomendado" value={`${waterL} litros (${waterMl} ml)`} />
                      <DataRow label="Em dias de treino" value={`${(waterMl * 1.3 / 1000).toFixed(1)} – ${(waterMl * 1.5 / 1000).toFixed(1)} litros`} />
                      <p className="text-xs text-muted-foreground mt-3">
                        * Em dias de treino intenso, aumente o consumo em 30–50%. Distribua ao longo do dia.
                      </p>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}
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

        {/* Análise Postural */}
        {postureScan && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" /> Análise Postural
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {new Date(postureScan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photos with grid overlay */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { url: postureScan.front_photo_url, label: 'Frente', kpKey: 'front' },
                  { url: postureScan.side_photo_url, label: 'Lado (Perfil)', kpKey: 'side' },
                  { url: postureScan.back_photo_url, label: 'Costas', kpKey: 'back' },
                ].map(({ url, label, kpKey }) => {
                  const kpData = postureScan.pose_keypoints_json as any;
                  const kp = kpData?.[kpKey] ?? null;
                  const scores = (postureScan.region_scores_json as RegionScore[]) || [];
                  return (
                    <PosturePhotoWithGrid
                      key={kpKey}
                      photoUrl={url}
                      label={label}
                      keypoints={kp}
                      scores={scores}
                    />
                  );
                })}
              </div>

              {/* Region scores */}
              {postureScan.region_scores_json && (postureScan.region_scores_json as any[]).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-3">Resumo Postural</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(postureScan.region_scores_json as any[]).map((score: any, i: number) => (
                      <div
                        key={i}
                        className="rounded-xl border-l-4 p-3 bg-secondary/20"
                        style={{ borderLeftColor: statusColor(score.status) }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-foreground">{score.label}</span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${statusColor(score.status)}20`, color: statusColor(score.status) }}
                          >
                            {statusLabel(score.status)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{score.note}</p>
                        {score.angle !== null && score.angle !== undefined && (
                          <p className="text-[10px] text-muted-foreground mt-1 font-mono">Ângulo: {score.angle}°</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Angles / metrics */}
              {postureScan.angles_json && (
                <div>
                  <p className="text-sm font-semibold mb-2">Métricas e Ângulos</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: 'shoulder_tilt', label: 'Inclinação Ombros', unit: '°' },
                      { key: 'shoulder_protusion', label: 'Protrusão Ombros', unit: '°' },
                      { key: 'pelvic_tilt', label: 'Inclinação Pélvica', unit: '°' },
                      { key: 'trunk_lateral', label: 'Inclinação Tronco', unit: '°' },
                      { key: 'head_forward', label: 'Cabeça Anterior.', unit: '' },
                      { key: 'kyphosis_angle', label: 'Cifose Torácica', unit: '°' },
                      { key: 'lordosis_angle', label: 'Lordose Lombar', unit: '°' },
                      { key: 'scoliosis_angle', label: 'Escoliose', unit: '°' },
                      { key: 'knee_valgus_left', label: 'Valgo/Varo Esq.', unit: '°' },
                      { key: 'knee_valgus_right', label: 'Valgo/Varo Dir.', unit: '°' },
                      { key: 'knee_alignment_left', label: 'Joelho Esq.', unit: '°' },
                      { key: 'knee_alignment_right', label: 'Joelho Dir.', unit: '°' },
                    ].map(({ key, label, unit }) => {
                      const angles = postureScan.angles_json as any;
                      const overrides = (postureScan.overrides_json as any)?.values || {};
                      const manualFlags = (postureScan.overrides_json as any)?.manual_flags || {};
                      const val = manualFlags[key] ? overrides[key] : angles[key];
                      return (
                        <div key={key} className="flex flex-col items-center p-2 rounded-lg bg-secondary/30">
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                          <span className="text-sm font-mono font-bold text-foreground">
                            {val !== null && val !== undefined ? `${val}${unit}` : '—'}
                          </span>
                          {manualFlags[key] && <span className="text-[8px] text-primary">manual</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Condições Posturais Detalhadas */}
              {(() => {
                const conditions: PostureCondition[] = (postureScan.overrides_json as any)?.conditions 
                  || (postureScan.angles_json ? analyzePostureConditions(postureScan.angles_json as PostureAngles) : []);
                const significant = conditions.filter(c => c.severity !== 'normal');
                if (significant.length === 0) return null;
                return (
                  <div>
                    <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-primary" /> Condições Posturais Detalhadas
                    </p>
                    <div className="space-y-2">
                      {significant.map((cond, i) => {
                        const severityColor = cond.severity === 'grave' ? 'hsl(0 72% 51%)' : cond.severity === 'moderada' ? 'hsl(25 95% 53%)' : 'hsl(45 100% 50%)';
                        return (
                          <div key={i} className="rounded-xl border-l-4 p-3 bg-secondary/20" style={{ borderLeftColor: severityColor }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold text-foreground">{cond.label}</span>
                              <div className="flex items-center gap-2">
                                {cond.angle !== null && <span className="text-[10px] font-mono text-muted-foreground">{cond.angle}°</span>}
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${severityColor}20`, color: severityColor }}>
                                  {cond.severity}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs font-medium text-foreground mb-0.5">{cond.description}</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{cond.details}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Attention points */}
              {postureScan.attention_points_json && (postureScan.attention_points_json as any[]).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-primary" /> Pontos de Atenção
                  </p>
                  <div className="space-y-1.5">
                    {(postureScan.attention_points_json as any[]).map((point: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor(point.status) }} />
                        <span className="text-foreground">{point.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {postureScan.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas do avaliador</p>
                  <p className="text-sm text-foreground">{postureScan.notes}</p>
                </div>
              )}
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
