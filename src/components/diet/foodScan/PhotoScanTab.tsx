import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import type { ProductData } from '@/lib/foodScore';
import { fitWithin, type WeighFood } from '@/lib/mealWeigh';
import { readAutoCapturePref, writeAutoCapturePref } from '@/lib/mealWeigh/autoCapture';
import {
  LABEL_PHOTO_MESSAGE, resolvePackagedProduct, scanCountry,
  type OffCandidate, type PhotoIdentity, type ProductSource, type UnitWeightRow,
} from '@/lib/foodPhotoScan';
import { useAutoCapture } from '@/components/diet/mealWeigh/useAutoCapture';
import NaturaResult from './NaturaResult';

interface Props {
  userId: string | null;
  /** Produto embalado resolvido: vira um scan (avaliação da IA, revisão do admin). */
  onProduct: (product: ProductData, barcode: string | null, source: ProductSource, extra: { photoPaths: string[]; foodId: string | null }) => Promise<void>;
  /** Ações do alimento in natura (adicionar à refeição / só consultar). */
  naturaActions: (food: WeighFood, grams: number, reset: () => void) => React.ReactNode;
}

type Phase = 'camera' | 'busy' | 'candidates' | 'need_label' | 'natura';

const FOOD_COLUMNS = 'id, name, calories, protein, carbs, fats, portion, portion_size, brand, source';

