import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';

interface AiWizardProps {
  steps: string[];
  currentStep: number;
  onStepChange: (step: number) => void;
  stepValid: boolean[];
  /** When current step becomes valid, auto-advance after delay (ms). 0 disables. */
  autoAdvanceDelay?: number;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
  generateLabel?: string;
  generateIcon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Wizard wrapper that displays a stepper indicator, the current step content
 * and back/next/generate navigation. Children should render only the
 * content for `currentStep` (parent decides via conditional rendering).
 */
export const AiWizard: React.FC<AiWizardProps> = ({
  steps,
  currentStep,
  onStepChange,
  stepValid,
  autoAdvanceDelay = 350,
  canGenerate,
  generating,
  onGenerate,
  generateLabel = 'Gerar com IA',
  generateIcon = <Sparkles className="h-4 w-4" />,
  children,
}) => {
  const total = steps.length;
  const isLast = currentStep === total - 1;

  // Track whether the step was already valid when first shown.
  // We only auto-advance if the user actually transitioned the step
  // from invalid -> valid (i.e. interacted with it). This prevents
  // skipping steps that have valid defaults from the start.
  const initialValidRef = useRef<Record<number, boolean>>({});
  useEffect(() => {
    if (initialValidRef.current[currentStep] === undefined) {
      initialValidRef.current[currentStep] = !!stepValid[currentStep];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  useEffect(() => {
    if (autoAdvanceDelay <= 0) return;
    if (isLast) return;
    if (!stepValid[currentStep]) return;
    // Skip auto-advance when this step was already valid on entry
    // (user hasn't interacted yet).
    if (initialValidRef.current[currentStep] === true) return;
    const t = setTimeout(() => onStepChange(currentStep + 1), autoAdvanceDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepValid[currentStep], currentStep]);

  const goNext = () => onStepChange(Math.min(total - 1, currentStep + 1));
  const goBack = () => onStepChange(Math.max(0, currentStep - 1));

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1.5">
        {steps.map((t, i) => (
          <button
            key={t + i}
            onClick={() => onStepChange(i)}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              i === currentStep ? 'bg-primary' : i < currentStep ? 'bg-primary/60' : 'bg-secondary'
            }`}
            title={`${i + 1}. ${t}`}
            aria-label={t}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Etapa {currentStep + 1} de {total} —{' '}
        <span className="text-foreground font-medium">{steps[currentStep]}</span>
      </p>

      {/* Step content */}
      {children}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="outline" onClick={goBack} disabled={currentStep === 0} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {!isLast ? (
          <Button onClick={goNext} disabled={!stepValid[currentStep]} className="gap-1">
            Avançar <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={onGenerate}
            disabled={!canGenerate || generating}
            className="gap-2 font-bold"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando...
              </>
            ) : (
              <>
                {generateIcon} {generateLabel}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AiWizard;