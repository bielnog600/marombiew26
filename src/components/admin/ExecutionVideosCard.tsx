import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Video, ChevronRight, Check, AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PendingVideo {
  id: string;
  student_id: string;
  exercise_name: string;
  playback_url: string;
  thumbnail_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  student_name: string;
}

const COLS = 'id, student_id, exercise_name, playback_url, thumbnail_url, status, admin_note, created_at';
const QK = ['dashboard-pending-execution-videos'];

async function withNames(rows: any[]): Promise<PendingVideo[]> {
  const ids = [...new Set(rows.map((r) => r.student_id))];
  if (!ids.length) return [];
  const { data } = await supabase.from('profiles').select('user_id, nome').in('user_id', ids);
  const m = new Map((data ?? []).map((p: any) => [p.user_id, p.nome]));
  return rows.map((r) => ({ ...r, student_name: m.get(r.student_id) ?? 'Aluno' }));
}

async function loadPending() {
  const { data, count, error } = await supabase
    .from('exercise_execution_videos')
    .select(COLS, { count: 'exact' })
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return { count: count ?? 0, items: await withNames(data ?? []) };
}

/** Same review actions as Consultoria › Vídeos: mark reviewed / ask redo with an admin note. */
const ExecutionVideoReviewDialog: React.FC<{ video: PendingVideo | null; onClose: () => void; onSaved: () => void }> = ({ video, onClose, onSaved }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(video?.admin_note ?? ''); }, [video?.id]);

  const save = async (status: 'reviewed' | 'needs_redo') => {
    if (!video) return;
    setSaving(true);
    const { error } = await supabase.from('exercise_execution_videos')
      .update({ status, admin_note: note.trim() || null, reviewed_at: new Date().toISOString() } as any)
      .eq('id', video.id);
    setSaving(false);
    if (error) return toast.error('Falha ao atualizar.');
    toast.success(status === 'reviewed' ? 'Marcado como revisado.' : 'Pedido para refazer.');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!video} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{video?.student_name} — {video?.exercise_name}</DialogTitle>
        </DialogHeader>
        {video && (
          <div className="space-y-3">
            <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
              <iframe src={video.playback_url} className="absolute inset-0 w-full h-full rounded-md"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowFullScreen />
            </div>
            <Textarea placeholder="Observação para o aluno…" value={note} maxLength={500}
              onChange={(e) => setNote(e.target.value.slice(0, 500))} className="text-sm min-h-[60px]" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={saving} onClick={() => save('reviewed')}>
                <Check className="h-4 w-4 mr-1" /> Revisado
              </Button>
              <Button size="sm" variant="outline" disabled={saving} className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => save('needs_redo')}>
                <AlertOctagon className="h-4 w-4 mr-1" /> Refazer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ExecutionVideosCard: React.FC = () => {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const openId = params.get('video');
  const { data, isLoading } = useQuery({ queryKey: QK, queryFn: loadPending, staleTime: 60_000, refetchOnWindowFocus: false });

  // Video opened from a notification/push may not be in the top 5.
  const { data: linked } = useQuery({
    queryKey: ['execution-video', openId],
    enabled: !!openId && !data?.items.some((v) => v.id === openId),
    queryFn: async () => {
      const { data: row } = await supabase.from('exercise_execution_videos').select(COLS).eq('id', openId!).maybeSingle();
      return row ? (await withNames([row]))[0] : null;
    },
  });
  const open = openId ? data?.items.find((v) => v.id === openId) ?? linked ?? null : null;

  useEffect(() => {
    const ch = supabase.channel('dashboard-execution-videos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercise_execution_videos' }, () => qc.invalidateQueries({ queryKey: QK }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('video', id); else next.delete('video');
    setParams(next, { replace: true });
  };
  const count = data?.count ?? 0;

  return (
    <Card className="glass-card border-primary/30" data-testid="execution-videos-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
            <Video className="h-5 w-5 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-2">
              Vídeos de execução
              {count > 0 && (
                <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-bold leading-none">{count}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Carregando…' : count > 0 ? `${count} pendente${count > 1 ? 's' : ''} de revisão` : 'Nenhum vídeo pendente'}
            </p>
          </div>
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link to="/consultoria?tab=videos">Ver todos <ChevronRight className="h-3.5 w-3.5 ml-0.5" /></Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : data && data.items.length > 0 ? (
          <ul className="space-y-1.5">
            {data.items.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setOpen(v.id)}
                  className="w-full flex items-center gap-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors p-2 text-left">
                  <span className="h-10 w-16 shrink-0 rounded-md bg-muted/50 overflow-hidden flex items-center justify-center">
                    {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Video className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-primary font-semibold truncate">{v.student_name}</span>
                    <span className="block text-sm truncate">{v.exercise_name}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <ExecutionVideoReviewDialog video={open} onClose={() => setOpen(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: QK }); }} />
    </Card>
  );
};

export default ExecutionVideosCard;
