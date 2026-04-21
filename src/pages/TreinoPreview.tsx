import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Target, Repeat, Timer, Activity, Dumbbell } from 'lucide-react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { buildSetPlan, buildPlanSummary } from '@/lib/setPlanBuilder';
import type { TrainingPhase } from '@/lib/trainingPhase';

interface ExerciseMediaInfo {
  id?: string;
  imageUrl?: string;
  videoEmbed?: string;
  muscleGroup?: string;
  ajustes?: string[] | null;
}

interface LocationState {
  exercises: ParsedExercise[];
  dayName: string;
  exerciseMedia: Record<string, ExerciseMediaInfo>;
  phase: TrainingPhase;
}

const TreinoPreview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  if (!state || !state.exercises) {
    return (
      <AppLayout title="Treino">
        <Card className="glass-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Treino não encontrado.</p>
            <Button className="mt-4" onClick={() => navigate('/meus-treinos')}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const { exercises, dayName, exerciseMedia, phase } = state;

  const totalSets = exercises.reduce((acc, ex) => {
    return acc + buildSetPlan(ex.series, ex.series2, ex.reps).length;
  }, 0);

  const muscleGroups = (() => {
    const groups: string[] = [];
    for (const ex of exercises) {
      const key = ex.exercise.toUpperCase().trim();
      const muscle = exerciseMedia[key]?.muscleGroup;
      if (muscle && !groups.includes(muscle)) groups.push(muscle);
    }
    return groups;
  })();

  const handleStart = () => {
    navigate('/treino-execucao', {
      state: { exercises, dayName, exerciseMedia, phase },
    });
  };

  return (
    <AppLayout title={dayName}>
      <div className="space-y-4 animate-fade-in pb-24">
        {/* Header / Resumo */}
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1 text-muted-foreground"
                onClick={() => navigate('/meus-treinos')}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                {dayName}
              </p>
              {muscleGroups.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {muscleGroups.slice(0, 4).join(' • ')}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg bg-muted/30 p-3 flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Exercícios</p>
                  <p className="text-sm font-semibold">{exercises.length}</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Séries totais</p>
                  <p className="text-sm font-semibold">{totalSets}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de exercícios */}
        <div className="space-y-2">
          {exercises.map((ex, i) => {
            const key = ex.exercise.toUpperCase().trim();
            const media = exerciseMedia[key];
            const plan = buildSetPlan(ex.series, ex.series2, ex.reps);
            const summary = buildPlanSummary(plan);

            return (
              <Card key={ex.exercise + i} className="glass-card overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    {/* Foto */}
                    <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                      {media?.imageUrl ? (
                        <img
                          src={media.imageUrl}
                          alt={ex.exercise}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Dumbbell className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-primary mt-0.5">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="text-sm font-semibold leading-tight flex-1">
                          {ex.exercise}
                        </p>
                      </div>
                      {media?.muscleGroup && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 ml-5">
                          {media.muscleGroup}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 ml-5 text-[11px] text-muted-foreground">
                        {summary && (
                          <span className="flex items-center gap-1">
                            <Repeat className="h-3 w-3" />
                            {summary}
                          </span>
                        )}
                        {ex.rir && ex.rir !== '-' && (
                          <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            RIR {ex.rir}
                          </span>
                        )}
                        {ex.pause && ex.pause !== '-' && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {ex.pause}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Botão fixo de iniciar */}
      <div
        className="fixed left-0 right-0 px-4 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent z-40 md:bottom-0"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-2xl mx-auto">
          <Button size="lg" className="w-full gap-2 h-12" onClick={handleStart}>
            <Play className="h-5 w-5" />
            Iniciar Treino
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default TreinoPreview;
