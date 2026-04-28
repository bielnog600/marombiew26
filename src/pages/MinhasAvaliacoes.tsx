import React, { useEffect, useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, ChevronRight, Weight, TrendingUp, ScanLine, Maximize2, ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { type PoseKeypoint, type RegionScore } from '@/lib/postureUtils';
import { renderPostureAnalysisDataUrl } from '@/lib/postureCanvas';

interface AssessmentRow {
  id: string;
  created_at: string;
  peso?: number | null;
  gordura?: number | null;
}

interface PostureScan {
  id: string;
  created_at: string;
  front_photo_url: string | null;
  side_photo_url: string | null;
  back_photo_url: string | null;
  pose_keypoints_json: any;
  region_scores_json: any;
  attention_points_json: any;
  angles_json: any;
  notes: string | null;
}

const statusColor = (status: string) =>
  status === 'risk' ? 'text-destructive' : status === 'attention' ? 'text-primary' : 'text-emerald-500';

const statusLabel = (status: string) =>
  status === 'risk' ? 'Risco' : status === 'attention' ? 'Atenção' : 'Normal';

const statusBadgeClass = (status: string) =>
  status === 'risk' ? 'bg-destructive/10 text-destructive border-destructive/30'
    : status === 'attention' ? 'bg-primary/10 text-primary border-primary/30'
    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';

const PosturePhoto = ({ url, keypoints, scores }: { url: string | null; keypoints: PoseKeypoint[] | null; scores: RegionScore[] }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [renderedOverlayUrl, setRenderedOverlayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !keypoints) {
      setRenderedOverlayUrl(null);
      return;
    }
    let cancelled = false;

    renderPostureAnalysisDataUrl({ photoUrl: url, keypoints, scores, maxWidth: 720 })
      .then((dataUrl) => {
        if (!cancelled) setRenderedOverlayUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setRenderedOverlayUrl(null);
        console.warn('Falha ao carregar foto para overlay:', url);
      });

    return () => { cancelled = true; };
  }, [url, keypoints, scores]);

  if (!url) {
    return (
      <div className="aspect-[3/4] bg-secondary/30 rounded-lg flex items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <>
      <div className="relative aspect-[3/4] bg-secondary/30 rounded-lg overflow-hidden group cursor-pointer" onClick={() => setExpanded(true)}>
        <img ref={imgRef} src={renderedOverlayUrl || url} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-background/80 rounded-full p-1">
            <Maximize2 className="h-3 w-3 text-foreground" />
          </div>
        </div>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl p-2">
          <img src={renderedOverlayUrl || url} className="w-full h-auto rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
};

const MinhasAvaliacoes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'avaliacoes' | 'postura'>('avaliacoes');
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [scans, setScans] = useState<PostureScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingScans, setLoadingScans] = useState(true);

  useEffect(() => {
    if (user) {
      loadAssessments();
      loadPostureScans();
    }
  }, [user]);

  const loadAssessments = async () => {
    const { data: avals } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });

    if (!avals) { setLoading(false); return; }

    const enriched = await Promise.all(
      avals.map(async (a) => {
        const { data: anth } = await supabase.from('anthropometrics').select('peso').eq('assessment_id', a.id).maybeSingle();
        const { data: comp } = await supabase.from('composition').select('percentual_gordura').eq('assessment_id', a.id).maybeSingle();
        return { ...a, peso: anth?.peso, gordura: comp?.percentual_gordura };
      })
    );
    setAssessments(enriched);
    setLoading(false);
  };

  const loadPostureScans = async () => {
    setLoadingScans(true);
    const { data } = await supabase
      .from('posture_scans')
      .select('id, created_at, front_photo_url, side_photo_url, back_photo_url, pose_keypoints_json, region_scores_json, attention_points_json, angles_json, notes')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });
    setScans(data ?? []);
    setLoadingScans(false);
  };

  const tabs = [
    { value: 'avaliacoes' as const, label: 'Avaliações', icon: ClipboardList },
    { value: 'postura' as const, label: 'Postura', icon: ScanLine },
  ];

  return (
    <AppLayout title="Minhas Avaliações">
      <div className="space-y-4 animate-fade-in">
        {/* Tab pills */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          <div className="flex gap-2 w-max">
            {tabs.map((t) => {
              const isActive = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                      : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Avaliações tab */}
        {tab === 'avaliacoes' && (
          <>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="glass-card">
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <div className="flex gap-4">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : assessments.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-8 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma avaliação realizada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              assessments.map((a, i) => (
                <Card
                  key={a.id}
                  className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors active:scale-[0.98]"
                  onClick={() => navigate(`/relatorio/${a.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-4 mt-1.5">
                          {a.peso != null && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Weight className="h-3 w-3" /> {a.peso} kg
                            </span>
                          )}
                          {a.gordura != null && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <TrendingUp className="h-3 w-3" /> {a.gordura}% gordura
                            </span>
                          )}
                        </div>
                        {i === 0 && (
                          <span className="inline-block mt-2 text-[10px] uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                            Mais recente
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}

        {/* Postura tab */}
        {tab === 'postura' && (
          <>
            {loadingScans ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="glass-card">
                    <CardContent className="p-4 space-y-4">
                      <Skeleton className="h-4 w-40" />
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((j) => (
                          <Skeleton key={j} className="aspect-[3/4] rounded-lg" />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : scans.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-8 text-center">
                  <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma análise de postura realizada ainda.</p>
                </CardContent>
              </Card>
            ) : (
              scans.map((scan) => {
                const keypoints: Record<string, PoseKeypoint[]> = scan.pose_keypoints_json || {};
                const regionScores: Record<string, RegionScore[]> = scan.region_scores_json || {};
                const attentionPoints: Array<{ label: string; status: string; detail?: string }> = Array.isArray(scan.attention_points_json) ? scan.attention_points_json : [];

                return (
                  <Card key={scan.id} className="glass-card">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">
                          {format(new Date(scan.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                        {attentionPoints.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {attentionPoints.filter(p => p.status !== 'normal').length} ponto(s) de atenção
                          </Badge>
                        )}
                      </div>

                      {/* Photos grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground text-center mb-1">Frente</p>
                          <PosturePhoto
                            url={scan.front_photo_url}
                            keypoints={keypoints?.front || null}
                            scores={regionScores?.front || []}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground text-center mb-1">Perfil</p>
                          <PosturePhoto
                            url={scan.side_photo_url}
                            keypoints={keypoints?.side || null}
                            scores={regionScores?.side || []}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground text-center mb-1">Costas</p>
                          <PosturePhoto
                            url={scan.back_photo_url}
                            keypoints={keypoints?.back || null}
                            scores={regionScores?.back || []}
                          />
                        </div>
                      </div>

                      {/* Attention points */}
                      {attentionPoints.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Pontos de atenção</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {attentionPoints.map((point, idx) => (
                              <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg border-l-2 ${
                                point.status === 'risk' ? 'border-l-destructive bg-destructive/5'
                                  : point.status === 'attention' ? 'border-l-primary bg-primary/5'
                                  : 'border-l-emerald-500 bg-emerald-500/5'
                              }`}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium">{point.label}</p>
                                  {point.detail && <p className="text-[10px] text-muted-foreground">{point.detail}</p>}
                                </div>
                                <Badge variant="outline" className={`text-[9px] shrink-0 ${statusBadgeClass(point.status)}`}>
                                  {statusLabel(point.status)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {scan.notes && (
                        <div className="p-2 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">{scan.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default MinhasAvaliacoes;
