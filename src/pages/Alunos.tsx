import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const Alunos = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterAtivo, setFilterAtivo] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ nome: '', email: '', password: '', telefone: '', sexo: 'masculino', raca: '', objetivo: '' });
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { loadStudents(); }, []);

  // Auto-open edit dialog if ?edit=userId is present
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && students.length > 0) {
      const student = students.find(s => s.user_id === editId);
      if (student) {
        const sp = student.students_profile;
        setEditStudent({
          user_id: student.user_id,
          nome: student.nome || '',
          telefone: student.telefone || '',
          sexo: sp?.sexo || '',
          raca: sp?.raca || '',
          objetivo: sp?.objetivo || '',
          data_nascimento: sp?.data_nascimento || '',
          altura: sp?.altura || '',
          restricoes: sp?.restricoes || '',
          lesoes: sp?.lesoes || '',
          observacoes: sp?.observacoes || '',
        });
        setEditDialogOpen(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [students, searchParams]);

  const loadStudents = async () => {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'aluno');

    const alunoIds = (roleData ?? []).map(r => r.user_id);
    if (alunoIds.length === 0) { setStudents([]); return; }

    const [{ data: profilesData }, { data: studentsData }] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', alunoIds).order('created_at', { ascending: false }),
      supabase.from('students_profile').select('*').in('user_id', alunoIds),
    ]);

    const spMap = new Map((studentsData ?? []).map(sp => [sp.user_id, sp]));
    const merged = (profilesData ?? []).map(p => ({ ...p, students_profile: spMap.get(p.user_id) || null }));
    setStudents(merged);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.nome || !newStudent.email || !newStudent.password) {
      toast.error('Preencha nome, email e senha');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('create-student', {
      body: {
        email: newStudent.email,
        password: newStudent.password,
        nome: newStudent.nome,
        telefone: newStudent.telefone,
        sexo: newStudent.sexo,
        raca: newStudent.raca,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Erro ao cadastrar aluno');
    } else {
      toast.success('Aluno cadastrado com sucesso!');
      setDialogOpen(false);
      setNewStudent({ nome: '', email: '', password: '', telefone: '', sexo: 'masculino', raca: '', objetivo: '' });
      setTimeout(loadStudents, 1000);
    }
    setLoading(false);
  };

  const openEditDialog = (s: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const sp = s.students_profile;
    setEditStudent({
      user_id: s.user_id,
      nome: s.nome || '',
      telefone: s.telefone || '',
      sexo: sp?.sexo || '',
      raca: sp?.raca || '',
      objetivo: sp?.objetivo || '',
      data_nascimento: sp?.data_nascimento || '',
      altura: sp?.altura || '',
      restricoes: sp?.restricoes || '',
      lesoes: sp?.lesoes || '',
      observacoes: sp?.observacoes || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    setEditLoading(true);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ nome: editStudent.nome, telefone: editStudent.telefone || null })
      .eq('user_id', editStudent.user_id);

    if (profileError) {
      toast.error('Erro ao atualizar perfil: ' + profileError.message);
      setEditLoading(false);
      return;
    }

    const { error: spError } = await supabase
      .from('students_profile')
      .update({
        sexo: editStudent.sexo || null,
        raca: editStudent.raca || null,
        objetivo: editStudent.objetivo || null,
        data_nascimento: editStudent.data_nascimento || null,
        altura: editStudent.altura ? Number(editStudent.altura) : null,
        restricoes: editStudent.restricoes || null,
        lesoes: editStudent.lesoes || null,
        observacoes: editStudent.observacoes || null,
      })
      .eq('user_id', editStudent.user_id);

    if (spError) {
      toast.error('Erro ao atualizar dados: ' + spError.message);
      setEditLoading(false);
      return;
    }

    toast.success('Aluno atualizado com sucesso!');
    setEditDialogOpen(false);
    loadStudents();
    setEditLoading(false);
  };

  const handleDeleteStudent = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke('delete-student', {
      body: { student_user_id: userId },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Erro ao deletar aluno');
    } else {
      toast.success('Aluno deletado com sucesso!');
      setStudents(prev => prev.filter(s => s.user_id !== userId));
    }
  };

  const filteredStudents = students.filter(s => {
    const matchSearch = s.nome?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
    if (filterAtivo === 'all') return matchSearch;
    const sp = Array.isArray(s.students_profile) ? s.students_profile[0] : s.students_profile;
    const isAtivo = sp?.ativo !== false;
    return matchSearch && (filterAtivo === 'ativo' ? isAtivo : !isAtivo);
  });

  return (
    <AppLayout title="Alunos">
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-1 w-full sm:w-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterAtivo} onValueChange={setFilterAtivo}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold">
                <Plus className="mr-2 h-4 w-4" /> Novo Aluno
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Aluno</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateStudent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={newStudent.nome} onChange={e => setNewStudent({ ...newStudent, nome: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <Input type="password" value={newStudent.password} onChange={e => setNewStudent({ ...newStudent, password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={newStudent.telefone} onChange={e => setNewStudent({ ...newStudent, telefone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Sexo</Label>
                  <Select value={newStudent.sexo} onValueChange={v => setNewStudent({ ...newStudent, sexo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Raça</Label>
                  <Select value={newStudent.raca} onValueChange={v => setNewStudent({ ...newStudent, raca: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="branco">Branco</SelectItem>
                      <SelectItem value="negro">Negro</SelectItem>
                      <SelectItem value="pardo">Pardo</SelectItem>
                      <SelectItem value="asiatico">Asiático</SelectItem>
                      <SelectItem value="indigena">Indígena</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={loading}>
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.length === 0 ? (
            <Card className="glass-card col-span-full">
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum aluno encontrado.
              </CardContent>
            </Card>
          ) : (
            filteredStudents.map((s) => (
              <Card
                key={s.id}
                className="glass-card cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => navigate(`/alunos/${s.user_id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold shrink-0 text-sm">
                      {(s.nome || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-tight">{s.nome || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-primary"
                      onClick={(e) => openEditDialog(s, e)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deletar aluno</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja deletar <strong>{s.nome || 'este aluno'}</strong>? Todos os dados (avaliações, planos, fichas) serão removidos permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDeleteStudent(s.user_id)}
                          >
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

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="glass-card max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Aluno</DialogTitle>
            </DialogHeader>
            {editStudent && (
              <form onSubmit={handleEditStudent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={editStudent.nome} onChange={e => setEditStudent({ ...editStudent, nome: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={editStudent.telefone} onChange={e => setEditStudent({ ...editStudent, telefone: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sexo</Label>
                    <Select value={editStudent.sexo} onValueChange={v => setEditStudent({ ...editStudent, sexo: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Raça</Label>
                    <Select value={editStudent.raca} onValueChange={v => setEditStudent({ ...editStudent, raca: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="branco">Branco</SelectItem>
                        <SelectItem value="negro">Negro</SelectItem>
                        <SelectItem value="pardo">Pardo</SelectItem>
                        <SelectItem value="asiatico">Asiático</SelectItem>
                        <SelectItem value="indigena">Indígena</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Nascimento</Label>
                    <Input type="date" value={editStudent.data_nascimento} onChange={e => setEditStudent({ ...editStudent, data_nascimento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Altura (cm)</Label>
                    <Input type="number" value={editStudent.altura} onChange={e => setEditStudent({ ...editStudent, altura: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Objetivo</Label>
                  <Input value={editStudent.objetivo} onChange={e => setEditStudent({ ...editStudent, objetivo: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Restrições</Label>
                  <Input value={editStudent.restricoes} onChange={e => setEditStudent({ ...editStudent, restricoes: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Lesões</Label>
                  <Input value={editStudent.lesoes} onChange={e => setEditStudent({ ...editStudent, lesoes: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input value={editStudent.observacoes} onChange={e => setEditStudent({ ...editStudent, observacoes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={editLoading}>
                  Salvar Alterações
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Alunos;
