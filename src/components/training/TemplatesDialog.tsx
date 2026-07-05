import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Save, Trash2, BookmarkPlus, FolderOpen, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: any;
  studentId: string;
  onApplyTemplate: (tpl: any) => void;
}

const TemplatesDialog: React.FC<Props> = ({ open, onOpenChange, plan, studentId, onApplyTemplate }) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [search, setSearch] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNome(plan?.titulo ? `${plan.titulo}` : '');
      setDescricao('');
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar templates: ' + error.message);
    setTemplates(data ?? []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error('Informe um nome para o template.'); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const owner_id = userData?.user?.id;
    if (!owner_id) { toast.error('Sessão inválida.'); setSaving(false); return; }
    const { error } = await supabase.from('workout_templates').insert({
      owner_id,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      conteudo: plan.conteudo || '',
      conteudo_json: plan.conteudo_json ?? null,
      fase: plan.fase ?? null,
      mobility_count: plan.mobility_count ?? null,
      main_exercises_count: plan.main_exercises_count ?? null,
      source_plan_id: plan.id,
      source_student_id: studentId,
    });
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Template salvo!');
    setNome(''); setDescricao('');
    loadTemplates();
  };

  const handleApply = async (tpl: any) => {
    setApplyingId(tpl.id);
    try {
      await onApplyTemplate(tpl);
      toast.success('Template aplicado ao aluno.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro ao aplicar: ' + (e?.message || e));
    } finally {
      setApplyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('workout_templates').delete().eq('id', id);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Template removido.');
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const filtered = templates.filter(t =>
    !search ||
    t.nome?.toLowerCase().includes(search.toLowerCase()) ||
    t.descricao?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Templates de Treino</DialogTitle>
          <DialogDescription>
            Salve este treino como template ou aplique um template existente para este aluno.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="usar" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="usar" className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Usar template</TabsTrigger>
            <TabsTrigger value="salvar" className="gap-1.5"><BookmarkPlus className="h-3.5 w-3.5" /> Salvar atual</TabsTrigger>
          </TabsList>

          <TabsContent value="usar" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar template..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum template encontrado.</p>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {filtered.map(tpl => (
                  <div key={tpl.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card/60 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{tpl.nome}</p>
                      {tpl.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{tpl.descricao}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(tpl.created_at).toLocaleDateString('pt-BR')}
                        {tpl.fase && ` · ${tpl.fase}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={applyingId === tpl.id}
                        onClick={() => handleApply(tpl)}
                      >
                        {applyingId === tpl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aplicar'}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deletar template?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(tpl.id)}>Deletar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="salvar" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">Nome do template *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Hipertrofia MMSS 4x/sem" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Observações, público-alvo, etc." />
            </div>
            <p className="text-xs text-muted-foreground">
              O conteúdo atual do treino ({plan?.titulo || '—'}) será salvo como template reutilizável.
            </p>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar template
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatesDialog;