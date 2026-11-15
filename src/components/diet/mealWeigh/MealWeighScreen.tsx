import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, Check, ChevronRight, ImagePlus, ListOrdered, Loader2, Pencil, Plus, RotateCcw, Scale, ScanSearch, Search, SkipForward, UtensilsCrossed, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useHoldAppUpdate } from '@/hooks/useHoldAppUpdate';
import { useHideBottomNav } from '@/hooks/useBottomNavVisibility';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import type { ParsedMeal } from '@/lib/dietResultParser';
import {
  FIRST_ITEM_HINT, NEXT_ITEM_HINT, NEXT_PLAN_FOOD_HINT, NOT_TARED_MESSAGE, REPEATED_FOOD_MESSAGE, SCALE_ONLY_UNREADABLE_MESSAGE, UNREADABLE_MESSAGE,
  buildPlanWeighedItem, buildScanWeighRequest, buildWeighedItem, checkTare, compareWeighedMeal, fitWithin, formatFoodComparison, formatPlanWeighLine,
  isReadingUnreliable, macrosForGrams, matchPlanFood, nextPlanFoodIndex, pendingPlanFoods, planFoodToWeighFood, planProgressLabel, plannedFromMeal,
  isEstimatedItem, isScannedItem, resolveScanWeigh, round1, scaleOnlyHint, sumWeighedItems, visibleWeighObservation, weighedChipsLabel,
  applySubstitution, buildUnweighedEntries, dropStaleSubstitutions, formatSwapLine, formatUnweighedLine, mealConsumedTotals,
  outOfPlanItemIndexes, substitutionQuestion,
  type PendingPlanFood, type ScanWeighResolution, type UnweighedChoice, type WeighAiResult, type WeighFood, type WeighedItem,
  type WeighLogRecord,
} from '@/lib/mealWeigh';
import { editWeighedItem, finishPhase, removeWeighedItem, startFromWeighLog, type WeighItemChange } from '@/lib/mealWeigh/editItems';
import { SCALE_DISPLAY_HINT, readAutoCapturePref, writeAutoCapturePref } from '@/lib/mealWeigh/autoCapture';
import WeighItemEditSheet, { MacroLine } from './WeighItemEditSheet';
import ScanApplyChoice from './ScanApplyChoice';
import {
  needsScanApplyChoice, readScanApplyPref, replaceMealWithScan, sessionScanItems, writeScanApplyPref, type ScanApplyMode,
} from '@/lib/mealWeigh/scanApply';
import PlateReview, { EstimatedBadge } from './PlateReview';
import { PLATE_HINT, buildPlateEstimateRequest, normalizePlateEstimate, resolvePlateRows, type PlateAiResult } from '@/lib/mealWeigh/plateEstimate';
import {
  correctionsFromItems, foodKey, placeWeighedItem, scaleCorrectionRow,
  type CalibrationSamples, type EstimateCorrectionRow, type PromptCorrection,
} from '@/lib/mealWeigh/calibration';
import { loadCalibrationEnabled, loadCalibrationSamples, loadRecentCorrections, saveEstimateCorrections } from './calibrationApi';
import { useAutoCapture } from './useAutoCapture';
import {
  AUTO_HINT, LABEL_HINT, SCAN_MODE_CHIPS, acceptLiveBarcode, applyCreatedFoods, autoToIdentity, autoToPlateAi, autoToWeighAi, chipForMode,
  isReferenceDraftFood, markReferenceItem, productGrams, productScore, readScanModePref, referenceWeighFood, routeAutoScan, shouldLookupLive,
  withScoreCategory, writeScanModePref, type AutoScanResult, type RefMacros, type ScanChipMode,
} from '@/lib/mealWeigh/unifiedScan';
import { scanCountry, scannedProductItem, type OffCandidate, type ProductSource } from '@/lib/foodPhotoScan';
import type { ProductData } from '@/lib/foodScore';
import ProductDraftPanel, { type ProductDraft } from './ProductDraftPanel';
import { LiveProductCard, ScanItemList, type LiveProduct } from './ScanParts';
import { createReferenceFoods, invokeScanner, lookupBarcode, recordProductScan, resolveProduct } from './scannerApi';
import { useLiveBarcode } from './useLiveBarcode';

interface Props {
  meal: ParsedMeal;
  studentId: string;
  /** Data local (yyyy-mm-dd) da refeição. */
  logDate: string;
  mealIndex: number | null;
  dietPlanId: string | null;
  /** Teste do admin: nada é salvo. */
  testMode?: boolean;
  /** 'plan' = Pesar alimentos da dieta (só lê o peso); 'scan' = Escanear prato; 'plate' = Prato pronto. Sem valor: o aluno escolhe. */
  initialMode?: 'plan' | 'scan' | 'plate';
  /** Alimento do plano para começar no modo 'plan'. */
  startFoodIndex?: number;
  onClose: () => void;
  /** Pesagem salva (registro do dia da refeição). */
  onSaved?: (log: WeighLogRecord) => void;
  /** "Editar pesagem": abre o resumo editável desta pesagem já salva; salvar cria o novo registro do dia. */
  editLog?: WeighLogRecord | null;
  /**
   * Refeição já pesada no dia ("Adicionar alimento" ou balança num alimento): começa com os
   * itens salvos e salvar grava a lista mesclada (antigos + novos) como novo registro do dia.
   */
  addToLog?: WeighLogRecord | null;
  /** Com `editLog`: abre direto em "Antes de concluir" (Revisar item por item vindo do scanner). */
  startInReview?: boolean;
  /** Scanner único: "Registrar em [refeição ▾]" (trocar só antes do primeiro item desta sessão). */
  mealOptions?: { index: number; label: string }[];
  onChangeMeal?: (mealIndex: number) => void;
}

type Phase = 'camera' | 'analyzing' | 'item' | 'plate' | 'product' | 'list' | 'review' | 'summary';
/** 'auto'/'label' = scanner único (IA decide / código e rótulo); 'scan' e 'plan' ficam no chip Balança. */
type Mode = 'plan' | 'scan' | 'plate' | 'auto' | 'label';

const MODE_FOR_CHIP: Record<ScanChipMode, Mode> = { auto: 'auto', label: 'label', scale: 'scan', plate: 'plate' };
const deviceCountry = () => scanCountry(typeof navigator !== 'undefined' ? navigator.language : null);
const storage = () => (typeof window !== 'undefined' ? window.localStorage : null);

interface PlanDraft {
  photo: string;
  readGrams: number | null;
  grams: string;
  unreadable: boolean;
  /** Alimento escolhido na base quando o do plano não tem macros por grama. */
  override: WeighFood | null;
}

interface Draft {
  photo: string;
  ai: WeighAiResult;
  resolution: ScanWeighResolution;
  food: WeighFood | null;
  /** Índice do alimento previsto escolhido (auto ou chip); null = fora do plano. */
  planIndex: number | null;
  grams: string;
  unreadable: boolean;
  tareDismissed: boolean;
}

const FOOD_COLUMNS = 'id, name, calories, protein, carbs, fats, portion, portion_size, brand, source';

/** Desenha a fonte num canvas com lado maior ≤ 1280 px e devolve JPEG. */
function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const size = fitWithin(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const fileToJpeg = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try { resolve(toJpeg(img, img.naturalWidth, img.naturalHeight)); } catch (e) { reject(e); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });

const signed = (n: number, unit = '') => `${n > 0 ? '+' : ''}${n}${unit}`;

