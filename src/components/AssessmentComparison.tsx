import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BarChart3, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

interface Props {
  studentId: string;
  assessments: any[];
}

const COLORS = ['hsl(45,100%,50%)', 'hsl(200,80%,55%)', 'hsl(140,60%,45%)', 'hsl(280,70%,55%)', 'hsl(20,90%,55%)'];

const AssessmentComparison: React.FC<Props> = ({ studentId, assessments }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [compData, setCompData] = useState<any>(null);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const loadComparison = async () => {
    if (selectedIds.length < 2) {
      toast.error('Selecione pelo menos 2 avaliações para comparar');
      return;
    }
    setLoading(true);

    const [{ data: anthro }, { data: comp }, { data: skins }, { data: photos }, { data: posture }, { data: postureScans }] = await Promise.all([
      supabase.from('anthropometrics').select('*').in('assessment_id', selectedIds),
      supabase.from('composition').select('*').in('assessment_id', selectedIds),
      supabase.from('skinfolds').select('*').in('assessment_id', selectedIds),
      supabase.from('assessment_photos').select('*').in('assessment_id', selectedIds),
      supabase.from('posture').select('*').in('assessment_id', selectedIds),
      supabase.from('posture_scans').select('*').eq('student_id', studentId).in('assessment_id', selectedIds),
    ]);

    // Sort by assessment date
    const sortedAssessments = selectedIds
      .map(id => assessments.find(a => a.id === id))
      .filter(Boolean)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const dateLabels = sortedAssessments.map(a => new Date(a.created_at).toLocaleDateString('pt-BR'));

    // Build anthropometric chart data
    const anthroMap = new Map((anthro ?? []).map(a => [a.assessment_id, a]));
    const compMap = new Map((comp ?? []).map(c => [c.assessment_id, c]));
    const skinsMap = new Map((skins ?? []).map(s => [s.assessment_id, s]));
    const photosMap = new Map<string, any[]>();
    (photos ?? []).forEach(p => {
      const arr = photosMap.get(p.assessment_id) || [];
      arr.push(p);
      photosMap.set(p.assessment_id, arr);
    });
    const postureMap = new Map((posture ?? []).map(p => [p.assessment_id, p]));
    const postureScanMap = new Map((postureScans ?? []).map(p => [p.assessment_id, p]));

    // Measurements evolution
    const measurementFields = [
      { key: 'peso', label: 'Peso (kg)' },
      { key: 'cintura', label: 'Cintura (cm)' },
      { key: 'quadril', label: 'Quadril (cm)' },
      { key: 'braco_direito', label: 'Braço D (cm)' },
      { key: 'braco_esquerdo', label: 'Braço E (cm)' },
      { key: 'coxa_direita', label: 'Coxa D (cm)' },
      { key: 'coxa_esquerda', label: 'Coxa E (cm)' },
      { key: 'panturrilha_direita', label: 'Pant. D (cm)' },
      { key: 'panturrilha_esquerda', label: 'Pant. E (cm)' },
      { key: 'torax', label: 'Tórax (cm)' },
      { key: 'abdomen', label: 'Abdômen (cm)' },
      { key: 'ombro', label: 'Ombro (cm)' },
      { key: 'pescoco', label: 'Pescoço (cm)' },
    ];

    const measurementChartData = sortedAssessments.map((a, i) => {
      const d = anthroMap.get(a.id);
      const row: any = { date: dateLabels[i] };
      measurementFields.forEach(f => { row[f.label] = d?.[f.key] ?? null; });
      return row;
    });

    // Composition evolution
    const compositionChartData = sortedAssessments.map((a, i) => {
      const c = compMap.get(a.id);
      const d = anthroMap.get(a.id);
      return {
        date: dateLabels[i],
        '% Gordura': c?.percentual_gordura ?? null,
        'Massa Gorda (kg)': c?.massa_gorda ?? null,
        'Massa Magra (kg)': c?.massa_magra ?? null,
        'IMC': d?.imc ?? null,
      };
    });

    // Skinfolds comparison
    const skinfoldFields = [
      { key: 'subescapular', label: 'Subescapular' },
      { key: 'triceps', label: 'Tríceps' },
      { key: 'peitoral', label: 'Peitoral' },
      { key: 'axilar_media', label: 'Axilar Média' },
      { key: 'suprailiaca', label: 'Supraílíaca' },
      { key: 'abdominal', label: 'Abdominal' },
      { key: 'coxa', label: 'Coxa' },
    ];

    const skinfoldChartData = skinfoldFields.map(f => {
      const row: any = { dobra: f.label };
      sortedAssessments.forEach((a, i) => {
        const s = skinsMap.get(a.id);
        row[dateLabels[i]] = s?.[f.key] ?? null;
      });
      return row;
    });

    // Radar chart for perimeters (latest vs first)
    const perimeterFields = [
      { key: 'braco_direito', label: 'Braço D' },
      { key: 'braco_esquerdo', label: 'Braço E' },
      { key: 'coxa_direita', label: 'Coxa D' },
      { key: 'coxa_esquerda', label: 'Coxa E' },
      { key: 'panturrilha_direita', label: 'Pant. D' },
      { key: 'panturrilha_esquerda', label: 'Pant. E' },
      { key: 'torax', label: 'Tórax' },
      { key: 'cintura', label: 'Cintura' },
      { key: 'quadril', label: 'Quadril' },
      { key: 'ombro', label: 'Ombro' },
    ];

    const radarData = perimeterFields.map(f => {
      const row: any = { metric: f.label };
      sortedAssessments.forEach((a, i) => {
        const d = anthroMap.get(a.id);
        row[dateLabels[i]] = d?.[f.key] ?? 0;
      });
      return row;
    });

    // Photos grouped by assessment
    const photosGrouped = sortedAssessments.map((a, i) => ({
      date: dateLabels[i],
      photos: photosMap.get(a.id) || [],
    }));

    // Posture data
    const postureGrouped = sortedAssessments.map((a, i) => ({
      date: dateLabels[i],
      posture: postureMap.get(a.id) || null,
      scan: postureScanMap.get(a.id) || null,
    }));

    setCompData({
      dateLabels,
      measurementChartData,
      compositionChartData,
      skinfoldChartData,
      radarData,
      photosGrouped,
      postureGrouped,
      sortedAssessments,
    });
    setLoading(false);
  };

  const renderPostureView = (view: any, label: string) => {
    if (!view || typeof view !== 'object') return null;
    const entries = Object.entries(view).filter(([_, v]) => v && v !== 'normal' && v !== 'Normal');
    if (entries.length === 0) return <p className="text-xs text-muted-foreground">Sem desvios</p>;
    return (
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="capitalize">{k.replace(/_/g, ' ')}</span>
            <span className="text-primary font-medium">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Comparar Avaliações
          </h3>
          <p className="text-sm text-muted-foreground">
            Selecione 2 ou mais avaliações para comparar evolução.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {assessments.map(a => (
              <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
                <Checkbox
                  checked={selectedIds.includes(a.id)}
                  onCheckedChange={() => toggleSelection(a.id)}
                />
                <span className="text-sm">
                  {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </span>
              </label>
            ))}
          </div>
          <Button onClick={loadComparison} disabled={loading || selectedIds.length < 2} className="w-full font-semibold">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...</> : `Comparar (${selectedIds.length} selecionadas)`}
          </Button>
        </CardContent>
      </Card>

      {compData && (
        <div className="space-y-6">
          {/* Composition Evolution */}
          <Card className="glass-card">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-semibold text-sm">Composição Corporal</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compData.compositionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                    <Legend />
                    <Line type="monotone" dataKey="% Gordura" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Massa Gorda (kg)" stroke={COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Massa Magra (kg)" stroke={COLORS[2]} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="IMC" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Measurements Evolution */}
          <Card className="glass-card">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-semibold text-sm">Evolução de Medidas</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compData.measurementChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                    <Legend />
                    <Line type="monotone" dataKey="Peso (kg)" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Cintura (cm)" stroke={COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Braço D (cm)" stroke={COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Coxa D (cm)" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Tórax (cm)" stroke={COLORS[4]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Radar Chart - Perimeters */}
          <Card className="glass-card">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-semibold text-sm">Radar de Perímetros</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={compData.radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <PolarRadiusAxis tick={{ fontSize: 9 }} />
                    {compData.dateLabels.map((label: string, i: number) => (
                      <Radar key={label} name={label} dataKey={label} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Skinfolds Bar Chart */}
          {compData.skinfoldChartData.some((d: any) => compData.dateLabels.some((l: string) => d[l] != null)) && (
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Dobras Cutâneas (mm)</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compData.skinfoldChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="dobra" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                      <Legend />
                      {compData.dateLabels.map((label: string, i: number) => (
                        <Bar key={label} dataKey={label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Photos Comparison */}
          {compData.photosGrouped.some((g: any) => g.photos.length > 0) && (
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Comparação de Fotos</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {compData.photosGrouped.map((g: any) => (
                    <div key={g.date} className="space-y-2">
                      <p className="text-xs font-medium text-center text-primary">{g.date}</p>
                      {g.photos.length === 0 ? (
                        <div className="h-32 rounded-lg bg-secondary/30 flex items-center justify-center text-xs text-muted-foreground">Sem fotos</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1">
                          {g.photos.map((p: any) => (
                            <img key={p.id} src={p.url} alt={p.tipo || 'Foto'} className="rounded-lg w-full h-auto object-cover aspect-[3/4]" />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Posture Comparison */}
          {compData.postureGrouped.some((g: any) => g.posture || g.scan) && (
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Comparação Postural</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {compData.postureGrouped.map((g: any) => (
                    <div key={g.date} className="space-y-2 p-3 rounded-lg bg-secondary/30">
                      <p className="text-xs font-medium text-center text-primary">{g.date}</p>

                      {g.scan && (
                        <div className="space-y-2">
                          {g.scan.front_photo_url && <img src={g.scan.front_photo_url} alt="Frontal" className="rounded-lg w-full h-auto" />}
                          {g.scan.side_photo_url && <img src={g.scan.side_photo_url} alt="Lateral" className="rounded-lg w-full h-auto" />}
                          {g.scan.back_photo_url && <img src={g.scan.back_photo_url} alt="Posterior" className="rounded-lg w-full h-auto" />}
                        </div>
                      )}

                      {g.posture && (
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Anterior</p>
                            {renderPostureView(g.posture.vista_anterior, 'Anterior')}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Lateral</p>
                            {renderPostureView(g.posture.vista_lateral, 'Lateral')}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Posterior</p>
                            {renderPostureView(g.posture.vista_posterior, 'Posterior')}
                          </div>
                        </div>
                      )}

                      {!g.posture && !g.scan && (
                        <p className="text-xs text-muted-foreground text-center">Sem dados posturais</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default AssessmentComparison;
