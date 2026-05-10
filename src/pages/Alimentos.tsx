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
import { Plus, Pencil, Trash2, Search, Sparkles } from 'lucide-react';
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
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodForm[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
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

  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const existingNames = foods.map(f => f.name);
      const { data, error } = await supabase.functions.invoke('food-search-ai', {
        body: { mode: 'suggest', existingFoods: existingNames },
      });

      if (error) throw error;

      if (Array.isArray(data)) {
        setSuggestions(data);
        if (data.length === 0) {
          toast.info('Não foram encontradas novas sugestões no momento.');
        }
      }
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      toast.error('Erro ao buscar sugestões de alimentos');
    } finally {
      setIsSuggesting(false);
    }
  };

  const addSuggestedFood = (food: FoodForm) => {
    setForm(food);
    setAiDialogOpen(false);
    setSuggestions([]);
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleAiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) {
      toast.error('Digite o nome do alimento');
      return;
    }

    setIsAiSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('food-search-ai', {
        body: { query: aiQuery },
      });

      if (error) throw error;

      if (data) {
        setForm({
          name: data.name,
          portion: data.portion || 'gramas',
          portion_size: data.portion_size || 100,
          calories: data.calories || 0,
          protein: data.protein || 0,
          carbs: data.carbs || 0,
          fats: data.fats || 0,
        });
        setAiDialogOpen(false);
        setAiQuery('');
        setEditingId(null);
        setDialogOpen(true);
        toast.success('Dados nutricionais encontrados!');
      }
    } catch (error) {
      console.error('Erro na busca IA:', error);
      toast.error('Não foi possível encontrar os dados nutricionais');
    } finally {
      setIsAiSearching(false);
    }
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
          <div className="flex gap-2">
            <Button onClick={() => setAiDialogOpen(true)} variant="outline" className="gap-2 border-primary/20 hover:border-primary/50 text-primary">
              <Sparkles className="h-4 w-4" />
              Busca IA
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
      {/* AI Search Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Busca Nutricional com IA
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAiSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aiQuery">O que você quer buscar?</Label>
              <Input 
                id="aiQuery" 
                value={aiQuery} 
                onChange={(e) => setAiQuery(e.target.value)} 
                placeholder="Ex: Frango grelhado ou 1 banana prata" 
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A IA buscará informações em bases como FatSecret e MyFitnessPal.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setAiDialogOpen(false);
                  setSuggestions([]);
                }}>Cancelar</Button>
                <Button type="submit" disabled={isAiSearching || isSuggesting}>
                  {isAiSearching ? 'Buscando...' : 'Buscar Alimento'}
                </Button>
              </DialogFooter>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Ou</span>
                </div>
              </div>

              <Button 
                type="button" 
                variant="secondary" 
                className="w-full gap-2" 
                onClick={handleSuggest}
                disabled={isSuggesting || isAiSearching}
              >
                <Sparkles className="h-4 w-4" />
                {isSuggesting ? 'Gerando sugestões...' : 'Sugerir Alimentos Saudáveis'}
              </Button>
            </div>
          </form>

          {suggestions.length > 0 && (
            <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto pr-1">
              <Label className="text-sm font-semibold">Sugestões da IA:</Label>
              <div className="grid gap-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.calories}kcal | P: {s.protein}g | C: {s.carbs}g | G: {s.fats}g
                      </span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0" 
                      onClick={() => addSuggestedFood(s)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
