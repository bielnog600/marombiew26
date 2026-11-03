import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MethodSetRows } from '@/components/training/MethodSetRows';
import { methodPatch, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import '@/index.css';

const base: ParsedExercise = { exercise: 'Leg Press', series: '3', series2: '', reps: '12', pause: '90s', variation: '', description: '', rir: '' };
const ex: ParsedExercise = { ...base, ...methodPatch('cluster') };

function Harness() {
  const [set, update] = useState<MethodSetEntry>({ weight: '40', reps: '' });
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-[390px]">
        <MethodSetRows exercise={ex} set={set} index={0} count={3} targetReps="12" weightPlaceholder="kg"
          disabled={false} onChange={update} onComplete={update} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
