import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Share2, Download, X, Flame, Clock, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import logoMarombiew from '@/assets/logo_marombiew.png';

export interface TabataShareExercise {
  name: string;
  imageUrl?: string | null;
}

interface TabataSummaryShareProps {
  title: string;
  durationSeconds: number;
  exercises: TabataShareExercise[];
  blocksCount: number;
  onClose: () => void;
}

const formatDuration = (totalSec: number) => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const formatDateBR = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export const TabataSummaryShare: React.FC<TabataSummaryShareProps> = ({
  title,
  durationSeconds,
  exercises,
  blocksCount,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string>(logoMarombiew);
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({});
  const today = new Date();

  // Preload logo as base64
  useEffect(() => {
    fetch(logoMarombiew)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      )
      .then(setLogoDataUrl)
      .catch(() => {});
  }, []);

  // Preload exercise images to data URLs (avoid CORS taint in html-to-image)
  useEffect(() => {
    let cancelled = false;
    const urls = Array.from(new Set(exercises.map((e) => e.imageUrl).filter(Boolean))) as string[];
    Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
          const blob = await res.blob();
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return [url, data] as const;
        } catch {
          return [url, url] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setImageDataUrls(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [exercises]);

  const generateImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const imgs = Array.from(cardRef.current.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? img.decode().catch(() => undefined)
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0F1115' });
    const dataUrl = await toPng(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#0F1115',
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error('Falha ao gerar imagem');
      const file = new File([blob], `marombiew-tabata-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Meu TABATA MAROMBIEW',
          text: `Acabei de finalizar ${title} em ${formatDuration(durationSeconds)}! 🔥`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Imagem baixada!');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao compartilhar.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownload = async () => {
    setIsSharing(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marombiew-tabata-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Imagem baixada!');
    } catch {
      toast.error('Erro ao baixar.');
    } finally {
      setIsSharing(false);
    }
  };

  // Unique exercise list for display (avoid duplicates when repeated across blocks)
  const uniqueExercises: TabataShareExercise[] = [];
  const seen = new Set<string>();
  for (const ex of exercises) {
    const key = ex.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueExercises.push(ex);
  }
  const shown = uniqueExercises.slice(0, 8);
  const remaining = uniqueExercises.length - shown.length;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col animate-fade-in overflow-y-auto">
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-3 z-10 h-10 w-10 rounded-full bg-card/80 backdrop-blur border border-border flex items-center justify-center text-foreground hover:bg-card transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="flex-1 p-4 flex flex-col items-center gap-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">TABATA Concluído!</h2>
          <p className="text-sm text-muted-foreground mt-1">Compartilhe seu resultado</p>
        </div>

        <div className="w-full max-w-[360px]">
          <div
            ref={cardRef}
            className="relative w-full overflow-hidden rounded-3xl"
            style={{
              aspectRatio: '9/16',
              background: 'linear-gradient(160deg, #0F1115 0%, #171A21 50%, #0F1115 100%)',
            }}
          >
            <div
              className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-25"
              style={{ background: '#FF4D2E' }}
            />
            <div
              className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full blur-3xl opacity-15"
              style={{ background: '#FFC400' }}
            />
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(#FFC400 1px, transparent 1px), linear-gradient(90deg, #FFC400 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative h-full flex flex-col p-5">
              {/* Header */}
              <div className="flex flex-col items-center gap-2">
                <img src={logoDataUrl} alt="MAROMBIEW" className="h-20 w-auto object-contain" />
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1"
                  style={{
                    background: 'rgba(255,77,46,0.15)',
                    color: '#FF4D2E',
                    border: '1px solid rgba(255,77,46,0.35)',
                  }}
                >
                  <Flame className="h-3 w-3" /> TABATA
                </span>
              </div>

              {/* Timer */}
              <div className="flex flex-col items-center text-center mt-3">
                <p
                  className="text-[9px] uppercase tracking-[0.3em] mb-1"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  Tempo Total
                </p>
                <div
                  className="font-mono font-black tabular-nums leading-none"
                  style={{
                    color: '#FFC400',
                    fontSize: '48px',
                    textShadow: '0 0 40px rgba(255,196,0,0.4)',
                  }}
                >
                  {formatDuration(durationSeconds)}
                </div>
                <h1
                  className="text-base font-black mt-3 leading-tight px-2 line-clamp-2"
                  style={{ color: '#FFFFFF' }}
                >
                  {title.toUpperCase()}
                </h1>
                <div className="h-[2px] w-10 mt-2" style={{ background: '#FF4D2E' }} />
              </div>

              {/* Exercises list */}
              <div className="flex-1 mt-3 min-h-0">
                <p
                  className="text-[9px] uppercase tracking-widest text-center mb-2"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  Exercícios realizados
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {shown.map((ex, i) => {
                    const src = ex.imageUrl ? imageDataUrls[ex.imageUrl] || ex.imageUrl : null;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-lg p-1.5"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          className="h-9 w-9 rounded-md overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: 'rgba(255,196,0,0.12)' }}
                        >
                          {src ? (
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Dumbbell className="h-4 w-4" style={{ color: '#FFC400' }} />
                          )}
                        </div>
                        <span
                          className="text-[9px] font-bold leading-tight line-clamp-2 flex-1"
                          style={{ color: '#FFFFFF' }}
                        >
                          {ex.name.replace(/\*+/g, '').trim().toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {remaining > 0 && (
                  <p
                    className="text-[9px] text-center mt-1.5 font-bold"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                  >
                    + {remaining} exercício{remaining > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Footer stats */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div
                  className="rounded-xl p-2 flex flex-col items-center"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Flame className="h-4 w-4 mb-0.5" style={{ color: '#FF4D2E' }} />
                  <span className="text-base font-black" style={{ color: '#FFFFFF' }}>
                    {blocksCount}
                  </span>
                  <span
                    className="text-[8px] uppercase tracking-widest"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Blocos
                  </span>
                </div>
                <div
                  className="rounded-xl p-2 flex flex-col items-center"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Clock className="h-4 w-4 mb-0.5" style={{ color: '#FFC400' }} />
                  <span className="text-base font-black" style={{ color: '#FFFFFF' }}>
                    {Math.max(1, Math.round(durationSeconds / 60))} min
                  </span>
                  <span
                    className="text-[8px] uppercase tracking-widest"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Duração
                  </span>
                </div>
              </div>

              <p
                className="text-[9px] uppercase tracking-widest text-center mt-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                {formatDateBR(today)}
              </p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[360px] space-y-2">
          <Button
            onClick={handleShare}
            disabled={isSharing}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-bold gap-2"
          >
            <Share2 className="h-5 w-5" />
            {isSharing ? 'Gerando...' : 'Compartilhar resultado'}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isSharing}
            variant="outline"
            className="w-full h-11 rounded-xl gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar imagem
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full h-11 rounded-xl gap-2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
};
