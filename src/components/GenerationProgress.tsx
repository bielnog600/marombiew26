import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Dumbbell, Loader2, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export type GenerationKind = 'workout' | 'diet';
export type GenerationStatus = 'generating' | 'success' | 'error';

export interface GenerationProgressState {
  label: string;
  detail?: string;
  /** 0..1 — feedback visual, não representa progresso exato da IA. */
  ratio: number;
}

const TITLES: Record<GenerationKind, string> = {
  workout: 'Gerando treino personalizado',
  diet: 'Gerando plano alimentar',
};

const SUCCESS_LABEL: Record<GenerationKind, string> = {
  workout: 'Treino gerado com sucesso.',
  diet: 'Plano alimentar gerado com sucesso.',
};

const ERROR_LABEL: Record<GenerationKind, string> = {
  workout: 'Não foi possível gerar o treino.',
  diet: 'Não foi possível gerar o plano alimentar.',
};

/**
 * Etapas visuais aproximadas do treino. O backend (JSON mode) não expõe
 * progresso real, então usamos avanço gradual limitado a ~92% até a resposta.
 */
export const WORKOUT_PROGRESS_STEPS: { until: number; label: string }[] = [
  { until: 0.15, label: 'Preparando dados do aluno...' },
  { until: 0.3, label: 'Analisando objetivo e restrições...' },
  { until: 0.45, label: 'Analisando treinos anteriores...' },
  { until: 0.6, label: 'Definindo divisão e exercícios...' },
  { until: 0.75, label: 'Ajustando séries e repetições...' },
  { until: 0.88, label: 'Validando progressão e redundâncias...' },
  { until: 0.96, label: 'Conferindo exercícios e variações...' },
  { until: 1, label: 'Finalizando protocolo...' },
];

/**
 * Progresso simulado seguro: começa imediatamente, avança devagar e para em
 * ~0.92 enquanto a chamada não retorna (nunca mostra 100% antes do resultado).
 */
export function useSimulatedProgress(active: boolean, ceiling = 0.92): GenerationProgressState | null {
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    if (!active) {
      setRatio(0);
      return;
    }
    setRatio(0.04);
    const id = setInterval(() => {
      setRatio((prev) => {
        if (prev >= ceiling) return ceiling;
        // Desacelera conforme se aproxima do teto.
        const step = Math.max(0.004, (ceiling - prev) * 0.06);
        return Math.min(ceiling, prev + step);
      });
    }, 450);
    return () => clearInterval(id);
  }, [active, ceiling]);

  if (!active) return null;
  const step = WORKOUT_PROGRESS_STEPS.find((s) => ratio <= s.until) ?? WORKOUT_PROGRESS_STEPS[WORKOUT_PROGRESS_STEPS.length - 1];
  return { label: step.label, ratio };
}

interface Props {
  kind: GenerationKind;
  status: GenerationStatus;
  progress?: GenerationProgressState | null;
  errorMessage?: string;
  className?: string;
}

/**
 * Painel único de progresso usado por Treino IA e Dieta IA.
 * Sticky no topo da área principal para nunca ficar escondido abaixo do form.
 */
export function GenerationProgress({ kind, status, progress, errorMessage, className }: Props) {
  const Icon = kind === 'workout' ? Dumbbell : UtensilsCrossed;
  const isGenerating = status === 'generating';
  const pct = status === 'success'
    ? 100
    : Math.round(Math.min(1, Math.max(0.02, progress?.ratio ?? 0.02)) * 100);

  const label = status === 'success'
    ? SUCCESS_LABEL[kind]
    : status === 'error'
      ? (errorMessage || ERROR_LABEL[kind])
      : progress?.label || 'Preparando dados do aluno...';

  return (
    <div className={`sticky top-3 z-30 ${className ?? ''}`}>
      <Card className="glass-card border-primary/40 shadow-lg">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {status === 'generating' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
            {status === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wide">
              {status === 'error' ? ERROR_LABEL[kind] : TITLES[kind]}
            </h3>
            {status !== 'error' && (
              <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
            )}
          </div>

          {status !== 'error' && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={TITLES[kind]}
            >
              <div
                className={`h-full rounded-full bg-primary transition-all duration-500 ${
                  isGenerating && pct >= 90 ? 'animate-pulse' : ''
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <p aria-live="polite" className="text-xs text-muted-foreground break-words">
            {label}
          </p>
          {status === 'generating' && progress?.detail && (
            <p className="text-[11px] text-muted-foreground/80 break-words">{progress.detail}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Faz scroll suave até o painel apenas uma vez, quando a geração inicia. */
export function useScrollToOnStart(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!active) {
      scrolled.current = false;
      return;
    }
    if (scrolled.current) return;
    scrolled.current = true;
    const id = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(id);
  }, [active]);
  return ref;
}

export default GenerationProgress;