const MealWeighScreen: React.FC<Props> = ({ meal, studentId, logDate, mealIndex, dietPlanId, testMode, initialMode, startFoodIndex, onClose, onSaved, editLog, addToLog, startInReview, mealOptions, onChangeMeal }) => {
  useHoldAppUpdate(true);
  // Tela cheia de verdade: o menu inferior some enquanto a pesagem está aberta.
  useHideBottomNav(true);
  // Editar pesagem salva: parte do registro do dia (previsto guardado, itens e escolhas).
  // Adicionar alimento: parte do mesmo registro, mas abre a câmera para pesar só o novo.
  const [editStart] = useState(() => {
    const base = editLog ?? addToLog ?? null;
    return base ? startFromWeighLog(base, plannedFromMeal(meal)) : null;
  });
  const isEdit = !!editStart && !!editLog;
  const isAdd = !!editStart && !editLog;
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>(isEdit ? 'scan' : initialMode ?? MODE_FOR_CHIP[readScanModePref(storage())]);
  /** Algum item desta sessão veio de scan (não do "Pesar alimentos da dieta"): concluir pergunta Substituir/Adicionar/Revisar. */
  const scanUsedRef = useRef(false);
  /** Alimentos novos da IA ainda não criados em foods (id provisório 'ia:…'), criados ao salvar. */
  const refDraftsRef = useRef<Map<string, WeighFood>>(new Map());
  const rememberDraft = (f: WeighFood | null | undefined) => { if (f && isReferenceDraftFood(f)) refDraftsRef.current.set(f.id, f); };
  /** Produto embalado em revisão (Automático / Código / rótulo / leitura ao vivo). */
  const [product, setProduct] = useState<ProductDraft | null>(null);
  /** Produto lido ao vivo pelo código de barras, por cima da câmera (antes da foto). */
  const [live, setLive] = useState<LiveProduct | null>(null);
  const liveRef = useRef<{ code: string; at: number } | null>(null);
  const liveProductRef = useRef<{ code: string; product: ProductData } | null>(null);
  const [phase, setPhase] = useState<Phase>(() => {
    if (!isEdit) return 'camera';
    return startInReview && editStart && pendingPlanFoods(editStart.planned, editStart.items).length > 0 ? 'review' : 'summary';
  });
  /** Itens que vieram do registro salvo: "Substituir a refeição" tira só estes. */
  const priorRef = useRef<Set<WeighedItem>>(new Set(editStart?.items ?? []));
  /** Pergunta Substituir / Adicionar / Revisar ao concluir um scan. */
  const [applyAsk, setApplyAsk] = useState(false);
  const [planIdx, setPlanIdx] = useState(Math.max(0, startFoodIndex ?? 0));
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [items, setItems] = useState<WeighedItem[]>(() => editStart?.items ?? []);
  const [photos, setPhotos] = useState<string[]>(() => editStart?.photos ?? []);
  /** Item aberto no painel de edição. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  /** Foto automática: preferência (lembrada) e armada até disparar uma vez. */
  const [autoOn, setAutoOn] = useState(() => readAutoCapturePref(typeof window !== 'undefined' ? window.localStorage : null));
  const [autoArmed, setAutoArmed] = useState(true);
  const [flashing, setFlashing] = useState(false);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Prato pronto: foto + resposta da IA em revisão. */
  const [plate, setPlate] = useState<{ photo: string; ai: PlateAiResult; samples: CalibrationSamples | null } | null>(null);
  /** Calibração: liga/desliga global + últimas correções do aluno (exemplos para a IA). */
  const calibrationRef = useRef<Promise<{ enabled: boolean; recent: PromptCorrection[] }> | null>(null);
  const loadCalibration = useCallback(() => {
    if (!calibrationRef.current) {
      calibrationRef.current = (async () => {
        const enabled = await loadCalibrationEnabled();
        return { enabled, recent: enabled ? await loadRecentCorrections(studentId) : [] };
      })();
    }
    return calibrationRef.current;
  }, [studentId]);
  /** Estimados depois pesados na balança nesta refeição: viram correção 'balanca' ao salvar. */
  const scaleCorrectionsRef = useRef<EstimateCorrectionRow[]>([]);
  const pushScaleCorrection = (replaced: WeighedItem | null, weighed: WeighedItem) => {
    if (!replaced) return;
    const row = scaleCorrectionRow(replaced, weighed, studentId);
    if (!row) return;
    scaleCorrectionsRef.current = [...scaleCorrectionsRef.current.filter((r) => r.estimate_id !== row.estimate_id), row];
  };
  const [foods, setFoods] = useState<WeighFood[]>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  /** Escolha para cada alimento do plano não pesado (padrão: comi sem pesar). */
  const [unweighedChoices, setUnweighedChoices] = useState<Record<number, UnweighedChoice>>(() => editStart?.choices ?? {});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const planned = useMemo(() => editStart?.planned ?? plannedFromMeal(meal), [editStart, meal]);
  const accumulated = useMemo(() => sumWeighedItems(items).gramas, [items]);
  const pending = useMemo(() => pendingPlanFoods(planned, items), [planned, items]);
  // Sempre a lista/fotos mais recentes na chamada da IA (sem closure velha).
  const itemsRef = useRef<WeighedItem[]>([]);
  const photosRef = useRef<string[]>([]);
  const choicesRef = useRef<Record<number, UnweighedChoice>>({});
  itemsRef.current = items;
  photosRef.current = photos;
  choicesRef.current = unweighedChoices;

  /** "Concluir refeição": antes do resumo, pergunta sobre os alimentos do plano não pesados. */
  const finish = useCallback((list: WeighedItem[] = itemsRef.current) => {
    setPhase(finishPhase(planned, list, choicesRef.current, isAdd));
  }, [planned, isAdd]);

  /**
   * Concluir em Escanear prato / Prato pronto: numa refeição com alimentos do
   * plano ou já pesada, pergunta antes o que fazer com o que foi escaneado.
   */
  const conclude = useCallback((list: WeighedItem[] = itemsRef.current) => {
    if (!isEdit && (mode !== 'plan' || scanUsedRef.current)) {
      const session = sessionScanItems(list, photosRef.current, priorRef.current);
      const prior = list.filter((it) => priorRef.current.has(it));
      if (session.items.length > 0 && needsScanApplyChoice(planned, prior)) {
        setPhase('list');
        setApplyAsk(true);
        return;
      }
    }
    finish(list);
  }, [isEdit, mode, planned, finish]);
  // (scanUsedRef é ref: não precisa entrar nas dependências)

  const applyScan = (choice: ScanApplyMode) => {
    writeScanApplyPref(typeof window !== 'undefined' ? window.localStorage : null, choice);
    setApplyAsk(false);
    const list = itemsRef.current;
    if (choice === 'replace') {
      // O escaneado vira a refeição: antigos saem, o que bate com o plano casa, o resto do plano fica "Não comi".
      const session = sessionScanItems(list, photosRef.current, priorRef.current);
      const r = replaceMealWithScan(planned, session.items, session.photos);
      itemsRef.current = r.items;
      photosRef.current = r.photos;
      choicesRef.current = r.choices;
      setItems(r.items);
      setPhotos(r.photos);
      setUnweighedChoices(r.choices);
      setDirty(true);
      setPhase('summary');
      return;
    }
    if (choice === 'review') { setPhase(pendingPlanFoods(planned, list).length > 0 ? 'review' : 'summary'); return; }
    finish(list);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.from('foods').select(FOOD_COLUMNS).order('name').then(({ data }) => {
      if (!cancelled) setFoods((data as WeighFood[] | null) ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (phase !== 'camera') { stopCamera(); return; }
    let cancelled = false;
    setCamError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.muted = true;
          v.setAttribute('playsinline', 'true');
          await v.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) setCamError('Não deu para abrir a câmera. Libere o acesso ou escolha uma foto.');
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [phase, mode, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const analyze = useCallback(async (photo: string) => {
    setPendingPhoto(photo);
    setPhase('analyzing');
    try {
      const doneItems = itemsRef.current;
      const body = { ...buildScanWeighRequest({ photo, items: doneItems, photos: photosRef.current, mealName: meal.name, planned }), country: deviceCountry() };
      const { data, error } = await supabase.functions.invoke('food-scanner', { body });
      if (error) {
        let msg = 'Não foi possível analisar a foto agora.';
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      const ai = data?.result as WeighAiResult & { ref_100g?: RefMacros | null };
      if (!ai) throw new Error('Não consegui analisar a foto. Tira outra.');
      openScaleDraft(photo, ai);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível analisar a foto.');
      setPhase('camera');
    }
  }, [meal.name, planned, foods]);

  /** Um alimento na balança (Escanear prato ou Automático): repetidos, tara, chips do plano e alimento novo da IA. */
  function openScaleDraft(photo: string, ai: WeighAiResult & { ref_100g?: RefMacros | null }) {
    const doneItems = itemsRef.current;
    // Um alimento estimado pela foto pode ser pesado depois: não conta como repetido.
    const resolution = resolveScanWeigh(ai, foods, planned, doneItems.filter((it) => !isEstimatedItem(it)));
    // Fora da base, com macros de referência (TACO/INSA): vira alimento novo, criado ao salvar.
    const refFood = !resolution.food && !resolution.repeated && ai.ref_100g ? referenceWeighFood(ai.alimento, ai.ref_100g) : null;
    const unreadable = isReadingUnreliable(ai);
    setDraft({
      photo, ai, resolution,
      food: resolution.food ?? refFood,
      planIndex: resolution.planIndex,
      grams: unreadable || ai.gramas_lidas == null ? '' : String(ai.gramas_lidas),
      unreadable,
      tareDismissed: false,
    });
    setSearch('');
    setSearchOpen(!resolution.food && !refFood && !resolution.repeated && resolution.alternatives.length === 0 && resolution.pending.length === 0);
    setPhase('item');
  }

  const currentPlanFood = planned.alimentos[planIdx] ?? null;

  const analyzePlan = useCallback(async (photo: string) => {
    setPendingPhoto(photo);
    setPhase('analyzing');
    try {
      const { data, error } = await supabase.functions.invoke('food-scanner', {
        body: { action: 'read_weight', image: photo, foodName: currentPlanFood?.alimento ?? '' },
      });
      if (error) {
        let msg = 'Não foi possível analisar a foto agora.';
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      const read = data?.result as Pick<WeighAiResult, 'gramas_lidas' | 'visor_legivel' | 'confianca_leitura'> | undefined;
      if (!read) throw new Error('Não consegui analisar a foto. Tira outra.');
      const unreadable = isReadingUnreliable(read);
      setPlanDraft({
        photo,
        readGrams: read.gramas_lidas ?? null,
        grams: unreadable || read.gramas_lidas == null ? '' : String(read.gramas_lidas),
        unreadable,
        override: null,
      });
      setSearch('');
      setSearchOpen(false);
      setPhase('item');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível analisar a foto.');
      setPhase('camera');
    }
  }, [currentPlanFood]);

  /** Prato pronto: uma foto do prato montado; a IA identifica cada alimento e estima as gramas. */
  const analyzePlate = useCallback(async (photo: string) => {
    setPendingPhoto(photo);
    setPhase('analyzing');
    try {
      const calib = await loadCalibration();
      const body = { ...buildPlateEstimateRequest({ photo, mealName: meal.name, planned, items: itemsRef.current, corrections: calib.recent }), country: deviceCountry() };
      const { data, error } = await supabase.functions.invoke('food-scanner', { body });
      if (error) {
        let msg = 'Não foi possível analisar a foto agora.';
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      const ai = normalizePlateEstimate(data?.result);
      if (!ai) throw new Error('Não consegui ver os alimentos do prato. Tira outra foto de cima, com o prato inteiro.');
      await openPlate(photo, ai, calib.enabled);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível analisar a foto.');
      setPhase('camera');
    }
  }, [meal.name, planned, foods, loadCalibration]);

  /** Revisão do prato (Prato pronto ou Automático): calibração aplicada antes de repartir o visor. */
  async function openPlate(photo: string, ai: PlateAiResult, calibrationOn: boolean) {
    let samples: CalibrationSamples | null = null;
    if (calibrationOn) {
      const keys = resolvePlateRows(ai, foods, planned, itemsRef.current).map((r) => foodKey(r.food?.id ?? null, r.food?.name ?? r.aiName));
      samples = await loadCalibrationSamples(keys);
    }
    setPlate({ photo, ai, samples });
    setPhase('plate');
  }

  /** Produto embalado: código → base/cache → Open Food Facts → tabela lida pela IA; gramas do visor ou do rótulo. */
  const openProduct = useCallback(async (photo: string | null, auto: AutoScanResult | null, knownBarcode: string | null) => {
    const readGrams = auto?.visor_legivel ? auto.gramas_lidas : null;
    const base: ProductDraft = {
      photo, status: 'busy', product: null, barcode: knownBarcode, source: 'openfoodfacts', foodId: null, candidates: [],
      grams: '', gramsFrom: 'padrao', confidence: auto?.confianca ?? null,
    };
    setProduct(base);
    setPhase('product');
    const ready = (prod: ProductData, barcode: string | null, source: string, foodId: string | null = null) => {
      const named = withScoreCategory(prod, auto);
      const g = productGrams(readGrams, named);
      setProduct({ ...base, status: 'ready', product: named, barcode, source, foodId, grams: String(g.grams), gramsFrom: g.from });
    };
    try {
      const livePrd = liveProductRef.current;
      if (knownBarcode && livePrd?.code === knownBarcode) { ready(livePrd.product, knownBarcode, 'openfoodfacts'); return; }
      if (!auto) {
        const prod = knownBarcode ? await lookupBarcode(knownBarcode) : null;
        if (prod) ready(prod, knownBarcode, 'openfoodfacts'); else setProduct({ ...base, status: 'need_label' });
        return;
      }
      const res = await resolveProduct(autoToIdentity(auto, knownBarcode), deviceCountry());
      if (res.kind === 'product') ready(res.product, res.barcode, res.source, res.foodId ?? null);
      else if (res.kind === 'candidates') setProduct({ ...base, status: 'candidates', candidates: res.candidates });
      else setProduct({ ...base, status: 'need_label' });
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível buscar o produto.');
      setProduct({ ...base, status: 'need_label' });
    }
  }, []);

  const autoRef = useRef<AutoScanResult | null>(null);
  /** Automático / Código-rótulo: UMA chamada de IA na foto; o app segue o caminho do tipo devolvido. */
  const analyzeAuto = useCallback(async (photo: string) => {
    setPendingPhoto(photo);
    setPhase('analyzing');
    try {
      const calib = await loadCalibration();
      const liveCode = liveRef.current?.code ?? null;
      const body = {
        ...buildPlateEstimateRequest({ photo, mealName: meal.name, planned, items: itemsRef.current, corrections: calib.recent }),
        action: 'scan_auto', hint: mode === 'label' ? 'label' : 'auto', liveBarcode: liveCode, country: deviceCountry(),
      };
      const { result } = await invokeScanner<{ result: AutoScanResult }>(body);
      if (!result) throw new Error('Não consegui identificar. Tira outra foto, mais de perto.');
      autoRef.current = result;
      const route = routeAutoScan(result, mode === 'label' ? 'label' : 'auto');
      if (route === 'product') { await openProduct(photo, result, result.codigo_barras_visivel ?? liveCode); return; }
      if (route === 'scale_item') { openScaleDraft(photo, autoToWeighAi(result)); return; }
      const plateAi = normalizePlateEstimate(autoToPlateAi(result));
      if (!plateAi) throw new Error('Não consegui ver os alimentos. Tira outra foto, mais de perto.');
      await openPlate(photo, plateAi, calib.enabled);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível analisar a foto.');
      setPhase('camera');
    }
  }, [meal.name, planned, foods, mode, loadCalibration, openProduct]);

  const runAnalysis = useCallback(
    (photo: string) => (mode === 'plan' ? analyzePlan(photo) : mode === 'plate' ? analyzePlate(photo)
      : mode === 'auto' || mode === 'label' ? analyzeAuto(photo) : analyze(photo)),
    [mode, analyze, analyzePlan, analyzePlate, analyzeAuto],
  );

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast.error('A câmera ainda está abrindo.'); return; }
    const photo = toJpeg(v, v.videoWidth, v.videoHeight);
    void runAnalysis(photo);
  }, [runAnalysis]);

  /** Volta para a câmera rearmando a foto automática (Próximo alimento / Tirar de novo). */
  const toCamera = useCallback(() => {
    setAutoArmed(true);
    setPhase('camera');
  }, []);

  const autoCapture = useAutoCapture({
    enabled: autoOn && autoArmed && phase === 'camera' && !camError && editingIndex == null && !confirmExit && !live,
    videoRef,
    guideRef,
    // Código / rótulo: produto embalado, que o detector de pratos não reconhece.
    requireObject: mode !== 'label',
    onFire: () => {
      // Uma foto por vez: só dispara de novo depois de "Próximo alimento" ou "Tirar de novo".
      setAutoArmed(false);
      setFlashing(true);
      capture();
    },
  });
  /** Leitura contínua do código (sem IA): mostra o produto e a nota por cima da câmera antes da foto. */
  const onLiveCode = useCallback((raw: string) => {
    const code = acceptLiveBarcode(raw);
    const now = Date.now();
    if (!code || !shouldLookupLive(liveRef.current, code, now)) return;
    liveRef.current = { code, at: now };
    try { navigator.vibrate?.(40); } catch { /* sem vibração */ }
    setLive({ code, name: '', score: null, label: null, loading: true });
    lookupBarcode(code).then((prod) => {
      if (liveRef.current?.code !== code) return;
      if (!prod) { setLive({ code, name: '', score: null, label: null, notFound: true }); return; }
      liveProductRef.current = { code, product: prod };
      const sc = productScore(prod);
      setLive({ code, name: prod.product_name || 'Produto', score: sc.score, label: sc.label });
    }, () => { if (liveRef.current?.code === code) setLive(null); });
  }, []);
  useLiveBarcode({ enabled: phase === 'camera' && (mode === 'auto' || mode === 'label') && !camError, videoRef, onCode: onLiveCode });
  const dismissLive = () => { setLive(null); liveRef.current = liveRef.current ? { ...liveRef.current, at: Date.now() } : null; };
  const useLive = () => {
    if (!live) return;
    const code = live.code;
    setLive(null);
    void openProduct(null, null, code);
  };

  useEffect(() => {
    if (!flashing) return;
    const t = window.setTimeout(() => setFlashing(false), 450);
    return () => window.clearTimeout(t);
  }, [flashing]);
  const toggleAuto = (on: boolean) => {
    setAutoOn(on);
    if (on) setAutoArmed(true);
    writeAutoCapturePref(typeof window !== 'undefined' ? window.localStorage : null, on);
  };

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { void runAnalysis(await fileToJpeg(file)); } catch { toast.error('Não deu para abrir essa foto.'); }
  }, [runAnalysis]);

  const gramsNum = Number(String((mode === 'plan' ? planDraft?.grams : draft?.grams) ?? '').replace(',', '.'));
  const draftMacros = draft?.food && gramsNum > 0 ? macrosForGrams(draft.food, gramsNum) : null;

  const weighedPlanIdx = useMemo(
    () => items.map((it) => it.indice_plano).filter((i): i is number => typeof i === 'number'),
    [items],
  );
  const planBaseFood = useMemo(() => planFoodToWeighFood(currentPlanFood, foods), [currentPlanFood, foods]);
  const planFoodForDraft = planDraft?.override ?? planBaseFood;
  const planMacros = planFoodForDraft && gramsNum > 0 ? macrosForGrams(planFoodForDraft, gramsNum) : null;
  const nextPlanIdx = nextPlanFoodIndex(planIdx, planned.alimentos.length, weighedPlanIdx);

  const confirmPlanItem = () => {
    if (!planDraft || !currentPlanFood || !(gramsNum > 0)) return;
    const item = buildPlanWeighedItem(currentPlanFood, planIdx, gramsNum, foods, { readGrams: planDraft.readGrams, override: planDraft.override });
    if (!item) return;
    // Pesar de novo o mesmo alimento substitui só aquele item; os outros (inclusive os já salvos no dia) ficam.
    // Se ele estava estimado pela foto, o peso da balança vira correção da estimativa.
    const out = placeWeighedItem(itemsRef.current, photosRef.current, item, planDraft.photo, 'upsert');
    pushScaleCorrection(out.replaced, item);
    const nextItems = dropStaleSubstitutions(out.items, buildUnweighedEntries(pendingPlanFoods(planned, out.items), choicesRef.current));
    itemsRef.current = nextItems;
    photosRef.current = out.photos;
    setItems(nextItems);
    setPhotos(out.photos);
    setPlanDraft(null);
    setDirty(true);
    setPhase('list');
  };

  const skipPlanFood = () => {
    if (nextPlanIdx != null) { setPlanIdx(nextPlanIdx); toCamera(); return; }
    setPhase(items.length > 0 ? 'list' : 'camera');
    if (items.length === 0) toast('Esse era o último alimento da refeição.');
  };

  const goNextPlanFood = () => {
    if (nextPlanIdx == null) return;
    setPlanIdx(nextPlanIdx);
    toCamera();
  };

  /** Prato pronto confirmado: os itens estimados entram na refeição (somados aos já registrados). */
  const confirmPlate = (estimated: WeighedItem[]) => {
    if (estimated.length === 0) return;
    (plate?.ai.itens ?? []).forEach((it) => { if (it.ref_100g) rememberDraft(referenceWeighFood(it.alimento, it.ref_100g)); });
    scanUsedRef.current = true;
    const appended = [...itemsRef.current, ...estimated];
    const nextItems = dropStaleSubstitutions(appended, buildUnweighedEntries(pendingPlanFoods(planned, appended), choicesRef.current));
    const nextPhotos = [...photosRef.current, ...estimated.map(() => plate?.photo ?? '')];
    itemsRef.current = nextItems;
    photosRef.current = nextPhotos;
    setItems(nextItems);
    setPhotos(nextPhotos);
    setPlate(null);
    setDirty(true);
    conclude(nextItems);
  };

  /** Chips de modo embaixo da câmera (o último fica lembrado). */
  const chooseChip = (chip: ScanChipMode) => {
    writeScanModePref(storage(), chip);
    setMode(MODE_FOR_CHIP[chip]);
    setLive(null);
    toCamera();
  };
  /** Dentro do chip Balança: pesar um alimento da dieta (só lê o visor) ou voltar ao "qualquer alimento". */
  const choosePlanFood = (index: number | null) => {
    if (index == null) { setMode('scan'); toCamera(); return; }
    setPlanIdx(index);
    setMode('plan');
    toCamera();
  };

  /** Produto embalado confirmado: entra na refeição com origem 'escaneado' e a nota no item. */
  const confirmProduct = (next: 'camera' | 'summary') => {
    const pd = product;
    const g = Number(String(pd?.grams ?? '').replace(',', '.'));
    if (!pd?.product || !(g > 0)) return;
    const sc = productScore(pd.product);
    const initial = productGrams(autoRef.current?.visor_legivel ? autoRef.current.gramas_lidas : null, pd.product).grams;
    const item = scannedProductItem(pd.product.product_name || 'Produto', pd.product.brands ?? null, pd.product, g, pd.foodId, {
      score: sc.score, label: sc.label, gramsFrom: Math.abs(g - initial) > 0.05 ? null : pd.gramsFrom, edited: Math.abs(g - initial) > 0.05,
    });
    const hit = matchPlanFood(item.alimento, pending.map((p) => p.food));
    item.indice_plano = hit != null ? pending[hit].index : null;
    const placed = placeWeighedItem(itemsRef.current, photosRef.current, item, pd.photo ?? '', 'append');
    const nextItems = dropStaleSubstitutions(placed.items, buildUnweighedEntries(pendingPlanFoods(planned, placed.items), choicesRef.current));
    itemsRef.current = nextItems;
    photosRef.current = placed.photos;
    setItems(nextItems);
    setPhotos(placed.photos);
    setProduct(null);
    setDirty(true);
    scanUsedRef.current = true;
    if (!testMode) {
      void recordProductScan({ studentId, product: pd.product, barcode: pd.barcode, source: pd.source, photo: pd.photo, confidence: pd.confidence, grams: g });
    }
    if (next === 'summary') conclude(nextItems); else toCamera();
  };

  const pickCandidate = (c: OffCandidate) => {
    setProduct((d) => {
      if (!d) return d;
      const prod = withScoreCategory(c.product, autoRef.current);
      const gr = productGrams(autoRef.current?.visor_legivel ? autoRef.current.gramas_lidas : null, prod);
      return { ...d, status: 'ready', product: prod, barcode: c.barcode ?? d.barcode, source: 'openfoodfacts_busca', grams: String(gr.grams), gramsFrom: gr.from };
    });
  };

  /** Tabela nutricional fotografada: a IA lê o rótulo (mesmo caminho do scanner de produtos). */
  const onProductLabel = async (file: File) => {
    const d = product;
    if (!d) return;
    setProduct({ ...d, status: 'busy' });
    try {
      const image = await fileToJpeg(file);
      const { product: read } = await invokeScanner<{ product: ProductData }>({ action: 'extract', image });
      const a = autoRef.current;
      const named = withScoreCategory({
        ...read,
        product_name: read?.product_name || [a?.produto, a?.variante].filter(Boolean).join(' ') || 'Produto sem nome',
        brands: read?.brands || a?.marca || undefined,
      }, a);
      const gr = productGrams(a?.visor_legivel ? a.gramas_lidas : null, named);
      setProduct({ ...d, status: 'ready', product: named, source: 'tabela_ia' as ProductSource, photo: d.photo ?? image, grams: String(gr.grams), gramsFrom: gr.from });
    } catch (e) {
      toast.error((e as Error).message || 'Não consegui ler a tabela.');
      setProduct({ ...d, status: 'need_label' });
    }
  };

  const draftValid = !!draft?.food && gramsNum > 0;
  /** Confirma o item atual e segue: 'camera' = próximo alimento, 'summary' = concluir. */
  const confirmItem = (next: 'camera' | 'summary' | 'list' = 'list') => {
    if (!draft?.food || !(gramsNum > 0)) return;
    const readG = draft.ai.gramas_lidas;
    const sameAsAi = draft.food.id === draft.resolution.food?.id;
    const edited = !sameAsAi || readG == null || Math.abs(gramsNum - readG) > 0.05;
    const item = buildWeighedItem(draft.food, gramsNum, {
      edited, aiName: draft.ai.alimento || null, readGrams: readG,
      planIndex: draft.planIndex,
    });
    // Escolheu outro alimento no lugar do que a IA viu (ex.: IA repetiu um já pesado).
    if (!sameAsAi && draft.ai.alimento && !isReferenceDraftFood(draft.food)) item.alimento_corrigido = true;
    Object.assign(item, markReferenceItem(item, draft.food));
    rememberDraft(draft.food);
    scanUsedRef.current = true;
    // O mesmo alimento estimado pela foto: o pesado ocupa o lugar dele e vira correção 'balanca'.
    const placed = placeWeighedItem(itemsRef.current, photosRef.current, item, draft.photo, 'append');
    pushScaleCorrection(placed.replaced, item);
    const appended = placed.items;
    // Um alimento antes "Não comi" agora pesado deixa de valer como trocado por outro item.
    const nextItems = dropStaleSubstitutions(appended, buildUnweighedEntries(pendingPlanFoods(planned, appended), choicesRef.current));
    const nextPhotos = placed.photos;
    itemsRef.current = nextItems;
    photosRef.current = nextPhotos;
    setItems(nextItems);
    setPhotos(nextPhotos);
    setDraft(null);
    setDirty(true);
    if (next === 'summary') conclude(nextItems);
    else if (next === 'camera') toCamera();
    else setPhase(next);
  };

  const pickPending = (p: PendingPlanFood) => {
    const food = planFoodToWeighFood(p.food, foods);
    if (!food) { setSearch(p.food.alimento); setSearchOpen(true); return; }
    setDraft((d) => (d ? { ...d, food, planIndex: p.index } : d));
    setSearchOpen(false);
    setSearch('');
  };

  /** Item aberto no rascunho atual que a IA marcou como repetido: refaz a checagem com a nova lista. */
  const refreshDraft = (nextItems: WeighedItem[]) => {
    setDraft((d) => {
      if (!d || !d.resolution.repeated) return d;
      const resolution = resolveScanWeigh(d.ai, foods, planned, nextItems);
      return d.food ? { ...d, resolution } : { ...d, resolution, food: resolution.food, planIndex: resolution.planIndex };
    });
  };

  /** Painel do item: salvar alteração recalcula macros, totais, previsto × pesado e acumulado da tara. */
  const applyItemEdit = (index: number, change: WeighItemChange) => {
    const nextItems = dropStaleSubstitutions(
      editWeighedItem(itemsRef.current, index, change),
      buildUnweighedEntries(pendingPlanFoods(planned, editWeighedItem(itemsRef.current, index, change)), unweighedChoices),
    );
    itemsRef.current = nextItems;
    setItems(nextItems);
    setDirty(true);
    setEditingIndex(null);
    refreshDraft(nextItems);
  };

  const deleteItem = (index: number) => {
    const out = removeWeighedItem(planned, itemsRef.current, photosRef.current, index, unweighedChoices);
    const nextItems = dropStaleSubstitutions(out.items, buildUnweighedEntries(pendingPlanFoods(planned, out.items), out.choices));
    itemsRef.current = nextItems;
    photosRef.current = out.photos;
    setItems(nextItems);
    setPhotos(out.photos);
    setUnweighedChoices(out.choices);
    setDirty(true);
    setEditingIndex(null);
    refreshDraft(nextItems);
    // Editar pesagem: dá para apagar tudo (os alimentos do plano ficam "Não comi") e salvar.
    if (nextItems.length === 0 && !isEdit && (phase === 'summary' || phase === 'review' || phase === 'list')) toCamera();
  };

  const unweighed = useMemo(() => buildUnweighedEntries(pending, unweighedChoices), [pending, unweighedChoices]);
  /** Editar pesagem com tudo apagado: vale salvar (a refeição fica só com o que não comeu). */
  const canSaveEmpty = isEdit && planned.alimentos.length > 0;
  const notEaten = useMemo(() => unweighed.filter((u) => u.escolha === 'nao_comeu'), [unweighed]);
  const outOfPlan = useMemo(() => outOfPlanItemIndexes(planned, items), [planned, items]);
  /** Só pergunta "substituiu?" quando há item do plano marcado "Não comi". */
  const swapQuestions = notEaten.length > 0 ? outOfPlan : [];
  const swapsAnswered = swapQuestions.every((i) => items[i]?.extra === true || !!items[i]?.substituiu);
  const comparison = useMemo(() => compareWeighedMeal(planned, items, unweighed), [planned, items, unweighed]);
  const totals = useMemo(() => sumWeighedItems(items), [items]);
  // Aviso de balança não zerada sempre pelo acumulado ATUAL (itens editados/apagados contam na hora).
  const tare = draft && !draft.unreadable ? checkTare(draft.ai.gramas_lidas, accumulated) : { notTared: false, suggestedGrams: null };
  const tareSuggested = tare.notTared ? tare.suggestedGrams : null;
  // Uma edição no resumo pode criar uma troca sem resposta: volta para a pergunta.
  useEffect(() => {
    if (phase === 'summary' && !swapsAnswered && !isEdit) setPhase('review');
  }, [phase, swapsAnswered, isEdit]);

  const chooseUnweighed = (index: number, choice: UnweighedChoice) => {
    const nextChoices = { ...unweighedChoices, [index]: choice };
    setUnweighedChoices(nextChoices);
    setDirty(true);
    setItems((prev) => dropStaleSubstitutions(prev, buildUnweighedEntries(pendingPlanFoods(planned, prev), nextChoices)));
  };

  const save = async () => {
    if (testMode) { toast.success('Modo teste: nada foi salvo.'); onClose(); return; }
    if (!canSaveEmpty && items.length === 0) return;
    setSaving(true);
    // Alimentos novos da IA viram alimentos de verdade (ou o já existente com o mesmo nome) antes de salvar.
    const created = refDraftsRef.current.size > 0 ? await createReferenceFoods(items, refDraftsRef.current, deviceCountry()) : new Map();
    const items_ = applyCreatedFoods(items, created);
    const consumed = mealConsumedTotals(items_, unweighed);
    const { data: saved, error } = await supabase.from('meal_weigh_logs').insert({
      student_id: studentId,
      log_date: logDate,
      diet_plan_id: dietPlanId,
      meal_index: mealIndex,
      meal_name: meal.name || '',
      meal_time: meal.time ?? null,
      items: items_ as any,
      unweighed: unweighed as any,
      total_kcal: consumed.kcal,
      total_p: consumed.p,
      total_c: consumed.c,
      total_g: consumed.g,
      planned: { ...planned, comparacao: compareWeighedMeal(planned, items_, unweighed).alimentos } as any,
    }).select('id, log_date, meal_index, items, unweighed, planned, created_at').single();
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    if (saved) {
      // Calibração: gramas mudadas num item estimado (e estimados pesados depois) contra a estimativa ORIGINAL.
      const mealLogId = (saved as { id?: string }).id ?? null;
      const { upserts, removeIds } = correctionsFromItems(items_, { studentId, mealLogId, fonte: 'aluno' });
      const scale = scaleCorrectionsRef.current.map((r) => ({ ...r, meal_log_id: mealLogId }));
      const byId = new Map<string, EstimateCorrectionRow>();
      [...upserts, ...scale].forEach((r) => byId.set(r.estimate_id, r));
      void saveEstimateCorrections(studentId, [...byId.values()], removeIds.filter((id) => !byId.has(id)));
    }
    toast.success(isEdit || isAdd ? 'Pesagem atualizada no seu dia' : 'Refeição pesada salva no seu dia');
    if (saved) onSaved?.(saved as unknown as WeighLogRecord);
    onClose();
  };

  const requestClose = () => {
    if (isEdit || isAdd) return dirty ? setConfirmExit(true) : onClose();
    return items.length > 0 && phase !== 'summary' ? setConfirmExit(true) : onClose();
  };
  const progress = planned.alimentos.length > 0 ? planProgressLabel(planIdx, planned.alimentos.length) : '';

  const searchResults = useMemo(() => (search.trim() ? filterFoodsBySearch(foods, search).slice(0, 25) : []), [foods, search]);
  const pickFood = (f: WeighFood) => {
    if (mode === 'plan') setPlanDraft((d) => (d ? { ...d, override: f } : d));
    else {
      const hit = matchPlanFood(f.name, pending.map((p) => p.food));
      setDraft((d) => (d ? { ...d, food: f, planIndex: hit != null ? pending[hit].index : null } : d));
    }
    setSearchOpen(false);
    setSearch('');
  };

  const header = (title: string) => (
    <div className="flex items-center gap-2 px-4 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
      <Scale className="h-5 w-5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{title}</p>
        {mealOptions && onChangeMeal ? (
          <label className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground" data-testid="scan-meal-picker">
            <span className="shrink-0">Registrar em</span>
            <select value={mealIndex ?? ''} disabled={mealLocked} aria-label="Registrar em qual refeição"
              onChange={(e) => onChangeMeal(Number(e.target.value))}
              className="min-w-0 max-w-full truncate rounded-md border border-primary/40 bg-secondary/80 px-1.5 py-0.5 text-[11px] font-semibold text-primary disabled:opacity-60">
              {mealOptions.map((o) => <option key={o.index} value={o.index}>{o.label}</option>)}
            </select>
            {testMode ? ' · teste' : ''}
          </label>
        ) : (
          <p className="text-[11px] text-muted-foreground truncate">{meal.time ? `${meal.time} · ` : ''}{meal.name}{testMode ? ' · teste' : ''}</p>
        )}
      </div>
      <button type="button" aria-label="Fechar" onClick={requestClose}
        className="h-11 w-11 shrink-0 rounded-full bg-secondary/70 flex items-center justify-center">
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  /** Trocar a refeição só antes do primeiro item desta sessão (os itens já salvos do dia não contam). */
  const mealLocked = items.some((it) => !priorRef.current.has(it));
  /** Itens já pesados no topo: "Iogurte 154 g · Whey 26 g". */
  const weighedChips = mode !== 'plan' && items.length > 0 ? (
    <div className="px-4 pb-2" data-testid="meal-weigh-weighed-chips" aria-label={`Já pesados: ${weighedChipsLabel(items)}`}>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {items.map((it, i) => (
          <button key={i} type="button" onClick={() => setEditingIndex(i)} aria-label={`Editar ${it.alimento} ${Math.round(it.gramas)} g`}
            className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary tabular-nums active:bg-primary/20">
            {it.alimento} {Math.round(it.gramas)} g
          </button>
        ))}
      </div>
    </div>
  ) : null;
  const scanTitle = `Alimento ${items.length + 1}`;

  const screen = (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Pesar refeição"
      data-testid="meal-weigh-screen" data-no-swipe="true" style={{ height: '100dvh' }}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {(phase === 'camera' || phase === 'analyzing') && (
        <div className="relative flex-1 min-h-0 bg-background">
          {phase === 'camera' ? (
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
          ) : (
            pendingPhoto ? <img src={pendingPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-secondary/40" />
          )}
          <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/90 to-transparent">
            {header(mode === 'plan' ? 'Pesar refeição' : mode === 'plate' ? 'Prato pronto' : items.length === 0 ? 'Escanear' : scanTitle)}
            {weighedChips}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <div ref={guideRef} data-testid="meal-weigh-guide" className="relative aspect-[3/4] w-full max-w-sm rounded-3xl border-2 border-dashed border-primary/80 shadow-[0_0_0_9999px_hsl(var(--background)/0.45)]">
              {phase === 'camera' && autoCapture.phase === 'countdown' && autoCapture.count != null && (
                <>
                  <svg className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] overflow-visible" viewBox="0 0 312 412" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="3" y="3" width="306" height="406" rx="26" pathLength={100} fill="none" vectorEffect="non-scaling-stroke"
                      className="stroke-primary" strokeWidth={5} strokeLinecap="round" strokeDasharray="100"
                      style={{ strokeDashoffset: 100 * (1 - autoCapture.progress), transition: 'stroke-dashoffset 160ms linear' }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center" role="timer" aria-live="assertive" data-testid="meal-weigh-countdown">
                    <span key={autoCapture.count} className="text-8xl font-black tabular-nums text-primary drop-shadow-lg animate-in zoom-in-50 fade-in duration-300">
                      {autoCapture.count}
                    </span>
                  </span>
                </>
              )}
              <span className="absolute -top-px left-1/2 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-primary px-3 py-1 text-center text-xs font-semibold text-primary-foreground" data-testid="meal-weigh-hint">
                {mode === 'plan' ? scaleOnlyHint(currentPlanFood?.alimento ?? '') : mode === 'plate' ? PLATE_HINT : mode === 'auto' ? AUTO_HINT : mode === 'label' ? LABEL_HINT : items.length === 0 ? FIRST_ITEM_HINT : NEXT_ITEM_HINT}
              </span>

              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-primary/60 bg-background/70 px-3 py-1 text-[11px] text-primary">
                {mode === 'plate' ? 'prato inteiro' : mode === 'auto' ? 'prato, balança ou produto' : mode === 'label' ? 'código ou rótulo' : 'visor da balança'}
              </span>
            </div>
          </div>
          {phase === 'camera' && autoCapture.boxes.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true" data-testid="scan-detections">
              {autoCapture.boxes.map((b, i) => (
                <span key={i} className="absolute rounded-lg border-2 border-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
                  style={{ left: b.x, top: b.y, width: b.width, height: b.height }} />
              ))}
            </div>
          )}
          {phase === 'camera' && live && (
            <div className="absolute inset-x-0 z-20" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 64px)' }}>
              <LiveProductCard live={live} onUse={useLive} onDismiss={dismissLive} />
            </div>
          )}
          {flashing && <div className="pointer-events-none absolute inset-0 z-30 bg-foreground animate-out fade-out-0 duration-500 fill-mode-forwards" aria-hidden="true" />}
          {phase === 'analyzing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70" role="status">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-semibold">{mode === 'plate' ? 'Identificando os alimentos do prato…' : mode === 'auto' || mode === 'label' ? 'Identificando…' : 'Lendo a balança…'}</p>
            </div>
          )}
          {phase === 'camera' && (
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-background/95 to-transparent px-6 pt-10"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
              {camError && <p className="text-center text-xs text-destructive">{camError}</p>}
              {!isEdit && (
                <div className="w-full space-y-1.5">
                  <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Modo do scanner" data-testid="scan-mode-chips">
                    {SCAN_MODE_CHIPS.map((c) => {
                      const active = chipForMode(mode) === c.mode;
                      return (
                        <button key={c.mode} type="button" aria-pressed={active} onClick={() => chooseChip(c.mode)}
                          className={`h-9 shrink-0 rounded-full border px-3 text-xs font-bold ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/80 text-foreground'}`}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {chipForMode(mode) === 'scale' && planned.alimentos.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Pesar um alimento da dieta" data-testid="scan-plan-foods">
                      <button type="button" aria-pressed={mode === 'scan'} onClick={() => choosePlanFood(null)}
                        className={`h-8 shrink-0 rounded-full border px-2.5 text-[11px] font-semibold ${mode === 'scan' ? 'border-primary text-primary bg-primary/15' : 'border-border bg-background/80'}`}>
                        Qualquer alimento
                      </button>
                      {planned.alimentos.map((pf, i) => {
                        const done = weighedPlanIdx.includes(i);
                        const active = mode === 'plan' && planIdx === i;
                        return (
                          <button key={i} type="button" aria-pressed={active} onClick={() => choosePlanFood(i)}
                            className={`h-8 shrink-0 rounded-full border px-2.5 text-[11px] font-semibold ${active ? 'border-primary text-primary bg-primary/15' : 'border-border bg-background/80'} ${done ? 'opacity-60' : ''}`}>
                            {done ? '✓ ' : ''}{pf.alimento}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {!camError && (
                <div className="flex w-full flex-col items-center gap-1.5" data-testid="meal-weigh-auto">
                  {autoOn && autoArmed && autoCapture.phase !== 'off' && (
                    <p className="rounded-full bg-background/80 px-3 py-1 text-center text-xs font-semibold" data-testid="meal-weigh-auto-status" data-detector={autoCapture.detector}>
                      {autoCapture.phase === 'countdown' ? 'Não mexe…'
                        : autoCapture.phase === 'no_object' ? (autoCapture.detector === 'loading' ? 'Procurando o prato…' : 'Coloca o prato no centro da moldura')
                        : 'Segura o celular parado'}
                      {(mode === 'scan' || mode === 'plan') && <span className="block text-[11px] font-normal text-muted-foreground">{SCALE_DISPLAY_HINT}</span>}
                    </p>
                  )}
                  {autoOn && !autoArmed && (
                    <button type="button" onClick={() => setAutoArmed(true)} className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-primary">
                      Foto automática pausada · Retomar
                    </button>
                  )}
                  <label className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold">
                    <Switch checked={autoOn} onCheckedChange={toggleAuto} aria-label="Foto automática" />
                    Foto automática
                  </label>
                </div>
              )}
              {mode === 'plan' && progress && (
                <p className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-primary tabular-nums" data-testid="meal-weigh-progress">
                  Alimento {progress}
                </p>
              )}
              {items.length > 0 && (
                <button type="button" onClick={() => (mode !== 'plan' ? conclude() : setPhase('list'))}
                  className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-foreground">
                  {mode !== 'plan' ? 'Concluir refeição' : `${items.length} ${items.length === 1 ? 'item pesado' : 'itens pesados'}`} · {Math.round(accumulated)} g
                </button>
              )}
              <div className="flex w-full items-center justify-between">
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Escolher foto"
                  className="h-12 w-12 rounded-full bg-secondary/80 flex items-center justify-center">
                  <ImagePlus className="h-5 w-5" />
                </button>
                <button type="button" onClick={capture} disabled={!!camError} aria-label="Tirar foto"
                  className="h-[88px] w-[88px] rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center disabled:opacity-40">
                  <span className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
                    <Camera className="h-7 w-7 text-primary-foreground" />
                  </span>
                </button>
                {mode === 'plan' ? (
                  <button type="button" onClick={skipPlanFood} aria-label="Pular este alimento"
                    className="h-12 w-12 rounded-full bg-secondary/80 flex items-center justify-center">
                    <SkipForward className="h-5 w-5" />
                  </button>
                ) : items.length > 0 ? (
                  <button type="button" onClick={() => setPhase('list')} aria-label="Ver itens"
                    className="h-12 w-12 rounded-full bg-secondary/80 flex items-center justify-center text-sm font-bold">
                    {items.length}
                  </button>
                ) : <span className="h-12 w-12" />}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'plan' && phase === 'item' && planDraft && currentPlanFood && (
        <div className="flex-1 min-h-0 flex flex-col">
          {header(`Alimento ${progress}`)}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
            <img src={planDraft.photo} alt="Foto da balança" className="h-40 w-full rounded-2xl object-cover border border-border" />
            {planDraft.unreadable && (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p>{SCALE_ONLY_UNREADABLE_MESSAGE}</p>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alimento da dieta</p>
                <p className="mt-1 text-base font-bold">{currentPlanFood.alimento}</p>
                {gramsNum > 0 && (
                  <p className="mt-1 text-sm text-primary font-semibold" data-testid="meal-weigh-plan-line">
                    {formatPlanWeighLine(currentPlanFood.alimento, gramsNum, currentPlanFood)}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="meal-weigh-grams" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gramas</label>
                <div className="mt-1 flex items-center gap-2">
                  <Input id="meal-weigh-grams" inputMode="decimal" value={planDraft.grams}
                    onChange={(e) => setPlanDraft({ ...planDraft, grams: e.target.value.replace(/[^\d.,]/g, '') })}
                    className="text-lg font-bold tabular-nums" placeholder="Digite as gramas" />
                  <span className="text-sm text-muted-foreground">g</span>
                </div>
                {planDraft.readGrams != null && !planDraft.unreadable && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Lido no visor: {planDraft.readGrams} g</p>
                )}
              </div>
              {planMacros ? <MacroLine m={planMacros} /> : planFoodForDraft ? (
                <p className="text-xs text-muted-foreground">Digite as gramas para ver os macros.</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Esse alimento não tem macros por grama no plano. Escolha na base de alimentos:</p>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na base de alimentos" aria-label="Buscar alimento" />
                  {searchResults.length > 0 && (
                    <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                      {searchResults.map((f) => (
                        <li key={f.id}><button type="button" onClick={() => pickFood(f)} className="w-full px-3 py-2 text-left text-sm active:bg-primary/10">{f.name}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {planDraft.override && <p className="text-[11px] text-muted-foreground">Macros de: {planDraft.override.name}</p>}
            </div>
          </div>
          <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            <Button variant="outline" className="gap-1.5" onClick={() => { setPlanDraft(null); toCamera(); }}>
              <RotateCcw className="h-4 w-4" /> Outra foto
            </Button>
            <Button className="flex-1 gap-1.5 font-semibold" disabled={!planFoodForDraft || !(gramsNum > 0)} onClick={confirmPlanItem}>
              <Check className="h-4 w-4" /> Confirmar
            </Button>
          </div>
        </div>
      )}

      {mode !== 'plan' && phase === 'item' && draft && (
        <div className="flex-1 min-h-0 flex flex-col">
          {header(scanTitle)}
          {weighedChips}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
            <img src={draft.photo} alt="Foto da balança" className="h-40 w-full rounded-2xl object-cover border border-border" />

            {draft.unreadable && (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p>{UNREADABLE_MESSAGE}</p>
              </div>
            )}
            {tareSuggested != null && !draft.tareDismissed && (
              <div role="alert" data-testid="meal-weigh-tare-warning" className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-sm space-y-2">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> {NOT_TARED_MESSAGE}</p>
                <p className="text-xs text-muted-foreground">
                  O visor mostra {Math.round(draft.ai.gramas_lidas ?? 0)} g, mais do que tudo o que já foi pesado ({Math.round(accumulated)} g).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setDraft({ ...draft, grams: String(tareSuggested), tareDismissed: true })}>
                    Descontar {Math.round(accumulated)} g
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, tareDismissed: true })}>A balança foi zerada</Button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alimento</p>
                {draft.resolution.repeated && !draft.food && (
                  <div role="alert" data-testid="meal-weigh-repeated" className="mt-1 rounded-xl border border-primary/50 bg-primary/10 p-2.5 text-sm">
                    <p className="font-semibold">{REPEATED_FOOD_MESSAGE}</p>
                    <p className="text-[11px] text-muted-foreground">A IA viu {draft.ai.alimento || draft.resolution.repeated.alimento}, que você já pesou ({Math.round(draft.resolution.repeated.gramas)} g).</p>
                  </div>
                )}
                {draft.food ? (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-base font-bold truncate">{draft.food.name}</p>
                    {isReferenceDraftFood(draft.food) && (
                      <span className="shrink-0 rounded-full border border-primary bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary" data-testid="scan-new-food">novo · criado pela IA</span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSearchOpen((v) => !v)} className="gap-1">
                      <Search className="h-3.5 w-3.5" /> Trocar
                    </Button>
                  </div>
                ) : draft.resolution.repeated ? null : (
                  <p className="mt-1 text-sm">
                    {draft.ai.alimento ? <>A IA viu <strong>{draft.ai.alimento}</strong>, mas não achei na base. Escolha:</> : 'Escolha o alimento:'}
                  </p>
                )}
                {pending.some((p) => p.index !== draft.planIndex) && (
                  <div className="mt-2" data-testid="meal-weigh-pending-chips">
                    <p className="text-[11px] text-muted-foreground mb-1">{draft.food ? 'Trocar por um alimento da refeição:' : 'Alimentos da refeição ainda não pesados:'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pending.filter((p) => p.index !== draft.planIndex).map((p) => (
                        <button key={p.index} type="button" onClick={() => pickPending(p)}
                          className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                          {p.food.alimento}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(draft.resolution.needsChoice || !draft.food) && draft.resolution.alternatives.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="meal-weigh-alternatives">
                    <span className="text-xs text-muted-foreground self-center">{draft.food ? 'Ou é:' : 'A IA sugere:'}</span>
                    {draft.resolution.alternatives.map((f) => (
                      <button key={f.id} type="button" onClick={() => pickFood(f)}
                        className={`rounded-full border px-3 py-1 text-xs ${draft.food?.id === f.id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary/60'}`}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                {(searchOpen || !draft.food) && (
                  <div className="mt-2 space-y-1.5">
                    <Input autoFocus={searchOpen} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na base de alimentos" aria-label="Buscar alimento" />
                    {searchResults.length > 0 && (
                      <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                        {searchResults.map((f) => (
                          <li key={f.id}>
                            <button type="button" onClick={() => pickFood(f)} className="w-full px-3 py-2 text-left text-sm active:bg-primary/10">
                              {f.name}{f.brand ? <span className="text-muted-foreground"> · {f.brand}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="meal-weigh-grams" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gramas</label>
                <div className="mt-1 flex items-center gap-2">
                  <Input id="meal-weigh-grams" inputMode="decimal" value={draft.grams}
                    onChange={(e) => setDraft({ ...draft, grams: e.target.value.replace(/[^\d.,]/g, '') })}
                    className="text-lg font-bold tabular-nums" placeholder="Digite as gramas" />
                  <span className="text-sm text-muted-foreground">g</span>
                </div>
                {draft.ai.gramas_lidas != null && !draft.unreadable && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Lido no visor: {draft.ai.gramas_lidas} g</p>
                )}
              </div>

              {draftMacros ? <MacroLine m={draftMacros} /> : <p className="text-xs text-muted-foreground">Escolha o alimento e as gramas para ver os macros.</p>}
              {(() => {
                const obs = visibleWeighObservation(draft.ai.observacao, { tareSuspected: tareSuggested != null });
                return obs ? <p className="text-[11px] text-muted-foreground" data-testid="meal-weigh-observation">Obs.: {obs}</p> : null;
              })()}
            </div>
          </div>
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-background px-4 pt-3 space-y-2" data-testid="meal-weigh-item-actions"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            <Button className="w-full h-12 gap-1.5 text-base font-semibold" disabled={!draftValid} onClick={() => confirmItem('camera')}>
              <Plus className="h-4 w-4" /> Próximo alimento
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { setDraft(null); toCamera(); }}>
                <RotateCcw className="h-4 w-4" /> Tirar de novo
              </Button>
              <Button variant="outline" className="flex-1 gap-1.5" disabled={!draftValid} onClick={() => confirmItem('summary')}>
                <Check className="h-4 w-4" /> Concluir refeição
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === 'product' && product && (
        <ProductDraftPanel
          header={<>{header('Produto')}{weighedChips}</>}
          draft={product}
          onChange={setProduct}
          onPickCandidate={pickCandidate}
          onLabelPhoto={(f) => void onProductLabel(f)}
          onRetake={() => { setProduct(null); toCamera(); }}
          onConfirm={confirmProduct}
        />
      )}

      {phase === 'plate' && plate && (
        <PlateReview
          header={<>{header('Prato pronto')}{weighedChips}</>}
          photo={plate.photo}
          ai={plate.ai}
          samples={plate.samples}
          planned={planned}
          existing={items}
          foods={foods}
          onRetake={() => { setPlate(null); toCamera(); }}
          onConfirm={confirmPlate}
        />
      )}

      {phase === 'list' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {header('Itens da refeição')}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2">
            {mode === 'plan' && (
              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm" data-testid="meal-weigh-plan-next">
                <p className="font-semibold tabular-nums">{weighedPlanIdx.length} de {planned.alimentos.length} alimentos pesados</p>
                {nextPlanIdx != null ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Próximo: <strong className="text-foreground">{planned.alimentos[nextPlanIdx]?.alimento}</strong> ({planProgressLabel(nextPlanIdx, planned.alimentos.length)}). {NEXT_PLAN_FOOD_HINT}.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Todos os alimentos da refeição foram vistos.</p>
                )}
              </div>
            )}
            <ScanItemList items={items} planned={planned} onEdit={setEditingIndex} />
          </div>
          <div className="border-t border-border px-4 pt-2" data-testid="scan-list-totals">
            <p className="text-xs font-semibold mb-1">Total até agora · {Math.round(totals.gramas)} g</p>
            <MacroLine m={totals} />
          </div>
          <div className="px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            {mode === 'plan' ? (
              <Button variant="outline" className="flex-1 gap-1.5" disabled={nextPlanIdx == null} onClick={goNextPlanFood}>
                <Plus className="h-4 w-4" /> Próximo alimento da refeição
              </Button>
            ) : (
              <Button variant="outline" className="flex-1 gap-1.5" onClick={toCamera}>
                <Plus className="h-4 w-4" /> {mode === 'plate' ? 'Outra foto de prato' : 'Escanear mais'}
              </Button>
            )}
            <Button className="flex-1 gap-1.5 font-semibold" disabled={items.length === 0} onClick={() => conclude()}>
              Concluir refeição <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {header('Antes de concluir')}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3" data-testid="meal-weigh-review">
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-sm font-semibold">Você não pesou estes alimentos. Comeu?</p>
              <ul className="space-y-2">
                {pending.map((p) => {
                  const choice = unweighedChoices[p.index] ?? 'comeu_sem_pesar';
                  const amount = p.food.gramas != null ? `${Math.round(p.food.gramas)} g` : p.food.qty || '—';
                  return (
                    <li key={p.index} className="rounded-xl border border-border/60 bg-background/40 p-2.5" data-testid="meal-weigh-unweighed-row">
                      <p className="text-sm font-semibold">{p.food.alimento} <span className="font-normal text-muted-foreground">· previsto {amount}</span></p>
                      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`O que aconteceu com ${p.food.alimento}`}>
                        <Button size="sm" variant={choice === 'comeu_sem_pesar' ? 'default' : 'outline'} aria-pressed={choice === 'comeu_sem_pesar'}
                          onClick={() => chooseUnweighed(p.index, 'comeu_sem_pesar')}>Comi sem pesar</Button>
                        <Button size="sm" variant={choice === 'nao_comeu' ? 'default' : 'outline'} aria-pressed={choice === 'nao_comeu'}
                          onClick={() => chooseUnweighed(p.index, 'nao_comeu')}>Não comi</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {swapQuestions.map((ii) => {
              const it = items[ii];
              if (!it) return null;
              return (
                <div key={ii} className="rounded-2xl border border-primary/40 bg-primary/10 p-3 space-y-2" data-testid="meal-weigh-swap">
                  <p className="text-sm font-semibold">{substitutionQuestion(it.alimento)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {notEaten.map((u) => {
                      const active = it.substituiu?.indice_plano === u.indice_plano;
                      return (
                        <Button key={u.indice_plano} size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active}
                          onClick={() => setItems((prev) => applySubstitution(prev, ii, u))}>{u.alimento}</Button>
                      );
                    })}
                    <Button size="sm" variant={it.extra ? 'default' : 'outline'} aria-pressed={!!it.extra}
                      onClick={() => setItems((prev) => applySubstitution(prev, ii, null))}>Não, foi extra</Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            <Button variant="outline" onClick={() => setPhase('list')}>Voltar</Button>
            <Button className="flex-1 font-semibold" disabled={!swapsAnswered} onClick={() => setPhase('summary')}>
              Ver resumo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {header(isEdit ? 'Editar pesagem' : 'Resumo da refeição')}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3" data-testid="meal-weigh-summary">
            {isEdit && <p className="text-xs text-muted-foreground">Toque num alimento para trocar, mudar as gramas ou apagar.</p>}
            {isEdit && items.length === 0 && (
              <p className="rounded-xl border border-border bg-secondary/30 p-3 text-xs text-muted-foreground" data-testid="meal-weigh-empty-edit">
                Nenhum item registrado. Ao salvar, os alimentos do plano ficam como "Não comi".
              </p>
            )}
            <ScanItemList items={items} planned={planned} onEdit={setEditingIndex} />
            <div className="rounded-2xl border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold mb-2">Previsto × consumido</p>
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-muted-foreground"><th className="text-left font-medium" /><th className="text-right font-medium">Previsto</th><th className="text-right font-medium">Consumido</th><th className="text-right font-medium">Diferença</th></tr>
                </thead>
                <tbody>
                  {(['kcal', 'p', 'c', 'g'] as const).map((k) => (
                    <tr key={k} className="border-t border-border/40">
                      <td className="py-1.5">{k === 'kcal' ? 'Calorias' : k === 'p' ? 'Proteína' : k === 'c' ? 'Carboidrato' : 'Gordura'}</td>
                      <td className="text-right">{comparison.previsto[k]}{k === 'kcal' ? '' : ' g'}</td>
                      <td className="text-right font-bold">{comparison.consumido[k]}{k === 'kcal' ? '' : ' g'}</td>
                      <td className={`text-right ${comparison.diff[k] > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{signed(comparison.diff[k], k === 'kcal' ? '' : ' g')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(comparison.alimentos.length > 0 || comparison.foraDoPlano.length > 0 || comparison.naoPesados.length > 0 || unweighed.length > 0) && (
              <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-1.5 text-xs">
                <p className="font-semibold">Por alimento</p>
                {comparison.alimentos.map((a) => <p key={a.alimento}>{formatFoodComparison(a)}</p>)}
                {comparison.foraDoPlano.map((it, i) => (
                  <p key={`f${i}`} className="text-muted-foreground">
                    {it.alimento}: fora do plano, {it.origem === 'estimado' ? 'estimado ~' : 'pesou '}{Math.round(it.gramas)} g{formatSwapLine(it) ? ` · ${formatSwapLine(it)}` : ''}
                  </p>
                ))}
                {unweighed.map((u) => <p key={`u${u.indice_plano}`} className="text-muted-foreground">{formatUnweighedLine(u)}</p>)}
                {comparison.naoPesados.map((pf, i) => <p key={`n${i}`} className="text-muted-foreground">{pf.alimento}: previsto {pf.gramas != null ? `${Math.round(pf.gramas)} g` : pf.qty || '—'}, não pesado</p>)}
              </div>
            )}
            {testMode && <p className="text-center text-xs text-muted-foreground">Modo teste: nada é salvo.</p>}
          </div>
          <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            <Button variant="outline" onClick={() => setPhase(pending.length > 0 ? 'review' : 'list')}>Voltar</Button>
            <Button className="flex-1 font-semibold" disabled={saving || (items.length === 0 && !canSaveEmpty) || ((isEdit || isAdd) && !dirty)} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : testMode ? 'Fechar teste' : isEdit ? 'Salvar alterações' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {editingIndex != null && items[editingIndex] && (
        <WeighItemEditSheet
          key={editingIndex}
          item={items[editingIndex]}
          index={editingIndex}
          items={items}
          photo={photos[editingIndex] || null}
          planned={planned}
          foods={foods}
          onSave={(change) => applyItemEdit(editingIndex, change)}
          onDelete={() => deleteItem(editingIndex)}
          onClose={() => setEditingIndex(null)}
        />
      )}

      {applyAsk && (
        <div className="absolute inset-0 z-[75] flex flex-col justify-end bg-background/70" data-testid="scan-apply-sheet">
          <button type="button" aria-label="Voltar aos itens" className="flex-1" onClick={() => setApplyAsk(false)} />
          <div role="dialog" aria-modal="true" aria-label="O que fazer com o que você escaneou"
            className="rounded-t-3xl border-t border-border bg-card px-4 pt-4 animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
            <ScanApplyChoice
              initial={readScanApplyPref(typeof window !== 'undefined' ? window.localStorage : null)}
              summary={weighedChipsLabel(sessionScanItems(items, photos, priorRef.current).items)}
              onConfirm={applyScan}
              onCancel={() => setApplyAsk(false)}
            />
          </div>
        </div>
      )}

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>{isEdit ? 'As alterações desta pesagem não serão salvas.'
              : isAdd ? 'Os alimentos novos não serão salvos. Os que já estavam pesados continuam no seu dia.'
              : 'Os alimentos já pesados nesta refeição serão descartados.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar pesando</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  // Portal no body: nenhum container da página (overflow/transform) prende a tela
  // embaixo do menu inferior.
  return typeof document !== 'undefined' ? createPortal(screen, document.body) : screen;
};

export default MealWeighScreen;
