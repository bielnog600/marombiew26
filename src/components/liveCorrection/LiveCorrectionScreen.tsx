import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHoldAppUpdate } from '@/hooks/useHoldAppUpdate';
import { createPortal } from 'react-dom';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { X, Volume2, VolumeX, SwitchCamera, Loader2, Camera, CheckCircle2, AlertTriangle, Timer, RotateCcw, ClipboardCheck, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  FULL_BODY_HOLD_MS, SKELETON_COLOR, SIDE_POINTS,
  POSITION_MESSAGES, AUTO_FINISH_MESSAGE,
  DEPTH_LEVELS, DEPTH_LEVEL_ORDER, DEFAULT_DEPTH_LEVEL, normalizeDepthLevel, type DepthLevel,
  LandmarkSmoother, StillnessDetector, FacingGate, AutoFinishDetector,
  canSpeak, isFullBodyVisible, isFacingCamera, isStillMovement,
  diagnosePositioning, countdownValue, planRepSpeech, repNumberWord,
  type Landmark, type PositionIssue, type Side,
} from '@/lib/liveCorrection/squatAnalysis';
import {
  EXERCISE_RULE_ORDER, DEFAULT_EXERCISE_RULE, LEG_LABELS, getExerciseRule, matchExerciseRule,
  summarizeLiveReps, summarizeByLeg, autoFinishRepCount, ARM_POINTS,
  FACE_CAMERA_MESSAGE, isWrongView, wrongViewMessage, speakableErrors, markSpokenOnce,
  type ExerciseRule, type ExerciseRuleId, type LiveRep, type LiveRepCounter, type LiveSessionSummary, type SilhouetteKind,
} from '@/lib/liveCorrection/exercises';

const MP_VERSION = '0.10.17';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
/** Corpo fora do quadro por mais que isto cancela a rep em andamento. */
const BODY_LOST_MS = 600;
/** Aviso de posicionamento só fala depois de se manter por este tempo. */
const HINT_STABLE_MS = 700;
/** O mesmo aviso de posicionamento só se repete depois deste tempo. */
const HINT_REPEAT_MS = 6000;

type Phase = 'intro' | 'loading' | 'positioning' | 'countdown' | 'tracking' | 'saving' | 'summary' | 'error';
type Facing = 'user' | 'environment';

interface Props {
  studentId: string;
  exerciseName: string;
  onClose: () => void;
  /** Preenche as reps completas na série que estava ativa ao abrir a câmera. Sem isto, o botão não aparece. */
  onSaveToSet?: (completeReps: number) => void;
  /** Nome da série de destino, ex.: "Série 2". */
  targetSetLabel?: string;
  /** Teste do admin: mostra um seletor para trocar a profundidade exigida na própria tela. */
  depthLevelPicker?: boolean;
  /** Teste do admin: mostra um seletor de exercício (agachamento, stiff, búlgaro). */
  exercisePicker?: boolean;
  /** Regra a usar; sem isto, vem do nome do exercício (sem casar = agachamento). */
  exerciseRule?: ExerciseRuleId;
}

/** Mensagem do aviso de posicionamento, conforme a vista exigida pela regra. */
const positionMessage = (rule: ExerciseRule, issue: Exclude<PositionIssue, 'ok'>) =>
  issue === 'frontal' && rule.view === 'front' ? FACE_CAMERA_MESSAGE : POSITION_MESSAGES[issue];
const turnMessage = (rule: ExerciseRule) => wrongViewMessage(rule.view);
const formatSeconds = (v: number | null) =>
  v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

/** Seletor de exercício (só no teste do admin). */
const ExercisePicker: React.FC<{ value: ExerciseRuleId; onChange: (v: ExerciseRuleId) => void }> = ({ value, onChange }) => (
  <div className="w-full max-w-sm" data-testid="live-exercise-picker">
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 text-center">Exercício (teste)</p>
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Exercício">
      {EXERCISE_RULE_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'min-h-11 rounded-xl border px-2 py-2 text-xs font-bold leading-tight',
            value === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card/80 border-border text-foreground',
          )}
        >
          {getExerciseRule(id).label}
        </button>
      ))}
    </div>
  </div>
);

