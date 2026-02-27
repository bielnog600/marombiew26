import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const Alunos = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterAtivo, setFilterAtivo] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ nome: '', email: '', password: '', telefone: '', sexo: 'masculino', objetivo: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = async () => {
    // Get all aluno role user_ids
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'aluno');

    const alunoIds = (roleData ?? []).map(r => r.user_id);
    if (alunoIds.length === 0) { setStudents([]); return; }

    const { data } = await supabase
      .from('profiles')
      .select('*, students_profile(*)')
      .in('user_id', alunoIds)
      .order('created_at', { ascending: false });

    setStudents(data ?? []);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.nome || !newStudent.email || !newStudent.password) {
      toast.error('Preencha nome, email e senha');
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: newStudent.email,
      password: newStudent.password,
      options: {
        data: { nome: newStudent.nome, role: 'aluno' }
      }
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Aluno cadastrado! Um email de confirmação foi enviado.');
      setDialogOpen(false);
      setNewStudent({ nome: '', email: '', password: '', telefone: '', sexo: 'masculino', objetivo: '' });
      setTimeout(loadStudents, 1000);
    }
    setLoading(false);
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
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
                      {(s.nome || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{s.nome || 'Sem nome'}</p>
                      <p className="text-sm text-muted-foreground truncate">{s.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Alunos;
