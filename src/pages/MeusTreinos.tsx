import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Play, Clock, Target } from 'lucide-react';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';

const MeusTreinos = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trainingDays, setTrainingDays] = useState<ParsedTrainingDay[]>([]);
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, { imageUrl?: string; videoEmbed?: string; muscleGroup?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadTraining();
  }, [user]);

  const loadTraining = async () => {
    const { data: treino } = await supabase
      .from('ai_plans')
      .select('conteudo')
      .eq('student_id', user!.id)
      .eq('tipo', 'treino')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (treino) {
      const sections = parseTrainingSections(treino.conteudo);
      const allDays = sections.flatMap(s => s.days ?? []);
      setTrainingDays(allDays);

      const exerciseNames = allDays.flatMap(d => d.exercises.map(e => e.exercise.toUpperCase().trim()));
      const uniqueNames = [...new Set(exerciseNames)];

      const { data: dbExercises } = await supabase
        .from('exercises')
        .select('nome, imagem_url, video_embed, grupo_muscular');

      if (dbExercises) {
        const mediaMap: Record<string, { imageUrl?: string; videoEmbed?: string; muscleGroup?: string }> = {};
        for (const name of uniqueNames) {
          const match = dbExercises.find(e =>
            e.nome.toUpperCase().trim() === name ||
            name.includes(e.nome.toUpperCase().trim()) ||
            e.nome.toUpperCase().trim().includes(name)
          );
          if (match) {
            mediaMap[name] = {
              imageUrl: match.imagem_url || undefined,
              videoEmbed: match.video_embed || undefined,
              muscleGroup: match.grupo_muscular || undefined,
            };
          }
        }
        setExerciseMedia(mediaMap);
      }
    }
    setLoading(false);
  };

  const todayIndex = trainingDays.length > 0 ? new Date().getDay() % trainingDays.length : -1;

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
      },
    });
  };

  if (loading) {
    return (
      <AppLayout title="Treinos">
        <div className="flex items-center justify-center h-40">
          <Dumbbell className="h-8 w-8 text-muted-foreground animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Treinos">
      <div className="space-y-4 animate-fade-in">
        {trainingDays.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-6 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum treino disponível ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Seu consultor preparará seu plano em breve!</p>
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
                    <img
                      src={heroImage}
                      alt={day.day}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
                    {isToday && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                        Hoje
                      </div>
                    )}
                  </div>
                )}

                <CardContent className={`${heroImage ? 'pt-0 -mt-8 relative z-10' : 'pt-4'} p-4 space-y-3`}>
                  {!heroImage && isToday && (
                    <span className="inline-block bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1">
                      Hoje
                    </span>
                  )}

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">{day.day}</p>
                    {muscles && (
                      <p className="text-xs text-muted-foreground mt-0.5">{muscles}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      {day.exercises.length} exercícios
                    </span>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={() => handleStart(day)}
                  >
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