/** Perna da frente (búlgaro/afundo). */
const FrontLegPicker: React.FC<{ value: Side | null; onChange: (v: Side) => void }> = ({ value, onChange }) => (
  <div className="w-full max-w-sm" data-testid="live-front-leg-picker">
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 text-center">Perna da frente</p>
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Perna da frente">
      {(['left', 'right'] as Side[]).map((leg) => (
        <button
          key={leg}
          type="button"
          role="radio"
          aria-checked={value === leg}
          onClick={() => onChange(leg)}
          className={cn(
            'min-h-11 rounded-xl border px-2 py-2 text-sm font-bold',
            value === leg ? 'bg-primary text-primary-foreground border-primary' : 'bg-card/80 border-border text-foreground',
          )}
        >
          {LEG_LABELS[leg]}
        </button>
      ))}
    </div>
  </div>
);

/** Seletor dos 4 níveis de profundidade (só no teste do admin). */
const DepthLevelPicker: React.FC<{ value: DepthLevel; onChange: (v: DepthLevel) => void; hints: Record<DepthLevel, string> }> = ({ value, onChange, hints }) => (
  <div className="w-full max-w-sm" data-testid="live-depth-picker">
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 text-center">Profundidade exigida (teste)</p>
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Profundidade exigida">
      {DEPTH_LEVEL_ORDER.map((lvl) => (
        <button
          key={lvl}
          type="button"
          role="radio"
          aria-checked={value === lvl}
          onClick={() => onChange(lvl)}
          className={cn(
            'min-h-11 rounded-xl border px-2 py-2 text-xs font-bold leading-tight',
            value === lvl ? 'bg-primary text-primary-foreground border-primary' : 'bg-card/80 border-border text-foreground',
          )}
        >
          {DEPTH_LEVELS[lvl].label}
        </button>
      ))}
    </div>
    <p className="mt-1.5 text-[11px] text-center text-muted-foreground">{hints[value]}</p>
  </div>
);

/** Pessoa de lado em base afundada (búlgaro com banco ou afundo), para guiar o posicionamento. */
const SplitSilhouette: React.FC<{ active: boolean; bench: boolean }> = ({ active, bench }) => (
  <svg
    viewBox="0 0 160 260"
    className={cn('h-[68%] max-h-[560px] text-primary transition-opacity duration-300', active ? 'opacity-70' : 'opacity-40')}
    fill="none"
    aria-hidden="true"
    data-testid="live-guide-silhouette"
    data-silhouette={bench ? 'split_bench' : 'split'}
  >
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5">
      <circle cx="62" cy="24" r="14" strokeWidth="2.5" fill="currentColor" fillOpacity="0.15" />
      <path d="M62 40 L64 122" />
      <path d="M63 50 L60 110" strokeWidth="3.5" />
      <path d="M64 122 L44 186 L44 248 L30 248" />
      {bench ? <path d="M64 122 L98 184 L128 168" /> : <path d="M64 122 L96 186 L118 246 L128 248" />}
    </g>
    {bench && (
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 5" fill="currentColor" fillOpacity="0.12">
        <rect x="112" y="168" width="44" height="10" rx="2" />
        <path d="M118 178 L118 250 M150 178 L150 250" fill="none" />
      </g>
    )}
  </svg>
);

/** De frente, da cintura pra cima, braços ao lado do corpo (elevação lateral). */
const FrontUpperSilhouette: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 200 220"
    className={cn('w-[78%] max-w-[420px] text-primary transition-opacity duration-300', active ? 'opacity-70' : 'opacity-40')}
    fill="none"
    aria-hidden="true"
    data-testid="live-guide-silhouette"
    data-silhouette="front_upper"
  >
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5">
      <circle cx="100" cy="34" r="22" fill="currentColor" fillOpacity="0.15" />
      <path d="M60 72 L140 72 L132 196 L68 196 Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M60 74 L50 136 L46 196" strokeWidth="5" />
      <path d="M140 74 L150 136 L154 196" strokeWidth="5" />
    </g>
  </svg>
);

/** Deitado de lado com as costas no banco (elevação pélvica). */
const HipThrustSilhouette: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 260 160"
    className={cn('w-[86%] max-w-[520px] text-primary transition-opacity duration-300', active ? 'opacity-70' : 'opacity-40')}
    fill="none"
    aria-hidden="true"
    data-testid="live-guide-silhouette"
    data-silhouette="hip_thrust"
  >
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5">
      <circle cx="30" cy="62" r="13" strokeWidth="2.5" fill="currentColor" fillOpacity="0.15" />
      <path d="M44 72 L130 84 L184 70 L190 146 L208 146" />
    </g>
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 5" fill="currentColor" fillOpacity="0.12">
      <rect x="20" y="82" width="60" height="10" rx="2" />
      <path d="M28 92 L28 150 M72 92 L72 150" fill="none" />
    </g>
  </svg>
);

