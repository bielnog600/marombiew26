import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  ChevronRight, ChevronLeft, Check, AlertTriangle,
  Save, FileDown, ArrowLeft, Eye, Upload, Maximize2, ImageIcon, FolderOpen,
  TrendingUp, Edit3, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { calculatePostureAngles, calculateRegionScores, analyzePostureConditions, drawPoseOverlay, type PoseKeypoint, type PostureAngles, type RegionScore, type PostureCondition } from '@/lib/postureUtils';

type CapturePosition = 'front' | 'side' | 'back';

const POSITION_LABELS: Record<CapturePosition, string> = {
  front: 'Frente',
  side: 'Lado (Perfil)',
  back: 'Costas',
};

// ── Status helpers ──
const statusColor = (status: string) =>
  status === 'risk' ? 'hsl(0 72% 51%)' : status === 'attention' ? 'hsl(45 100% 50%)' : 'hsl(142 71% 45%)';

const statusBorderClass = (status: string) =>
  status === 'risk' ? 'border-l-[hsl(0,72%,51%)]' : status === 'attention' ? 'border-l-primary' : 'border-l-[hsl(142,71%,45%)]';

const statusBgClass = (status: string) =>
  status === 'risk' ? 'bg-destructive/10' : status === 'attention' ? 'bg-primary/10' : 'bg-[hsl(142,71%,45%)]/10';

const statusLabel = (status: string) =>
  status === 'risk' ? 'Risco elevado' : status === 'attention' ? 'Atenção' : 'OK';

const statusTextClass = (status: string) =>
  status === 'risk' ? 'text-destructive' : status === 'attention' ? 'text-primary' : 'text-[hsl(142,71%,45%)]';

