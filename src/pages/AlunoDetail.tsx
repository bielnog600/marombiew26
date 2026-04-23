import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import AiPlansList from '@/components/AiPlansList';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, ClipboardList, User, Target, FileText, ScanLine, Pencil, Trash2, Heart, Bot, Download, Loader2, BarChart3, UtensilsCrossed, FileQuestion, Dumbbell, Flame, HeartPulse } from 'lucide-react';
import StudentTrainingTab from '@/components/student/StudentTrainingTab';
import StudentDietTab from '@/components/student/StudentDietTab';
import AssessmentComparison from '@/components/AssessmentComparison';
import DietQuestionnairesList from '@/components/DietQuestionnairesList';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import KarvonenZones from '@/components/KarvonenZones';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

const AlunoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'avaliacoes';
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [postureScans, setPostureScans] = useState<any[]>([]);
  const [latestFcRepouso, setLatestFcRepouso] = useState<number | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', id).maybeSingle();
    setProfile(prof);

    const { data: sp } = await supabase.from('students_profile').select('*').eq('user_id', id).maybeSingle();
    setStudentProfile(sp);

    const { data: avals } = await supabase.from('assessments').select('*').eq('student_id', id).order('created_at', { ascending: false });
    setAssessments(avals ?? []);

    const { data: g } = await supabase.from('goals').select('*').eq('student_id', id).order('created_at', { ascending: false });
    setGoals(g ?? []);

    const { data: n } = await supabase.from('progress_notes').select('*').eq('student_id', id).order('created_at', { ascending: false });
    setNotes(n ?? []);

    const { data: ps } = await supabase.from('posture_scans').select('*').eq('student_id', id).order('created_at', { ascending: false });
    setPostureScans(ps ?? []);

    // Load latest FC repouso from vitals
    if (avals && avals.length > 0) {
      const { data: v } = await supabase.from('vitals').select('fc_repouso').eq('assessment_id', avals[0].id).maybeSingle();
      setLatestFcRepouso(v?.fc_repouso ?? null);
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    // Delete related data first
    await Promise.all([
      supabase.from('anthropometrics').delete().eq('assessment_id', assessmentId),
      supabase.from('skinfolds').delete().eq('assessment_id', assessmentId),
      supabase.from('composition').delete().eq('assessment_id', assessmentId),
      supabase.from('vitals').delete().eq('assessment_id', assessmentId),
      supabase.from('performance_tests').delete().eq('assessment_id', assessmentId),
      supabase.from('anamnese').delete().eq('assessment_id', assessmentId),
      supabase.from('posture').delete().eq('assessment_id', assessmentId),
      supabase.from('assessment_photos').delete().eq('assessment_id', assessmentId),
    ]);
    const { error } = await supabase.from('assessments').delete().eq('id', assessmentId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Avaliação deletada.');
    setAssessments(prev => prev.filter(a => a.id !== assessmentId));
  };

  const handleImportFox = async () => {
    if (!importUrl.trim()) {
      toast.error('Cole a URL do relatório Fox');
      return;
    }
    setImportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-fox-assessment', {
        body: { url: importUrl.trim(), studentId: id },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Erro ao importar');
      } else {
        toast.success('Avaliação importada com sucesso!');
        setImportDialogOpen(false);
        setImportUrl('');
        loadData();
      }
    } catch (err: any) {
      toast.error('Erro ao importar: ' + (err.message || 'erro desconhecido'));
    }
    setImportLoading(false);
  };

  if (!profile) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={profile.nome || 'Aluno'}>
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate('/alunos')} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary text-2xl font-bold">
                {(profile.nome || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold">{profile.nome}</h2>
                <p className="text-muted-foreground">{profile.email}</p>
                {profile.telefone && <p className="text-sm text-muted-foreground">{profile.telefone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue={initialTab} data-no-swipe>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="bg-secondary w-max min-w-full">
              <TabsTrigger value="perfil" className="text-xs sm:text-sm"><User className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Perfil</span><span className="sm:hidden">Perfil</span></TabsTrigger>
              <TabsTrigger value="avaliacoes" className="text-xs sm:text-sm"><ClipboardList className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Avaliações</span><span className="sm:hidden">Aval.</span></TabsTrigger>
              <TabsTrigger value="comparar" className="text-xs sm:text-sm"><BarChart3 className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Comparar</span><span className="sm:hidden">Comp.</span></TabsTrigger>
              <TabsTrigger value="treinos" className="text-xs sm:text-sm"><Dumbbell className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Treinos</span><span className="sm:hidden">Treino</span></TabsTrigger>
              <TabsTrigger value="dietas" className="text-xs sm:text-sm"><UtensilsCrossed className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Dietas</span><span className="sm:hidden">Dieta</span></TabsTrigger>
              <TabsTrigger value="fichas" className="text-xs sm:text-sm"><FileQuestion className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Fichas</span><span className="sm:hidden">Fichas</span></TabsTrigger>
              <TabsTrigger value="ia" className="text-xs sm:text-sm"><Bot className="mr-1 h-4 w-4 shrink-0" /> IA</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="perfil">
            <Card className="glass-card">
              <CardContent className="p-6">
                {studentProfile ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Sexo:</span> <span className="ml-2 capitalize">{studentProfile.sexo || '-'}</span></div>
                    <div><span className="text-muted-foreground">Nascimento:</span> <span className="ml-2">{studentProfile.data_nascimento || '-'}</span></div>
                    <div><span className="text-muted-foreground">Altura:</span> <span className="ml-2">{studentProfile.altura ? `${studentProfile.altura} cm` : '-'}</span></div>
                    <div><span className="text-muted-foreground">Objetivo:</span> <span className="ml-2">{studentProfile.objetivo || '-'}</span></div>
                    <div className="col-span-full"><span className="text-muted-foreground">Restrições:</span> <span className="ml-2">{studentProfile.restricoes || '-'}</span></div>
                    <div className="col-span-full"><span className="text-muted-foreground">Lesões:</span> <span className="ml-2">{studentProfile.lesoes || '-'}</span></div>
                    <div className="col-span-full"><span className="text-muted-foreground">Observações:</span> <span className="ml-2">{studentProfile.observacoes || '-'}</span></div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Perfil detalhado não cadastrado.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="avaliacoes">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/nova-avaliacao/${id}`)} className="font-semibold">
                  <Plus className="mr-2 h-4 w-4" /> Nova Avaliação
                </Button>
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="font-semibold">
                      <Download className="mr-2 h-4 w-4" /> Importar Fox
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-card">
                    <DialogHeader>
                      <DialogTitle>Importar Avaliação do Fox</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>URL do Relatório Fox</Label>
                        <Input
                          placeholder="https://app.foxavaliacaofisica.com.br/relatorio/full/..."
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Cole a URL completa do relatório do Fox Avaliação Física (incluindo o token).
                        </p>
                      </div>
                      <Button
                        onClick={handleImportFox}
                        disabled={importLoading}
                        className="w-full font-semibold"
                      >
                        {importLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</> : 'Importar Avaliação'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {assessments.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="p-6 text-center text-muted-foreground">Nenhuma avaliação registrada.</CardContent>
                </Card>
              ) : (
                assessments.map((a) => (
                  <Card key={a.id} className="glass-card hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="cursor-pointer flex-1" onClick={() => navigate(`/relatorio/${a.id}`)}>
                        <p className="font-medium">Avaliação</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => navigate(`/nova-avaliacao/${id}?edit=${a.id}`)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Deletar avaliação?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. Todos os dados desta avaliação serão removidos permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAssessment(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Deletar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Posture scans section inside avaliacoes */}
              <div className="mt-6 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-primary" /> Análise Postural
                  </h3>
                  <Button size="sm" onClick={() => navigate(`/postura/${id}`)} className="font-semibold">
                    <Plus className="mr-1 h-3 w-3" /> Nova Análise
                  </Button>
                </div>
                {postureScans.length === 0 ? (
                  <Card className="glass-card">
                    <CardContent className="p-4 text-center text-muted-foreground text-sm">Nenhuma análise postural registrada.</CardContent>
                  </Card>
                ) : (
                  postureScans.map((s) => (
                    <Card key={s.id} className="glass-card hover:border-primary/30 transition-colors mb-2">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="cursor-pointer flex-1" onClick={() => navigate(`/postura/${id}`)}>
                          <p className="font-medium">Análise Postural</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(s.created_at).toLocaleDateString('pt-BR')}
                          </p>
                          {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deletar análise postural?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. Todos os dados desta análise serão removidos permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => {
                                  const { error } = await supabase.from('posture_scans').delete().eq('id', s.id);
                                  if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
                                  toast.success('Análise deletada.');
                                  setPostureScans(prev => prev.filter(p => p.id !== s.id));
                                }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>


          <TabsContent value="comparar">
            <AssessmentComparison studentId={id!} studentName={profile?.nome} assessments={assessments} />
          </TabsContent>

          <TabsContent value="treinos">
            <StudentTrainingTab studentId={id!} />
          </TabsContent>

          <TabsContent value="dietas">
            <StudentDietTab studentId={id!} />
          </TabsContent>

          <TabsContent value="fichas">
            <DietQuestionnairesList studentId={id!} studentPhone={profile?.telefone} studentName={profile?.nome} />
          </TabsContent>

          <TabsContent value="ia">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="glass-card">
                  <CardContent className="p-6 text-center space-y-4">
                    <Bot className="h-12 w-12 mx-auto text-primary" />
                    <h3 className="text-lg font-bold">Agente de Treino</h3>
                    <p className="text-muted-foreground text-sm">Gere treinos personalizados com IA baseados nos dados do aluno.</p>
                    <Button onClick={() => navigate(`/treino-ia/${id}`)} className="font-semibold w-full">
                      <Bot className="mr-2 h-4 w-4" /> Gerar Treino
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="p-6 text-center space-y-4">
                    <UtensilsCrossed className="h-12 w-12 mx-auto text-primary" />
                    <h3 className="text-lg font-bold">Agente de Dieta</h3>
                    <p className="text-muted-foreground text-sm">Calcule TMB, GET e gere dietas personalizadas com múltiplas estratégias.</p>
                    <Button onClick={() => navigate(`/dieta-ia/${id}`)} className="font-semibold w-full">
                      <UtensilsCrossed className="mr-2 h-4 w-4" /> Gerar Dieta
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass-card border-primary/30">
                  <CardContent className="p-6 text-center space-y-4">
                    <Flame className="h-12 w-12 mx-auto text-primary" />
                    <h3 className="text-lg font-bold">TABATA IA</h3>
                    <p className="text-muted-foreground text-sm">Gere treinos HIIT/TABATA seguros e personalizados ao perfil do aluno.</p>
                    <Button onClick={() => navigate(`/tabata-ia/${id}`)} className="font-semibold w-full">
                      <Flame className="mr-2 h-4 w-4" /> Gerar TABATA
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass-card border-primary/30">
                  <CardContent className="p-6 text-center space-y-4">
                    <HeartPulse className="h-12 w-12 mx-auto text-primary" />
                    <h3 className="text-lg font-bold">Cardio IA</h3>
                    <p className="text-muted-foreground text-sm">Gere protocolos de cardio personalizados (passadeira, bike, elíptica, escada) com zona Karvonen alvo.</p>
                    <Button onClick={() => navigate(`/cardio-ia/${id}`)} className="font-semibold w-full">
                      <HeartPulse className="mr-2 h-4 w-4" /> Gerar Cardio com IA
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <AiPlansList studentId={id!} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AlunoDetail;
