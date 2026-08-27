import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Film, Images, Trash2, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { deleteSocialPost, listSocialPosts, signSocialPath, type SocialPost } from '@/lib/socialPosts';

interface Props { refreshKey?: number }

const SocialGallery: React.FC<Props> = ({ refreshKey = 0 }) => {
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [open, setOpen] = useState<SocialPost | null>(null);
  const [urls, setUrls] = useState<string[]>([]);

  const load = async () => {
    try {
      setPosts(await listSocialPosts());
    } catch {
      setPosts([]);
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  useEffect(() => {
    if (!open) { setUrls([]); return; }
    (async () => {
      const signed = await Promise.all(open.file_paths.map((p) => signSocialPath(p)));
      setUrls(signed.filter(Boolean) as string[]);
    })();
  }, [open]);

  const saveFile = async (url: string, index: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const isVideo = blob.type.startsWith('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url);
      const ext = isVideo ? (blob.type.includes('webm') ? 'webm' : 'mp4') : 'png';
      const name = `${(open?.title || 'publicacao').replace(/[^\w-]+/g, '-').toLowerCase()}-${index + 1}.${ext}`;
      const file = new File([blob], name, { type: blob.type || (isVideo ? 'video/mp4' : 'image/png') });

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: open?.title || 'Publicação' });
        return;
      }

      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      toast.error('Não foi possível baixar o arquivo.');
    }
  };

  const remove = async (post: SocialPost) => {
    try {
      await deleteSocialPost(post);
      toast.success('Publicação removida.');
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao remover.');
    }
  };

  if (posts === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Reels e carrosséis gerados</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada salvo ainda. Gere um reels ou carrossel e toque em “Salvar na galeria”.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{p.title || 'Sem título'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                    {p.kind === 'reel' ? <Film className="h-3 w-3" /> : <Images className="h-3 w-3" />}
                    {p.kind === 'reel' ? 'Reels' : `Carrossel (${p.file_paths.length})`}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setOpen(p)}>
                    <Eye className="h-3 w-3 mr-1" /> Ver
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => remove(p)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{open?.title || 'Publicação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {urls.map((url, i) => (
              <div key={url} className="space-y-2">
                {open?.kind === 'reel' ? (
                  <video src={url} controls playsInline className="w-full rounded-lg bg-black" />
                ) : (
                  <img src={url} alt={`Slide ${i + 1}`} className="w-full rounded-lg" loading="lazy" />
                )}
                <Button size="sm" variant="secondary" onClick={() => saveFile(url, i)}>
                  <Download className="h-4 w-4 mr-1" /> Baixar {open?.kind === 'reel' ? 'vídeo' : `slide ${i + 1}`}
                </Button>
              </div>
            ))}
            {!urls.length && <p className="text-sm text-muted-foreground">Carregando arquivos…</p>}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SocialGallery;