// ── Photo Card Component ──
const PhotoCard = ({
  position, label, photoUrl, hasKeypoints, showOverlay, onToggleOverlay,
  onUpload, onExpand, keypoints, scores
}: {
  position: CapturePosition; label: string; photoUrl: string | null;
  hasKeypoints: boolean; showOverlay: boolean; onToggleOverlay: () => void;
  onUpload: () => void; onExpand: () => void;
  keypoints: PoseKeypoint[] | null; scores: RegionScore[];
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!photoUrl || !keypoints || !showOverlay || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Load image programmatically so it works even when the <img> is hidden
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let cancelled = false;
    img.onload = () => {
      if (cancelled || !img.naturalWidth) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      drawPoseOverlay(ctx, keypoints, img.naturalWidth, img.naturalHeight, scores);
    };
    img.onerror = () => console.warn('Falha ao carregar foto para overlay:', photoUrl);
    img.src = photoUrl;
    return () => { cancelled = true; };
  }, [photoUrl, keypoints, showOverlay, scores]);

  return (
    <Card className="glass-card overflow-hidden group">
      <div className="relative aspect-[3/4] bg-secondary/30">
        {photoUrl ? (
          <>
            <img ref={imgRef} src={photoUrl} className="w-full h-full object-cover" crossOrigin="anonymous" />
            {showOverlay && keypoints && (
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            )}
            {/* Overlay buttons */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={onExpand}>
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="w-10 h-10 opacity-30" />
            <span className="text-xs">Sem foto</span>
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          {photoUrl && (
            <div className="flex items-center gap-1">
              {hasKeypoints && <span className="text-[9px] text-primary font-medium">IA ✓</span>}
              <Check className="w-3 h-3 text-[hsl(142,71%,45%)]" />
            </div>
          )}
        </div>
        {photoUrl && hasKeypoints && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Mostrar overlay</span>
            <Switch checked={showOverlay} onCheckedChange={onToggleOverlay} className="scale-75" />
          </div>
        )}
        <Button variant="outline" size="sm" className="w-full text-[10px] h-7" onClick={onUpload}>
          <Upload className="w-3 h-3 mr-1" /> {photoUrl ? 'Substituir foto' : 'Anexar foto'}
        </Button>
      </CardContent>
    </Card>
  );
};

// ── Metric Row Component ──
const MetricRow = ({
  label, value, unit, isManual, onEdit
}: {
  label: string; value: number | null; unit: string; isManual: boolean;
  onEdit: (val: number | null) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value?.toString() ?? '');

  const save = () => {
    const parsed = inputVal === '' ? null : parseFloat(inputVal);
    onEdit(isNaN(parsed as number) ? null : parsed);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              className="w-20 h-7 text-xs text-right"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={save}>OK</Button>
          </div>
        ) : (
          <>
            <span className="text-sm font-mono font-semibold text-foreground">
              {value !== null && value !== undefined ? `${value}${unit}` : '—'}
            </span>
            {isManual && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">manual</span>}
            <button onClick={() => { setInputVal(value?.toString() ?? ''); setEditing(true); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main Component ──
const PostureAnalysis = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Wizard state
  const [step, setStep] = useState(0);
  const [heightCm, setHeightCm] = useState('');
  const [sex, setSex] = useState<string>('masculino');
  const [notes, setNotes] = useState('');

  // Captures
  const [photos, setPhotos] = useState<Record<CapturePosition, string | null>>({ front: null, side: null, back: null });
  const [photoBlobs, setPhotoBlobs] = useState<Record<CapturePosition, Blob | null>>({ front: null, side: null, back: null });
  const [keypoints, setKeypoints] = useState<Record<CapturePosition, PoseKeypoint[] | null>>({ front: null, side: null, back: null });
  const [overlays, setOverlays] = useState<Record<CapturePosition, boolean>>({ front: true, side: true, back: true });

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<CapturePosition | null>(null);

  // Results
  const [angles, setAngles] = useState<PostureAngles | null>(null);
  const [regionScores, setRegionScores] = useState<RegionScore[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Overrides (manual values)
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [manualFlags, setManualFlags] = useState<Record<string, boolean>>({});

  // Attention points & conditions
  const [attentionPoints, setAttentionPoints] = useState<{ text: string; status: string }[]>([]);
  const [postureConditions, setPostureConditions] = useState<PostureCondition[]>([]);

  // Expand photo dialog
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  // Pose detection
  const poseLandmarkerRef = useRef<any>(null);
  const [poseReady, setPoseReady] = useState(false);
  const [poseError, setPoseError] = useState(false);

  // Scan history
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!studentId) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('posture_scans')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    setScanHistory(data || []);
    setLoadingHistory(false);
  }, [studentId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Auto-fill height and sex from student profile
  useEffect(() => {
    if (!studentId) return;
    const loadStudentProfile = async () => {
      const { data } = await supabase.from('students_profile').select('altura, sexo').eq('user_id', studentId).maybeSingle();
      if (data) {
        if (data.sexo) setSex(data.sexo);
        if (data.altura && !heightCm) {
          setHeightCm(String(data.altura));
        } else if (!data.altura && !heightCm) {
          // Fallback: get height from latest assessment anthropometrics
          const { data: assessData } = await supabase.from('assessments').select('id').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1);
          if (assessData?.[0]?.id) {
            const { data: anthroData } = await supabase.from('anthropometrics').select('altura').eq('assessment_id', assessData[0].id).maybeSingle();
            if (anthroData?.altura) setHeightCm(String(anthroData.altura));
          }
        }
      }
    };
    loadStudentProfile();
  }, [studentId]);

  const handleDeleteScan = async (scanId: string) => {
    const { error } = await supabase.from('posture_scans').delete().eq('id', scanId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Avaliação deletada.');
    setScanHistory(prev => prev.filter(s => s.id !== scanId));
  };

  const loadScan = (scan: any) => {
    setPhotos({
      front: scan.front_photo_url ?? null,
      side: scan.side_photo_url ?? null,
      back: scan.back_photo_url ?? null,
    });
    setPhotoBlobs({ front: null, side: null, back: null });
    const kp = (scan.pose_keypoints_json ?? {}) as any;
    setKeypoints({
      front: kp.front ?? null,
      side: kp.side ?? null,
      back: kp.back ?? null,
    });
    setAngles((scan.angles_json ?? null) as any);
    setRegionScores((scan.region_scores_json ?? []) as any);
    setAttentionPoints((scan.attention_points_json ?? []) as any);
    const ov = (scan.overrides_json ?? {}) as any;
    setOverrides(ov.values ?? {});
    setManualFlags(ov.manual_flags ?? {});
    setPostureConditions(ov.conditions ?? []);
    setNotes(scan.notes ?? '');
    if (scan.height_cm) setHeightCm(String(scan.height_cm));
    if (scan.sex) setSex(scan.sex);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Avaliação carregada.');
  };

  // Load MediaPipe
  useEffect(() => {
    loadPoseDetector();
  }, []);

  const loadPoseDetector = async () => {
    try {
      // @ts-ignore
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      poseLandmarkerRef.current = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
      setPoseReady(true);
    } catch (err) {
      console.warn('MediaPipe não disponível:', err);
      setPoseError(true);
    }
  };


  const handleFileUpload = (position: CapturePosition) => { setUploadTarget(position); fileInputRef.current?.click(); };

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    const dataUrl = await new Promise<string>(r => { const rd = new FileReader(); rd.onload = () => r(rd.result as string); rd.readAsDataURL(file); });
    setPhotos(prev => ({ ...prev, [uploadTarget]: dataUrl }));
    setPhotoBlobs(prev => ({ ...prev, [uploadTarget]: file }));
    if (poseLandmarkerRef.current) {
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; });
        const result = poseLandmarkerRef.current.detect(img);
        if (result.landmarks?.length > 0) {
          const kp: PoseKeypoint[] = result.landmarks[0].map((lm: any, i: number) => ({
            name: `point_${i}`, x: lm.x, y: lm.y, confidence: lm.visibility ?? lm.score ?? 0.5,
          }));
          setKeypoints(prev => ({ ...prev, [uploadTarget]: kp }));
          toast.success(`Pose detectada (${POSITION_LABELS[uploadTarget]})`);
        } else {
          toast.warning('Corpo não detectado na foto.');
        }
      } catch { toast.warning('Falha na detecção.'); }
    }
    setUploadTarget(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadTarget]);

  const processResults = useCallback(() => {
    setProcessing(true);
    setTimeout(() => {
      const frontKp = keypoints.front;
      const sideKp = keypoints.side;
      const calculatedAngles = calculatePostureAngles(frontKp || []);
      if (sideKp && sideKp.length > 10) {
        const sideAngles = calculatePostureAngles(sideKp);
        if (sideAngles.head_forward !== null) calculatedAngles.head_forward = sideAngles.head_forward;
      }
      const scores = calculateRegionScores(calculatedAngles);
      const conditions = analyzePostureConditions(calculatedAngles);
      setAngles(calculatedAngles);
      setRegionScores(scores);
      setPostureConditions(conditions);

      // Generate attention points
      const points = scores.filter(s => s.status !== 'ok').map(s => ({ text: `${s.label}: ${s.note}`, status: s.status }));
      if (points.length === 0) points.push({ text: 'Nenhum achado significativo', status: 'ok' });
      setAttentionPoints(points);

      setProcessing(false);
      setStep(3);
    }, 1500);
  }, [keypoints]);

  const uploadPhoto = async (blob: Blob, position: string): Promise<string | null> => {
    const fileName = `${studentId}/${Date.now()}_${position}.jpg`;
    const { data, error } = await supabase.storage.from('scan-photos').upload(fileName, blob, { contentType: 'image/jpeg' });
    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Falha ao enviar foto (${position}): ${error.message}`);
    }
    const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!studentId || !user) return;
    setSaving(true);
    try {
      const [frontUrl, sideUrl, backUrl] = await Promise.all([
        photoBlobs.front ? uploadPhoto(photoBlobs.front, 'front') : null,
        photoBlobs.side ? uploadPhoto(photoBlobs.side, 'side') : null,
        photoBlobs.back ? uploadPhoto(photoBlobs.back, 'back') : null,
      ]);
      if (!frontUrl && !sideUrl && !backUrl) {
        throw new Error('Nenhuma foto foi enviada. Tente novamente.');
      }
      const { error } = await supabase.from('posture_scans').insert({
        student_id: studentId,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        sex, device_has_lidar: false, mode: '2d',
        front_photo_url: frontUrl, side_photo_url: sideUrl, back_photo_url: backUrl,
        pose_keypoints_json: keypoints as any,
        angles_json: angles as any,
        region_scores_json: regionScores as any,
        attention_points_json: attentionPoints as any,
        overrides_json: { values: overrides, manual_flags: manualFlags, conditions: postureConditions } as any,
        notes,
      });
      if (error) throw error;
      toast.success('Análise postural salva!');
      fetchHistory();
    } catch (err: any) { toast.error('Erro ao salvar: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleOverride = (key: string, value: number | null) => {
    setOverrides(prev => ({ ...prev, [key]: value }));
    setManualFlags(prev => ({ ...prev, [key]: true }));
  };

  const getMetricValue = (key: string): number | null => {
    if (manualFlags[key]) return overrides[key] ?? null;
    if (!angles) return null;
    return (angles as any)[key] ?? null;
  };

  const hasAllPhotos = photos.front && photos.side && photos.back;
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <AppLayout title="Análise Postural">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {['Pré-check', 'Captura', 'Processamento', 'Resultado'].map((label, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1.5 rounded-full transition-all ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
              <p className={`text-[10px] mt-1 text-center ${i <= step ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp" className="hidden" onChange={onFileSelected} />

        {/* ─── Step 0: Pre-check ─── */}
        {step === 0 && (
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-lg">Pré-check — Informações do Aluno</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Altura (cm) *</Label><Input type="number" placeholder="170" value={heightCm} onChange={e => setHeightCm(e.target.value)} /></div>
                <div><Label>Sexo</Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" /> Instruções para captura
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>Usar roupa justa (short/legging/top ou só bermuda)</li>
                  <li>Fundo liso e iluminação uniforme</li>
                  <li>Telemóvel no tripé, na altura do umbigo</li>
                  <li>Distância recomendada: ~2,5 metros</li>
                  <li>Marcar posição dos pés no chão</li>
                  <li>O aluno deve estar descalço, em posição natural</li>
                </ul>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 flex items-start gap-3">
                <Eye className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Modo: {poseError ? '2D Manual' : poseReady ? '2D com IA' : 'Carregando IA...'}</p>
                  <p className="text-xs text-muted-foreground">
                    {poseError ? 'Detecção automática indisponível. Você poderá avaliar manualmente.'
                      : poseReady ? 'Detecção de pose por IA ativa.' : 'Aguarde o carregamento do modelo de IA...'}
                  </p>
                </div>
              </div>
              <Button onClick={() => setStep(1)} disabled={!heightCm} className="w-full">
                Iniciar Captura <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step 1: Capture ─── */}
        {step === 1 && (
          <div className="space-y-4">
            <Card className="glass-card">
                  <CardHeader><CardTitle className="text-lg">Captura — 3 Posições</CardTitle></CardHeader>
                  <CardContent>
                    {/* Desktop: 3 columns */}
                    <div className="hidden sm:grid grid-cols-3 gap-4">
                      {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                        <PhotoCard
                          key={pos} position={pos} label={POSITION_LABELS[pos]}
                          photoUrl={photos[pos]} hasKeypoints={!!keypoints[pos]}
                          showOverlay={overlays[pos]}
                          onToggleOverlay={() => setOverlays(p => ({ ...p, [pos]: !p[pos] }))}
                          onUpload={() => handleFileUpload(pos)}
                          onExpand={() => setExpandedPhoto(photos[pos])}
                          keypoints={keypoints[pos]} scores={regionScores}
                        />
                      ))}
                    </div>
                    {/* Mobile: tabs */}
                    <div className="sm:hidden">
                      <Tabs defaultValue="front">
                        <TabsList className="w-full">
                          {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                            <TabsTrigger key={pos} value={pos} className="flex-1 text-xs">
                              {POSITION_LABELS[pos].split(' ')[0]}
                              {photos[pos] && <Check className="w-3 h-3 ml-1 text-[hsl(142,71%,45%)]" />}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                          <TabsContent key={pos} value={pos}>
                            <PhotoCard
                              position={pos} label={POSITION_LABELS[pos]}
                              photoUrl={photos[pos]} hasKeypoints={!!keypoints[pos]}
                              showOverlay={overlays[pos]}
                              onToggleOverlay={() => setOverlays(p => ({ ...p, [pos]: !p[pos] }))}
                              onUpload={() => handleFileUpload(pos)}
                              onExpand={() => setExpandedPhoto(photos[pos])}
                              keypoints={keypoints[pos]} scores={regionScores}
                            />
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="mr-1 w-4 h-4" /> Voltar</Button>
                  <Button onClick={() => { setStep(2); processResults(); }} disabled={!hasAllPhotos} className="flex-1">
                    Processar Análise <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
          </div>
        )}

        {/* ─── Step 2: Processing ─── */}
        {step === 2 && (
          <Card className="glass-card">
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Eye className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Processando análise...</h3>
              <p className="text-sm text-muted-foreground">Calculando ângulos, simetrias e scores.</p>
              <div className="w-48 mx-auto bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '70%' }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Step 3: Results ─── */}
        {step === 3 && (
          <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-foreground">Relatório Postural</h2>
                <p className="text-xs text-muted-foreground">{today}</p>
              </div>
              <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                <FileDown className="mr-2 w-4 h-4" /> Exportar PDF
              </Button>
            </div>

            {/* Section 1: Photos Grid */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" /> Fotos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="hidden sm:grid grid-cols-3 gap-4">
                  {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                    <PhotoCard
                      key={pos} position={pos} label={POSITION_LABELS[pos]}
                      photoUrl={photos[pos]} hasKeypoints={!!keypoints[pos]}
                      showOverlay={overlays[pos]}
                      onToggleOverlay={() => setOverlays(p => ({ ...p, [pos]: !p[pos] }))}
                       onUpload={() => handleFileUpload(pos)}
                      onExpand={() => setExpandedPhoto(photos[pos])}
                      keypoints={keypoints[pos]} scores={regionScores}
                    />
                  ))}
                </div>
                <div className="sm:hidden">
                  <Tabs defaultValue="front">
                    <TabsList className="w-full">
                      {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                        <TabsTrigger key={pos} value={pos} className="flex-1 text-xs">{POSITION_LABELS[pos].split(' ')[0]}</TabsTrigger>
                      ))}
                    </TabsList>
                    {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                      <TabsContent key={pos} value={pos}>
                        <PhotoCard
                          position={pos} label={POSITION_LABELS[pos]}
                          photoUrl={photos[pos]} hasKeypoints={!!keypoints[pos]}
                          showOverlay={overlays[pos]}
                          onToggleOverlay={() => setOverlays(p => ({ ...p, [pos]: !p[pos] }))}
                          onUpload={() => handleFileUpload(pos)}
                          onExpand={() => setExpandedPhoto(photos[pos])}
                          keypoints={keypoints[pos]} scores={regionScores}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Resumo Postural */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" /> Resumo Postural
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {regionScores.map((score, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border-l-4 p-4 ${statusBgClass(score.status)} transition-all`}
                      style={{ borderLeftColor: statusColor(score.status) }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-foreground">{score.label}</span>
                        <span
                          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
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
              </CardContent>
            </Card>

            {/* Section 3: Métricas e Ângulos */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Métricas e Ângulos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MetricRow label="Inclinação dos ombros (E/D)" value={getMetricValue('shoulder_tilt')} unit="°" isManual={!!manualFlags.shoulder_tilt} onEdit={v => handleOverride('shoulder_tilt', v)} />
                <MetricRow label="Protrusão dos ombros" value={getMetricValue('shoulder_protusion')} unit="°" isManual={!!manualFlags.shoulder_protusion} onEdit={v => handleOverride('shoulder_protusion', v)} />
                <MetricRow label="Inclinação pélvica (E/D)" value={getMetricValue('pelvic_tilt')} unit="°" isManual={!!manualFlags.pelvic_tilt} onEdit={v => handleOverride('pelvic_tilt', v)} />
                <MetricRow label="Inclinação lateral do tronco" value={getMetricValue('trunk_lateral')} unit="°" isManual={!!manualFlags.trunk_lateral} onEdit={v => handleOverride('trunk_lateral', v)} />
                <MetricRow label="Cabeça anteriorizada" value={getMetricValue('head_forward')} unit="" isManual={!!manualFlags.head_forward} onEdit={v => handleOverride('head_forward', v)} />
                <MetricRow label="Cifose torácica" value={getMetricValue('kyphosis_angle')} unit="°" isManual={!!manualFlags.kyphosis_angle} onEdit={v => handleOverride('kyphosis_angle', v)} />
                <MetricRow label="Lordose lombar" value={getMetricValue('lordosis_angle')} unit="°" isManual={!!manualFlags.lordosis_angle} onEdit={v => handleOverride('lordosis_angle', v)} />
                <MetricRow label="Escoliose (desvio lateral)" value={getMetricValue('scoliosis_angle')} unit="°" isManual={!!manualFlags.scoliosis_angle} onEdit={v => handleOverride('scoliosis_angle', v)} />
                <MetricRow label="Valgo/Varo joelho E" value={getMetricValue('knee_valgus_left')} unit="°" isManual={!!manualFlags.knee_valgus_left} onEdit={v => handleOverride('knee_valgus_left', v)} />
                <MetricRow label="Valgo/Varo joelho D" value={getMetricValue('knee_valgus_right')} unit="°" isManual={!!manualFlags.knee_valgus_right} onEdit={v => handleOverride('knee_valgus_right', v)} />
                <MetricRow label="Alinhamento joelho E" value={getMetricValue('knee_alignment_left')} unit="°" isManual={!!manualFlags.knee_alignment_left} onEdit={v => handleOverride('knee_alignment_left', v)} />
                <MetricRow label="Alinhamento joelho D" value={getMetricValue('knee_alignment_right')} unit="°" isManual={!!manualFlags.knee_alignment_right} onEdit={v => handleOverride('knee_alignment_right', v)} />
              </CardContent>
            </Card>

            {/* Section 3.5: Condições Posturais Detalhadas */}
            {postureConditions.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" /> Condições Posturais Detalhadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {postureConditions.filter(c => c.severity !== 'normal').length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma condição postural significativa detectada.</p>
                  )}
                  {postureConditions.map((cond, i) => {
                    const severityColor = cond.severity === 'grave' ? 'hsl(0 72% 51%)' : cond.severity === 'moderada' ? 'hsl(25 95% 53%)' : cond.severity === 'leve' ? 'hsl(45 100% 50%)' : 'hsl(142 71% 45%)';
                    const severityBg = cond.severity === 'grave' ? 'bg-destructive/10' : cond.severity === 'moderada' ? 'bg-orange-500/10' : cond.severity === 'leve' ? 'bg-primary/10' : 'bg-[hsl(142,71%,45%)]/10';
                    return (
                      <div key={i} className={`rounded-xl border-l-4 p-4 ${severityBg}`} style={{ borderLeftColor: severityColor }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold text-foreground">{cond.label}</span>
                          <div className="flex items-center gap-2">
                            {cond.angle !== null && (
                              <span className="text-[10px] font-mono text-muted-foreground">{cond.angle}°</span>
                            )}
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${severityColor}20`, color: severityColor }}>
                              {cond.severity}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs font-medium text-foreground mb-1">{cond.description}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{cond.details}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Section 4: Pontos de Atenção */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" /> Pontos de Atenção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {attentionPoints.map((point, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                      <span
                        className="mt-1 w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: statusColor(point.status) }}
                      />
                      <span className="text-sm text-foreground">{point.text}</span>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full ml-auto shrink-0"
                        style={{ backgroundColor: `${statusColor(point.status)}20`, color: statusColor(point.status) }}
                      >
                        {statusLabel(point.status)}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Notas do avaliador</Label>
                  <Textarea
                    placeholder="Observações adicionais, recomendações..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="bg-secondary/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 print:hidden">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 w-4 h-4" /> Refazer Captura
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Avaliação'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Histórico de Avaliações Posturais ─── */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Avaliações Posturais Realizadas</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : scanHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação postural registrada.</p>
            ) : (
              <div className="space-y-3">
                {scanHistory.map(scan => {
                  const scores = (scan.region_scores_json as any[]) || [];
                  const riskCount = scores.filter((s: any) => s.status === 'risk').length;
                  const attCount = scores.filter((s: any) => s.status === 'attention').length;
                  const photoCount = [scan.front_photo_url, scan.side_photo_url, scan.back_photo_url].filter(Boolean).length;
                  return (
                    <div key={scan.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {scan.front_photo_url ? (
                          <img src={scan.front_photo_url} className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(scan.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{photoCount} foto{photoCount !== 1 ? 's' : ''}</span>
                            {riskCount > 0 && <span className="text-destructive font-medium">{riskCount} risco{riskCount !== 1 ? 's' : ''}</span>}
                            {attCount > 0 && <span className="text-primary font-medium">{attCount} atenção</span>}
                            {riskCount === 0 && attCount === 0 && scores.length > 0 && <span className="text-[hsl(142,71%,45%)] font-medium">Tudo OK</span>}
                          </div>
                          {scan.notes && <p className="text-[10px] text-muted-foreground truncate">{scan.notes}</p>}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deletar avaliação?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. A avaliação postural será removida permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteScan(scan.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Deletar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-primary"
                        title="Abrir avaliação"
                        onClick={() => loadScan(scan)}
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>


        <Dialog open={!!expandedPhoto} onOpenChange={() => setExpandedPhoto(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Foto ampliada</DialogTitle></DialogHeader>
            {expandedPhoto && <img src={expandedPhoto} className="w-full rounded-lg" />}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default PostureAnalysis;
