import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Search, Check, Plus, Trash2, Upload, Download, X, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const STORAGE_BUCKET = 'exercise-images';
const STORAGE_PUBLIC_PREFIX = `/storage/v1/object/public/${STORAGE_BUCKET}/`;

interface Exercise {
  id: string;
  nome: string;
  grupo_muscular: string;
  imagem_url: string | null;
  video_embed: string | null;
  ajustes: string[] | null;
}

type EditForm = {
  nome: string;
  grupo_muscular: string;
  imagem_url: string;
  video_embed: string;
};

const emptyForm: EditForm = { nome: '', grupo_muscular: '', imagem_url: '', video_embed: '' };

const isInternalUrl = (url: string | null) => !!url && url.includes(STORAGE_PUBLIC_PREFIX);

const Exercicios: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Exercise | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [ajustes, setAjustes] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [bulkMigrating, setBulkMigrating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

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

  const externalCount = exercises.filter((e) => e.imagem_url && !isInternalUrl(e.imagem_url)).length;

  const handleBulkMigrate = async () => {
    const targets = exercises.filter((e) => e.imagem_url && !isInternalUrl(e.imagem_url));
    if (targets.length === 0) {
      toast.info('Nenhuma URL externa para migrar.');
      return;
    }
    setBulkMigrating(true);
    setBulkProgress({ done: 0, total: targets.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const ex = targets[i];
      try {
        const { data, error } = await supabase.functions.invoke('migrate-exercise-image', {
          body: { url: ex.imagem_url },
        });
        if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || 'Falha');
        const { error: upErr } = await supabase.from('exercises').update({ imagem_url: data.url }).eq('id', ex.id);
        if (upErr) throw upErr;
        ok++;
      } catch (e) {
        fail++;
        console.error('Falha migração', ex.nome, e);
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setBulkMigrating(false);
    qc.invalidateQueries({ queryKey: ['exercises-admin'] });
    toast.success(`Migração concluída: ${ok} ok, ${fail} falhas.`);
  };


  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        grupo_muscular: form.grupo_muscular.trim(),
        imagem_url: form.imagem_url.trim() || null,
        video_embed: form.video_embed.trim() || null,
        ajustes,
      };
      if (!payload.nome || !payload.grupo_muscular) {
        throw new Error('Nome e grupo muscular são obrigatórios.');
      }
      if (editing) {
        const { error } = await supabase.from('exercises').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exercises').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises-admin'] });
      toast.success(editing ? 'Exercício atualizado.' : 'Exercício criado.');
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises-admin'] });
      toast.success('Exercício apagado.');
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao apagar.'),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato não suportado. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Imagem muito grande. Máximo 5MB.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `exercises/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      setForm((f) => ({ ...f, imagem_url: pub.publicUrl }));
      toast.success('Imagem enviada.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro no upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleMigrateUrl = async () => {
    const url = form.imagem_url.trim();
    if (!url) return;
    if (isInternalUrl(url)) {
      toast.info('Esta imagem já está no storage do projeto.');
      return;
    }
    setMigrating(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-exercise-image', {
        body: { url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('Resposta inválida.');
      setForm((f) => ({ ...f, imagem_url: data.url }));
      toast.success('Imagem migrada para o storage.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao migrar imagem.');
    } finally {
      setMigrating(false);
    }
  };

  const handleRemoveImage = () => {
    setForm((f) => ({ ...f, imagem_url: '' }));
  };

  const openEdit = (ex: Exercise) => {
    setEditing(ex);
    setCreating(false);
    setForm({
      nome: ex.nome,
      grupo_muscular: ex.grupo_muscular,
      imagem_url: ex.imagem_url ?? '',
      video_embed: ex.video_embed ?? '',
    });
    setAjustes(ex.ajustes ?? []);
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(emptyForm);
    setAjustes([]);
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
    setForm(emptyForm);
    setAjustes([]);
  };

  const filtered = exercises.filter(
    (e) =>
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.grupo_muscular.toLowerCase().includes(search.toLowerCase())
  );

  const dialogOpen = !!editing || creating;
  const previewUrl = form.imagem_url.trim();
  const previewIsExternal = previewUrl && !isInternalUrl(previewUrl);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Exercícios</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie a base de exercícios e os ajustes de máquina.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {externalCount > 0 && (
              <Button
                variant="outline"
                onClick={handleBulkMigrate}
                disabled={bulkMigrating}
                className="gap-2"
              >
                {bulkMigrating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Migrando {bulkProgress.done}/{bulkProgress.total}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Migrar todas ({externalCount})
                  </>
                )}
              </Button>
            )}
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo exercício
            </Button>
          </div>
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
                  <TableHead className="w-16">Img</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Ajustes</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum exercício encontrado.</TableCell></TableRow>
                ) : filtered.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell>
                      {ex.imagem_url ? (
                        <img
                          src={ex.imagem_url}
                          alt={ex.nome}
                          className="h-10 w-10 rounded object-cover bg-muted"
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {ex.nome}
                        {ex.imagem_url && !isInternalUrl(ex.imagem_url) && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">
                            URL externa
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(ex)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(ex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="line-clamp-2">
                {editing ? editing.nome : 'Novo exercício'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Supino reto"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grupo">Grupo muscular</Label>
                  <Input
                    id="grupo"
                    value={form.grupo_muscular}
                    onChange={(e) => setForm((f) => ({ ...f, grupo_muscular: e.target.value }))}
                    placeholder="Ex: Peito"
                  />
                </div>
              </div>

              {/* Imagem */}
              <div className="space-y-2">
                <Label>Imagem</Label>
                <div className="flex gap-3 items-start">
                  <div className="h-24 w-24 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {previewUrl ? 'Substituir' : 'Enviar imagem'}
                      </Button>
                      {previewUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleRemoveImage}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" /> Remover
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP — até 5MB.</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="imagem_url" className="text-xs text-muted-foreground">
                    Ou cole uma URL (será migrada para o storage do projeto)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="imagem_url"
                      value={form.imagem_url}
                      onChange={(e) => setForm((f) => ({ ...f, imagem_url: e.target.value }))}
                      placeholder="https://..."
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleMigrateUrl}
                      disabled={migrating || !previewIsExternal}
                      title={previewIsExternal ? 'Baixar e salvar no storage' : 'URL já está no storage'}
                    >
                      {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Migrar
                    </Button>
                  </div>
                  {previewIsExternal && (
                    <p className="text-xs text-amber-500">
                      ⚠️ URL externa — clique em "Migrar" para hospedar no storage do projeto.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="video">Vídeo (embed/iframe ou URL)</Label>
                <Textarea
                  id="video"
                  value={form.video_embed}
                  onChange={(e) => setForm((f) => ({ ...f, video_embed: e.target.value }))}
                  placeholder="<iframe ...></iframe> ou URL"
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ajustes da máquina</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Selecione os tipos de ajuste disponíveis para este exercício.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STANDARD_FIELDS.map((field) => {
                    const checked = ajustes.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() =>
                          setAjustes((prev) =>
                            prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
                          )
                        }
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          checked
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                        }`}
                      >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="font-medium">{field}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || uploading || migrating}
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar exercício?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O exercício <strong>{deleting?.nome}</strong> será removido permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleting && deleteMutation.mutate(deleting.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Apagando...' : 'Apagar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default Exercicios;
