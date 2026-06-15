import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, Check, AlertOctagon, Phone, Play, Search, MessageSquare, Trash2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Row {
  id: string;
  student_id: string;
  exercise_name: string;
  cf_uid: string;
  playback_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  workout_session_id: string | null;
  student_name?: string;
  student_phone?: string | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  reviewed: { label: 'Revisado', cls: 'bg-primary/15 text-primary border-primary/30' },
  needs_redo: { label: 'Pedir novo', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

type Filter = 'pending_review' | 'reviewed' | 'needs_redo' | 'all';

const AllExecutionVideos: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [search, setSearch] = useState('');
  const [openVideo, setOpenVideo] = useState<Row | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    const { data: videos } = await supabase
      .from('exercise_execution_videos')
      .select('id, student_id, exercise_name, cf_uid, playback_url, thumbnail_url, duration_seconds, status, admin_note, reviewed_at, created_at, workout_session_id')
      .order('created_at', { ascending: false });
    const list = (videos as any[]) ?? [];
    const ids = Array.from(new Set(list.map((v) => v.student_id)));
    if (ids.length === 0) { setRows([]); return; }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nome, telefone')
      .in('user_id', ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    setRows(list.map((v) => ({
      ...v,
      student_name: pmap.get(v.student_id)?.nome ?? 'Aluno',
      student_phone: pmap.get(v.student_id)?.telefone ?? null,
    })));
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('all-execution-videos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercise_execution_videos' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const update = async (id: string, patch: Partial<Row>) => {
    setSavingId(id);
    const { error } = await supabase
      .from('exercise_execution_videos')
      .update({
        ...patch,
        reviewed_at: patch.status ? new Date().toISOString() : undefined,
      } as any)
      .eq('id', id);
    setSavingId(null);
    if (error) return toast.error('Falha ao atualizar.');
    toast.success('Atualizado.');
    load();
  };

  const handleDelete = async (row: Row) => {
    setDeletingId(row.id);
    const { error } = await supabase
      .from('exercise_execution_videos')
      .delete()
      .eq('id', row.id);
    setDeletingId(null);
    setConfirmDelete(null);
    if (error) return toast.error('Falha ao deletar vídeo.');
    toast.success('Vídeo deletado.');
    setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
  };

  const openWhatsApp = (phone: string | null | undefined, msg: string) => {
    if (!phone) return toast.error('Aluno sem telefone cadastrado.');
    const digits = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q && !`${r.student_name} ${r.exercise_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c = { all: rows?.length ?? 0, pending_review: 0, reviewed: 0, needs_redo: 0 } as Record<string, number>;
    (rows ?? []).forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  if (rows === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  const tabs: { value: Filter; label: string }[] = [
    { value: 'pending_review', label: 'Pendentes' },
    { value: 'needs_redo', label: 'Refazer' },
    { value: 'reviewed', label: 'Revisados' },
    { value: 'all', label: 'Todos' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const active = filter === t.value;
          const n = counts[t.value] ?? 0;
          return (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                  : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
              }`}
            >
              {t.label}
              {n > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por aluno ou exercício…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Nenhum vídeo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => {
            const meta = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'bg-muted text-foreground border-border' };
            const note = noteDrafts[r.id] ?? r.admin_note ?? '';
            return (
              <Card key={r.id} className="glass-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenVideo(r)}
                  className="relative block w-full aspect-video bg-muted/40 group"
                >
                  {r.thumbnail_url ? (
                    <img src={r.thumbnail_url} alt={r.exercise_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="h-10 w-10 text-white" />
                  </div>
                  {r.duration_seconds != null && (
                    <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
                      {r.duration_seconds}s
                    </span>
                  )}
                  <Badge className={`${meta.cls} border text-[10px] absolute top-1 right-1`}>{meta.label}</Badge>
                </button>

                <CardContent className="p-3 space-y-2">
                  <div className="min-w-0">
                    <p className="text-xs text-primary font-semibold truncate">{r.student_name}</p>
                    <p className="text-sm font-semibold truncate">{r.exercise_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>

                  <Textarea
                    placeholder="Observação para o aluno…"
                    value={note}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value.slice(0, 500) }))}
                    className="text-xs min-h-[50px]"
                    maxLength={500}
                  />

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
                      disabled={savingId === r.id}
                      onClick={() => update(r.id, { status: 'reviewed', admin_note: note || null } as any)}
                    >
                      <Check className="h-3 w-3" />
                      Revisado
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={savingId === r.id}
                      onClick={() => update(r.id, { status: 'needs_redo', admin_note: note || null } as any)}
                    >
                      <AlertOctagon className="h-3 w-3" />
                      Refazer
                    </Button>
                    {note && note !== (r.admin_note ?? '') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[10px]"
                        disabled={savingId === r.id}
                        onClick={() => update(r.id, { admin_note: note } as any)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Salvar nota
                      </Button>
                    )}
                    {r.student_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[10px] text-emerald-500 hover:text-emerald-600"
                        onClick={() =>
                          openWhatsApp(
                            r.student_phone,
                            `Oi ${r.student_name ?? ''}! Vi seu vídeo de ${r.exercise_name}. ${note || 'Vamos ajustar a execução.'}`,
                          )
                        }
                      >
                        <Phone className="h-3 w-3" />
                        WhatsApp
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                      disabled={deletingId === r.id}
                      onClick={() => setConfirmDelete(r)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Deletar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!openVideo} onOpenChange={(v) => !v && setOpenVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {openVideo?.student_name} — {openVideo?.exercise_name}
            </DialogTitle>
          </DialogHeader>
          {openVideo && (
            <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
              <iframe
                src={openVideo.playback_url}
                className="absolute inset-0 w-full h-full rounded-md"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  Esta ação não pode ser desfeita. O vídeo de{' '}
                  <strong>{confirmDelete.exercise_name}</strong> enviado por{' '}
                  <strong>{confirmDelete.student_name}</strong> será removido permanentemente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AllExecutionVideos;