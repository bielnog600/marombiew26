import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Utensils, Dumbbell, ClipboardList, Users, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

const CYCLE_MIN_DAYS = 28; // 4 semanas
const CYCLE_MAX_DAYS = 42; // 6 semanas

type CycleStatus = 'ok' | 'atencao' | 'vencido';

function getCycleInfo(dateStr: string | null): { days: number; remaining: number; status: CycleStatus; progress: number } {
  if (!dateStr) return { days: 0, remaining: 0, status: 'vencido', progress: 100 };
  const days = differenceInDays(new Date(), new Date(dateStr));
  const remaining = CYCLE_MAX_DAYS - days;
  let status: CycleStatus = 'ok';
  if (days >= CYCLE_MAX_DAYS) status = 'vencido';
  else if (days >= CYCLE_MIN_DAYS) status = 'atencao';
  const progress = Math.min(100, Math.round((days / CYCLE_MAX_DAYS) * 100));
  return { days, remaining, status, progress };
}

function cycleStatusBadge(status: CycleStatus, remaining: number) {
  switch (status) {
    case 'ok': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">{remaining}d restantes</Badge>;
    case 'atencao': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">⚠ {remaining > 0 ? `${remaining}d restantes` : 'Renovar'}</Badge>;
    case 'vencido': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Vencido</Badge>;
  }
}

function cycleProgressColor(status: CycleStatus) {
  switch (status) {
    case 'ok': return '[&>div]:bg-emerald-500';
    case 'atencao': return '[&>div]:bg-orange-500';
    case 'vencido': return '[&>div]:bg-destructive';
  }
}

interface StudentSummary {
  userId: string;
  nome: string;
  email: string;
  telefone: string | null;
  totalDietas: number;
  totalTreinos: number;
  totalAvaliacoes: number;
  fichaStatus: 'respondida' | 'pendente' | 'sem_ficha';
  ultimaDieta: string | null;
  ultimoTreino: string | null;
  ultimaFicha: string | null;
}