/** De lado, da cintura pra cima, com o braço dobrado (rosca, tríceps francês). */
const SideUpperSilhouette: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 160 220"
    className={cn('h-[60%] max-h-[480px] text-primary transition-opacity duration-300', active ? 'opacity-70' : 'opacity-40')}
    fill="none"
    aria-hidden="true"
    data-testid="live-guide-silhouette"
    data-silhouette="side_upper"
  >
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5">
      <circle cx="76" cy="30" r="20" fill="currentColor" fillOpacity="0.15" />
      <path d="M62 56 C54 70 52 92 54 118 L56 200 L94 200 L96 118 C98 92 96 70 88 56 Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M76 70 L80 132 L120 104" strokeWidth="5" />
    </g>
  </svg>
);

/** Contorno de uma pessoa de lado, para guiar o posicionamento. */
const GuideSilhouette: React.FC<{ active: boolean; kind?: SilhouetteKind }> = ({ active, kind = 'standing' }) =>
  kind === 'front_upper' ? <FrontUpperSilhouette active={active} />
  : kind === 'side_upper' ? <SideUpperSilhouette active={active} />
  : kind === 'hip_thrust' ? <HipThrustSilhouette active={active} />
  : kind !== 'standing' ? <SplitSilhouette active={active} bench={kind === 'split_bench'} /> : (
  <svg
    viewBox="0 0 100 260"
    className={cn('h-[68%] max-h-[560px] text-primary transition-opacity duration-300', active ? 'opacity-70' : 'opacity-40')}
    fill="none"
    aria-hidden="true"
    data-testid="live-guide-silhouette"
  >
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5">
      <circle cx="52" cy="22" r="15" fill="currentColor" fillOpacity="0.15" />
      <path
        d="M46 38 C40 46 37 56 37 68 L35 118 C34 130 36 140 40 147 L40 200 C40 214 39 228 38 240 L36 252 L62 252 L58 244 C56 230 56 214 56 200 L58 147 C63 138 65 128 64 118 L65 68 C65 56 62 46 58 38 Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M51 62 C53 82 55 100 55 122" />
    </g>
  </svg>
  );

interface Feedback { text: string; tone: 'ok' | 'error' | 'info' }

