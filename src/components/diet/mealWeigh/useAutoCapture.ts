import { useEffect, useRef, useState } from 'react';
import type { ObjectDetector } from '@mediapipe/tasks-vision';
import {
  AUTO_FRAME_H, AUTO_FRAME_W, foodInGuide, frameDifference, initialAutoCapture, rgbaToGray, screenRectToVideo, stepAutoCapture,
  type AutoCapturePhase, type DetectionBox,
} from '@/lib/mealWeigh/autoCapture';

const MP_VERSION = '0.10.17';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const DETECTOR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
/** Intervalo entre quadros comparados. */
const TICK_MS = 150;
/** Intervalo mínimo entre detecções (só rodam com a imagem parada). */
const DETECT_EVERY_MS = 400;
/** Detecção mais velha que isto não vale. */
const DETECTION_TTL_MS = 1500;
/** Modelo que não carrega neste tempo é tratado como indisponível. */
const DETECTOR_TIMEOUT_MS = 10000;

// Um detector por aba: carregar o modelo de novo a cada alimento seria lento.
let detectorPromise: Promise<ObjectDetector | null> | null = null;
function loadDetector(): Promise<ObjectDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const create = (delegate: 'GPU' | 'CPU') => vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: DETECTOR_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          scoreThreshold: 0.25,
          maxResults: 6,
        });
        const detector = create('GPU').catch(() => create('CPU'));
        // Modelo travado (rede ruim): segue só com a estabilidade.
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DETECTOR_TIMEOUT_MS));
        return await Promise.race([detector, timeout]);
      } catch (e) {
        console.warn('[meal-weigh] detector indisponível, usando só a estabilidade', e);
        return null;
      }
    })();
  }
  return detectorPromise;
}

export interface AutoCaptureView {
  phase: AutoCapturePhase | 'off';
  count: number | null;
  progress: number;
  /** Detector carregado (null = carregando ou indisponível). */
  detector: 'loading' | 'ready' | 'unavailable' | 'idle';
}

/**
 * Foto automática na câmera da pesagem: compara quadros reduzidos, conta 3-2-1
 * quando a imagem para e há prato/comida na moldura, e chama `onFire` uma vez.
 * Sem leitura de pixels no aparelho (ou canvas indisponível), fica desligada.
 */
export function useAutoCapture(opts: {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  guideRef: React.RefObject<HTMLElement | null>;
  onFire: () => void;
  /** false = só a estabilidade (ex.: produtos embalados, que o detector de pratos não reconhece). */
  requireObject?: boolean;
}): AutoCaptureView {
  const { enabled, videoRef, guideRef } = opts;
  const requireObject = opts.requireObject !== false;
  const onFireRef = useRef(opts.onFire);
  onFireRef.current = opts.onFire;
  const [view, setView] = useState<AutoCaptureView>({ phase: 'off', count: null, progress: 0, detector: 'idle' });

  useEffect(() => {
    if (!enabled) { setView((v) => ({ ...v, phase: 'off', count: null, progress: 0 })); return; }
    let cancelled = false;
    let state = initialAutoCapture();
    let prev: Uint8Array | null = null;
    let detector: ObjectDetector | null = null;
    let detectorState: AutoCaptureView['detector'] = 'idle';
    let lastDetectAt = 0;
    let lastDetection: { at: number; ok: boolean } | null = null;
    let lastVideoTime = -1;
    const canvas = document.createElement('canvas');
    canvas.width = AUTO_FRAME_W;
    canvas.height = AUTO_FRAME_H;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null; } catch { ctx = null; }
    if (!ctx || typeof ctx.getImageData !== 'function') {
      setView({ phase: 'off', count: null, progress: 0, detector: 'unavailable' });
      return;
    }

    const startDetector = () => {
      if (!requireObject) { detectorState = 'unavailable'; return; }
      if (detectorState !== 'idle') return;
      detectorState = 'loading';
      void loadDetector().then((d) => {
        if (cancelled) return;
        detector = d;
        detectorState = d ? 'ready' : 'unavailable';
      });
    };

    const detect = (v: HTMLVideoElement, now: number) => {
      if (!detector || now - lastDetectAt < DETECT_EVERY_MS) return;
      lastDetectAt = now;
      const guide = guideRef.current;
      if (!guide) return;
      try {
        const vr = v.getBoundingClientRect();
        const gr = guide.getBoundingClientRect();
        const guideVideo = screenRectToVideo(
          { x: gr.left - vr.left, y: gr.top - vr.top, width: gr.width, height: gr.height },
          { width: vr.width, height: vr.height },
          { width: v.videoWidth, height: v.videoHeight },
        );
        const ts = Math.max(performance.now(), lastVideoTime + 1);
        lastVideoTime = ts;
        const res = detector.detectForVideo(v, ts);
        const boxes: DetectionBox[] = (res?.detections ?? []).flatMap((d) => {
          const b = d.boundingBox;
          if (!b) return [];
          return (d.categories ?? []).map((c) => ({
            x: b.originX, y: b.originY, width: b.width, height: b.height,
            label: c.categoryName ?? '', score: c.score ?? 0,
          }));
        });
        lastDetection = { at: now, ok: foodInGuide(boxes, guideVideo) };
      } catch {
        // Falha pontual do detector: segue só com a estabilidade.
        detector = null;
        detectorState = 'unavailable';
      }
    };

    const tick = () => {
      if (cancelled) return;
      const v = videoRef.current;
      const now = Date.now();
      if (v && v.videoWidth > 0 && v.readyState >= 2) {
        let gray: Uint8Array | null = null;
        try {
          ctx!.drawImage(v, 0, 0, AUTO_FRAME_W, AUTO_FRAME_H);
          gray = rgbaToGray(ctx!.getImageData(0, 0, AUTO_FRAME_W, AUTO_FRAME_H).data);
        } catch {
          gray = null;
        }
        if (gray) {
          startDetector();
          const diff = frameDifference(prev, gray);
          prev = gray;
          if (state.phase === 'settling' || state.phase === 'no_object') detect(v, now);
          const hasObject = detectorState === 'ready'
            ? (lastDetection && now - lastDetection.at <= DETECTION_TTL_MS ? lastDetection.ok : false)
            : detectorState === 'loading' ? false : null;
          const step = stepAutoCapture(state, { now, diff, hasObject });
          state = step.state;
          setView({ phase: state.phase, count: step.count, progress: step.progress, detector: detectorState });
          if (step.fire) {
            try { navigator.vibrate?.(80); } catch { /* sem vibração */ }
            onFireRef.current();
            return;
          }
        }
      }
      timer = window.setTimeout(tick, TICK_MS);
    };
    let timer = window.setTimeout(tick, TICK_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled, videoRef, guideRef, requireObject]);

  return view;
}
