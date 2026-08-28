import React, { useCallback, useEffect, useRef, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { Loader2, Plus, Trash2, Upload, Images, Download, Save, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react';
import logoMarombiew from '@/assets/logo_marombiew.png';
import { pickRecorderMime, REEL_THEMES } from '@/lib/reelsRenderer';
import {
  CAROUSEL_STYLES,
  CAROUSEL_TEXT_POSITIONS,
  CAROUSEL_DUAL_LAYOUTS,
  drawCarouselSlide,
  SLIDE_H,
  SLIDE_W,
  type CarouselStyle,
  type CarouselTextPosition,
  type CarouselDualLayout,
} from '@/lib/carouselRenderer';
import { saveSocialPost, uploadSocialFile } from '@/lib/socialPosts';

interface ExerciseRow { id: string; nome: string; imagem_url: string | null; video_embed: string | null }

type MediaKind = 'none' | 'upload' | 'exercise' | 'exercise_combo';

interface Slide {
  id: string;
  title: string;
  text: string;
  mediaKind: MediaKind;
  exerciseId?: string;
  uploadName?: string;
  // Segunda mídia (ex.: vídeo + imagem no mesmo slide)
  mediaKindB: MediaKind;
  exerciseIdB?: string;
  uploadNameB?: string;
  dualLayout: CarouselDualLayout;
  textPosition: CarouselTextPosition;
}

const extractStreamVideoId = (embed?: string | null): string | null => {
  if (!embed) return null;
  const patterns = [/cloudflarestream\.com\/([a-f0-9]{32})/i, /videodelivery\.net\/([a-f0-9]{32})/i];
  for (const re of patterns) {
    const m = embed.match(re);
    if (m) return m[1];
  }
  return null;
};

const hlsUrlFor = (uid: string) =>
  `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${uid}/manifest/video.m3u8`;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

const emptySlide = (index: number): Slide => ({
  id: newId(),
  title: index === 0 ? 'Título do carrossel' : `Slide ${index + 1}`,
  text: '',
  mediaKind: 'none',
  mediaKindB: 'none',
  dualLayout: 'vertical',
  textPosition: 'below',
});

interface Props { onSaved?: () => void }

const CarouselGenerator: React.FC<Props> = ({ onSaved }) => {
  const [slides, setSlides] = useState<Slide[]>([emptySlide(0), emptySlide(1), emptySlide(2)]);
  const [current, setCurrent] = useState(0);
  const [themeKey, setThemeKey] = useState<string>('ouro');
  const [slideStyle, setSlideStyle] = useState<CarouselStyle>('classic');
  const [footer, setFooter] = useState('@marombiew');
  const [postTitle, setPostTitle] = useState('');
  const [videoDurationSec, setVideoDurationSec] = useState(6);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const mediaRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const objectUrlsRef = useRef<string[]>([]);
  const hlsRef = useRef<Map<string, Hls>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const theme = REEL_THEMES[themeKey] ?? REEL_THEMES.ouro;

  useEffect(() => {
    const img = new Image();
    img.onload = () => { logoRef.current = img; };
    img.src = logoMarombiew;
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed').order('nome');
      setExercises((data ?? []) as ExerciseRow[]);
    })();
  }, []);

  useEffect(() => () => {
    hlsRef.current.forEach((h) => h.destroy());
    hlsRef.current.clear();
    mediaRef.current.forEach((m) => {
      if (m instanceof HTMLVideoElement) { try { m.pause(); m.removeAttribute('src'); m.load(); } catch { /* noop */ } }
    });
    mediaRef.current.clear();
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const ensureExerciseMedia = useCallback((exerciseId?: string) => {
    if (!exerciseId) return null;
    const key = `ex:${exerciseId}`;
    const existing = mediaRef.current.get(key);
    if (existing) return existing;
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) return null;
    const uid = extractStreamVideoId(ex.video_embed);
    if (uid) {
      const video = document.createElement('video');
      video.muted = true; video.loop = true; video.playsInline = true;
      video.crossOrigin = 'anonymous'; video.preload = 'auto';
      mediaRef.current.set(key, video);
      const url = hlsUrlFor(uid);
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, startLevel: 0, maxBufferLength: 6, backBufferLength: 0 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
        hlsRef.current.set(key, hls);
      }
      return video;
    }
    if (ex.imagem_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = ex.imagem_url;
      mediaRef.current.set(key, img);
      return img;
    }
    return null;
  }, [exercises]);

  // Imagem cadastrada do exercício (usada no modo combinado imagem + vídeo)
  const ensureExerciseImage = useCallback((exerciseId?: string) => {
    if (!exerciseId) return null;
    const key = `eximg:${exerciseId}`;
    const existing = mediaRef.current.get(key);
    if (existing) return existing;
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex?.imagem_url) return null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = ex.imagem_url;
    mediaRef.current.set(key, img);
    return img;
  }, [exercises]);

  const mediaForSlide = useCallback((slide: Slide) => {
    if (slide.mediaKind === 'upload') return mediaRef.current.get(`up:${slide.id}`) ?? null;
    if (slide.mediaKind === 'exercise') return ensureExerciseMedia(slide.exerciseId);
    if (slide.mediaKind === 'exercise_combo') return ensureExerciseImage(slide.exerciseId) ?? ensureExerciseMedia(slide.exerciseId);
    return null;
  }, [ensureExerciseMedia, ensureExerciseImage]);

  const mediaBForSlide = useCallback((slide: Slide) => {
    // Modo combinado: a 2ª mídia é sempre o vídeo do exercício escolhido
    if (slide.mediaKind === 'exercise_combo') return ensureExerciseMedia(slide.exerciseId);
    if (slide.mediaKindB === 'upload') return mediaRef.current.get(`upB:${slide.id}`) ?? null;
    if (slide.mediaKindB === 'exercise') return ensureExerciseMedia(slide.exerciseIdB);
    return null;
  }, [ensureExerciseMedia]);

  // Loop de pré-visualização (12fps, apenas o slide atual)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastFrameRef.current < 1000 / 12) return;
      lastFrameRef.current = now;
      const slide = slides[current];
      if (!slide) return;
      const media = mediaForSlide(slide);
      const mediaB = mediaBForSlide(slide);
      mediaRef.current.forEach((m) => {
        if (m instanceof HTMLVideoElement && m !== media && m !== mediaB && !m.paused) m.pause();
      });
      [media, mediaB].forEach((m) => {
        if (m instanceof HTMLVideoElement && m.paused) m.play().catch(() => {});
      });
      drawCarouselSlide(ctx, {
        theme,
        logo: logoRef.current,
        title: slide.title,
        text: slide.text,
        media,
        mediaB,
        dualLayout: slide.dualLayout,
        footer,
        index: current,
        total: slides.length,
        textPosition: slide.textPosition,
        style: slideStyle,
      });
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [slides, current, theme, footer, mediaForSlide, mediaBForSlide, slideStyle]);

  const patchSlide = (id: string, patch: Partial<Slide>) =>
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const swapMedia = (s: Slide) => {
    const a = mediaRef.current.get(`up:${s.id}`);
    const b = mediaRef.current.get(`upB:${s.id}`);
    if (a) mediaRef.current.set(`upB:${s.id}`, a); else mediaRef.current.delete(`upB:${s.id}`);
    if (b) mediaRef.current.set(`up:${s.id}`, b); else mediaRef.current.delete(`up:${s.id}`);
    patchSlide(s.id, {
      mediaKind: s.mediaKindB,
      mediaKindB: s.mediaKind,
      exerciseId: s.exerciseIdB,
      exerciseIdB: s.exerciseId,
      uploadName: s.uploadNameB,
      uploadNameB: s.uploadName,
    });
  };

  const addSlide = () => {
    if (slides.length >= 10) { toast.error('Máximo de 10 slides.'); return; }
    setSlides((prev) => [...prev, emptySlide(prev.length)]);
    setCurrent(slides.length);
  };

  const removeSlide = (id: string) => {
    setSlides((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
    setCurrent((c) => Math.max(0, Math.min(c, slides.length - 2)));
  };

  const handleUpload = (slide: Slide, file?: File | null, slot: 'a' | 'b' = 'a') => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    const key = slot === 'a' ? `up:${slide.id}` : `upB:${slide.id}`;
    if (file.type.startsWith('video')) {
      const video = document.createElement('video');
      video.src = url; video.muted = true; video.loop = true; video.playsInline = true;
      video.play().catch(() => {});
      mediaRef.current.set(key, video);
    } else {
      const img = new Image();
      img.src = url;
      mediaRef.current.set(key, img);
    }
    if (slot === 'a') patchSlide(slide.id, { mediaKind: 'upload', uploadName: file.name });
    else patchSlide(slide.id, { mediaKindB: 'upload', uploadNameB: file.name });
  };

  const renderSlideBlob = async (slide: Slide, index: number): Promise<Blob | null> => {
    const off = document.createElement('canvas');
    off.width = SLIDE_W;
    off.height = SLIDE_H;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    const media = mediaForSlide(slide);
    const mediaB = mediaBForSlide(slide);
    for (const m of [media, mediaB]) {
      if (m instanceof HTMLVideoElement && m.readyState < 2) {
        await new Promise((resolve) => {
          const t = window.setTimeout(resolve, 4000);
          m.addEventListener('loadeddata', () => { window.clearTimeout(t); resolve(null); }, { once: true });
        });
      }
      if (m instanceof HTMLImageElement && !m.complete) {
        await new Promise((resolve) => {
          const t = window.setTimeout(resolve, 4000);
          m.addEventListener('load', () => { window.clearTimeout(t); resolve(null); }, { once: true });
          m.addEventListener('error', () => { window.clearTimeout(t); resolve(null); }, { once: true });
        });
      }
    }
    drawCarouselSlide(ctx, {
      theme,
      logo: logoRef.current,
      title: slide.title,
      text: slide.text,
      media,
      mediaB,
      dualLayout: slide.dualLayout,
      footer,
      index,
      total: slides.length,
      textPosition: slide.textPosition,
      style: slideStyle,
    });
    return await new Promise<Blob | null>((resolve) => off.toBlob(resolve, 'image/png'));
  };

  const slideHasVideo = (slide: Slide) =>
    mediaForSlide(slide) instanceof HTMLVideoElement || mediaBForSlide(slide) instanceof HTMLVideoElement;

  // Slides com vídeo são exportados como vídeo (mp4 quando o navegador suportar, senão webm)
  const renderSlideVideoBlob = async (
    slide: Slide,
    index: number,
    durationMs,
  ): Promise<{ blob: Blob; ext: 'mp4' | 'webm' } | null> => {
    const effectiveDurationMs = Math.min(60_000, Math.max(1_000, durationMs ?? 6_000));
    const media = mediaForSlide(slide);
    const mediaB = mediaBForSlide(slide);
    const videos = [media, mediaB].filter((m): m is HTMLVideoElement => m instanceof HTMLVideoElement);
    if (!videos.length) return null;
    if (typeof MediaRecorder === 'undefined') return null;

    const off = document.createElement('canvas');
    off.width = SLIDE_W;
    off.height = SLIDE_H;
    const ctx = off.getContext('2d');
    if (!ctx) return null;

    for (const v of videos) {
      if (v.readyState < 2) {
        await new Promise((resolve) => {
          const t = window.setTimeout(resolve, 5000);
          v.addEventListener('loadeddata', () => { window.clearTimeout(t); resolve(null); }, { once: true });
        });
      }
      try { v.currentTime = 0; } catch { /* noop */ }
      await v.play().catch(() => {});
    }

    const mime = pickRecorderMime();
    const stream = off.captureStream(30);
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      drawCarouselSlide(ctx, {
        theme,
        logo: logoRef.current,
        title: slide.title,
        text: slide.text,
        media,
        mediaB,
        dualLayout: slide.dualLayout,
        footer,
        index,
        total: slides.length,
        textPosition: slide.textPosition,
        style: slideStyle,
      });
    };
    draw();
    recorder.start();

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }));
      window.setTimeout(() => { try { recorder.stop(); } catch { /* noop */ } }, effectiveDurationMs);
    });
    cancelAnimationFrame(raf);
    const ext: 'mp4' | 'webm' = (recorder.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
    return { blob, ext };
  };

  const downloadAll = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < slides.length; i += 1) {
        const video = slideHasVideo(slides[i]) ? await renderSlideVideoBlob(slides[i], i, videoDurationSec * 1000) : null;
        const blob = video?.blob ?? (await renderSlideBlob(slides[i], i));
        if (!blob) continue;
        const ext = video?.ext ?? 'png';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `carrossel-${(postTitle || 'post').toLowerCase().replace(/\s+/g, '-')}-${i + 1}.${ext}`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      toast.success('Slides baixados (vídeos em mp4/webm).');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao gerar slides.');
    } finally {
      setBusy(false);
    }
  };

  const saveToLibrary = async () => {
    setBusy(true);
    try {
      const paths: string[] = [];
      let coverPath: string | undefined;
      for (let i = 0; i < slides.length; i += 1) {
        const video = slideHasVideo(slides[i]) ? await renderSlideVideoBlob(slides[i], i, videoDurationSec * 1000) : null;
        const blob = video?.blob ?? (await renderSlideBlob(slides[i], i));
        if (!blob) continue;
        const path = await uploadSocialFile(blob, video?.ext ?? 'png', 'carousels');
        paths.push(path);
        if (!coverPath && !video) coverPath = path;
      }
      if (!paths.length) throw new Error('Nenhum slide gerado.');
      await saveSocialPost({
        kind: 'carousel',
        title: postTitle || slides[0]?.title || 'Carrossel',
        filePaths: paths,
        coverPath: coverPath ?? paths[0],
        meta: { theme: themeKey, style: slideStyle, slides: paths.length },
      });
      toast.success('Carrossel salvo na galeria.');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar carrossel.');
    } finally {
      setBusy(false);
    }
  };

  const slide = slides[current];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Images className="h-4 w-4 text-primary" /> Gerar carrossel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nome do post</Label>
                <Input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Ex.: Dicas de treino" />
              </div>
              <div className="space-y-1.5">
                <Label>Estilo (cores)</Label>
                <Select value={themeKey} onValueChange={setThemeKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ouro">Ouro (marca)</SelectItem>
                    <SelectItem value="neon">Neon</SelectItem>
                    <SelectItem value="fogo">Fogo</SelectItem>
                    <SelectItem value="gelo">Gelo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rodapé / @perfil</Label>
                <Input value={footer} onChange={(e) => setFooter(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Duração dos slides com vídeo (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={videoDurationSec}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setVideoDurationSec(Math.min(60, Math.max(1, Math.round(v))));
                  }}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label>Modelo do slide</Label>
                <Select value={slideStyle} onValueChange={(v) => setSlideStyle(v as CarouselStyle)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAROUSEL_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Slides ({slides.length})</Label>
              <Button size="sm" variant="secondary" onClick={addSlide}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar slide
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {slides.map((s, i) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={i === current ? 'default' : 'outline'}
                  onClick={() => setCurrent(i)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>

            {slide && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Slide {current + 1}</span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSlide(slide.id)} disabled={slides.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label>Título</Label>
                  <Input value={slide.title} onChange={(e) => patchSlide(slide.id, { title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Texto</Label>
                  <Textarea
                    value={slide.text}
                    onChange={(e) => patchSlide(slide.id, { text: e.target.value })}
                    placeholder="Escreva o conteúdo do slide…"
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Posição do texto</Label>
                  <Select
                    value={slide.textPosition}
                    onValueChange={(v) => patchSlide(slide.id, { textPosition: v as CarouselTextPosition })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAROUSEL_TEXT_POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Mídia</Label>
                    <Select value={slide.mediaKind} onValueChange={(v) => patchSlide(slide.id, { mediaKind: v as MediaKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Somente texto</SelectItem>
                        <SelectItem value="upload">Imagem/vídeo enviado</SelectItem>
                        <SelectItem value="exercise">Vídeo do exercício</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {slide.mediaKind === 'upload' && (
                    <div className="space-y-1.5">
                      <Label>Arquivo</Label>
                      <Button asChild variant="secondary" size="sm">
                        <label className="cursor-pointer">
                          <Upload className="h-4 w-4 mr-1" /> Enviar
                          <input
                            type="file" accept="image/*,video/*" className="hidden"
                            onChange={(e) => handleUpload(slide, e.target.files?.[0])}
                          />
                        </label>
                      </Button>
                      {slide.uploadName && <p className="text-xs text-muted-foreground truncate">{slide.uploadName}</p>}
                    </div>
                  )}
                  {slide.mediaKind === 'exercise' && (
                    <div className="space-y-1.5">
                      <Label>Exercício</Label>
                      <Select
                        value={slide.exerciseId ?? ''}
                        onValueChange={(v) => patchSlide(slide.id, { exerciseId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {exercises.map((ex) => (
                            <SelectItem key={ex.id} value={ex.id}>{ex.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label>Segunda mídia (vídeo + imagem)</Label>
                    <Select value={slide.mediaKindB} onValueChange={(v) => patchSlide(slide.id, { mediaKindB: v as MediaKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem segunda mídia</SelectItem>
                        <SelectItem value="upload">Imagem/vídeo enviado</SelectItem>
                        <SelectItem value="exercise">Vídeo do exercício</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {slide.mediaKindB === 'upload' && (
                    <div className="space-y-1.5">
                      <Label>Arquivo (2ª mídia)</Label>
                      <Button asChild variant="secondary" size="sm">
                        <label className="cursor-pointer">
                          <Upload className="h-4 w-4 mr-1" /> Enviar
                          <input
                            type="file" accept="image/*,video/*" className="hidden"
                            onChange={(e) => handleUpload(slide, e.target.files?.[0], 'b')}
                          />
                        </label>
                      </Button>
                      {slide.uploadNameB && <p className="text-xs text-muted-foreground truncate">{slide.uploadNameB}</p>}
                    </div>
                  )}
                  {slide.mediaKindB === 'exercise' && (
                    <div className="space-y-1.5">
                      <Label>Exercício (2ª mídia)</Label>
                      <Select
                        value={slide.exerciseIdB ?? ''}
                        onValueChange={(v) => patchSlide(slide.id, { exerciseIdB: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {exercises.map((ex) => (
                            <SelectItem key={ex.id} value={ex.id}>{ex.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {slide.mediaKindB !== 'none' && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Layout das mídias</Label>
                        <Select
                          value={slide.dualLayout}
                          onValueChange={(v) => patchSlide(slide.id, { dualLayout: v as CarouselDualLayout })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CAROUSEL_DUAL_LAYOUTS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ordem</Label>
                        <Button size="sm" variant="secondary" onClick={() => swapMedia(slide)}>
                          <ArrowLeftRight className="h-4 w-4 mr-1" /> Inverter mídias
                        </Button>
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadAll} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Baixar slides (.png)
              </Button>
              <Button variant="outline" onClick={saveToLibrary} disabled={busy}>
                <Save className="h-4 w-4 mr-1" /> Salvar na galeria
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Slides em 1080x1350 (4:5), formato ideal para carrossel do Instagram. Slides com vídeo são exportados como vídeo com a duração escolhida acima (1–60s; .mp4 quando o navegador suportar, senão .webm); os demais saem em .png.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-4 h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pré-visualização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <canvas
            ref={canvasRef}
            width={SLIDE_W}
            height={SLIDE_H}
            className="w-full max-w-[320px] mx-auto rounded-xl border border-border bg-black"
          />
          <div className="flex items-center justify-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{current + 1}/{slides.length}</span>
            <Button size="icon" variant="outline" onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))} disabled={current >= slides.length - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CarouselGenerator;
