import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, ClipboardList, User, Target, FileText, ScanLine } from 'lucide-react';
import { toast } from 'sonner';

const AlunoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

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
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => navigate(`/postura/${id}`)}>
                  <ScanLine className="mr-2 h-4 w-4" /> Análise Postura
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="avaliacoes">
          <TabsList className="bg-secondary">
            <TabsTrigger value="perfil"><User className="mr-1 h-4 w-4" /> Perfil</TabsTrigger>
            <TabsTrigger value="avaliacoes"><ClipboardList className="mr-1 h-4 w-4" /> Avaliações</TabsTrigger>
            <TabsTrigger value="objetivos"><Target className="mr-1 h-4 w-4" /> Objetivos</TabsTrigger>
            <TabsTrigger value="notas"><FileText className="mr-1 h-4 w-4" /> Observações</TabsTrigger>
          </TabsList>

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
                  <Card key={a.id} className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/relatorio/${a.id}`)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">Avaliação</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-primary" />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
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
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AlunoDetail;
