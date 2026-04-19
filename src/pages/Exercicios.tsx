import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Search, Check } from 'lucide-react';

const STANDARD_FIELDS = [
  'Banco',
  'Encosto',
  'Apoio dos pés',
  'Rolo',
  'Abertura',
  'Altura',
  'Pegada',
  'Observação',
] as const;
import { toast } from 'sonner';

interface Exercise {
  id: string;
  nome: string;
  grupo_muscular: string;
  imagem_url: string | null;
  video_embed: string | null;
  ajustes: string[] | null;
}

const Exercicios: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [ajustes, setAjustes] = useState<string[]>([]);
  const [novoAjuste, setNovoAjuste] = useState('');

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exercises-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, nome, grupo_muscular, imagem_url, video_embed, ajustes')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, ajustes }: { id: string; ajustes: string[] }) => {
      const { error } = await supabase.from('exercises').update({ ajustes }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises-admin'] });
      toast.success('Ajustes atualizados.');
      setEditing(null);
    },
    onError: () => toast.error('Erro ao salvar.'),
  });

  const openEdit = (ex: Exercise) => {
    setEditing(ex);
    setAjustes(ex.ajustes ?? []);
    setNovoAjuste('');
  };

  const addAjuste = () => {
    const v = novoAjuste.trim();
    if (!v || ajustes.includes(v)) return;
    setAjustes((prev) => [...prev, v]);
    setNovoAjuste('');
  };

  const removeAjuste = (v: string) => setAjustes((prev) => prev.filter((a) => a !== v));

  const filtered = exercises.filter(
    (e) =>
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.grupo_muscular.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Exercícios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure os ajustes de máquina disponíveis para cada exercício.
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou grupo muscular..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Ajustes</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum exercício encontrado.</TableCell></TableRow>
                ) : filtered.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">{ex.nome}</TableCell>
                    <TableCell><Badge variant="secondary">{ex.grupo_muscular}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(ex.ajustes ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          (ex.ajustes ?? []).map((a) => (
                            <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(ex)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="line-clamp-2">{editing?.nome}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ajustes da máquina</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Adicione os campos que o aluno poderá registrar (ex: Banco, Encosto, Apoio dos pés, Rolo).
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {ajustes.map((a) => (
                    <Badge key={a} variant="secondary" className="gap-1.5 pr-1 py-1">
                      {a}
                      <button onClick={() => removeAjuste(a)} className="rounded-full hover:bg-destructive/20 p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {ajustes.length === 0 && <span className="text-xs text-muted-foreground">Nenhum ajuste configurado.</span>}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: Banco"
                    value={novoAjuste}
                    onChange={(e) => setNovoAjuste(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAjuste(); } }}
                  />
                  <Button type="button" onClick={addAjuste}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button
                onClick={() => editing && saveMutation.mutate({ id: editing.id, ajustes })}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Exercicios;
