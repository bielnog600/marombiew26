import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { Loader2, Download, Play, Square, Upload, Film } from 'lucide-react';
import logoMarombiew from '@/assets/logo_marombiew.png';
import { getSafeWorkoutDays } from '@/lib/planMigrationUtils';
import { findBestExerciseMatch, type MatchableExercise } from '@/lib/exerciseMatcher';
import type { ParsedExercise, ParsedTrainingDay } from '@/lib/trainingResultParser';
import { buildSetPlan } from '@/components/training/TrainerLogSheetUtils';
import {
  REEL_W, REEL_H, REEL_THEMES, drawReelFrame, pickRecorderMime,
  type ReelExerciseItem,
} from '@/lib/reelsRenderer';

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

const detailFor = (ex: ParsedExercise) => {
  if (ex.setScheme?.mode === 'per_set' && ex.setScheme.sets?.length) {
    return ex.setScheme.sets
      .slice()
      .sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
      .map((s) => s.target_reps)
      .join(' / ');
  }
  const plan = buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme as never);
  if (!plan.length) return `3x ${ex.reps || ''}`.trim();
  // Group consecutive sets with same reps: "1x12 + 3x10"
  const blocks: { count: number; reps: string }[] = [];
  for (const s of plan) {
    const last = blocks[blocks.length - 1];
    if (last && last.reps === s.targetReps) last.count += 1;
    else blocks.push({ count: 1, reps: s.targetReps });
  }
  return blocks.map((b) => `${b.count}x ${b.reps || ex.reps || ''}`.trim()).join(' + ');
};

interface StudentOption { user_id: string; nome: string }

const ENGAGEMENT_CTAS = [
  'Salva esse treino 🔥',
  'Qual você faria primeiro? 👇',
  'Marca o parceiro de treino 💪',
  'Comenta o exercício favorito ⬇️',
  'Compartilha nos stories 📲',
  'Quem precisa desse treino? 👀',
  'Desafia-se hoje ⚡',
  'Qual série você aguenta? 💥',
  'Bora treinar! 🔥',
  'Salva para não perder 📌',
];

const pickRandomCta = () => ENGAGEMENT_CTAS[Math.floor(Math.random() * ENGAGEMENT_CTAS.length)];

