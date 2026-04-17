import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dumbbell, ClipboardList, ChevronRight, Play } from 'lucide-react';
import WeeklyRoutineCard from '@/components/home/WeeklyRoutineCard';
import WaterIntakeCard from '@/components/home/WaterIntakeCard';
import MealsCompletedCard from '@/components/home/MealsCompletedCard';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { useNavigate } from 'react-router-dom';
import workoutHero from '@/assets/workout-hero.jpg';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { parseSections, type ParsedMeal, type ParsedSection } from '@/lib/dietResultParser';
import DietPlanCard from '@/components/DietPlanCard';
import TabataDoDiaCard from '@/components/home/TabataDoDiaCard';

const MinhaArea = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assessmentCount, setAssessmentCount] = useState(0);
  const [trainingDays, setTrainingDays] = useState<ParsedTrainingDay[]>([]);
  const [meals, setMeals] = useState<ParsedMeal[]>([]);
  const [tabataConteudo, setTabataConteudo] = useState<string | null>(null);
  const [dietSections, setDietSections] = useState<ParsedSection[]>([]);
  const [_trainingTitle, setTrainingTitle] = useState('');
  const [_dietTitle, setDietTitle] = useState('');
  const { tracking, addWater, removeWater, weeklyWorkouts, waterCurrentMl, waterTargetMl, waterGoalGlasses } = useDailyTracking();
  const [exerciseImages, setExerciseImages] = useState<Record<string, string>>({});
  const [exerciseMuscles, setExerciseMuscles] = useState<Record<string, string>>({});
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, { imageUrl?: string; videoEmbed?: string; muscleGroup?: string }>>({});
  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    // Profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('nome')
      .eq('user_id', user!.id)
      .maybeSingle();
    setProfile(prof);

    // Latest assessment stats
    const { data: avals } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });
    setAssessmentCount(avals?.length ?? 0);

    // (assessment detail stats removed - no longer displayed on home)

    // Latest training plan
    const { data: treino } = await supabase
      .from('ai_plans')
      .select('conteudo, titulo')
      .eq('student_id', user!.id)
      .eq('tipo', 'treino')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (treino) {
      setTrainingTitle(treino.titulo);
      const sections = parseTrainingSections(treino.conteudo);
      const allDays = sections.flatMap(s => s.days ?? []);
      setTrainingDays(allDays);

      // Fetch exercise images from DB for matching
      const exerciseNames = allDays.flatMap(d => d.exercises.map(e => e.exercise.toUpperCase().trim()));
      const uniqueNames = [...new Set(exerciseNames)];
      if (uniqueNames.length > 0) {
        const { data: dbExercises } = await supabase
          .from('exercises')
          .select('nome, imagem_url, grupo_muscular, video_embed');
        if (dbExercises) {
          const imgMap: Record<string, string> = {};
          const muscleMap: Record<string, string> = {};
          const mediaMap: Record<string, { imageUrl?: string; videoEmbed?: string; muscleGroup?: string }> = {};
          for (const name of uniqueNames) {
            const match = dbExercises.find(e =>
              e.nome.toUpperCase().trim() === name ||
              name.includes(e.nome.toUpperCase().trim()) ||
              e.nome.toUpperCase().trim().includes(name)
            );
            if (match?.imagem_url) imgMap[name] = match.imagem_url;
            if (match?.grupo_muscular) muscleMap[name] = match.grupo_muscular;
            if (match) {
              mediaMap[name] = {
                imageUrl: match.imagem_url || undefined,
                videoEmbed: match.video_embed || undefined,
                muscleGroup: match.grupo_muscular || undefined,
              };
            }
          }
          setExerciseImages(imgMap);
          setExerciseMuscles(muscleMap);
          setExerciseMedia(mediaMap);
        }
      }
    }

    // Latest diet plan
    const { data: dieta } = await supabase
      .from('ai_plans')
      .select('conteudo, titulo')
      .eq('student_id', user!.id)
      .eq('tipo', 'dieta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dieta) {
      setDietTitle(dieta.titulo);
      const sections = parseSections(dieta.conteudo);
      setDietSections(sections);
      const allMeals = sections.flatMap(s => s.meals ?? []);
      setMeals(allMeals);
    }

    // Latest TABATA plan
    const { data: tabata } = await supabase
      .from('ai_plans')
      .select('conteudo')
      .eq('student_id', user!.id)
      .eq('tipo', 'tabata')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tabata) setTabataConteudo(tabata.conteudo);

    setLoading(false);
  };

  const firstName = profile?.nome?.split(' ')[0] || '';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  // Compute today's meal count (same logic as MinhasDietas)
  const todayMealCount = useMemo(() => {
    const mealSections = dietSections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0);
    if (mealSections.length <= 1) {
      return dietSections.filter(s => s.type === 'meal' && s.meals).flatMap(s => s.meals!).length;
    }
    const dayIndex = (new Date().getDay() + 6) % 7 % mealSections.length;
    return mealSections[dayIndex]?.meals?.length ?? 0;
  }, [dietSections]);

  const completedTodayMealsCount = useMemo(() => {
    if (todayMealCount <= 0) return 0;
    return [...new Set(tracking.meals_completed)]
      .map((mealIndex) => Number(mealIndex))
      .filter((mealIndex) => Number.isInteger(mealIndex) && mealIndex >= 0 && mealIndex < todayMealCount).length;
  }, [tracking.meals_completed, todayMealCount]);

  // Today's training - match by weekday name first, fallback to index cycling
  const todayTraining = useMemo(() => {
    if (trainingDays.length === 0) return undefined;
    const weekdayNames = ['domingo', 'segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta', 'sabado', 'sábado'];
    const jsDay = new Date().getDay(); // 0=Sun
    const todayNames = jsDay === 0 ? ['domingo'] : jsDay === 1 ? ['segunda'] : jsDay === 2 ? ['terca', 'terça'] : jsDay === 3 ? ['quarta'] : jsDay === 4 ? ['quinta'] : jsDay === 5 ? ['sexta'] : ['sabado', 'sábado'];
    const match = trainingDays.find(d => todayNames.some(n => d.day.toLowerCase().includes(n)));
    if (match) return match;
    // Fallback: cycle by index (Mon=0)
    const idx = (jsDay + 6) % 7 % trainingDays.length;
    return trainingDays[idx];
  }, [trainingDays]);

  // Pick an exercise image from today's training
  const todayHeroImage = useMemo(() => {
    if (!todayTraining) return workoutHero;
    // Skip first 2 exercises (usually mobility), start from 3rd
    const startIndex = Math.min(2, todayTraining.exercises.length - 1);
    for (let i = startIndex; i < todayTraining.exercises.length; i++) {
      const key = todayTraining.exercises[i].exercise.toUpperCase().trim();
      if (exerciseImages[key]) return exerciseImages[key];
    }
    // Fallback: try any exercise
    for (const ex of todayTraining.exercises) {
      const key = ex.exercise.toUpperCase().trim();
      if (exerciseImages[key]) return exerciseImages[key];
    }
    return workoutHero;
  }, [todayTraining, exerciseImages]);

  // Main muscle groups for today's training
  const todayMuscleGroups = useMemo(() => {
    if (!todayTraining) return '';
    const groups: string[] = [];
    const startIndex = Math.min(2, todayTraining.exercises.length - 1);
    for (let i = startIndex; i < todayTraining.exercises.length; i++) {
      const key = todayTraining.exercises[i].exercise.toUpperCase().trim();
      const muscle = exerciseMuscles[key];
      if (muscle && !groups.includes(muscle)) groups.push(muscle);
    }
    return groups.slice(0, 3).join(' • ');
  }, [todayTraining, exerciseMuscles]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-5">
          {/* Welcome skeleton */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
          {/* Training card skeleton */}
          <Card className="glass-card overflow-hidden">
            <Skeleton className="h-40 w-full rounded-none" />
          </Card>
          {/* Diet card skeleton */}
          <Skeleton className="h-24 rounded-xl" />
          {/* Dashboard cards skeleton */}
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          {/* Assessments skeleton */}
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Welcome Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-lg">{firstName?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{greeting},</p>
            <h1 className="text-lg font-bold text-foreground">{profile?.nome || 'Aluno'}</h1>
          </div>
        </div>


        {/* Today's Training */}
        {todayTraining && (
          <Card
            className="glass-card overflow-hidden cursor-pointer group"
            onClick={() => navigate('/treino-execucao', {
              state: {
                exercises: todayTraining.exercises,
                dayName: todayTraining.day,
                exerciseMedia,
              },
            })}
          >
            <div className="relative h-40 overflow-hidden">
              <img
                src={todayHeroImage}
                alt="Treino do dia"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">{todayTraining.day}</p>
                    <h3 className="text-base font-bold text-foreground mt-0.5 uppercase">Treino de Hoje</h3>
                    {todayMuscleGroups && (
                      <p className="text-[10px] text-primary/80 font-medium mt-0.5">{todayMuscleGroups}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{todayTraining.exercises.length} exercícios</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* TABATA do Dia */}
        {tabataConteudo && <TabataDoDiaCard conteudo={tabataConteudo} />}

        {/* Diet Summary */}
        {meals.length > 0 && <DietPlanCard sections={dietSections} />}

        {/* Dashboard Cards */}
        <div className="grid grid-cols-3 gap-3">
          <WeeklyRoutineCard
            completedThisWeek={weeklyWorkouts}
            totalDays={trainingDays.length}
            completedToday={tracking.workout_completed}
          />
          <WaterIntakeCard
            currentMl={waterCurrentMl}
            targetMl={waterTargetMl}
            glasses={tracking.water_glasses}
            goal={waterGoalGlasses}
            onAdd={addWater}
            onRemove={removeWater}
          />
          <MealsCompletedCard
            completed={completedTodayMealsCount}
            total={todayMealCount}
          />
        </div>
        {/* No plans message */}
        {trainingDays.length === 0 && meals.length === 0 && (
          <Card className="glass-card">
            <CardContent className="p-6 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum treino ou dieta disponível ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Seu consultor preparará seu plano em breve!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Quick access to assessments */}
        <Card
          className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => navigate('/minhas-avaliacoes')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Minhas Avaliações</p>
                <p className="text-xs text-muted-foreground">{assessmentCount} avaliação(ões) realizada(s)</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default MinhaArea;
