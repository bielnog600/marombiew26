import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { X, Volume2, VolumeX, SwitchCamera, Loader2, Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  FULL_BODY_HOLD_MS, SKELETON_COLOR, SIDE_POINTS, ERROR_MESSAGES,
  LandmarkSmoother, SquatRepCounter, canSpeak, errorsToJson, frameMetrics,
  isFullBodyVisible, pickSide, summarizeReps,
  type Landmark, type RepResult, type SessionSummary, type Side,
} from '@/lib/liveCorrection/squatAnalysis';

const MP_VERSION = '0.10.17';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
/** Corpo fora do quadro por mais que isto cancela a rep em andamento. */
const BODY_LOST_MS = 600;

type Phase = 'intro' | 'loading' | 'positioning' | 'tracking' | 'saving' | 'summary' | 'error';
type Facing = 'user' | 'environment';

interface Props {
  studentId: string;
  exerciseName: string;
  onClose: () => void;
}

interface Feedback { text: string; tone: 'ok' | 'error' | 'info' }

function drawSkeleton(canvas: HTMLCanvasElement, video: HTMLVideoElement, lms: Landmark[] | null, side: Side) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!lms || !vw || !vh) return;
  // mesmo recorte do object-cover do vídeo
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const P = (i: number) => ({ x: lms[i].x * vw * scale + ox, y: lms[i].y * vh * scale + oy });

  ctx.strokeStyle = SKELETON_COLOR;
  ctx.fillStyle = SKELETON_COLOR;
  ctx.shadowColor = SKELETON_COLOR;
  ctx.lineCap = 'round';
  (['left', 'right'] as Side[]).forEach((s) => {
    const main = s === side;
    const p = SIDE_POINTS[s];
    const chain = [p.shoulder, p.hip, p.knee, p.ankle];
    ctx.globalAlpha = main ? 1 : 0.3;
    ctx.lineWidth = main ? 4 : 2;
    ctx.shadowBlur = main ? 10 : 0;
    ctx.beginPath();
    chain.forEach((i, k) => {
      const pt = P(i);
      if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.shadowBlur = main ? 14 : 0;
    chain.forEach((i) => {
      const pt = P(i);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, main ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

const LiveCorrectionScreen: React.FC<Props> = ({ studentId, exerciseName, onClose }) => {
  const [phase, setPhase] = useState<Phase>('intro');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [voiceOn, setVoiceOn] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const [reps, setReps] = useState<RepResult[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const smootherRef = useRef(new LandmarkSmoother());
  const counterRef = useRef(new SquatRepCounter());
  const phaseRef = useRef<Phase>('intro');
  const sideRef = useRef<Side>('left');
  const holdStartRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const lastSpokeRef = useRef<number | null>(null);
  const voiceOnRef = useRef(true);
  const feedbackTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const speak = useCallback((text: string, force = false) => {
    if (!voiceOnRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (!force && !canSpeak(lastSpokeRef.current, now)) return;
    lastSpokeRef.current = now;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      u.rate = 1.05;
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang?.toLowerCase() === 'pt-br') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('pt'));
      if (voice) u.voice = voice;
      synth.speak(u);
    } catch { /* voz indisponível */ }
  }, []);

  const showFeedback = useCallback((fb: Feedback, ms = 2500) => {
    setFeedback(fb);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), ms);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async (mode: Facing) => {
    stopStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: mode }, width: { ideal: 640 }, height: { ideal: 480 } },
    });
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', 'true');
    await video.play().catch(() => undefined);
    lastVideoTimeRef.current = -1;
  }, [stopStream]);

  const processFrame = useCallback((raw: Landmark[] | undefined, now: number) => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    const lms = raw && raw.length ? smootherRef.current.push(raw) : null;
    if (!raw) smootherRef.current.reset();
    const counter = counterRef.current;
    if (lms && !counter.inRep) sideRef.current = pickSide(lms);
    const side = sideRef.current;
    drawSkeleton(canvas, video, lms, side);
    const full = isFullBodyVisible(lms, side);
    const p = phaseRef.current;

    if (p === 'positioning') {
      if (full) {
        if (holdStartRef.current == null) holdStartRef.current = now;
        const prog = Math.min(1, (now - holdStartRef.current) / FULL_BODY_HOLD_MS);
        setHoldProgress(Math.round(prog * 20) / 20);
        if (prog >= 1) {
          counter.reset();
          setReps([]);
          startedAtRef.current = new Date();
          setPhase('tracking');
          showFeedback({ text: 'Pode começar!', tone: 'ok' }, 2000);
          speak('Pode começar', true);
        }
      } else {
        holdStartRef.current = null;
        setHoldProgress(0);
      }
      return;
    }

    if (p !== 'tracking') return;
    if (!full || !lms) {
      if (lostSinceRef.current == null) lostSinceRef.current = now;
      if (now - lostSinceRef.current > BODY_LOST_MS) {
        if (counter.inRep) counter.abortRep();
        showFeedback({ text: 'Corpo inteiro na câmera', tone: 'info' }, 1500);
      }
      return;
    }
    lostSinceRef.current = null;
    const rep = counter.update(frameMetrics(lms, video.videoWidth || 1, video.videoHeight || 1, side));
    if (!rep) return;
    setReps([...counter.reps]);
    if (rep.errors.length) {
      const text = rep.errors.map((e) => ERROR_MESSAGES[e]).join(' · ');
      showFeedback({ text, tone: 'error' });
      speak(rep.errors.map((e) => ERROR_MESSAGES[e]).join('. '));
    } else {
      showFeedback({ text: 'Boa!', tone: 'ok' }, 1200);
    }
  }, [showFeedback, speak]);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current, lm = landmarkerRef.current;
    if (!video || !lm || video.readyState < 2) return;
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;
    const now = performance.now();
    try {
      const res = lm.detectForVideo(video, now);
      processFrame(res.landmarks?.[0] as Landmark[] | undefined, now);
    } catch { /* frame perdido */ }
  }, [processFrame]);

  const begin = useCallback(async () => {
    // Toque do usuário: libera a voz no iPhone.
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch { /* ignore */ }
    setPhase('loading');
    setErrorText(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unsupported');
      const cameraPromise = startCamera(facing);
      if (!landmarkerRef.current) {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const create = (delegate: 'GPU' | 'CPU') => vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        landmarkerRef.current = await create('GPU').catch(() => create('CPU'));
      }
      await cameraPromise;
      try { wakeLockRef.current = await (navigator as any).wakeLock?.request?.('screen'); } catch { /* opcional */ }
      holdStartRef.current = null;
      smootherRef.current.reset();
      setPhase('positioning');
      stopLoop();
      rafRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      stopStream();
      const name = e?.name ?? '';
      setErrorText(
        name === 'NotAllowedError' ? 'A câmera foi bloqueada. Libere o acesso à câmera nas configurações do navegador e tente de novo.'
          : name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste aparelho.'
          : e?.message === 'camera_unsupported' ? 'Este navegador não permite usar a câmera.'
          : 'Não foi possível abrir a câmera ou carregar o reconhecimento. Verifique a internet e tente de novo.',
      );
      setPhase('error');
    }
  }, [facing, loop, startCamera, stopLoop, stopStream]);

  const switchCamera = useCallback(async () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    if (phaseRef.current === 'positioning' || phaseRef.current === 'tracking') {
      counterRef.current.abortRep();
      smootherRef.current.reset();
      try { await startCamera(next); } catch { showFeedback({ text: 'Não foi possível trocar a câmera', tone: 'info' }); }
    }
  }, [facing, startCamera, showFeedback]);

  const releaseAll = useCallback(() => {
    stopLoop();
    stopStream();
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    try { wakeLockRef.current?.release?.(); } catch { /* ignore */ }
    wakeLockRef.current = null;
  }, [stopLoop, stopStream]);

  const save = useCallback(async (s: SessionSummary) => {
    setPhase('saving');
    setSaveError(null);
    const started = startedAtRef.current ?? new Date();
    const ended = new Date();
    const { error } = await supabase.from('camera_sessions').insert({
      student_id: studentId,
      exercise_name: exerciseName,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000)),
      total_reps: s.total,
      complete_reps: s.complete,
      incomplete_reps: s.incomplete,
      errors: errorsToJson(s),
      camera_side: sideRef.current,
    });
    if (error) setSaveError('Não foi possível salvar a sessão. Tente de novo.');
    setPhase('summary');
  }, [exerciseName, studentId]);

  const finish = useCallback(() => {
    releaseAll();
    const s = summarizeReps(counterRef.current.reps);
    setSummary(s);
    if (s.total > 0) void save(s); else setPhase('summary');
  }, [releaseAll, save]);

  useEffect(() => () => {
    releaseAll();
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, [releaseAll]);

  const close = () => { releaseAll(); onClose(); };

  const complete = reps.filter((r) => r.complete).length;
  const incomplete = reps.length - complete;
  const live = phase === 'loading' || phase === 'positioning' || phase === 'tracking';
  const mirrored = facing === 'user';

  const content = (
    <div
      className="fixed inset-0 z-[200] bg-background text-foreground overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Correção ao vivo"
      data-testid="live-correction-screen"
    >
      {/* Câmera + esqueleto */}
      <div className={cn('absolute inset-0', !live && 'hidden')} style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
      </div>

      {/* Topo */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3 bg-gradient-to-b from-background/80 to-transparent pb-6"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="h-11 w-11 shrink-0 rounded-full bg-card/80 border border-border flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>

        {phase === 'tracking' ? (
          <div className="flex flex-col items-center min-w-0" aria-live="polite">
            <span className="text-7xl font-black leading-none text-primary tabular-nums drop-shadow" data-testid="live-rep-count">{complete}</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">reps completas</span>
            {incomplete > 0 && (
              <span className="mt-1 text-sm font-bold text-destructive">{incomplete} incompleta{incomplete > 1 ? 's' : ''}</span>
            )}
            {reps.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1 max-w-[220px]">
                {reps.slice(-15).map((r) => (
                  <span
                    key={r.index}
                    className={cn('h-2.5 w-2.5 rounded-full', r.complete ? 'bg-primary' : 'bg-destructive')}
                    title={`Rep ${r.index}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center pt-2 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Correção ao vivo</p>
            <p className="text-sm font-semibold truncate">{exerciseName}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setVoiceOn((v) => { if (v) { try { window.speechSynthesis?.cancel(); } catch { /* */ } } return !v; })}
            aria-label={voiceOn ? 'Desligar voz' : 'Ligar voz'}
            aria-pressed={voiceOn}
            className={cn('h-11 w-11 rounded-full border flex items-center justify-center', voiceOn ? 'bg-primary text-primary-foreground border-primary' : 'bg-card/80 border-border text-muted-foreground')}
          >
            {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          {(phase === 'intro' || live) && (
            <button
              type="button"
              onClick={switchCamera}
              aria-label={facing === 'user' ? 'Usar câmera traseira' : 'Usar câmera frontal'}
              className="h-11 w-11 rounded-full bg-card/80 border border-border flex items-center justify-center"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Intro */}
      {phase === 'intro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="h-20 w-20 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Camera className="h-9 w-9 text-primary" />
          </div>
          <p className="text-xl font-bold leading-snug max-w-sm">
            Coloca o celular no chão, de lado pra você, com o corpo inteiro aparecendo
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            A contagem começa sozinha quando o corpo inteiro aparecer por 2 segundos.
          </p>
          <p className="text-xs text-muted-foreground">Câmera {facing === 'user' ? 'frontal' : 'traseira'} · troque no botão ao lado</p>
          <Button size="lg" className="h-12 px-10 font-bold" onClick={begin}>Começar</Button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Abrindo a câmera…</p>
        </div>
      )}

      {phase === 'positioning' && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pt-10 bg-gradient-to-t from-background/90 to-transparent" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <p className="text-center text-lg font-bold leading-snug">
            {holdProgress > 0 ? 'Fica assim…' : 'Coloca o celular no chão, de lado pra você, com o corpo inteiro aparecendo'}
          </p>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${holdProgress * 100}%` }} />
          </div>
        </div>
      )}

      {phase === 'tracking' && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-10 bg-gradient-to-t from-background/90 to-transparent" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="min-h-[64px] flex items-center justify-center mb-3" aria-live="assertive">
            {feedback && (
              <span
                className={cn(
                  'rounded-2xl px-5 py-3 text-2xl font-black text-center border',
                  feedback.tone === 'error' && 'bg-destructive text-destructive-foreground border-destructive',
                  feedback.tone === 'ok' && 'bg-primary text-primary-foreground border-primary',
                  feedback.tone === 'info' && 'bg-card/90 text-foreground border-border',
                )}
                data-testid="live-feedback"
              >
                {feedback.text}
              </span>
            )}
          </div>
          <Button size="lg" className="w-full h-12 font-bold" onClick={finish}>Finalizar</Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-base font-semibold max-w-sm">{errorText}</p>
          <Button onClick={begin} className="font-bold">Tentar de novo</Button>
        </div>
      )}

      {phase === 'saving' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Salvando…</p>
        </div>
      )}

      {phase === 'summary' && summary && (
        <div className="absolute inset-0 overflow-y-auto px-5 pt-24" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }} data-testid="live-summary">
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-2xl font-black text-center">Resumo</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="glass-card rounded-2xl p-3 text-center">
                <p className="text-3xl font-black tabular-nums">{summary.total}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
              </div>
              <div className="glass-card rounded-2xl p-3 text-center">
                <p className="text-3xl font-black tabular-nums text-primary">{summary.complete}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Completas</p>
              </div>
              <div className="glass-card rounded-2xl p-3 text-center">
                <p className="text-3xl font-black tabular-nums text-destructive">{summary.incomplete}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Incompletas</p>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Erros mais comuns</p>
              {summary.errors.length === 0 ? (
                <p className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Nenhum erro detectado</p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.errors.map((e) => (
                    <li key={e.key} className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{e.label}</span>
                      <span className="text-muted-foreground tabular-nums">{e.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {summary.total === 0 && (
              <p className="text-sm text-center text-muted-foreground">Nenhuma rep contada, então nada foi salvo.</p>
            )}
            {saveError && (
              <div className="text-center space-y-2">
                <p className="text-sm text-destructive">{saveError}</p>
                <Button variant="outline" onClick={() => save(summary)}>Tentar salvar de novo</Button>
              </div>
            )}
            {summary.total > 0 && !saveError && (
              <p className="text-xs text-center text-muted-foreground">Sessão salva.</p>
            )}
            <Button size="lg" className="w-full h-12 font-bold" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default LiveCorrectionScreen;