const RedeSocial: React.FC = () => {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState<string>('');
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState<string>('');
  const [days, setDays] = useState<ParsedTrainingDay[]>([]);
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [dbExercises, setDbExercises] = useState<MatchableExercise[]>([]);
  const [themeKey, setThemeKey] = useState<keyof typeof REEL_THEMES | string>('ouro');
  const [secondsPerPage, setSecondsPerPage] = useState(5);
  const [secondsPerPageInput, setSecondsPerPageInput] = useState('5');
  const [footer, setFooter] = useState('@marombiew');
  const [customTitle, setCustomTitle] = useState('');
  const [cta, setCta] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputExt, setOutputExt] = useState<'mp4' | 'webm'>('webm');
  const [bgName, setBgName] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const bgRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const bgUrlRef = useRef<string | null>(null);
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const hlsRef = useRef<Map<string, Hls>>(new Map());
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startRef = useRef<number>(performance.now());

  const theme = REEL_THEMES[themeKey] ?? REEL_THEMES.ouro;

  // Logo
  useEffect(() => {
    const img = new Image();
    img.onload = () => { logoRef.current = img; };
    img.src = logoMarombiew;
  }, []);

  // Alunos + catálogo de exercícios
  useEffect(() => {
    (async () => {
      const { data: roleData } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roleData ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('user_id, nome').in('user_id', ids).order('nome');
        setStudents((data ?? []) as StudentOption[]);
      }
      const { data: ex } = await supabase
        .from('exercises')
        .select('id, nome, imagem_url, video_embed, grupo_muscular');
      setDbExercises((ex ?? []) as MatchableExercise[]);
    })();
  }, []);

  // Planos do aluno
  useEffect(() => {
    if (!studentId) { setPlans([]); setPlanId(''); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ai_plans')
        .select('*')
        .eq('student_id', studentId)
        .eq('tipo', 'treino')
        .order('created_at', { ascending: false });
      setPlans(data ?? []);
      setPlanId((data ?? [])[0]?.id ?? '');
      setLoading(false);
    })();
  }, [studentId]);

  // Dias do plano
  useEffect(() => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) { setDays([]); return; }
    const { days: parsed } = getSafeWorkoutDays({ ...plan, tipo: 'treino' });
    setDays(parsed);
    setDayIndex(0);
  }, [planId, plans]);

  const exercises = days[dayIndex]?.exercises ?? [];

  useEffect(() => {
    const initial: Record<number, boolean> = {};
    exercises.forEach((_, i) => { initial[i] = i < 8; });
    setSelected(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, dayIndex, days.length]);

  const chosen = useMemo(
    () => exercises.filter((_, i) => selected[i]),
    [exercises, selected],
  );

  const pages = useMemo(() => {
    const out: ParsedExercise[][] = [];
    for (let i = 0; i < chosen.length; i += 4) out.push(chosen.slice(i, i + 4));
    return out;
  }, [chosen]);

  const totalDuration = Math.max(1, pages.length) * secondsPerPage;

  // Carrega mídia (vídeo HLS ou imagem) dos exercícios escolhidos
  useEffect(() => {
    const wanted = new Set<string>();
    chosen.forEach((ex) => {
      const match = findBestExerciseMatch(ex.exercise, dbExercises);
      const uid = extractStreamVideoId(match?.video_embed);
      if (uid) {
        wanted.add(`v:${uid}`);
        if (!videosRef.current.has(uid)) {
          const video = document.createElement('video');
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          videosRef.current.set(uid, video);
          const url = hlsUrlFor(uid);
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play().catch(() => {});
          } else if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, startLevel: -1 });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
            hlsRef.current.set(uid, hls);
          }
        }
      } else if (match?.imagem_url) {
        wanted.add(`i:${match.imagem_url}`);
        if (!imagesRef.current.has(match.imagem_url)) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = match.imagem_url;
          imagesRef.current.set(match.imagem_url, img);
        }
      }
    });
  }, [chosen, dbExercises]);

  useEffect(() => () => {
    hlsRef.current.forEach((h) => h.destroy());
    hlsRef.current.clear();
    videosRef.current.clear();
    if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
  }, []);

  const mediaFor = (ex: ParsedExercise) => {
    const match = findBestExerciseMatch(ex.exercise, dbExercises);
    const uid = extractStreamVideoId(match?.video_embed);
    if (uid && videosRef.current.has(uid)) return videosRef.current.get(uid)!;
    if (match?.imagem_url && imagesRef.current.has(match.imagem_url)) return imagesRef.current.get(match.imagem_url)!;
    return null;
  };

  const dayName = days[dayIndex]?.day ?? '';
  const title = customTitle || dayName || 'Treino';

  // Loop de render (preview + gravação)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const pageCount = Math.max(1, pages.length);
      const pageIdx = Math.min(pageCount - 1, Math.floor(elapsed / secondsPerPage) % pageCount);
      const items: ReelExerciseItem[] = (pages[pageIdx] ?? []).map((ex) => ({
        name: ex.exercise,
        detail: detailFor(ex),
        sub: ex.pause ? `Pausa ${ex.pause}` : undefined,
        media: mediaFor(ex),
      }));
      drawReelFrame(ctx, {
        theme,
        logo: logoRef.current,
        title,
        cta,
        footer,
        items,
        background: bgRef.current,
        startIndex: pageIdx * 4,
        pageLabel: pageCount > 1 ? `Parte ${pageIdx + 1}/${pageCount}` : undefined,
        time: elapsed,
      });
      if (recording) setProgress(Math.min(100, (elapsed / totalDuration) * 100));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [pages, secondsPerPage, theme, title, cta, footer, recording, totalDuration]);

  const handleBackgroundFile = (file?: File | null) => {
    if (!file) return;
    if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    const url = URL.createObjectURL(file);
    bgUrlRef.current = url;
    setBgName(file.name);
    if (file.type.startsWith('video')) {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.play().catch(() => {});
      bgRef.current = video;
    } else {
      const img = new Image();
      img.onload = () => { bgRef.current = img; };
      img.src = url;
    }
  };

  const clearBackground = () => {
    if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    bgUrlRef.current = null;
    bgRef.current = null;
    setBgName('');
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!chosen.length) { toast.error('Selecione ao menos um exercício.'); return; }
    const mime = pickRecorderMime();
    if (typeof MediaRecorder === 'undefined') { toast.error('Gravação não suportada neste navegador.'); return; }

    // Sorteia um CTA diferente a cada geração para gerar diversidade/engajamento
    const nextCta = cta || pickRandomCta();
    if (!cta) setCta(nextCta);

    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setOutputUrl(null);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks, { type });
      setOutputExt(type.includes('mp4') ? 'mp4' : 'webm');
      setOutputUrl(URL.createObjectURL(blob));
      setRecording(false);
      setProgress(100);
      toast.success('Vídeo gerado! Toque em Baixar.');
    };
    recorderRef.current = recorder;
    startRef.current = performance.now();
    setProgress(0);
    setRecording(true);
    recorder.start(200);
    window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    }, totalDuration * 1000 + 200);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  };

  return (
    <AppLayout title="Rede Social">
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" /> Gerar Reels do treino
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Aluno</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                    <SelectContent>
                      {students.map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Treino</Label>
                  <Select value={planId} onValueChange={setPlanId} disabled={!plans.length}>
                    <SelectTrigger><SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o plano'} /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.titulo || new Date(p.created_at).toLocaleDateString('pt-BR')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dia</Label>
                  <Select value={String(dayIndex)} onValueChange={(v) => setDayIndex(Number(v))} disabled={!days.length}>
                    <SelectTrigger><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                    <SelectContent>
                      {days.map((d, i) => (
                        <SelectItem key={`${d.day}-${i}`} value={String(i)}>{d.day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estilo (cores)</Label>
                  <Select value={String(themeKey)} onValueChange={setThemeKey}>
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
                  <Label>Título (opcional)</Label>
                  <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={dayName || 'Treino A'} />
                </div>
                <div className="space-y-1.5">
                  <Label>Rodapé / @perfil</Label>
                  <Input value={footer} onChange={(e) => setFooter(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CTA (chamada para engajamento)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={cta}
                      onChange={(e) => setCta(e.target.value)}
                      placeholder="Aleatório a cada vídeo"
                      className="flex-1"
                    />
                    <Button type="button" variant="secondary" size="icon" onClick={() => setCta(pickRandomCta())} title="Sortear CTA">
                      🎲
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Deixe em branco para sortear um CTA diferente a cada geração.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Segundos por tela (4 exercícios)</Label>
                  <Input
                    type="number" min={3} max={20}
                    value={secondsPerPageInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setSecondsPerPageInput(raw);
                      const n = Number(raw);
                      if (!Number.isNaN(n) && n >= 3 && n <= 20) setSecondsPerPage(n);
                    }}
                    onBlur={(e) => {
                      const n = Math.min(20, Math.max(3, Number(e.target.value) || 5));
                      setSecondsPerPage(n);
                      setSecondsPerPageInput(String(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fundo (vídeo ou imagem)</Label>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <label className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-1" /> Enviar
                        <input
                          type="file" accept="video/*,image/*" className="hidden"
                          onChange={(e) => handleBackgroundFile(e.target.files?.[0])}
                        />
                      </label>
                    </Button>
                    {bgName && (
                      <Button variant="ghost" size="sm" onClick={clearBackground}>Remover</Button>
                    )}
                  </div>
                  {bgName && <p className="text-xs text-muted-foreground truncate">{bgName}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Exercícios ({chosen.length} selecionados • {pages.length} telas)</Label>
                <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-auto pr-1">
                  {exercises.map((ex, i) => (
                    <label key={`${ex.exercise}-${i}`} className="flex items-start gap-2 rounded-lg border border-border p-2">
                      <Checkbox
                        checked={!!selected[i]}
                        onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [i]: !!v }))}
                      />
                      <span className="text-sm leading-tight">
                        <span className="font-medium">{ex.exercise}</span>
                        <span className="block text-xs text-muted-foreground">{detailFor(ex)}</span>
                      </span>
                    </label>
                  ))}
                  {!exercises.length && (
                    <p className="text-sm text-muted-foreground">Selecione um aluno, plano e dia.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!recording ? (
                  <Button onClick={startRecording} disabled={!chosen.length}>
                    <Play className="h-4 w-4 mr-1" /> Gerar vídeo ({totalDuration}s)
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={stopRecording}>
                    <Square className="h-4 w-4 mr-1" /> Parar
                  </Button>
                )}
                {recording && (
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> {Math.round(progress)}%
                  </span>
                )}
                {outputUrl && (
                  <Button asChild variant="secondary">
                    <a href={outputUrl} download={`reels-${(title || 'treino').toLowerCase().replace(/\s+/g, '-')}.${outputExt}`}>
                      <Download className="h-4 w-4 mr-1" /> Baixar .{outputExt}
                    </a>
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Formato 1080x1920 (9:16). Se o navegador não suportar MP4, o arquivo sai em .webm — o Instagram aceita conversão, ou use o Safari/Chrome atualizado para MP4.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <canvas
              ref={canvasRef}
              width={REEL_W}
              height={REEL_H}
              className="w-full max-w-[300px] mx-auto rounded-xl border border-border bg-black"
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default RedeSocial;