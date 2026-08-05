import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { getLatestStudentWeightKg } from '@/lib/studentWeight';
import { toast } from 'sonner';
import { Bot, Loader2, Upload, ImageIcon, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type ViewKey = 'front' | 'side' | 'back';

const VIEW_LABEL: Record<ViewKey, string> = {
  front: 'Frente',
  side: 'Lado',
  back: 'Costas',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName?: string | null;
  postureScans: any[];
  onSaved?: () => void;
}

interface AiResult {
  percentual_gordura?: number | null;
  margem_erro_pp?: number | null;
  confianca?: string | null;
  massa_gorda_kg?: number | null;
  massa_magra_kg?: number | null;
  imc?: number | null;
  classificacao?: string | null;
  somatotipo?: string | null;
  medidas_cm?: Record<string, number | null> | null;
  dobras_mm?: Record<string, number | null> | null;
  pontos_fortes?: string[];
  pontos_atencao?: string[];
  recomendacoes?: string[];
  limitacoes?: string[];
  relatorio_markdown?: string | null;
}

const MEASURE_LABELS: Record<string, string> = {
  pescoco: 'Pescoço', ombro: 'Ombro', torax: 'Tórax', cintura: 'Cintura',
  abdomen: 'Abdômen', quadril: 'Quadril', braco_direito: 'Braço D.',
  braco_esquerdo: 'Braço E.', antebraco: 'Antebraço', coxa_direita: 'Coxa D.',
  coxa_esquerda: 'Coxa E.', panturrilha_direita: 'Panturrilha D.', panturrilha_esquerda: 'Panturrilha E.',
};

const FOLD_LABELS: Record<string, string> = {
  triceps: 'Tríceps', subescapular: 'Subescapular', suprailiaca: 'Suprailíaca',
  abdominal: 'Abdominal', peitoral: 'Peitoral', axilar_media: 'Axilar média',
  coxa: 'Coxa', biceps: 'Bíceps', panturrilha_medial: 'Panturrilha medial',
};

const AiBodyCompositionDialog: React.FC<Props> = ({ open, onOpenChange, studentId, studentName, postureScans, onSaved }) => {
  const [photos, setPhotos] = useState<Record<ViewKey, string | null>>({ front: null, side: null, back: null });
  const [sexo, setSexo] = useState('');
  const [idade, setIdade] = useState<string>('');
  const [altura, setAltura] = useState<string>('');
  const [peso, setPeso] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<ViewKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const fileRefs = { front: useRef<HTMLInputElement>(null), side: useRef<HTMLInputElement>(null), back: useRef<HTMLInputElement>(null) };

  useEffect(() => {
    if (!open) return;
    setResult(null);
    (async () => {
      const { data: sp } = await supabase.from('students_profile').select('sexo, altura, data_nascimento').eq('user_id', studentId).maybeSingle();
      if (sp?.sexo) setSexo(sp.sexo);
      if (sp?.altura) setAltura(String(sp.altura));
      if (sp?.data_nascimento) {
        const dob = new Date(sp.data_nascimento);
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
        if (age > 0 && age < 120) setIdade(String(age));
      }
      const w = await getLatestStudentWeightKg(studentId);
      if (w) setPeso(String(w));
    })();
  }, [open, studentId]);

  const useScan = (scan: any) => {
    setPhotos({
      front: scan.front_photo_url ?? null,
      side: scan.side_photo_url ?? null,
      back: scan.back_photo_url ?? null,
    });
    if (scan.height_cm) setAltura(String(scan.height_cm));
    if (scan.sex) setSexo(scan.sex);
    toast.success('Fotos da análise postural carregadas.');
  };

  const handleUpload = async (view: ViewKey, file: File) => {
    setUploading(view);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${studentId}/ai-comp-${view}-${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('scan-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(data.path);
      setPhotos(p => ({ ...p, [view]: urlData.publicUrl }));
    } catch (e: any) {
      toast.error('Erro no upload: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setUploading(null);
    }
  };

  const analyze = async () => {
    if (!photos.front && !photos.side && !photos.back) {
      toast.error('Selecione ou envie ao menos uma foto.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('body-composition-ai', {
        body: {
          photos,
          sex: sexo || null,
          ageYears: idade ? Number(idade) : null,
          heightCm: altura ? Number(altura) : null,
          weightKg: peso ? Number(peso) : null,
          notes: notes || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult((data as any).result as AiResult);
      toast.success('Análise concluída.');
    } catch (e: any) {
      toast.error('Falha na análise: ' + (e?.message ?? 'erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const saveAsAssessment = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const avaliador = userData?.user?.id;
      if (!avaliador) throw new Error('Sessão expirada.');

      const { data: assessment, error: aErr } = await supabase
        .from('assessments')
        .insert({ student_id: studentId, avaliador_id: avaliador, notas_gerais: `Avaliação estimada por IA (foto-antropometria).${notes ? ' ' + notes : ''}` })
        .select('id')
        .single();
      if (aErr) throw aErr;

      const m = result.medidas_cm ?? {};
      const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null);
      await supabase.from('anthropometrics').insert({
        assessment_id: assessment.id,
        altura: altura ? Number(altura) : null,
        peso: peso ? Number(peso) : null,
        imc: num(result.imc),
        pescoco: num(m.pescoco), ombro: num(m.ombro), torax: num(m.torax),
        cintura: num(m.cintura), abdomen: num(m.abdomen), quadril: num(m.quadril),
        braco_direito: num(m.braco_direito), braco_esquerdo: num(m.braco_esquerdo),
        antebraco: num(m.antebraco), coxa_direita: num(m.coxa_direita), coxa_esquerda: num(m.coxa_esquerda),
        panturrilha_direita: num(m.panturrilha_direita), panturrilha_esquerda: num(m.panturrilha_esquerda),
      });

      await supabase.from('composition').insert({
        assessment_id: assessment.id,
        percentual_gordura: num(result.percentual_gordura),
        massa_gorda: num(result.massa_gorda_kg),
        massa_magra: num(result.massa_magra_kg),
        observacoes: `Estimativa por IA — confiança ${result.confianca ?? 'n/d'}${result.margem_erro_pp ? ` (±${result.margem_erro_pp} p.p.)` : ''}.`,
      });

      const d = result.dobras_mm ?? {};
      if (Object.values(d).some(v => typeof v === 'number')) {
        await supabase.from('skinfolds').insert({
          assessment_id: assessment.id,
          metodo: 'Estimativa IA (visual)',
          triceps: num(d.triceps), subescapular: num(d.subescapular), suprailiaca: num(d.suprailiaca),
          abdominal: num(d.abdominal), peitoral: num(d.peitoral), axilar_media: num(d.axilar_media),
          coxa: num(d.coxa), biceps: num(d.biceps), panturrilha_medial: num(d.panturrilha_medial),
        });
      }

      toast.success('Avaliação salva.');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Avaliação IA {studentName ? `— ${studentName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {postureScans.length > 0 && (
            <div className="space-y-2">
              <Label>Usar fotos de uma análise postural</Label>
              <div className="flex flex-wrap gap-2">
                {postureScans.slice(0, 6).map((s) => (
                  <Button key={s.id} size="sm" variant="outline" onClick={() => useScan(s)}>
                    <ImageIcon className="mr-1 h-3 w-3" />
                    {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {(['front', 'side', 'back'] as ViewKey[]).map((v) => (
              <div key={v} className="space-y-2">
                <Label className="text-xs">{VIEW_LABEL[v]}</Label>
                <div
                  className="aspect-[3/4] rounded-lg border border-border bg-muted/20 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => fileRefs[v].current?.click()}
                >
                  {uploading === v ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : photos[v] ? (
                    <img src={photos[v]!} alt={VIEW_LABEL[v]} className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={fileRefs[v]}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(v, f); e.currentTarget.value = ''; }}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Sexo</Label>
              <Input value={sexo} onChange={(e) => setSexo(e.target.value)} placeholder="masculino" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Idade</Label>
              <Input value={idade} onChange={(e) => setIdade(e.target.value)} inputMode="numeric" placeholder="30" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura (cm)</Label>
              <Input value={altura} onChange={(e) => setAltura(e.target.value)} inputMode="decimal" placeholder="175" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <Input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="80" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observações para a IA (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: atleta, fase de cutting, retenção hídrica..." />
          </div>

          <Button onClick={analyze} disabled={loading} className="w-full font-semibold">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando...</> : <><Bot className="mr-2 h-4 w-4" /> Analisar com IA</>}
          </Button>

          {result && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="glass-card"><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">% Gordura</p>
                  <p className="text-xl font-bold text-primary">{result.percentual_gordura ?? '—'}%</p>
                  {result.margem_erro_pp ? <p className="text-[10px] text-muted-foreground">±{result.margem_erro_pp} p.p.</p> : null}
                </CardContent></Card>
                <Card className="glass-card"><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Massa gorda</p>
                  <p className="text-xl font-bold">{result.massa_gorda_kg ?? '—'} kg</p>
                </CardContent></Card>
                <Card className="glass-card"><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Massa magra</p>
                  <p className="text-xl font-bold">{result.massa_magra_kg ?? '—'} kg</p>
                </CardContent></Card>
                <Card className="glass-card"><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">IMC</p>
                  <p className="text-xl font-bold">{result.imc ?? '—'}</p>
                </CardContent></Card>
              </div>

              <div className="flex flex-wrap gap-2">
                {result.confianca && <Badge variant="outline">Confiança: {result.confianca}</Badge>}
                {result.classificacao && <Badge variant="outline">{result.classificacao}</Badge>}
                {result.somatotipo && <Badge variant="outline">{result.somatotipo}</Badge>}
              </div>

              {result.medidas_cm && (
                <div>
                  <p className="text-sm font-semibold mb-2">Medidas antropométricas estimadas (cm)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(result.medidas_cm).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                      <div key={k} className="rounded-md border border-border p-2">
                        <p className="text-[10px] text-muted-foreground">{MEASURE_LABELS[k] ?? k}</p>
                        <p className="text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.dobras_mm && Object.values(result.dobras_mm).some(v => typeof v === 'number') && (
                <div>
                  <p className="text-sm font-semibold mb-2">Dobras cutâneas estimadas (mm)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(result.dobras_mm).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                      <div key={k} className="rounded-md border border-border p-2">
                        <p className="text-[10px] text-muted-foreground">{FOLD_LABELS[k] ?? k}</p>
                        <p className="text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.relatorio_markdown && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{result.relatorio_markdown}</ReactMarkdown>
                </div>
              )}

              {result.limitacoes && result.limitacoes.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold mb-1">Limitações</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {result.limitacoes.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              )}

              <Button onClick={saveAsAssessment} disabled={saving} className="w-full font-semibold">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> Salvar como avaliação</>}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiBodyCompositionDialog;