/** Foto (vídeo ou arquivo) → JPEG com lado maior ≤ 1280 px, para gastar pouco com a IA. */
function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const size = fitWithin(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
const fileToJpeg = (file: File) => new Promise<string>((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => { try { resolve(toJpeg(img, img.naturalWidth, img.naturalHeight)); } catch (e) { reject(e); } URL.revokeObjectURL(url); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
  img.src = url;
});

async function invoke<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('food-scanner', { body });
  if (error) {
    let msg = 'Não foi possível analisar a foto agora.';
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

/** Foto do produto guardada (privada) para o admin conferir; falha não impede o scan. */
async function uploadPhoto(userId: string | null, dataUrl: string): Promise<string[]> {
  if (!userId) return [];
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('food-scan-photos').upload(path, blob, { contentType: 'image/jpeg' });
    return error ? [] : [path];
  } catch {
    return [];
  }
}

/** Scanner por foto: produto embalado, alimento in natura ou prato. */
const PhotoScanTab: React.FC<Props> = ({ userId, onProduct, naturaActions }) => {
  const [phase, setPhase] = useState<Phase>('camera');
  const [busy, setBusy] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [identity, setIdentity] = useState<PhotoIdentity | null>(null);
  const [candidates, setCandidates] = useState<OffCandidate[]>([]);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [foods, setFoods] = useState<WeighFood[]>([]);
  const [unitWeights, setUnitWeights] = useState<UnitWeightRow[]>([]);
  const [autoOn, setAutoOn] = useState(() => readAutoCapturePref(typeof window !== 'undefined' ? window.localStorage : null));
  const [armed, setArmed] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.from('foods').select(FOOD_COLUMNS).order('name').then(({ data }) => { if (!cancelled) setFoods((data as WeighFood[] | null) ?? []); });
    void supabase.from('food_unit_weights').select('food_id, tamanho, gramas').then(({ data }) => { if (!cancelled) setUnitWeights((data as UnitWeightRow[] | null) ?? []); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCamError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (v) { v.srcObject = stream; v.muted = true; v.setAttribute('playsinline', 'true'); await v.play().catch(() => undefined); }
      } catch {
        if (!cancelled) setCamError('Não deu para abrir a câmera. Libere o acesso ou escolha uma foto.');
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [phase]);

  const reset = useCallback(() => {
    setIdentity(null); setCandidates([]); setPhoto(null); setPhotoPaths([]); setArmed(true); setPhase('camera');
  }, []);

  const finishProduct = useCallback(async (product: ProductData, barcode: string | null, source: ProductSource, paths: string[], foodId: string | null = null) => {
    setBusy('Avaliando o produto…');
    setPhase('busy');
    try {
      await onProduct(product, barcode, source, { photoPaths: paths, foodId });
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível salvar o produto.');
      reset();
    }
  }, [onProduct, reset]);

  const analyze = useCallback(async (image: string) => {
    setPhoto(image);
    setBusy('Identificando…');
    setPhase('busy');
    try {
      const { result } = await invoke<{ result: PhotoIdentity }>({ action: 'identify_photo', image });
      setIdentity(result);
      if (result.tipo !== 'embalado') { setPhase('natura'); return; }
      const paths = await uploadPhoto(userId, image);
      setPhotoPaths(paths);
      setBusy('Buscando o produto…');
      const country = scanCountry(typeof navigator !== 'undefined' ? navigator.language : null);
      const res = await resolvePackagedProduct(result, {
        lookupBarcode: async (barcode) => {
          const d = await invoke<{ found?: boolean; product?: ProductData }>({ action: 'lookup', barcode });
          return d?.found && d.product ? d.product : null;
        },
        findKnown: async (q) => {
          const d = await invoke<any>({ action: 'find_product', brand: q.brand, product: q.product, variant: q.variant });
          return d?.found ? { source: d.source, product: d.product, barcode: d.barcode ?? null, foodId: d.food_id ?? null } : null;
        },
        searchOff: async (q) => (await invoke<{ candidates?: OffCandidate[] }>({ action: 'search_off', brand: q.brand, product: q.product, variant: q.variant, country }))?.candidates ?? [],
      });
      if (res.kind === 'product') return finishProduct(res.product, res.barcode, res.source, paths, res.foodId ?? null);
      if (res.kind === 'candidates') { setCandidates(res.candidates); setPhase('candidates'); return; }
      setPhase('need_label');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível analisar a foto.');
      reset();
    }
  }, [userId, finishProduct, reset]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast.error('A câmera ainda está abrindo.'); return; }
    void analyze(toJpeg(v, v.videoWidth, v.videoHeight));
  }, [analyze]);

  const auto = useAutoCapture({
    enabled: autoOn && armed && phase === 'camera' && !camError,
    videoRef, guideRef, requireObject: false,
    onFire: () => { setArmed(false); capture(); },
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { void analyze(await fileToJpeg(file)); } catch { toast.error('Não deu para abrir essa foto.'); }
  };

  /** (d) A IA lê a foto da tabela nutricional. */
  const onLabel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !identity) return;
    setBusy('Lendo a tabela…');
    setPhase('busy');
    try {
      const image = await fileToJpeg(file);
      const [{ product }, paths] = await Promise.all([invoke<{ product: ProductData }>({ action: 'extract', image }), uploadPhoto(userId, image)]);
      const named: ProductData = {
        ...product,
        product_name: product?.product_name || [identity.produto, identity.variante].filter(Boolean).join(' ') || 'Produto sem nome',
        brands: product?.brands || identity.marca || undefined,
      };
      await finishProduct(named, identity.codigo_barras_visivel, 'tabela_ia', [...photoPaths, ...paths]);
    } catch (err) {
      toast.error((err as Error).message || 'Não consegui ler a tabela.');
      setPhase('need_label');
    }
  };

  const toggleAuto = (on: boolean) => {
    setAutoOn(on);
    if (on) setArmed(true);
    writeAutoCapturePref(typeof window !== 'undefined' ? window.localStorage : null, on);
  };

  return (
    <div className="space-y-4" data-testid="scan-photo-tab">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label="Escolher foto do produto" />
      <input ref={labelRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onLabel} aria-label="Foto da tabela nutricional" />

      {(phase === 'camera' || phase === 'busy') && (
        <>
          <div className="relative w-full aspect-[3/4] max-h-[55dvh] rounded-2xl overflow-hidden bg-card border border-border">
            {phase === 'camera' ? <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              : photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : null}
            <div ref={guideRef} className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-primary/80" />
            {phase === 'camera' && auto.phase === 'countdown' && auto.count != null && (
              <span role="timer" className="absolute inset-0 flex items-center justify-center text-8xl font-black text-primary drop-shadow-lg" data-testid="scan-countdown">{auto.count}</span>
            )}
            {(phase === 'busy' || camError) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-6 text-center text-sm" role="status">
                {phase === 'busy' ? <><Loader2 className="h-8 w-8 animate-spin text-primary" />{busy}</> : <><Camera className="h-8 w-8 text-muted-foreground" />{camError}</>}
              </div>
            )}
          </div>
          {phase === 'camera' && (
            <>
              <p className="text-center text-xs text-muted-foreground">Enquadre o produto ou o alimento. Se der, deixe a marca e a tabela nutricional aparecendo.</p>
              <div className="flex items-center justify-center gap-6">
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Escolher foto" className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center"><ImagePlus className="h-5 w-5" /></button>
                <button type="button" onClick={capture} disabled={!!camError} aria-label="Tirar foto"
                  className="h-[76px] w-[76px] rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center disabled:opacity-40">
                  <span className="h-14 w-14 rounded-full bg-primary flex items-center justify-center"><Camera className="h-6 w-6 text-primary-foreground" /></span>
                </button>
                <span className="h-12 w-12" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                {autoOn && !armed && <button type="button" onClick={() => setArmed(true)} className="text-xs font-semibold text-primary">Foto automática pausada · Retomar</button>}
                <label className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  <Switch checked={autoOn} onCheckedChange={toggleAuto} aria-label="Foto automática" /> Foto automática
                </label>
              </div>
            </>
          )}
        </>
      )}

      {phase === 'candidates' && identity && (
        <div className="space-y-3" data-testid="scan-off-candidates">
          <p className="text-sm font-semibold">É algum destes? <span className="font-normal text-muted-foreground">A IA viu {[identity.marca, identity.produto, identity.variante].filter(Boolean).join(' · ')}</span></p>
          {candidates.map((c, i) => {
            const kcal = Number((c.product.nutriments as any)?.['energy-kcal_100g']);
            return (
              <button key={c.barcode ?? i} type="button" onClick={() => finishProduct(c.product, c.barcode, 'openfoodfacts_busca', photoPaths)}
                className="w-full flex items-center gap-3 rounded-xl glass-card-solid p-3 text-left min-h-[64px]">
                {c.product.image_front_url ? <img src={c.product.image_front_url} alt="" className="h-12 w-12 rounded-lg object-cover bg-secondary" /> : <div className="h-12 w-12 rounded-lg bg-secondary" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.product.product_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.product.brands ?? ''}{Number.isFinite(kcal) ? ` · ${Math.round(kcal)} kcal/100 g` : ''}</p>
                </div>
              </button>
            );
          })}
          <Button variant="outline" className="h-11 w-full" onClick={() => setPhase('need_label')}>Nenhum destes</Button>
        </div>
      )}

      {phase === 'need_label' && identity && (
        <div className="glass-card-solid rounded-2xl p-5 space-y-3 text-center" data-testid="scan-need-label">
          <p className="font-semibold">{[identity.marca, identity.produto].filter(Boolean).join(' · ') || 'Produto'}</p>
          <p className="text-sm text-muted-foreground">Não achei os valores deste produto. {LABEL_PHOTO_MESSAGE} e a IA lê os números.</p>
          <Button className="h-12 w-full gap-2 font-semibold" onClick={() => labelRef.current?.click()}><Camera className="h-4 w-4" /> {LABEL_PHOTO_MESSAGE}</Button>
          <Button variant="ghost" className="h-11 w-full gap-1.5" onClick={reset}><RotateCcw className="h-4 w-4" /> Tirar outra foto</Button>
        </div>
      )}

      {phase === 'natura' && identity && photo && (
        <>
          <NaturaResult photo={photo} identity={identity} foods={foods} unitWeights={unitWeights} actions={(food, grams) => naturaActions(food, grams, reset)} />
          <Button variant="outline" className="h-12 w-full gap-1.5" onClick={reset}><RotateCcw className="h-4 w-4" /> Escanear outro</Button>
        </>
      )}
    </div>
  );
};

export default PhotoScanTab;
