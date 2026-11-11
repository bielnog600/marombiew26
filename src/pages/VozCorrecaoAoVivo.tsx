import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Mic, RefreshCw, Sparkles, Square } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  VOICE_CATALOG, VOICE_CATEGORY_LABELS, VOICE_CATEGORY_ORDER, type VoicePhrase,
} from '@/lib/liveCorrection/voice/phrases';
import { COACH_VOICE_BUCKET } from '@/lib/liveCorrection/voice/browserVoice';
import {
  callCoachVoice, findOwnVoice, type CoachVoiceTake, type ElevenModelOption, type ElevenVoice,
} from '@/lib/coachVoice/api';

interface VoiceConfig {
  voice_id: string | null;
  voice_name: string | null;
  model_id: string | null;
  stability: number;
  similarity_boost: number;
  language_code: string;
}
interface PhraseRow { phrase_key: string; texto: string; categoria: string; approved_take_id: string | null }

const DEFAULT_CONFIG: VoiceConfig = { voice_id: null, voice_name: null, model_id: null, stability: 0.4, similarity_boost: 1, language_code: 'pt' };
const SIGNED_URL_SECONDS = 60 * 60 * 6;

type Status = 'approved' | 'pending' | 'empty';
const statusOf = (row: PhraseRow | undefined, takes: CoachVoiceTake[]): Status =>
  row?.approved_take_id && takes.some((t) => t.id === row.approved_take_id) ? 'approved' : takes.length ? 'pending' : 'empty';

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  approved: { label: 'Aprovada', className: 'bg-primary/15 text-primary border-primary/40' },
  pending: { label: 'Para aprovar', className: 'bg-secondary text-foreground border-border' },
  empty: { label: 'Sem áudio', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const VozCorrecaoAoVivo = () => {
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_CONFIG);
  const [rows, setRows] = useState<Map<string, PhraseRow>>(new Map());
  const [takes, setTakes] = useState<CoachVoiceTake[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [models, setModels] = useState<ElevenModelOption[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const stopBulkRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  const signTakes = useCallback(async (list: CoachVoiceTake[]) => {
    const paths = list.map((t) => t.file_path);
    if (!paths.length) return;
    const { data } = await supabase.storage.from(COACH_VOICE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    const next: Record<string, string> = {};
    for (const d of data ?? []) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
    setUrls((u) => ({ ...u, ...next }));
  }, []);

  const saveConfig = useCallback(async (patch: Partial<VoiceConfig>) => {
    const next = { ...configRef.current, ...patch };
    setConfig(next);
    const { error } = await supabase.from('coach_voice_config').upsert({ id: true, ...next });
    if (error) toast.error('Não foi possível salvar a configuração da voz.');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, ph] = await Promise.all([
        supabase.from('coach_voice_config').select('*').eq('id', true).maybeSingle(),
        supabase.from('coach_voice_phrases').select('phrase_key, texto, categoria, approved_take_id'),
      ]);
      if (cfg.error || ph.error) throw cfg.error ?? ph.error;
      if (cfg.data) {
        setConfig({
          voice_id: cfg.data.voice_id, voice_name: cfg.data.voice_name, model_id: cfg.data.model_id,
          stability: Number(cfg.data.stability), similarity_boost: Number(cfg.data.similarity_boost),
          language_code: cfg.data.language_code,
        });
      }
      let phraseRows = (ph.data ?? []) as PhraseRow[];
      // Fala nova no código entra na lista como "sem áudio".
      const known = new Set(phraseRows.map((r) => r.phrase_key));
      const missing = VOICE_CATALOG.filter((p) => !known.has(p.key));
      if (missing.length) {
        const { error } = await supabase.from('coach_voice_phrases').upsert(
          missing.map((p) => ({ phrase_key: p.key, texto: p.voiceText, categoria: VOICE_CATEGORY_LABELS[p.category] })),
          { onConflict: 'phrase_key', ignoreDuplicates: true },
        );
        if (error) throw error;
        const again = await supabase.from('coach_voice_phrases').select('phrase_key, texto, categoria, approved_take_id');
        if (again.error) throw again.error;
        phraseRows = (again.data ?? []) as PhraseRow[];
      }
      setRows(new Map(phraseRows.map((r) => [r.phrase_key, r])));
      const tk = await supabase.from('coach_voice_takes').select('*').order('created_at', { ascending: false });
      if (tk.error) throw tk.error;
      const list = (tk.data ?? []) as CoachVoiceTake[];
      setTakes(list);
      void signTakes(list);
    } catch {
      setLoadError('Não foi possível carregar as falas. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }, [signTakes]);

  const loadProvider = useCallback(async () => {
    setProviderLoading(true);
    setProviderError(null);
    try {
      const [v, m] = await Promise.all([
        callCoachVoice<{ voices: ElevenVoice[] }>({ action: 'list_voices' }),
        callCoachVoice<{ models: ElevenModelOption[]; default_model_id: string }>({ action: 'list_models' }),
      ]);
      setVoices(v.voices ?? []);
      setModels(m.models ?? []);
      const patch: Partial<VoiceConfig> = {};
      if (!configRef.current.voice_id) {
        const own = findOwnVoice(v.voices ?? []);
        if (own) { patch.voice_id = own.voice_id; patch.voice_name = own.name; }
      }
      if (!configRef.current.model_id && m.default_model_id) patch.model_id = m.default_model_id;
      if (Object.keys(patch).length) await saveConfig(patch);
    } catch (e) {
      setProviderError(e instanceof Error ? e.message : 'Não foi possível falar com o ElevenLabs.');
    } finally {
      setProviderLoading(false);
    }
  }, [saveConfig]);

  useEffect(() => { void load().then(loadProvider); }, [load, loadProvider]);

  const takesByKey = useMemo(() => {
    const m = new Map<string, CoachVoiceTake[]>();
    for (const t of takes) m.set(t.phrase_key, [...(m.get(t.phrase_key) ?? []), t]);
    return m;
  }, [takes]);

  const approvedCount = VOICE_CATALOG.filter((p) => statusOf(rows.get(p.key), takesByKey.get(p.key) ?? []) === 'approved').length;
  const emptyPhrases = VOICE_CATALOG.filter((p) => !(takesByKey.get(p.key)?.length));

  const generate = useCallback(async (key: string): Promise<boolean> => {
    setBusyKey(key);
    setRowErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    try {
      const { take } = await callCoachVoice<{ take: CoachVoiceTake }>({ action: 'generate', phrase_key: key });
      setTakes((list) => [take, ...list]);
      void signTakes([take]);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível gerar.';
      setRowErrors((errs) => ({ ...errs, [key]: msg }));
      throw new Error(msg);
    } finally {
      setBusyKey(null);
    }
  }, [signTakes]);

  const generateAll = async () => {
    const list = emptyPhrases.map((p) => p.key);
    if (!list.length) return;
    stopBulkRef.current = false;
    setBulkError(null);
    setBulk({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      if (stopBulkRef.current) break;
      try {
        await generate(list[i]);
        setBulk({ done: i + 1, total: list.length });
      } catch (e) {
        const phrase = rows.get(list[i])?.texto ?? list[i];
        setBulkError(`Parou em "${phrase}": ${e instanceof Error ? e.message : 'erro'}`);
        break;
      }
    }
    setBulk(null);
  };

  const approve = async (take: CoachVoiceTake) => {
    const { error } = await supabase.rpc('approve_coach_voice_take', { _take_id: take.id });
    if (error) { toast.error('Não foi possível aprovar. Tente de novo.'); return; }
    setTakes((list) => list.map((t) => (t.phrase_key === take.phrase_key ? { ...t, approved: t.id === take.id } : t)));
    setRows((m) => {
      const n = new Map(m);
      const r = n.get(take.phrase_key);
      if (r) n.set(take.phrase_key, { ...r, approved_take_id: take.id });
      return n;
    });
  };

  const saveText = async (key: string, texto: string) => {
    const clean = texto.trim();
    const row = rows.get(key);
    if (!row || !clean || clean === row.texto) return;
    const { error } = await supabase.from('coach_voice_phrases').update({ texto: clean }).eq('phrase_key', key);
    if (error) { toast.error('Não foi possível salvar o texto.'); return; }
    setRows((m) => new Map(m).set(key, { ...row, texto: clean }));
  };

  const ready = !!config.voice_id;
  const running = bulk != null;

  return (
    <AppLayout title="Voz da Correção ao vivo">
      <div className="max-w-3xl mx-auto space-y-4 pb-10" data-testid="coach-voice-page">
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sua voz no ElevenLabs</p>
                <p className="text-xs text-muted-foreground">Uma fala por arquivo. Só as aprovadas tocam na câmera; as outras usam a voz do celular.</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadProvider} disabled={providerLoading}>
                {providerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {providerError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{providerError}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Voz</span>
                <Select
                  value={config.voice_id ?? undefined}
                  onValueChange={(id) => void saveConfig({ voice_id: id, voice_name: voices.find((v) => v.voice_id === id)?.name ?? null })}
                >
                  <SelectTrigger aria-label="Voz"><SelectValue placeholder={providerLoading ? 'Carregando…' : 'Escolha a voz'}>{config.voice_name ?? undefined}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}{v.category ? ` · ${v.category}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Modelo</span>
                <Select value={config.model_id ?? undefined} onValueChange={(id) => void saveConfig({ model_id: id })}>
                  <SelectTrigger aria-label="Modelo"><SelectValue placeholder={providerLoading ? 'Carregando…' : 'Escolha o modelo'}>{models.find((m) => m.model_id === config.model_id)?.name ?? config.model_id ?? undefined}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => <SelectItem key={m.model_id} value={m.model_id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([['stability', 'Estabilidade'], ['similarity_boost', 'Similaridade']] as const).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <div className="flex justify-between text-xs"><span className="font-medium text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{config[field].toFixed(2)}</span></div>
                  <Slider
                    aria-label={label}
                    min={0} max={1} step={0.05}
                    value={[config[field]]}
                    onValueChange={([v]) => setConfig((c) => ({ ...c, [field]: v }))}
                    onValueCommit={([v]) => void saveConfig({ [field]: v } as Partial<VoiceConfig>)}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {running ? (
                <Button variant="outline" onClick={() => { stopBulkRef.current = true; }}>
                  <Square className="h-4 w-4 mr-1.5" /> Parar
                </Button>
              ) : (
                <Button onClick={generateAll} disabled={!ready || !emptyPhrases.length || busyKey != null || loading} data-testid="coach-voice-generate-all">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Gerar todas sem áudio ({emptyPhrases.length})
                </Button>
              )}
              <span className="text-sm" data-testid="coach-voice-counter">
                <span className="font-bold text-primary">{approvedCount}</span> de {VOICE_CATALOG.length} aprovadas
              </span>
            </div>
            {bulk && (
              <div className="space-y-1">
                <Progress value={(bulk.done / bulk.total) * 100} />
                <p className="text-xs text-muted-foreground">Gerando {Math.min(bulk.done + 1, bulk.total)} de {bulk.total}…</p>
              </div>
            )}
            {bulkError && <p className="text-sm text-destructive" role="alert">{bulkError}</p>}
            {!ready && !providerLoading && !providerError && <p className="text-xs text-muted-foreground">Escolha a voz para poder gerar.</p>}
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        ) : loadError ? (
          <Card className="glass-card"><CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>Tentar de novo</Button>
          </CardContent></Card>
        ) : (
          VOICE_CATEGORY_ORDER.map((cat) => {
            const list = VOICE_CATALOG.filter((p) => p.category === cat);
            if (!list.length) return null;
            return (
              <section key={cat} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{VOICE_CATEGORY_LABELS[cat]}</h2>
                {list.map((p) => (
                  <PhraseCard
                    key={p.key}
                    phrase={p}
                    row={rows.get(p.key)}
                    takes={takesByKey.get(p.key) ?? []}
                    urls={urls}
                    busy={busyKey === p.key}
                    disabled={!ready || busyKey != null || running}
                    error={rowErrors[p.key] ?? null}
                    onGenerate={() => generate(p.key).catch(() => undefined)}
                    onApprove={approve}
                    onSaveText={(t) => saveText(p.key, t)}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </AppLayout>
  );
};

interface PhraseCardProps {
  phrase: VoicePhrase;
  row: PhraseRow | undefined;
  takes: CoachVoiceTake[];
  urls: Record<string, string>;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onGenerate(): void;
  onApprove(take: CoachVoiceTake): void;
  onSaveText(text: string): void;
}

const PhraseCard: React.FC<PhraseCardProps> = ({ phrase, row, takes, urls, busy, disabled, error, onGenerate, onApprove, onSaveText }) => {
  const [text, setText] = useState(row?.texto ?? phrase.voiceText);
  useEffect(() => { setText(row?.texto ?? phrase.voiceText); }, [row?.texto, phrase.voiceText]);
  const status = statusOf(row, takes);
  const badge = STATUS_BADGE[status];
  return (
    <Card className="glass-card" data-testid={`coach-voice-phrase-${phrase.key}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label={`Texto da fala ${phrase.text}`}
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onSaveText(text)}
            className="h-9 flex-1"
          />
          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.className)}>{badge.label}</span>
        </div>
        {text.trim() !== phrase.text && <p className="text-[11px] text-muted-foreground">Na câmera: “{phrase.text}”</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" variant={takes.length ? 'outline' : 'default'} onClick={onGenerate} disabled={disabled}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mic className="h-3.5 w-3.5 mr-1.5" />}
            {takes.length ? 'Gerar de novo' : 'Gerar'}
          </Button>
          {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
        </div>
        {takes.length > 0 && (
          <ul className="space-y-1.5">
            {takes.map((t, i) => {
              const approved = row?.approved_take_id === t.id;
              return (
                <li key={t.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-2', approved ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                  <span className="text-[11px] text-muted-foreground w-24 shrink-0">Versão {takes.length - i} · {formatWhen(t.created_at)}</span>
                  {urls[t.file_path]
                    ? <audio controls preload="none" src={urls[t.file_path]} className="h-8 flex-1 min-w-[160px]" />
                    : <span className="flex-1 text-xs text-muted-foreground">Carregando áudio…</span>}
                  {approved ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Aprovada</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onApprove(t)}>Aprovar</Button>
                  )}
                  {t.texto !== (row?.texto ?? '') && <span className="basis-full text-[11px] text-muted-foreground">Gerada com: “{t.texto}”</span>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default VozCorrecaoAoVivo;
