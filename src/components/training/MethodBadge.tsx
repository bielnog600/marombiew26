import React from 'react';
import { Zap } from 'lucide-react';
import { formatMethodParams, methodLabel, type WorkoutMethodRef } from '@/lib/trainingMethods';

interface Props {
  method?: WorkoutMethodRef | null;
  /** Exercícios do mesmo dia — usados para resolver o par de bi-set/tri-set. */
  dayExercises?: Array<{ id?: string; exerciseId?: string; exercise?: string }>;
  className?: string;
}

/** Badge amarelo com o método de treino + parâmetros em texto curto. */
export const MethodBadge: React.FC<Props> = ({ method, dayExercises, className = '' }) => {
  if (!method?.slug) return null;

  const resolvePair = (idOrName: string): string => {
    const found = (dayExercises || []).find(
      (e) =>
        e?.id === idOrName ||
        e?.exerciseId === idOrName ||
        (e?.exercise || '').toLowerCase() === idOrName.toLowerCase(),
    );
    return found?.exercise || idOrName;
  };

  const label = methodLabel(method.slug);
  const params = formatMethodParams(method.params, resolvePair);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary ${className}`}
      title={params ? `${label} — ${params}` : label}
    >
      <Zap className="h-3 w-3 shrink-0" />
      <span className="uppercase tracking-wide">{label}</span>
      {params && <span className="font-normal normal-case opacity-90">· {params}</span>}
    </span>
  );
};

export default MethodBadge;
