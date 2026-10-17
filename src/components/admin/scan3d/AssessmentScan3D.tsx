import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SCAN_CUTS, scanValues, validateScanUpload, type ScanMeasurements } from '@/lib/assessment3dGeometry';
import type { CaptureScan } from './ScanViewer';

const Viewer = lazy(() => import('./ScanViewer'));
type ScanRow = Database['public']['Tables']['assessment_3d_scans']['Row'];
export interface ScanAnalysisInput { id: string; measurements: Record<string, number>; photos: { front: string; side: string; back: string } }
interface Props { studentId: string; height: number; onApply: (values: Record<string, number>) => void; onReady: (prepare: (() => Promise<ScanAnalysisInput>) | null) => void }

export default function AssessmentScan3D({ studentId, height, onApply, onReady }: Props) {
  const [rows, setRows] = useState<ScanRow[]>([]), [selected, setSelected] = useState<ScanRow | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [loadingRows, setLoadingRows] = useState(true);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [settings, setSettings] = useState<ScanMeasurements>({}), [measures, setMeasures] = useState<ScanMeasurements>({});
  const [up, setUp] = useState('y'), [turn, setTurn] = useState(0), [unit, setUnit] = useState(100);
  const [originalHeight, setOriginalHeight] = useState(0), [scaleWarning, setScaleWarning] = useState(false), [measuring, setMeasuring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), captureRef = useRef<CaptureScan | null>(null);
  const loadRows = async () => {
    const { data, error: e } = await supabase.from('assessment_3d_scans').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(100);
    if (e) throw e; setRows(data ?? []); return data ?? [];
  };
  useEffect(() => {
    let cancelled = false;
    setLoadingRows(true); setSelected(null); setBytes(null); onReady(null);
    loadRows().catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoadingRows(false); });
    return () => { cancelled = true; onReady(null); };
  }, [studentId]);
  const openScan = async (row: ScanRow) => {
    setBusy(true); setError(''); setBytes(null); onReady(null); setMeasures({});
    try {
      const { data, error: e } = await supabase.storage.from('avaliacoes-3d').download(row.storage_path);
      if (e || !data) throw e ?? new Error('Arquivo indisponível.');
      const s = row.settings as { up?: string; turn?: number; unit?: number };
      setUp(s.up ?? 'y'); setTurn(s.turn ?? 0); setUnit(s.unit ?? (row.format === 'obj' || row.format === 'glb' ? 100 : 1));
      setSettings((row.measurements ?? {}) as unknown as ScanMeasurements); setSelected(row); setMeasuring(true); setBytes(await data.arrayBuffer());
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível abrir o scan.'); } finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    setBusy(true); setError(''); let inserted: ScanRow | null = null;
    try {
      const format = validateScanUpload(file.name, file.size, consent);
      if (!(height > 0)) throw new Error('Informe a altura do aluno antes de importar.');
      const buffer = await file.arrayBuffer();
      const { loadScanModel, disposeScan } = await import('./scanModel');
      const parsed = await loadScanModel(buffer, format); disposeScan(parsed);
      const id = crypto.randomUUID(), path = `${studentId}/${id}/model.${format}`;
      const { data, error: e } = await supabase.from('assessment_3d_scans').insert({ id, student_id: studentId, storage_path: path, file_name: file.name, format, file_bytes: file.size, consent_given: true, height_cm: height }).select('*').single();
      if (e) throw e; inserted = data;
      const { error: uploadError } = await supabase.storage.from('avaliacoes-3d').upload(path, file, { contentType: 'application/octet-stream', upsert: false });
      if (uploadError) throw uploadError;
      setConsent(false); await loadRows(); await openScan(data); toast.success('Scan importado com consentimento registrado.');
    } catch (e) {
      if (inserted) { await supabase.storage.from('avaliacoes-3d').remove([inserted.storage_path]); await supabase.from('assessment_3d_scans').delete().eq('id', inserted.id); }
      setError(e instanceof Error ? e.message : 'Falha ao importar o scan.');
    } finally { setBusy(false); }
  };
  const persist = async () => {
    if (!selected) throw new Error('Selecione um scan.');
    if (measuring || error || !Object.keys(measures).length) throw new Error('Aguarde o cálculo dos cortes.');
    const { error: e } = await supabase.from('assessment_3d_scans').update({ measurements: measures as unknown as Json, settings: { up, turn, unit }, height_cm: height, original_height_cm: originalHeight }).eq('id', selected.id);
    if (e) throw e; await loadRows();
  };
  useEffect(() => {
    if (!selected || !bytes || measuring || error || !Object.keys(scanValues(measures)).length) { onReady(null); return; }
    onReady(async () => {
      if (!captureRef.current) throw new Error('Aguarde o visualizador 3D.');
      await persist(); return { id: selected.id, measurements: scanValues(measures), photos: await captureRef.current() };
    });
  }, [selected, bytes, measures, measuring, error, height, up, turn, unit]);
  const remove = async () => {
    if (!selected) return; setBusy(true);
    try {
      const { error: e } = await supabase.storage.from('avaliacoes-3d').remove([selected.storage_path]); if (e) throw e;
      const { error: d } = await supabase.from('assessment_3d_scans').delete().eq('id', selected.id); if (d) throw d;
      setSelected(null); setBytes(null); setMeasures({}); setSettings({}); onReady(null); await loadRows(); toast.success('Scan apagado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível apagar o scan.'); } finally { setBusy(false); }
  };
  const previous = selected ? rows.find(r => r.created_at < selected.created_at && Object.keys((r.measurements ?? {}) as object).length > 0) : null;
  const adjust = (key: string, value: Partial<ScanMeasurements[string]>) => {
    setMeasuring(true); setSettings(current => ({ ...measures, ...current, [key]: { ...measures[key], ...current[key], ...value } }));
  };
  return <section className="space-y-3 border-t border-border pt-4">
    <h3 className="text-sm font-semibold">Scan 3D</h3>
    <div className="flex items-start gap-2"><Checkbox id="scan-consent" checked={consent} onCheckedChange={v => setConsent(v === true)} disabled={busy} /><Label htmlFor="scan-consent" className="text-xs leading-relaxed">O aluno autorizou o escaneamento 3D e o armazenamento do modelo</Label></div>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={!consent || busy || loadingRows} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Importar scan 3D</Button>
      {selected && <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 h-4 w-4" />Apagar scan</Button>}
    </div>
    <input ref={fileRef} type="file" accept=".obj,.ply,.glb" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
    {loadingRows && <p className="text-xs text-muted-foreground" role="status">Carregando scans…</p>}
    {rows.length > 0 && <Select value={selected?.id ?? ''} onValueChange={id => { const row = rows.find(r => r.id === id); if (row) void openScan(row); }} disabled={busy}><SelectTrigger aria-label="Scans anteriores"><SelectValue placeholder="Abrir scan importado" /></SelectTrigger><SelectContent>{rows.map(r => <SelectItem key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString('pt-BR')} · {r.file_name}</SelectItem>)}</SelectContent></Select>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {selected && bytes && height > 0 && <>
      <p className="text-xs text-muted-foreground">Consentimento registrado em {new Date(selected.consent_at).toLocaleString('pt-BR')} · Importado por administrador ({selected.imported_by.slice(0, 8)})</p>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Eixo vertical</Label><Select value={up} onValueChange={v => { setUp(v); setSettings({}); setMeasuring(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['y','z','x'].map(v => <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Unidade original</Label><Select value={String(unit)} onValueChange={v => { setUnit(Number(v)); setMeasuring(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="100">Metros</SelectItem><SelectItem value="1">Centímetros</SelectItem><SelectItem value="0.1">Milímetros</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs">Frente do modelo</Label><Select value={String(turn)} onValueChange={v => { setTurn(Number(v)); setSettings({}); setMeasuring(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0,90,180,270].map(v => <SelectItem key={v} value={String(v)}>{v}°</SelectItem>)}</SelectContent></Select></div>
      </div>
      <Suspense fallback={<p role="status" className="p-6 text-center">Carregando visualizador…</p>}><Viewer bytes={bytes} format={selected.format} height={height} up={up} turn={turn} unit={unit} settings={settings} captureRef={captureRef} onError={message => { setError(message); setMeasuring(false); onReady(null); }} onMeasured={(m, original, warning) => { setMeasures(m); setOriginalHeight(original); setScaleWarning(warning); setMeasuring(false); }} /></Suspense>
      {scaleWarning && <p role="alert" className="text-xs text-primary">Altura original {originalHeight.toFixed(1)} cm difere mais de 5% da altura cadastrada ({height} cm). Modelo reescalado; confira eixo, unidade e pés.</p>}
      {measuring && <p className="text-xs text-muted-foreground" role="status">Calculando cortes…</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{SCAN_CUTS.map(cut => {
        const m = measures[cut.key]; if (!m) return null;
        const before = previous ? (previous.measurements as unknown as ScanMeasurements)[cut.key]?.value : null;
        return <div key={cut.key} className="space-y-2 border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2"><Label htmlFor={`measure-${cut.key}`} className="text-xs">{cut.label} (cm)</Label><Input id={`measure-${cut.key}`} className="h-8 w-24" type="number" min="0" step="0.1" value={m.value ?? ''} onChange={e => adjust(cut.key, { manual: true, value: e.target.value && Number(e.target.value) > 0 ? Number(e.target.value) : null })} /></div>
          <Slider aria-label={`Altura do corte ${cut.label}`} min={5} max={90} step={0.5} value={[m.percent]} onValueChange={v => adjust(cut.key, { percent: v[0], manual: false })} />
          <div className="flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{m.percent}% da altura{m.manual ? ' · corrigido manualmente' : ''}</span><span>{typeof before === 'number' && typeof m.value === 'number' ? `${m.value - before >= 0 ? '+' : ''}${(m.value - before).toFixed(1)} cm vs. anterior` : m.value === null ? 'Contorno não isolado' : ''}</span></div>
        </div>;
      })}</div>
      {previous && <p className="text-xs text-muted-foreground">Comparação com scan de {new Date(previous.created_at).toLocaleDateString('pt-BR')}.</p>}
      <Button variant="outline" disabled={busy || measuring || !!error || !Object.keys(scanValues(measures)).length} onClick={async () => { setBusy(true); try { await persist(); onApply(scanValues(measures)); toast.success('Perímetros do scan aplicados nas medidas da avaliação.'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao aplicar.'); } finally { setBusy(false); } }}>Aplicar nas medidas da avaliação</Button>
      <p className="text-xs text-muted-foreground">Perímetros aproximados do scan 3D. Contornos unidos ou incompletos precisam de conferência. A gordura estimada pelo formato do corpo não substitui dobras cutâneas.</p>
    </>}
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apagar scan 3D?</AlertDialogTitle><AlertDialogDescription>O modelo e o registro do scan serão removidos. A avaliação já salva não será apagada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Apagar scan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}