const Consultoria = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ dietas: 0, treinos: 0, fichas: 0, fichasPendentes: 0, alunos: 0, dietasVencidas: 0, treinosVencidos: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
    const alunoIds = (roles ?? []).map(r => r.user_id);
    if (alunoIds.length === 0) { setLoading(false); return; }

    const [profilesRes, plansRes, assessmentsRes, questionnairesRes] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', alunoIds),
      supabase.from('ai_plans').select('student_id, tipo, created_at').in('student_id', alunoIds).order('created_at', { ascending: false }),
      supabase.from('assessments').select('student_id, created_at').in('student_id', alunoIds),
      supabase.from('diet_questionnaires').select('student_id, status, created_at, responded_at').in('student_id', alunoIds).order('created_at', { ascending: false }),
    ]);

    const profiles = profilesRes.data ?? [];
    const plans = plansRes.data ?? [];
    const assessments = assessmentsRes.data ?? [];
    const questionnaires = questionnairesRes.data ?? [];

    let totalDietas = 0, totalTreinos = 0, totalFichas = 0, totalFichasPendentes = 0, dietasVencidas = 0, treinosVencidos = 0;

    const summaries: StudentSummary[] = profiles.map(p => {
      const studentPlans = plans.filter(pl => pl.student_id === p.user_id);
      const dietas = studentPlans.filter(pl => pl.tipo === 'dieta');
      const treinos = studentPlans.filter(pl => pl.tipo === 'treino');
      const studentAssessments = assessments.filter(a => a.student_id === p.user_id);
      const studentFichas = questionnaires.filter(q => q.student_id === p.user_id);
      const lastFicha = studentFichas[0];

      totalDietas += dietas.length;
      totalTreinos += treinos.length;
      totalFichas += studentFichas.length;
      if (lastFicha?.status === 'pending') totalFichasPendentes++;

      const dietaCycle = getCycleInfo(dietas[0]?.created_at ?? null);
      const treinoCycle = getCycleInfo(treinos[0]?.created_at ?? null);
      if (dietas.length > 0 && dietaCycle.status === 'vencido') dietasVencidas++;
      if (treinos.length > 0 && treinoCycle.status === 'vencido') treinosVencidos++;

      let fichaStatus: 'respondida' | 'pendente' | 'sem_ficha' = 'sem_ficha';
      if (lastFicha) fichaStatus = lastFicha.status === 'pending' ? 'pendente' : 'respondida';

      return {
        userId: p.user_id, nome: p.nome || 'Sem nome', email: p.email, telefone: p.telefone,
        totalDietas: dietas.length, totalTreinos: treinos.length, totalAvaliacoes: studentAssessments.length,
        fichaStatus, ultimaDieta: dietas[0]?.created_at ?? null, ultimoTreino: treinos[0]?.created_at ?? null, ultimaFicha: lastFicha?.created_at ?? null,
      };
    });

    setStudents(summaries.sort((a, b) => a.nome.localeCompare(b.nome)));
    setTotals({ dietas: totalDietas, treinos: totalTreinos, fichas: totalFichas, fichasPendentes: totalFichasPendentes, alunos: profiles.length, dietasVencidas, treinosVencidos });
    setLoading(false);
  };

  const fmtDate = (d: string | null) => d ? format(new Date(d), "dd/MM/yy", { locale: ptBR }) : '—';

  const statCards = [
    { title: 'Alunos Ativos', value: totals.alunos, icon: Users, color: 'text-primary' },
    { title: 'Dietas Geradas', value: totals.dietas, sub: totals.dietasVencidas > 0 ? `${totals.dietasVencidas} vencida${totals.dietasVencidas > 1 ? 's' : ''}` : undefined, icon: Utensils, color: 'text-emerald-500' },
    { title: 'Treinos Gerados', value: totals.treinos, sub: totals.treinosVencidos > 0 ? `${totals.treinosVencidos} vencido${totals.treinosVencidos > 1 ? 's' : ''}` : undefined, icon: Dumbbell, color: 'text-blue-500' },
    { title: 'Fichas Pendentes', value: totals.fichasPendentes, icon: ClipboardList, color: 'text-orange-500' },
  ];

  const fichaStatusBadge = (status: string) => {
    switch (status) {
      case 'respondida': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Respondida</Badge>;
      case 'pendente': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">Pendente</Badge>;
      default: return <Badge variant="outline" className="bg-muted text-muted-foreground">Sem ficha</Badge>;
    }
  };

  const renderPlanRow = (s: StudentSummary, tipo: 'dieta' | 'treino') => {
    const date = tipo === 'dieta' ? s.ultimaDieta : s.ultimoTreino;
    const total = tipo === 'dieta' ? s.totalDietas : s.totalTreinos;
    const cycle = getCycleInfo(date);
    const Icon = tipo === 'dieta' ? Utensils : Dumbbell;
    const iconColor = tipo === 'dieta' ? 'text-emerald-500' : 'text-blue-500';

    return (
      <div
        key={s.userId}
        className="p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
        onClick={() => navigate(`/alunos/${s.userId}`)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{s.nome}</p>
              <p className="text-xs text-muted-foreground">Última: {fmtDate(date)} · {total} {tipo}{total > 1 ? 's' : ''}</p>
            </div>
          </div>
          {cycleStatusBadge(cycle.status, cycle.remaining)}
        </div>
        <div className="flex items-center gap-2">
          <Progress value={cycle.progress} className={`h-1.5 flex-1 ${cycleProgressColor(cycle.status)}`} />
          <span className="text-[10px] text-muted-foreground w-14 text-right">
            {cycle.days}d / {CYCLE_MAX_DAYS}d
          </span>
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="Consultoria">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(stat => (
            <Card key={stat.title} className="glass-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-xl p-2.5 bg-secondary ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{loading ? '…' : stat.value}</p>
                  {stat.sub && <p className="text-[10px] text-destructive">{stat.sub}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="dietas">Dietas</TabsTrigger>
            <TabsTrigger value="treinos">Treinos</TabsTrigger>
            <TabsTrigger value="fichas">Fichas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Resumo por Aluno
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado.</p>
                ) : (
                  <div className="space-y-2">
                    {students.map(s => {
                      const dietaCycle = getCycleInfo(s.ultimaDieta);
                      const treinoCycle = getCycleInfo(s.ultimoTreino);
                      return (
                        <div
                          key={s.userId}
                          className="p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                          onClick={() => navigate(`/alunos/${s.userId}`)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm shrink-0">
                              {s.nome[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{s.nome}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                {s.totalDietas > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    🍽 {s.totalDietas}
                                    <span className={`text-[10px] ${dietaCycle.status === 'vencido' ? 'text-destructive' : dietaCycle.status === 'atencao' ? 'text-orange-500' : 'text-emerald-500'}`}>
                                      ({dietaCycle.remaining > 0 ? `${dietaCycle.remaining}d` : 'vencida'})
                                    </span>
                                  </span>
                                )}
                                {s.totalTreinos > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    🏋️ {s.totalTreinos}
                                    <span className={`text-[10px] ${treinoCycle.status === 'vencido' ? 'text-destructive' : treinoCycle.status === 'atencao' ? 'text-orange-500' : 'text-emerald-500'}`}>
                                      ({treinoCycle.remaining > 0 ? `${treinoCycle.remaining}d` : 'vencido'})
                                    </span>
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">📋 {s.totalAvaliacoes}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {fichaStatusBadge(s.fichaStatus)}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dietas">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-emerald-500" />
                  Ciclo de Dietas (4-6 semanas)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : (
                  <div className="space-y-2">
                    {students.filter(s => s.totalDietas > 0).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma dieta gerada ainda.</p>
                    ) : (
                      students.filter(s => s.totalDietas > 0)
                        .sort((a, b) => getCycleInfo(b.ultimaDieta).days - getCycleInfo(a.ultimaDieta).days)
                        .map(s => renderPlanRow(s, 'dieta'))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="treinos">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Dumbbell className="h-5 w-5 text-blue-500" />
                  Ciclo de Treinos (4-6 semanas)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : (
                  <div className="space-y-2">
                    {students.filter(s => s.totalTreinos > 0).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum treino gerado ainda.</p>
                    ) : (
                      students.filter(s => s.totalTreinos > 0)
                        .sort((a, b) => getCycleInfo(b.ultimoTreino).days - getCycleInfo(a.ultimoTreino).days)
                        .map(s => renderPlanRow(s, 'treino'))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fichas">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-orange-500" />
                  Fichas (Questionários de Dieta)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : (
                  <div className="space-y-2">
                    {students.map(s => (
                      <div
                        key={s.userId}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                        onClick={() => navigate(`/alunos/${s.userId}`)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ClipboardList className="h-4 w-4 text-orange-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{s.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.ultimaFicha ? `Enviada: ${fmtDate(s.ultimaFicha)}` : 'Nunca enviada'}
                            </p>
                          </div>
                        </div>
                        {fichaStatusBadge(s.fichaStatus)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Consultoria;
