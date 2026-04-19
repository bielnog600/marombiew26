import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Play, Target } from 'lucide-react';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import {
  TRAINING_PHASES,
  PHASE_LABELS,
  PHASE_SHORT_LABELS,
  PHASE_BADGE_CLASS,
  PHASE_DESCRIPTIONS,
  calculateCurrentPhase,
  type TrainingPhase,
} from '@/lib/trainingPhase';

interface PlanRow {
  id: string;
  conteudo: string;
  fase: TrainingPhase;
  fase_inicio_data: string | null;
}

const MeusTreinos = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, { id?: string; imageUrl?: string; videoEmbed?: string; muscleGroup?: string; ajustes?: string[] | null }>>({});
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<TrainingPhase>('semana_1');
  const [autoPhaseSet, setAutoPhaseSet] = useState(false);

  useEffect(() => {
    if (user) loadTraining();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('meus-treinos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_plans', filter: `student_id=eq.${user.id}` }, () => {
        loadTraining();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadTraining = async () => {
    const { data } = await supabase
      .from('ai_plans')
      .select('id, conteudo, fase, fase_inicio_data')
      .eq('student_id', user!.id)
      .eq('tipo', 'treino')
      .order('created_at', { ascending: false });

    const allPlans = (data ?? []) as PlanRow[];
    setPlans(allPlans);

    // Cálculo automático da fase (somente na primeira carga)
    if (!autoPhaseSet && allPlans.length > 0) {
      const planWithDate = allPlans.find(p => p.fase_inicio_data);
      const auto = planWithDate
        ? calculateCurrentPhase(planWithDate.fase_inicio_data)
        : (allPlans[0].fase || 'semana_1');
      // Garante que existe plano dessa fase, senão pega a primeira disponível
      const available = allPlans.find(p => p.fase === auto);
      setActivePhase(available ? auto : (allPlans[0].fase || 'semana_1'));
      setAutoPhaseSet(true);
    }

    // Carrega media de TODOS os planos (para todas as fases)
    const allMd = allPlans.map(p => p.conteudo).join('\n');
    const sections = parseTrainingSections(allMd);
    const allDays = sections.flatMap(s => s.days ?? []);
    const exerciseNames = allDays.flatMap(d => d.exercises.map(e => e.exercise.toUpperCase().trim()));
    const uniqueNames = [...new Set(exerciseNames)];

    if (uniqueNames.length > 0) {
      const { data: dbExercises } = await supabase
        .from('exercises')
        .select('id, nome, imagem_url, video_embed, grupo_muscular, ajustes');

      if (dbExercises) {
        const mediaMap: Record<string, { id?: string; imageUrl?: string; videoEmbed?: string; muscleGroup?: string; ajustes?: string[] | null }> = {};
        for (const name of uniqueNames) {
          const match = dbExercises.find(e =>
            e.nome.toUpperCase().trim() === name ||
            name.includes(e.nome.toUpperCase().trim()) ||
            e.nome.toUpperCase().trim().includes(name)
          );
          if (match) {
            mediaMap[name] = {
              id: match.id,
              imageUrl: match.imagem_url || undefined,
              videoEmbed: match.video_embed || undefined,
              muscleGroup: match.grupo_muscular || undefined,
              ajustes: match.ajustes ?? null,
            };
          }
        }
        setExerciseMedia(mediaMap);
      }
    }
    setLoading(false);
  };

  // Fases que possuem ao menos um plano
  const availablePhases = useMemo(
    () => TRAINING_PHASES.filter(p => plans.some(pl => pl.fase === p)),
    [plans],
  );

  // Dias da fase ativa
  const trainingDays = useMemo(() => {
    const phasePlans = plans.filter(p => p.fase === activePhase);
    const md = phasePlans.map(p => p.conteudo).join('\n');
    const sections = parseTrainingSections(md);
    return sections.flatMap(s => s.days ?? []);
  }, [plans, activePhase]);

  const todayIndex = useMemo(() => {
    if (trainingDays.length === 0) return -1;
    const jsDay = new Date().getDay();
    const todayNames = jsDay === 0 ? ['domingo'] : jsDay === 1 ? ['segunda'] : jsDay === 2 ? ['terca', 'terça'] : jsDay === 3 ? ['quarta'] : jsDay === 4 ? ['quinta'] : jsDay === 5 ? ['sexta'] : ['sabado', 'sábado'];
    return trainingDays.findIndex(d => todayNames.some(n => d.day.toLowerCase().includes(n)));
  }, [trainingDays]);

  const getMuscleGroups = (day: ParsedTrainingDay) => {
    const groups: string[] = [];
    const startIndex = Math.min(2, day.exercises.length - 1);
    for (let i = startIndex; i < day.exercises.length; i++) {
      const key = day.exercises[i].exercise.toUpperCase().trim();
      const muscle = exerciseMedia[key]?.muscleGroup;
      if (muscle && !groups.includes(muscle)) groups.push(muscle);
    }
    return groups.slice(0, 3).join(' • ');
  };

  const handleStart = (day: ParsedTrainingDay) => {
    navigate('/treino-execucao', {
      state: {
        exercises: day.exercises,
        dayName: day.day,
        exerciseMedia,
        phase: activePhase,
      },
    });
  };

  if (loading) {
    return (
      <AppLayout title="Treinos">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-card overflow-hidden">
              <Skeleton className="h-32 w-full rounded-none" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Treinos">
      <div className="space-y-4 animate-fade-in">
        {/* Seletor de fase semanal (híbrido: auto + manual) */}
        {availablePhases.length > 1 && (
          <div className="space-y-2">
            <Tabs value={activePhase} onValueChange={(v) => setActivePhase(v as TrainingPhase)}>
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${availablePhases.length}, 1fr)` }}>
                {availablePhases.map(p => (
                  <TabsTrigger key={p} value={p} className="text-xs">
                    {PHASE_SHORT_LABELS[p]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground text-center px-2 leading-relaxed">
              <span className="font-semibold text-foreground">{PHASE_LABELS[activePhase]}</span>
              <br />
              {PHASE_DESCRIPTIONS[activePhase]}
            </p>
          </div>
        )}

        {trainingDays.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-6 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {plans.length === 0
                  ? 'Nenhum treino disponível ainda.'
                  : `Nenhum treino na fase ${PHASE_LABELS[activePhase]}.`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {plans.length === 0
                  ? 'Seu consultor preparará seu plano em breve!'
                  : 'Selecione outra fase no topo.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          trainingDays.map((day, i) => {
            const isToday = i === todayIndex;
            const muscles = getMuscleGroups(day);
            const heroImage = (() => {
              const start = Math.min(2, day.exercises.length - 1);
              for (let j = start; j < day.exercises.length; j++) {
                const key = day.exercises[j].exercise.toUpperCase().trim();
                if (exerciseMedia[key]?.imageUrl) return exerciseMedia[key].imageUrl;
              }
              return null;
            })();

            return (
              <Card
                key={day.day + i}
                className={`glass-card overflow-hidden ${isToday ? 'ring-2 ring-primary/50' : ''}`}
              >
                {heroImage && (
                  <div className="relative h-32 overflow-hidden">
                    <img src={heroImage} alt={day.day} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PHASE_BADGE_CLASS[activePhase]}`}>
                        {PHASE_SHORT_LABELS[activePhase]}
                      </span>
                    </div>
                    {isToday && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                        Hoje
                      </div>
                    )}
                  </div>
                )}

                <CardContent className={`${heroImage ? 'pt-0 -mt-8 relative z-10' : 'pt-4'} p-4 space-y-3`}>
                  {!heroImage && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PHASE_BADGE_CLASS[activePhase]}`}>
                        {PHASE_SHORT_LABELS[activePhase]}
                      </span>
                      {isToday && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Hoje
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">{day.day}</p>
                    {muscles && <p className="text-xs text-muted-foreground mt-0.5">{muscles}</p>}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      {day.exercises.length} exercícios
                    </span>
                  </div>

                  <Button className="w-full gap-2" onClick={() => handleStart(day)}>
                    <Play className="h-4 w-4" />
                    Iniciar Treino
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppLayout>
  );
};

export default MeusTreinos;