function drawSkeleton(canvas: HTMLCanvasElement, video: HTMLVideoElement, lms: Landmark[] | null, side: Side, kind: 'legs' | 'arms' | 'arm_side' = 'legs') {
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
    // Braços (vista de frente): os dois lados contam igual.
    const main = kind === 'arms' || s === side;
    const p = SIDE_POINTS[s], a = ARM_POINTS[s];
    // De lado (rosca, tríceps francês): braço medido em destaque.
    const chain = kind !== 'legs' ? [a.hip, a.shoulder, a.elbow, a.wrist] : [p.shoulder, p.hip, p.knee, p.ankle];
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

const LiveCorrectionScreen: React.FC<Props> = ({
  studentId, exerciseName, onClose, onSaveToSet, targetSetLabel, depthLevelPicker = false, exercisePicker = false, exerciseRule,
}) => {
  // Versão nova do app nunca recarrega com a câmera aberta.
  useHoldAppUpdate(true);
  const [phase, setPhase] = useState<Phase>('intro');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [voiceOn, setVoiceOn] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const [reps, setReps] = useState<LiveRep[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<LiveSessionSummary | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issue, setIssue] = useState<PositionIssue>('no_body');
  const [countdown, setCountdown] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoFinished, setAutoFinished] = useState(false);
  const [depthLevel, setDepthLevel] = useState<DepthLevel>(DEFAULT_DEPTH_LEVEL);
  const [ruleId, setRuleId] = useState<ExerciseRuleId>(() => exerciseRule ?? matchExerciseRule(exerciseName)?.id ?? DEFAULT_EXERCISE_RULE);
  const rule = getExerciseRule(ruleId);
  const [frontLeg, setFrontLeg] = useState<Side | null>(null);
  /** Voltou a posicionar depois de "Trocar perna": a série continua com as reps já feitas. */
  const [resuming, setResuming] = useState(false);
  /** Regra da série mostrada no resumo (o teste do admin pode trocar o seletor depois). */
  const [summaryRuleId, setSummaryRuleId] = useState<ExerciseRuleId>(ruleId);
  const summaryRule = getExerciseRule(summaryRuleId);
  /** Nome salvo/exibido: no teste do admin, o exercício escolhido no seletor. */
  const displayName = exercisePicker ? `${rule.label} (teste)` : exerciseName;
  const instructionName = exercisePicker ? null : exerciseName;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const smootherRef = useRef(new LandmarkSmoother());
  const counterRef = useRef<LiveRepCounter | null>(null);
  // Um contador por regra; trocar de exercício (teste do admin) cria um novo.
  if (!counterRef.current || counterRef.current.ruleId !== rule.id) {
    counterRef.current = rule.createCounter(depthLevel, frontLeg ?? 'left', instructionName);
  }
  const ruleRef = useRef(rule);
  ruleRef.current = rule;
  const resumeRef = useRef(false);
  const phaseRef = useRef<Phase>('intro');
  const sideRef = useRef<Side>('left');
  const holdStartRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const lastSpokeRef = useRef<number | null>(null);
  const voiceOnRef = useRef(true);
  const feedbackTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const wakeLockRef = useRef<any>(null);
  const stillRef = useRef(new StillnessDetector(undefined, rule.stillPoints, rule.stillScale));
  const stillRuleRef = useRef<ExerciseRuleId>(rule.id);
  // Cada regra mede "parado" com os próprios pontos (elevação lateral não usa tornozelo).
  if (stillRuleRef.current !== rule.id) {
    stillRuleRef.current = rule.id;
    stillRef.current = new StillnessDetector(undefined, rule.stillPoints, rule.stillScale);
  }
  /** Avisos de "1x por série" já falados nesta série. */
  const spokenOnceRef = useRef(new Set<string>());
  const facingGateRef = useRef(new FacingGate());
  const autoFinishRef = useRef(new AutoFinishDetector());
  const issueRef = useRef<PositionIssue>('no_body');
  const issueSinceRef = useRef(0);
  const lastHintRef = useRef<{ issue: PositionIssue; at: number } | null>(null);
  const countdownStartRef = useRef(0);
  const countdownShownRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const finishRef = useRef<(auto: boolean) => void>(() => undefined);

  /** Muda a fase já no ref, para o próximo frame não repetir a transição. */
  const goPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { counterRef.current?.setDepthLevel(depthLevel); }, [depthLevel]);
  useEffect(() => {
    if (frontLeg) { counterRef.current?.setFrontLeg?.(frontLeg); sideRef.current = frontLeg; }
  }, [frontLeg, ruleId]);
  // Profundidade escolhida pelo admin na ficha do aluno (sem perfil/erro = Intermediário).
  useEffect(() => {
    if (depthLevelPicker) return;
    let cancelled = false;
    supabase
      .from('students_profile')
      .select('camera_depth_level')
      .eq('user_id', studentId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setDepthLevel(normalizeDepthLevel(data?.camera_depth_level)); }, () => undefined);
    return () => { cancelled = true; };
  }, [studentId, depthLevelPicker]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const voiceAvailable = () => voiceOnRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window;

  /** Fala os textos em sequência (interrompe a fala anterior). */
  const speakSequence = useCallback((texts: string[]) => {
    if (!voiceAvailable() || !texts.length) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang?.toLowerCase() === 'pt-br') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('pt'));
      for (const text of texts) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.rate = 1.05;
        if (voice) u.voice = voice;
        synth.speak(u);
      }
    } catch { /* voz indisponível */ }
  }, []);

  const speak = useCallback((text: string, force = false) => {
    if (!voiceAvailable()) return;
    const now = Date.now();
    if (!force && !canSpeak(lastSpokeRef.current, now)) return;
    lastSpokeRef.current = now;
    speakSequence([text]);
  }, [speakSequence]);

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
    const w = video.videoWidth || 1, h = video.videoHeight || 1;
    const lms = raw && raw.length ? smootherRef.current.push(raw) : null;
    if (!raw) smootherRef.current.reset();
    const counter = counterRef.current;
    const currentRule = ruleRef.current;
    if (!counter) return;
    if (lms && !counter.inRep) sideRef.current = counter.measureSide(lms);
    const side = sideRef.current;
    drawSkeleton(canvas, video, lms, side, currentRule.skeleton);
    const full = currentRule.isBodyVisible ? currentRule.isBodyVisible(lms, side) : isFullBodyVisible(lms, side);
    const facingCamera = facingGateRef.current.update(!!lms && isFacingCamera(lms, w, h), now);
    // Vista errada: de frente numa regra de lado (ou de lado numa regra de frente).
    const frontal = isWrongView(currentRule.view, facingCamera, !!lms);
    const p = phaseRef.current;

    if (p === 'positioning') {
      let movement: number | null = null;
      if (lms) movement = stillRef.current.push(lms, now, w, h, side); else stillRef.current.reset();
      const next = diagnosePositioning({ hasBody: !!lms, fullBody: full, frontal, still: isStillMovement(movement) });
      if (next !== issueRef.current) {
        issueRef.current = next;
        issueSinceRef.current = now;
        setIssue(next);
      }
      // Fala o que está errado (aviso estável, sem repetir o mesmo antes de HINT_REPEAT_MS, limite de 3 s).
      if (next !== 'ok' && next !== 'no_body' && now - issueSinceRef.current >= HINT_STABLE_MS) {
        const last = lastHintRef.current;
        if ((!last || last.issue !== next || now - last.at >= HINT_REPEAT_MS) && canSpeak(lastSpokeRef.current, Date.now())) {
          lastHintRef.current = { issue: next, at: now };
          speak(positionMessage(currentRule, next));
        }
      }
      if (next === 'ok') {
        if (holdStartRef.current == null) holdStartRef.current = now;
        const prog = Math.min(1, (now - holdStartRef.current) / FULL_BODY_HOLD_MS);
        setHoldProgress(Math.round(prog * 20) / 20);
        if (prog >= 1) {
          countdownStartRef.current = now;
          countdownShownRef.current = null;
          goPhase('countdown');
        }
      } else {
        holdStartRef.current = null;
        setHoldProgress(0);
      }
      return;
    }

    if (p === 'countdown') {
      if (!full) {
        // Saiu do quadro durante a contagem: volta a posicionar.
        holdStartRef.current = null;
        setHoldProgress(0);
        stillRef.current.reset();
        goPhase('positioning');
        return;
      }
      const v = countdownValue(countdownStartRef.current, now);
      if (v !== countdownShownRef.current) {
        countdownShownRef.current = v;
        setCountdown(v);
        if (v > 0) { lastSpokeRef.current = Date.now(); speakSequence([repNumberWord(v)]); }
      }
      if (v === 0) {
        if (resumeRef.current) {
          // Depois de trocar de perna: continua a mesma série.
          resumeRef.current = false;
          setResuming(false);
        } else {
          counter.reset();
          spokenOnceRef.current.clear();
          setReps([]);
          startedAtRef.current = new Date();
        }
        counter.waitForStanding();
        autoFinishRef.current.reset();
        lostSinceRef.current = null;
        pausedRef.current = false;
        setPaused(false);
        goPhase('tracking');
        showFeedback({ text: 'Pode começar!', tone: 'ok' }, 2000);
        speak('Pode começar', true);
      }
      return;
    }

    if (p !== 'tracking') return;
    const autoFinish = autoFinishRef.current;
    if (!full || !lms) {
      if (lostSinceRef.current == null) lostSinceRef.current = now;
      if (now - lostSinceRef.current > BODY_LOST_MS) {
        if (counter.inRep) counter.abortRep();
        showFeedback({ text: currentRule.lostMessage ?? 'Corpo inteiro na câmera', tone: 'info' }, 1500);
      }
      if (autoFinish.update({ t: now, repCount: autoFinishRepCount(currentRule, counter.reps), fullBody: false, inRep: counter.inRep, kneeAngle: null, standing: false })) finishRef.current(true);
      return;
    }
    lostSinceRef.current = null;

    // De frente: pausa a contagem e as correções até voltar de lado.
    if (frontal) {
      if (!pausedRef.current) {
        pausedRef.current = true;
        setPaused(true);
        counter.waitForStanding();
      }
      speak(turnMessage(currentRule));
      autoFinish.update({ t: now, repCount: autoFinishRepCount(currentRule, counter.reps), fullBody: true, inRep: false, kneeAngle: null, standing: false });
      return;
    }
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      showFeedback({ text: 'Pode continuar', tone: 'ok' }, 1200);
    }

    const rep = counter.update(lms, w, h, side, now);
    if (rep) {
      setReps([...counter.reps]);
      if (rep.errors.length) {
        const text = rep.errors.map((e) => currentRule.messages[e] ?? e).join(' · ');
        showFeedback({ text, tone: 'error' });
      } else {
        showFeedback({ text: 'Boa!', tone: 'ok' }, 1200);
      }
      // Número da rep completa sempre fala (fora do limite de 3 s); depois a correção, se couber no limite.
      if (voiceAvailable()) {
        const speechNow = Date.now();
        const completeCount = counter.reps.filter((r) => r.complete).length;
        const spokenErrors = speakableErrors(rep.errors, currentRule.speakOncePerSeries, spokenOnceRef.current);
        const plan = planRepSpeech({ complete: rep.complete, errors: spokenErrors }, completeCount, lastSpokeRef.current, speechNow, currentRule.messages);
        if (plan.correctionSpoken) {
          lastSpokeRef.current = speechNow;
          markSpokenOnce(spokenErrors, currentRule.speakOncePerSeries, spokenOnceRef.current);
        }
        speakSequence(plan.texts);
      }
    }
    // Elevação pélvica informa o próprio descanso (topo ou parado embaixo).
    const resting = counter.resting;
    if (autoFinish.update({ t: now, repCount: autoFinishRepCount(currentRule, counter.reps), fullBody: true, inRep: resting === undefined ? counter.inRep : false, kneeAngle: null, standing: resting ?? counter.atTop })) {
      finishRef.current(true);
    }
  }, [goPhase, showFeedback, speak, speakSequence]);

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
    resumeRef.current = false;
    setResuming(false);
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
      setHoldProgress(0);
      smootherRef.current.reset();
      stillRef.current.reset();
      facingGateRef.current.reset();
      autoFinishRef.current.reset();
      issueRef.current = 'no_body';
      setIssue('no_body');
      lastHintRef.current = null;
      pausedRef.current = false;
      setPaused(false);
      goPhase('positioning');
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
  }, [facing, goPhase, loop, startCamera, stopLoop, stopStream]);

  const switchCamera = useCallback(async () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    if (phaseRef.current === 'positioning' || phaseRef.current === 'countdown' || phaseRef.current === 'tracking') {
      counterRef.current?.abortRep();
      smootherRef.current.reset();
      stillRef.current.reset();
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

  const save = useCallback(async (s: LiveSessionSummary) => {
    setPhase('saving');
    setSaveError(null);
    const started = startedAtRef.current ?? new Date();
    const ended = new Date();
    const { error } = await supabase.from('camera_sessions').insert({
      student_id: studentId,
      exercise_name: displayName,
      exercise_rule: ruleRef.current.id,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000)),
      total_reps: s.total,
      complete_reps: s.complete,
      incomplete_reps: s.incomplete,
      errors: Object.fromEntries(s.errors.map((e) => [e.key, e.count])),
      camera_side: sideRef.current,
      tempo_medio_descida: s.avgDescentSeconds,
      reps_descida_rapida: s.fastDescentReps,
      depth_level: counterRef.current?.level ?? depthLevel,
    });
    if (error) setSaveError('Não foi possível salvar a sessão. Tente de novo.');
    setPhase('summary');
  }, [displayName, studentId, depthLevel]);

  const finish = useCallback((auto = false) => {
    const p = phaseRef.current;
    if (p === 'saving' || p === 'summary') return;
    // A partir daqui nenhum movimento conta (ex.: ir pegar o celular).
    phaseRef.current = 'saving';
    releaseAll();
    // Rep ainda segurando em cima (elevação pélvica) fecha com o que já foi medido.
    if (p === 'tracking') counterRef.current?.flush?.();
    const repsDone = [...(counterRef.current?.reps ?? [])];
    const s = summarizeLiveReps(repsDone, ruleRef.current.messages);
    setReps(repsDone);
    setSummaryRuleId(ruleRef.current.id);
    setSummary(s);
    setAutoFinished(auto);
    if (auto) speakSequence([AUTO_FINISH_MESSAGE]);
    if (s.total > 0) void save(s); else goPhase('summary');
  }, [goPhase, releaseAll, save, speakSequence]);
  useEffect(() => { finishRef.current = finish; }, [finish]);

  /** "Fazer outra série": reabre a câmera direto, com a mesma câmera e voz. */
  const again = useCallback(() => {
    counterRef.current?.reset();
    spokenOnceRef.current.clear();
    setReps([]);
    setSummary(null);
    setSaveError(null);
    setFeedback(null);
    setAutoFinished(false);
    setCountdown(0);
    void begin();
  }, [begin]);

  /** "Trocar perna" (búlgaro/afundo): volta a posicionar e continua a mesma série. */
  const switchLeg = () => {
    const next: Side = (counterRef.current?.frontLeg ?? frontLeg ?? 'left') === 'left' ? 'right' : 'left';
    counterRef.current?.setFrontLeg?.(next);
    sideRef.current = next;
    setFrontLeg(next);
    autoFinishRef.current.reset();
    resumeRef.current = true;
    setResuming(true);
    holdStartRef.current = null;
    setHoldProgress(0);
    stillRef.current.reset();
    issueRef.current = 'no_body';
    setIssue('no_body');
    lastHintRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    goPhase('positioning');
    speak(`Agora a perna ${LEG_LABELS[next].toLowerCase()} na frente`, true);
  };

  const saveToSet = () => {
    if (!summary || !onSaveToSet) return;
    onSaveToSet(summary.complete);
    close();
  };

  useEffect(() => () => {
    releaseAll();
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, [releaseAll]);

  const close = () => { releaseAll(); onClose(); };

  const complete = reps.filter((r) => r.complete).length;
  const incomplete = reps.length - complete;
  const legSummaries = (phase === 'summary' ? summaryRule : rule).needsFrontLeg ? summarizeByLeg(reps) : [];
  const canStart = !rule.needsFrontLeg || frontLeg != null;
  const live = phase === 'loading' || phase === 'positioning' || phase === 'countdown' || phase === 'tracking';
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
            {paused && <span className="mb-1 text-[11px] font-bold uppercase tracking-widest text-destructive">Pausado</span>}
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
            <p className="text-sm font-semibold truncate">{displayName}</p>
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
          <p className="text-xl font-bold leading-snug max-w-sm" data-testid="live-instruction">
            {rule.instruction(instructionName)}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {rule.startHint ?? (rule.view === 'front'
              ? 'A contagem começa sozinha quando você aparecer de frente, parado, por 2 segundos.'
              : 'A contagem começa sozinha quando o corpo inteiro aparecer por 2 segundos.')}
          </p>
          <p className="text-xs text-muted-foreground">Câmera {facing === 'user' ? 'frontal' : 'traseira'} · troque no botão ao lado</p>
          {exercisePicker && <ExercisePicker value={ruleId} onChange={setRuleId} />}
          {rule.needsFrontLeg && <FrontLegPicker value={frontLeg} onChange={setFrontLeg} />}
          {depthLevelPicker && <DepthLevelPicker value={depthLevel} onChange={setDepthLevel} hints={rule.levelHints} />}
          <Button size="lg" className="h-12 px-10 font-bold" onClick={begin} disabled={!canStart}>Começar</Button>
          {!canStart && <p className="-mt-3 text-xs text-muted-foreground">Escolha a perna da frente para começar.</p>}
        </div>
      )}

      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Abrindo a câmera…</p>
        </div>
      )}

      {phase === 'positioning' && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <GuideSilhouette active={issue === 'ok'} kind={rule.silhouette(instructionName)} />
        </div>
      )}

      {phase === 'positioning' && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pt-10 bg-gradient-to-t from-background/90 to-transparent" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <div className="min-h-[56px] flex items-center justify-center mb-2" aria-live="assertive">
            {issue === 'ok' ? (
              <span className="rounded-2xl px-5 py-2.5 text-xl font-black bg-primary text-primary-foreground border border-primary">Fica assim…</span>
            ) : issue !== 'no_body' ? (
              <span className="rounded-2xl px-5 py-2.5 text-xl font-black bg-destructive text-destructive-foreground border border-destructive" data-testid="live-position-hint">
                {positionMessage(rule, issue)}
              </span>
            ) : null}
          </div>
          {resuming && frontLeg && (
            <p className="text-center text-sm font-black uppercase tracking-wider text-primary mb-1" data-testid="live-resume-leg">
              Perna da frente: {LEG_LABELS[frontLeg]} · {complete} rep{complete === 1 ? '' : 's'} até agora
            </p>
          )}
          <p className="text-center text-base font-bold leading-snug">{rule.instruction(instructionName)}</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">Encaixa o corpo na silhueta e fica parado</p>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${holdProgress * 100}%` }} />
          </div>
          {resuming && reps.length > 0 && (
            <Button size="lg" variant="outline" className="mt-3 w-full h-12 font-bold" onClick={() => finish(false)}>Finalizar</Button>
          )}
        </div>
      )}

      {phase === 'countdown' && countdown > 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none" aria-live="assertive">
          <span key={countdown} className="text-[10rem] font-black leading-none text-primary tabular-nums drop-shadow-lg animate-in zoom-in-50 fade-in duration-300" data-testid="live-countdown">
            {countdown}
          </span>
          <span className="mt-2 text-sm font-bold uppercase tracking-widest text-foreground">Prepara…</span>
        </div>
      )}

      {phase === 'tracking' && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-10 bg-gradient-to-t from-background/90 to-transparent" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="min-h-[64px] flex items-center justify-center mb-3" aria-live="assertive">
            {paused ? (
              <span className="rounded-2xl px-5 py-3 text-2xl font-black text-center border bg-destructive text-destructive-foreground border-destructive" data-testid="live-feedback">
                {turnMessage(rule)}
              </span>
            ) : feedback && (
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
          {rule.needsFrontLeg && frontLeg && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card/80 px-3 py-2" data-testid="live-front-leg">
              <span className="text-sm font-bold">Perna da frente: <span className="text-primary">{LEG_LABELS[frontLeg]}</span></span>
              <Button size="sm" variant="outline" className="h-11 font-bold border-primary text-primary" onClick={switchLeg} data-testid="live-switch-leg">
                <Repeat className="h-4 w-4 mr-1.5" />
                Trocar perna
              </Button>
            </div>
          )}
          <Button size="lg" className="w-full h-12 font-bold" onClick={() => finish(false)}>Finalizar</Button>
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
            {autoFinished && <p className="-mt-2 text-sm text-center text-muted-foreground">Fechou a série</p>}
            <p className="-mt-2 text-xs text-center text-muted-foreground" data-testid="live-summary-depth">Nível: {DEPTH_LEVELS[depthLevel].label}</p>
            <p className="-mt-3 text-[11px] text-center text-muted-foreground">{summaryRule.label} · {summaryRule.levelHints[depthLevel]}</p>
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
            <div className="glass-card rounded-2xl p-4" data-testid="live-summary-descent">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" /> Descida
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-2xl font-black tabular-nums">{formatSeconds(summary.avgDescentSeconds)}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tempo médio</p>
                </div>
                <div>
                  <p className={cn('text-2xl font-black tabular-nums', summary.fastDescentReps > 0 && 'text-destructive')}>{summary.fastDescentReps}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Rápida{summary.fastDescentReps === 1 ? '' : 's'} demais (&lt; {summaryRule.minDescentSeconds.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} s)
                  </p>
                </div>
              </div>
            </div>
            {legSummaries.length > 0 && (
              <div className="glass-card rounded-2xl p-4" data-testid="live-summary-legs">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Por perna da frente</p>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-sm items-center">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Perna</span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">Reps</span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">Completas</span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">Descida</span>
                  {legSummaries.map((l) => (
                    <React.Fragment key={l.leg}>
                      <span className="font-bold">{LEG_LABELS[l.leg]}</span>
                      <span className="tabular-nums text-right">{l.total}</span>
                      <span className="tabular-nums text-right font-bold text-primary">{l.complete}</span>
                      <span className="tabular-nums text-right text-muted-foreground">{formatSeconds(l.avgDescentSeconds)}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
            {reps.length > 0 && (
              <div className="glass-card rounded-2xl p-4" data-testid="live-summary-reps">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Rep por rep</p>
                <ul className="divide-y divide-border">
                  {reps.map((r) => (
                    <li key={r.index} className="py-2 flex items-start gap-3 text-sm">
                      <span className={cn('h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black tabular-nums', r.complete ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground')}>
                        {r.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('font-bold', r.complete ? 'text-foreground' : 'text-destructive')}>
                            {r.complete ? 'Completa' : 'Incompleta'}
                            {r.leg && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">· perna {LEG_LABELS[r.leg].toLowerCase()}</span>}
                          </span>
                          <span className={cn('tabular-nums text-xs', r.fastDescent ? 'text-destructive font-bold' : 'text-muted-foreground')}>
                            Descida {formatSeconds(r.descentSeconds)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {r.errors.length ? r.errors.map((e) => summaryRule.messages[e] ?? e).join(' · ') : 'Sem erros'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            {onSaveToSet && summary.total > 0 && (
              <Button size="lg" className="w-full h-12 font-bold" onClick={saveToSet} data-testid="live-save-to-set">
                <ClipboardCheck className="h-5 w-5 mr-2" />
                Salvar na série{targetSetLabel ? ` (${targetSetLabel})` : ''} · {summary.complete} rep{summary.complete === 1 ? '' : 's'}
              </Button>
            )}
            {exercisePicker && <div className="flex justify-center"><ExercisePicker value={ruleId} onChange={setRuleId} /></div>}
            {rule.needsFrontLeg && <div className="flex justify-center"><FrontLegPicker value={frontLeg} onChange={setFrontLeg} /></div>}
            {depthLevelPicker && <div className="flex justify-center"><DepthLevelPicker value={depthLevel} onChange={setDepthLevel} hints={rule.levelHints} /></div>}
            <Button size="lg" variant="outline" className="w-full h-12 font-bold border-primary text-primary hover:bg-primary/10" onClick={again} disabled={!canStart} data-testid="live-again">
              <RotateCcw className="h-5 w-5 mr-2" />
              Fazer outra série
            </Button>
            <Button size="lg" variant="ghost" className="w-full h-12 font-bold" onClick={close}>Fechar</Button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default LiveCorrectionScreen;
