import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, Check, MessageSquare, AlertOctagon, Phone, Play } from 'lucide-react';
import { toast } from 'sonner';

interface VideoRow {
  id: string;
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
}

interface Props {
  studentId: string;
  studentPhone?: string | null;
  studentName?: string | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pendente revisão', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  reviewed: { label: 'Revisado', cls: 'bg-primary/15 text-primary border-primary/30' },
  needs_redo: { label: 'Pedir novo vídeo', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const StudentExerciseVideos: React.FC<Props> = ({ studentId, studentPhone, studentName }) => {
  const [rows, setRows] = useState<VideoRow[] | null>(null);
  const [openVideo, setOpenVideo] = useState<VideoRow | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('exercise_execution_videos')
      .select('id, exercise_name, cf_uid, playback_url, thumbnail_url, duration_seconds, status, admin_note, reviewed_at, created_at, workout_session_id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    setRows((data as any) ?? []);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`execution-videos-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercise_execution_videos', filter: `student_id=eq.${studentId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const update = async (id: string, patch: Partial<VideoRow>) => {
    setSavingId(id);
    const { error } = await supabase
      .from('exercise_execution_videos')
      .update({
        ...patch,
        reviewed_at: patch.status ? new Date().toISOString() : undefined,
      } as any)
      .eq('id', id);
    setSavingId(null);
    if (error) {
      toast.error('Falha ao atualizar.');
      return;
    }
    toast.success('Atualizado.');
    load();
  };

  const openWhatsApp = (msg: string) => {
    if (!studentPhone) {
      toast.error('Aluno sem telefone cadastrado.');
      return;
    }
    const digits = studentPhone.replace(/\D/g, '');
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (rows === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const pendingCount = rows.filter((r) => r.status === 'pending_review').length;

  if (rows.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum vídeo de execução enviado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          Vídeos de execução
        </h3>
        {pendingCount > 0 && (
          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 border">
            {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => {
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
              </button>

              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.exercise_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Badge className={`${meta.cls} border text-[10px] shrink-0`}>{meta.label}</Badge>
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
                    Marcar revisado
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={savingId === r.id}
                    onClick={() => update(r.id, { status: 'needs_redo', admin_note: note || null } as any)}
                  >
                    <AlertOctagon className="h-3 w-3" />
                    Pedir novo
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
                  {studentPhone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-[10px] text-emerald-500 hover:text-emerald-600"
                      onClick={() =>
                        openWhatsApp(
                          `Oi ${studentName ?? ''}! Vi seu vídeo de ${r.exercise_name}. ${note || 'Vamos ajustar a execução.'}`,
                        )
                      }
                    >
                      <Phone className="h-3 w-3" />
                      WhatsApp
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!openVideo} onOpenChange={(v) => !v && setOpenVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openVideo?.exercise_name}</DialogTitle>
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
    </div>
  );
};

export default StudentExerciseVideos;