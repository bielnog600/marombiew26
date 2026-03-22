import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface FoodForm {
  name: string;
  portion: string;
  portion_size: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

const emptyForm: FoodForm = {
  name: '',
  portion: 'gramas',
  portion_size: 100,
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};

const Alimentos: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FoodForm>(emptyForm);

  const { data: foods = [], isLoading } = useQuery({
    queryKey: ['foods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (food: FoodForm & { id?: string }) => {
      if (food.id) {
        const { error } = await supabase.from('foods').update(food).eq('id', food.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('foods').insert(food);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      toast.success(editingId ? 'Alimento atualizado!' : 'Alimento adicionado!');
      closeDialog();
    },
    onError: () => toast.error('Erro ao salvar alimento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('foods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      toast.success('Alimento removido!');
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao remover alimento'),
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (food: typeof foods[0]) => {
    setEditingId(food.id);
    setForm({
      name: food.name,
      portion: food.portion,
      portion_size: food.portion_size,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    upsertMutation.mutate(editingId ? { ...form, id: editingId } : form);
  };

  const updateField = (field: keyof FoodForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const filtered = foods.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout title="Alimentos">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar alimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                {search ? 'Nenhum alimento encontrado' : 'Nenhum alimento cadastrado'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Porção</TableHead>
                      <TableHead className="text-right">Kcal</TableHead>
                      <TableHead className="text-right">P (g)</TableHead>
                      <TableHead className="text-right">C (g)</TableHead>
                      <TableHead className="text-right">G (g)</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((food) => (
                      <TableRow key={food.id}>
                        <TableCell className="font-medium">{food.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {food.portion_size} {food.portion}
                        </TableCell>
                        <TableCell className="text-right">{food.calories}</TableCell>
                        <TableCell className="text-right">{food.protein}</TableCell>
                        <TableCell className="text-right">{food.carbs}</TableCell>
                        <TableCell className="text-right">{food.fats}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(food)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(food.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Alimento' : 'Novo Alimento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ex: Frango grelhado" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="portion_size">Porção</Label>
                <Input id="portion_size" type="number" value={form.portion_size} onChange={(e) => updateField('portion_size', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portion">Unidade</Label>
                <Input id="portion" value={form.portion} onChange={(e) => updateField('portion', e.target.value)} placeholder="gramas" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="calories">Calorias (kcal)</Label>
                <Input id="calories" type="number" value={form.calories} onChange={(e) => updateField('calories', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protein">Proteína (g)</Label>
                <Input id="protein" type="number" step="0.1" value={form.protein} onChange={(e) => updateField('protein', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carbs">Carboidrato (g)</Label>
                <Input id="carbs" type="number" step="0.1" value={form.carbs} onChange={(e) => updateField('carbs', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fats">Gordura (g)</Label>
                <Input id="fats" type="number" step="0.1" value={form.fats} onChange={(e) => updateField('fats', Number(e.target.value))} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover alimento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Alimentos;
