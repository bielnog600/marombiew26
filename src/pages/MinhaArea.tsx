import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dumbbell, UtensilsCrossed, Weight, TrendingUp, ClipboardList, ChevronRight, Flame, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseTrainingResult, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { parseDietResult, type ParsedMeal } from '@/lib/dietResultParser';

const MinhaArea = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [latestAnthro, setLatestAnthro] = useState<any>(null);
  const [latestComp, setLatestComp] = useState<any>(null);
  const [assessmentCount, setAssessmentCount] = useState(0);
  const [trainingDays, setTrainingDays] = useState<ParsedTrainingDay[]>([]);
  const [meals, setMeals] = useState<ParsedMeal[]>([]);
  const [trainingTitle, setTrainingTitle] = useState('');
  const [dietTitle, setDietTitle] = useState('');

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

    if (avals && avals.length > 0) {
      const latest = avals[0];
      const [anthroR, compR] = await Promise.all([
        supabase.from('anthropometrics').select('peso, imc').eq('assessment_id', latest.id).maybeSingle(),
        supabase.from('composition').select('percentual_gordura, massa_magra').eq('assessment_id', latest.id).maybeSingle(),
      ]);
      setLatestAnthro(anthroR.data);
      setLatestComp(compR.data);
    }

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
      const sections = parseTrainingResult(treino.conteudo);
      const allDays = sections.flatMap(s => s.days ?? []);
      setTrainingDays(allDays);
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
      const sections = parseDietResult(dieta.conteudo);
      const allMeals = sections.flatMap(s => s.meals ?? []);
      setMeals(allMeals);
    }
  };

  const firstName = profile?.nome?.split(' ')[0] || '';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  // Today's training (cycle through days based on weekday)
  const todayIndex = trainingDays.length > 0 ? new Date().getDay() % trainingDays.length : 0;
  const todayTraining = trainingDays[todayIndex];

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

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass-card">
            <CardContent className="p-3 text-center">
              <Weight className="h-6 w-6 text-primary mx-auto mb-1" />
              <p className="text-xl font-bold">{latestAnthro?.peso ?? '-'}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Peso (kg)</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 text-center">
              <Flame className="h-6 w-6 text-chart-5 mx-auto mb-1" />
              <p className="text-xl font-bold">{latestComp?.percentual_gordura ?? '-'}<span className="text-sm">%</span></p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gordura</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 text-center">
              <Activity className="h-6 w-6 text-chart-2 mx-auto mb-1" />
              <p className="text-xl font-bold">{latestAnthro?.imc ?? '-'}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">IMC</p>
            </CardContent>
          </Card>
        </div>

        {/* Today's Training */}
        {todayTraining && (
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  Treino de Hoje
                </CardTitle>
                <span className="text-[10px] text-muted-foreground uppercase">{todayTraining.day}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {todayTraining.exercises.slice(0, 6).map((ex, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-sm text-foreground truncate flex-1">{ex.exercise}</span>
                    <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                      {ex.series && `${ex.series}x`}{ex.reps || ''}
                    </span>
                  </div>
                ))}
                {todayTraining.exercises.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{todayTraining.exercises.length - 6} exercícios
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Diet Summary */}
        {meals.length > 0 && (
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-chart-3" />
                Plano Alimentar
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {meals.slice(0, 6).map((meal, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate block">{meal.name}</span>
                      {meal.time && <span className="text-[10px] text-muted-foreground">{meal.time}</span>}
                    </div>
                    <span className="text-xs text-primary font-medium ml-2 whitespace-nowrap">
                      {meal.totalKcal ? `${meal.totalKcal} kcal` : `${meal.foods.length} itens`}
                    </span>
                  </div>
                ))}
                {meals.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{meals.length - 6} refeições
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
