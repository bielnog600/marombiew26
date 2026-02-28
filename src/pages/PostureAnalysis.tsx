import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Camera, ChevronRight, ChevronLeft, Check, AlertTriangle,
  RotateCcw, Save, FileDown, ArrowLeft, Eye, Upload
} from 'lucide-react';
import { calculatePostureAngles, calculateRegionScores, drawPoseOverlay, type PoseKeypoint, type PostureAngles, type RegionScore } from '@/lib/postureUtils';
import BodyModel3D, { type BodyMeasurement } from '@/components/BodyModel3D';

type CapturePosition = 'front' | 'side' | 'back';

const POSITION_LABELS: Record<CapturePosition, string> = {
  front: 'Frente',
  side: 'Lado (Perfil)',
  back: 'Costas',
};

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
  const [activeCapture, setActiveCapture] = useState<CapturePosition | null>(null);

  // Camera & file upload
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<CapturePosition | null>(null);

  // Results
  const [angles, setAngles] = useState<PostureAngles | null>(null);
  const [regionScores, setRegionScores] = useState<RegionScore[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pose detection (MediaPipe)
  const poseLandmarkerRef = useRef<any>(null);
  const [poseReady, setPoseReady] = useState(false);
  const [poseError, setPoseError] = useState(false);

  // Load MediaPipe
  useEffect(() => {
    loadPoseDetector();
    return () => { stopCamera(); };
  }, []);

  const loadPoseDetector = async () => {
    try {
      // @ts-ignore - loaded via CDN
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
      console.warn('MediaPipe não disponível, modo manual ativado:', err);
      setPoseError(true);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1920 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      toast.error('Não foi possível acessar a câmera.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = useCallback(async (position: CapturePosition) => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPhotos(prev => ({ ...prev, [position]: dataUrl }));
    setPhotoBlobs(prev => ({ ...prev, [position]: blob }));

    // Detect pose
    if (poseLandmarkerRef.current) {
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; });
        const result = poseLandmarkerRef.current.detect(img);
        if (result.landmarks && result.landmarks.length > 0) {
          const kp: PoseKeypoint[] = result.landmarks[0].map((lm: any, i: number) => ({
            name: `point_${i}`,
            x: lm.x,
            y: lm.y,
            confidence: lm.visibility ?? lm.score ?? 0.5,
          }));
          setKeypoints(prev => ({ ...prev, [position]: kp }));
          toast.success(`Pose detectada (${POSITION_LABELS[position]})`);
        } else {
          toast.warning('Corpo não detectado. Tente novamente.');
        }
      } catch {
        toast.warning('Falha na detecção. Continue mesmo assim.');
      }
    }

    setActiveCapture(null);
    stopCamera();
  }, []);

  const startCapture = async (position: CapturePosition) => {
    setActiveCapture(position);
    await startCamera();
  };

  const handleFileUpload = (position: CapturePosition) => {
    setUploadTarget(position);
    fileInputRef.current?.click();
  };

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    setPhotos(prev => ({ ...prev, [uploadTarget]: dataUrl }));
    setPhotoBlobs(prev => ({ ...prev, [uploadTarget]: file }));

    // Run pose detection on uploaded image
    if (poseLandmarkerRef.current) {
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; });
        const result = poseLandmarkerRef.current.detect(img);
        if (result.landmarks && result.landmarks.length > 0) {
          const kp: PoseKeypoint[] = result.landmarks[0].map((lm: any, i: number) => ({
            name: `point_${i}`,
            x: lm.x,
            y: lm.y,
            confidence: lm.visibility ?? lm.score ?? 0.5,
          }));
          setKeypoints(prev => ({ ...prev, [uploadTarget]: kp }));
          toast.success(`Pose detectada (${POSITION_LABELS[uploadTarget]})`);
        } else {
          toast.warning('Corpo não detectado na foto.');
        }
      } catch {
        toast.warning('Falha na detecção. Continue mesmo assim.');
      }
    }

    setUploadTarget(null);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadTarget]);

  const processResults = useCallback(() => {
    setProcessing(true);
    setTimeout(() => {
      // Use front keypoints primarily
      const frontKp = keypoints.front;
      const sideKp = keypoints.side;

      const calculatedAngles = calculatePostureAngles(frontKp || []);

      // If side keypoints exist, improve head_forward estimation
      if (sideKp && sideKp.length > 10) {
        const sideAngles = calculatePostureAngles(sideKp);
        if (sideAngles.head_forward !== null) {
          calculatedAngles.head_forward = sideAngles.head_forward;
        }
      }

      const scores = calculateRegionScores(calculatedAngles);
      setAngles(calculatedAngles);
      setRegionScores(scores);
      setProcessing(false);
      setStep(3);
    }, 1500);
  }, [keypoints]);

  const uploadPhoto = async (blob: Blob, position: string): Promise<string | null> => {
    const fileName = `${studentId}/${Date.now()}_${position}.jpg`;
    const { data, error } = await supabase.storage
      .from('scan-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg' });

    if (error) { console.error('Upload error:', error); return null; }
    const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!studentId || !user) return;
    setSaving(true);
    try {
      // Upload photos
      const [frontUrl, sideUrl, backUrl] = await Promise.all([
        photoBlobs.front ? uploadPhoto(photoBlobs.front, 'front') : null,
        photoBlobs.side ? uploadPhoto(photoBlobs.side, 'side') : null,
        photoBlobs.back ? uploadPhoto(photoBlobs.back, 'back') : null,
      ]);

      const { error } = await supabase.from('posture_scans').insert({
        student_id: studentId,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        sex,
        device_has_lidar: false,
        mode: '2d',
        front_photo_url: frontUrl,
        side_photo_url: sideUrl,
        back_photo_url: backUrl,
        pose_keypoints_json: keypoints as any,
        angles_json: angles as any,
        region_scores_json: regionScores as any,
        notes,
      });

      if (error) throw error;
      toast.success('Análise de postura salva!');
      navigate(`/alunos/${studentId}`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusColor = (status: string) => {
    return status === 'risk' ? 'text-red-500' : status === 'attention' ? 'text-yellow-500' : 'text-green-500';
  };

  const statusBg = (status: string) => {
    return status === 'risk' ? 'bg-red-500/10 border-red-500/30' : status === 'attention' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30';
  };

  const statusLabel = (status: string) => {
    return status === 'risk' ? 'Risco elevado' : status === 'attention' ? 'Atenção' : 'OK';
  };

  const hasAllPhotos = photos.front && photos.side && photos.back;
  const hasAnyKeypoints = keypoints.front || keypoints.side || keypoints.back;

  // Map region scores to BodyModel3D measurements
  const bodyMeasurements: BodyMeasurement[] = regionScores.map(s => ({
    key: s.region,
    label: s.label,
    value: s.angle ?? null,
    unit: s.angle !== null ? '°' : '',
    status: s.status,
    history: [],
  }));

  return (
    <AppLayout title="Análise 3D + Postura">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)}>
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

        {/* ─── Step 0: Pre-check ─── */}
        {step === 0 && (
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-lg">Pré-check — Informações do Aluno</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Altura (cm) *</Label>
                  <Input type="number" placeholder="170" value={heightCm} onChange={e => setHeightCm(e.target.value)} />
                </div>
                <div>
                  <Label>Sexo</Label>
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
                    {poseError
                      ? 'Detecção automática indisponível. Você poderá avaliar manualmente.'
                      : poseReady
                        ? 'Detecção de pose por IA ativa. O sistema vai identificar pontos do corpo automaticamente.'
                        : 'Aguarde o carregamento do modelo de IA...'}
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
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileSelected}
            />

            {/* Camera view */}
            {activeCapture && (
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0 relative">
                  <video ref={videoRef} className="w-full max-h-[60vh] object-contain bg-black" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Guide overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="border-2 border-primary/30 border-dashed rounded-lg w-[60%] h-[85%]" />
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                    <Button variant="outline" onClick={() => { stopCamera(); setActiveCapture(null); }}>
                      Cancelar
                    </Button>
                    <Button onClick={() => capturePhoto(activeCapture)} size="lg" className="rounded-full w-16 h-16">
                      <Camera className="w-6 h-6" />
                    </Button>
                  </div>
                  <div className="absolute top-4 left-0 right-0 text-center">
                    <span className="bg-background/80 backdrop-blur-sm text-sm font-medium px-4 py-2 rounded-full">
                      Capturar: {POSITION_LABELS[activeCapture]}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {!activeCapture && (
              <>
                <Card className="glass-card">
                  <CardHeader><CardTitle className="text-lg">Captura — 3 Posições</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                        <div key={pos} className="space-y-2">
                          <div
                            className={`aspect-[3/4] rounded-lg border-2 border-dashed flex items-center justify-center transition-all overflow-hidden ${
                              photos[pos] ? 'border-primary/50' : 'border-border'
                            }`}
                          >
                            {photos[pos] ? (
                              <img src={photos[pos]!} className="w-full h-full object-cover" alt={pos} />
                            ) : (
                              <div className="text-center p-2">
                                <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">{POSITION_LABELS[pos]}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            {photos[pos] ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-[10px] text-green-500">Capturado</span>
                                {keypoints[pos] && <span className="text-[10px] text-primary ml-1">+ Pose</span>}
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Pendente</span>
                            )}
                          </div>
                          {/* Action buttons: Camera + Upload */}
                          <div className="flex gap-1">
                            <Button
                              variant={photos[pos] ? 'ghost' : 'outline'}
                              size="sm"
                              className="flex-1 text-[10px] h-7 px-1"
                              onClick={() => startCapture(pos)}
                            >
                              <Camera className="w-3 h-3 mr-0.5" />
                              {photos[pos] ? 'Refazer' : 'Câmera'}
                            </Button>
                            <Button
                              variant={photos[pos] ? 'ghost' : 'outline'}
                              size="sm"
                              className="flex-1 text-[10px] h-7 px-1"
                              onClick={() => handleFileUpload(pos)}
                            >
                              <Upload className="w-3 h-3 mr-0.5" />
                              Anexar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(0)}>
                    <ChevronLeft className="mr-1 w-4 h-4" /> Voltar
                  </Button>
                  <Button onClick={() => { setStep(2); processResults(); }} disabled={!hasAllPhotos} className="flex-1">
                    Processar Análise <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
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
              <p className="text-sm text-muted-foreground">Calculando ângulos, simetrias e scores por região.</p>
              <div className="w-48 mx-auto bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '70%' }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Step 3: Results ─── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Summary scores */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-lg">Resultado — Scores por Região</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {regionScores.map((score, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${statusBg(score.status)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{score.label}</span>
                        <span className={`text-xs font-bold ${statusColor(score.status)}`}>
                          {statusLabel(score.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{score.note}</p>
                      {score.angle !== null && score.angle !== undefined && (
                        <p className="text-[10px] text-muted-foreground mt-1">Ângulo: {score.angle}°</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Photos with overlay */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Fotos com Overlay</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {(['front', 'side', 'back'] as CapturePosition[]).map(pos => (
                    <div key={pos} className="space-y-1">
                      <p className="text-xs text-muted-foreground text-center">{POSITION_LABELS[pos]}</p>
                      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted/20">
                        {photos[pos] && (
                          <PhotoOverlay
                            photoUrl={photos[pos]!}
                            keypoints={keypoints[pos]}
                            scores={regionScores}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 3D Body Map */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Mapa Corporal 3D — Pontos de Atenção</CardTitle></CardHeader>
              <CardContent>
                <BodyModel3D
                  measurements={bodyMeasurements}
                  defaultGender={sex === 'feminino' ? 'female' : 'male'}
                />
              </CardContent>
            </Card>

            {/* Notes */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Observações adicionais..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 w-4 h-4" /> Refazer Captura
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Avaliação'}
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <FileDown className="mr-2 w-4 h-4" /> Exportar PDF
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

// Photo overlay component
const PhotoOverlay = ({ photoUrl, keypoints, scores }: {
  photoUrl: string;
  keypoints: PoseKeypoint[] | null;
  scores: RegionScore[];
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current || !canvasRef.current || !keypoints) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;

    const draw = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      drawPoseOverlay(ctx, keypoints, img.naturalWidth, img.naturalHeight, scores);
    };

    if (img.complete) draw();
    else img.onload = draw;
  }, [photoUrl, keypoints, scores]);

  return (
    <>
      <img ref={imgRef} src={photoUrl} className="hidden" crossOrigin="anonymous" />
      {keypoints ? (
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
      ) : (
        <img src={photoUrl} className="w-full h-full object-contain" />
      )}
    </>
  );
};

export default PostureAnalysis;
