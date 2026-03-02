import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, ClipboardList, User, Target, FileText, ScanLine, Pencil, Trash2, Heart, Bot } from 'lucide-react';
import KarvonenZones from '@/components/KarvonenZones';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

const AlunoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [postureScans, setPostureScans] = useState<any[]>([]);
  const [latestFcRepouso, setLatestFcRepouso] = useState<number | null>(null);

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

        <Tabs defaultValue="avaliacoes">
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="bg-secondary w-max min-w-full">
              <TabsTrigger value="perfil" className="text-xs sm:text-sm"><User className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Perfil</span><span className="sm:hidden">Perfil</span></TabsTrigger>
              <TabsTrigger value="avaliacoes" className="text-xs sm:text-sm"><ClipboardList className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Avaliações</span><span className="sm:hidden">Aval.</span></TabsTrigger>
              <TabsTrigger value="postura" className="text-xs sm:text-sm"><ScanLine className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Análise Postural</span><span className="sm:hidden">Postura</span></TabsTrigger>
              <TabsTrigger value="fc" className="text-xs sm:text-sm"><Heart className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Zonas FC</span><span className="sm:hidden">FC</span></TabsTrigger>
              <TabsTrigger value="objetivos" className="text-xs sm:text-sm"><Target className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Objetivos</span><span className="sm:hidden">Obj.</span></TabsTrigger>
              <TabsTrigger value="notas" className="text-xs sm:text-sm"><FileText className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Observações</span><span className="sm:hidden">Notas</span></TabsTrigger>
              <TabsTrigger value="ia" className="text-xs sm:text-sm"><Bot className="mr-1 h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Treino IA</span><span className="sm:hidden">IA</span></TabsTrigger>
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
              <Button onClick={() => navigate(`/nova-avaliacao/${id}`)} className="font-semibold">
                <Plus className="mr-2 h-4 w-4" /> Nova Avaliação
              </Button>
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
            </div>
          </TabsContent>

          <TabsContent value="postura">
            <div className="space-y-4">
              <Button onClick={() => navigate(`/postura/${id}`)} className="font-semibold">
                <Plus className="mr-2 h-4 w-4" /> Nova Análise Postural
              </Button>
              {postureScans.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="p-6 text-center text-muted-foreground">Nenhuma análise postural registrada.</CardContent>
                </Card>
              ) : (
                postureScans.map((s) => (
                  <Card key={s.id} className="glass-card hover:border-primary/30 transition-colors">
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
          </TabsContent>

          <TabsContent value="fc">
            <KarvonenZones
              studentId={id!}
              birthDate={studentProfile?.data_nascimento}
              fcRepouso={latestFcRepouso}
            />
          </TabsContent>

          <TabsContent value="objetivos">
            <Card className="glass-card">
              <CardContent className="p-6">
                {goals.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum objetivo cadastrado.</p>
                ) : (
                  <div className="space-y-3">
                    {goals.map(g => (
                      <div key={g.id} className="p-3 rounded-lg bg-secondary/50">
                        <div className="flex gap-4 text-sm">
                          {g.meta_peso && <span>Peso: {g.meta_peso} kg</span>}
                          {g.meta_gordura && <span>Gordura: {g.meta_gordura}%</span>}
                          {g.prazo && <span>Prazo: {new Date(g.prazo).toLocaleDateString('pt-BR')}</span>}
                        </div>
                        {g.observacoes && <p className="text-xs text-muted-foreground mt-1">{g.observacoes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notas">
            <Card className="glass-card">
              <CardContent className="p-6">
                {notes.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma observação.</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map(n => (
                      <div key={n.id} className="p-3 rounded-lg bg-secondary/50">
                        <p className="text-xs text-muted-foreground">{new Date(n.data).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm mt-1">{n.nota}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ia">
            <Card className="glass-card">
              <CardContent className="p-6 text-center space-y-4">
                <Bot className="h-12 w-12 mx-auto text-primary" />
                <h3 className="text-lg font-bold">Agente de Treino & Dieta</h3>
                <p className="text-muted-foreground text-sm">Use inteligência artificial para gerar treinos e dietas personalizadas com base nos dados deste aluno.</p>
                <Button onClick={() => navigate(`/treino-ia/${id}`)} className="font-semibold">
                  <Bot className="mr-2 h-4 w-4" /> Iniciar Chat IA
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AlunoDetail;
