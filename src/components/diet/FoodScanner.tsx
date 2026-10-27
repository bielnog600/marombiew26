import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Camera, History, Loader2, ScanBarcode, X } from 'lucide-react';
import { computeFoodScore, type ProductData } from '@/lib/foodScore';
import FoodScanResult, { ScoreDot, type ScanRecord } from './FoodScanResult';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dailyKcal?: number | null;
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });

export default function FoodScanner({ open, onOpenChange, dailyKcal }: Props) {
  const { user } = useAuth();
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lookupRef = useRef<(code: string) => void>(() => {});
  const [camRetry, setCamRetry] = useState(0);
  const [tab, setTab] = useState('scan');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [result, setResult] = useState<ScanRecord | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const processProduct = useCallback(
    async (product: ProductData, barcode: string | null, source: string) => {
      if (!user) return;
      const { score, label, additives } = computeFoodScore(product);
      const { data, error } = await supabase
        .from('food_scans')
        .insert({
          aluno_id: user.id,
          barcode,
          product_name: product.product_name || 'Produto sem nome',
          brand: product.brands ?? null,
          image_url: product.image_front_url ?? null,
          score,
          score_label: label,
          nutriments: { ...(product.nutriments ?? {}), serving_quantity: product.serving_quantity ?? null, quantity: product.quantity ?? null } as any,
          additives: additives as any,
          source,
        })
        .select()
        .single();
      if (error) throw error;
      const rec = data as unknown as ScanRecord;
      setResult(rec);
      // Avaliação da IA em segundo plano
      supabase.functions
        .invoke('food-scanner', { body: { action: 'evaluate', product, score, label, additives, dailyKcal } })
        .then(async ({ data: ev, error: evErr }) => {
          const text = evErr ? null : ev?.evaluation;
          if (!text) {
            setResult((r) => (r && r.id === rec.id ? { ...r, ai_evaluation: '__erro__' } : r));
            return;
          }
          await supabase.from('food_scans').update({ ai_evaluation: text }).eq('id', rec.id);
          setResult((r) => (r && r.id === rec.id ? { ...r, ai_evaluation: text } : r));
        });
    },
    [user, dailyKcal],
  );

  const lookup = useCallback(
    async (code: string) => {
      const barcode = code.replace(/\D/g, '');
      if (barcode.length < 8) return toast.error('Código inválido. Confira os números.');
      stopCamera();
      setBusy('Buscando produto…');
      setNotFound(null);
      try {
        const { data, error } = await supabase.functions.invoke('food-scanner', { body: { action: 'lookup', barcode } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.found) {
          setNotFound(barcode);
          return;
        }
        await processProduct(data.product, barcode, 'openfoodfacts');
      } catch (e: any) {
        toast.error(e?.message || 'Não foi possível buscar o produto.');
      } finally {
        setBusy(null);
      }
    },
    [processProduct, stopCamera],
  );

  const onLabelPhoto = async (file?: File) => {
    if (!file) return;
    setBusy('Lendo o rótulo…');
    try {
      const image = await fileToDataUrl(file);
      const { data, error } = await supabase.functions.invoke('food-scanner', { body: { action: 'extract', image } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await processProduct(data.product, notFound, 'foto_rotulo');
      setNotFound(null);
    } catch (e: any) {
      toast.error(e?.message || 'Não consegui ler o rótulo.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    lookupRef.current = lookup;
  }, [lookup]);

  // Câmera: só inicia quando o <video> já está montado no DOM
  useEffect(() => {
    if (!open || tab !== 'scan' || result || notFound || busy || !videoEl) return;
    let cancelled = false;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    const reader = new BrowserMultiFormatReader(hints);
    setCamError(null);
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoEl, (res) => {
        if (res && !cancelled) {
          cancelled = true;
          navigator.vibrate?.(60);
          lookupRef.current(res.getText());
        }
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
          return;
        }
        controlsRef.current = c;
        videoEl.play().catch(() => {});
      })
      .catch(() => setCamError('Não foi possível abrir a câmera. Permita o acesso ou digite o código abaixo.'));
    // Se em 4s o vídeo ainda não tiver imagem, avisar e oferecer nova tentativa
    const watchdog = window.setTimeout(() => {
      if (!cancelled && videoEl.videoWidth === 0) {
        stopCamera();
        setCamError('A câmera abriu mas não mostrou imagem. Toque para tentar de novo.');
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      stopCamera();
    };
  }, [open, tab, result, notFound, busy, videoEl, stopCamera, camRetry]);

  useEffect(() => {
    if (!open || tab !== 'history' || !user) return;
    supabase
      .from('food_scans')
      .select('*')
      .eq('aluno_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setHistory((data ?? []) as unknown as ScanRecord[]));
  }, [open, tab, user, result]);

  const close = (v: boolean) => {
    if (!v) {
      stopCamera();
      setResult(null);
      setNotFound(null);
      setManual('');
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-none w-screen h-[100dvh] p-0 gap-0 border-0 rounded-none bg-background flex flex-col [&>button]:hidden">
        <DialogTitle className="sr-only">Scanner de alimentos</DialogTitle>
        <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <h2 className="text-lg font-bold flex items-center gap-2"><ScanBarcode className="h-5 w-5 text-primary" /> Scanner de alimentos</h2>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => close(false)} aria-label="Fechar"><X className="h-5 w-5" /></Button>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-4 grid grid-cols-2 bg-secondary">
            <TabsTrigger value="scan"><ScanBarcode className="h-4 w-4 mr-1" /> Escanear</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 mt-3 space-y-4">
            {!result && !notFound && (
              <>
                <div className="relative w-full aspect-[3/4] max-h-[55dvh] rounded-2xl overflow-hidden bg-card border border-border">
                  <video ref={setVideoEl} className="w-full h-full object-cover" muted playsInline autoPlay />
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-28 rounded-xl border-2 border-primary/80" />
                  {(busy || camError) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-6 text-center text-sm">
                      {busy ? <><Loader2 className="h-8 w-8 animate-spin text-primary" />{busy}</> : <><Camera className="h-8 w-8 text-muted-foreground" />{camError}</>}
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">Aponte a câmera para o código de barras do produto.</p>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(manual); }}>
                  <Input inputMode="numeric" placeholder="Ou digite o código (ex.: 7891000100103)" value={manual} onChange={(e) => setManual(e.target.value)} className="h-12" />
                  <Button type="submit" className="h-12" disabled={!!busy}>Buscar</Button>
                </form>
              </>
            )}

            {notFound && !result && (
              <div className="glass-card-solid rounded-2xl p-5 space-y-3 text-center">
                <p className="font-semibold">Produto não encontrado</p>
                <p className="text-sm text-muted-foreground">O código {notFound} não está na base. Tire uma foto da tabela nutricional e dos ingredientes que a IA lê o rótulo e avalia.</p>
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onLabelPhoto(e.target.files?.[0])} disabled={!!busy} />
                  <span className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {busy ?? 'Fotografar rótulo'}
                  </span>
                </label>
                <Button variant="ghost" className="h-11 w-full" onClick={() => setNotFound(null)} disabled={!!busy}>Escanear outro</Button>
              </div>
            )}

            {result && (
              <>
                <FoodScanResult scan={result} onChange={setResult} />
                <Button variant="outline" className="h-12 w-full" onClick={() => setResult(null)}>
                  <ScanBarcode className="h-4 w-4 mr-2" /> Escanear outro produto
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 mt-3 space-y-2">
            {history.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Nenhum produto escaneado ainda.</p>}
            {history.map((h) => (
              <button key={h.id} onClick={() => { setResult(h); setTab('scan'); }} className="w-full flex items-center gap-3 rounded-xl glass-card-solid p-3 text-left min-h-[64px]">
                {h.image_url ? <img src={h.image_url} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover bg-secondary" /> : <div className="h-12 w-12 rounded-lg bg-secondary" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{h.product_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{h.brand ?? ''} · {new Date(h.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm"><ScoreDot score={h.score ?? 0} /> {h.score}/100</div>
              </button>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
