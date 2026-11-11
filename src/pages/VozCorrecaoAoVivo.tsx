import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, RefreshCw, Sparkles, Square } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  VOICE_CATALOG, VOICE_CATEGORY_LABELS, VOICE_CATEGORY_ORDER,
} from '@/lib/liveCorrection/voice/phrases';
import { COACH_VOICE_BUCKET } from '@/lib/liveCorrection/voice/browserVoice';
import {
  callCoachVoice, findOwnVoice, type CoachVoiceTake, type ElevenModelOption, type ElevenVoice,
} from '@/lib/coachVoice/api';
import {
  customPhraseKey, isVoiceFrequency, isVoiceMoment, namePhraseKey, planNamePhrases,
  type NameStudent, type NameTemplate, type VoiceFrequency, type VoiceMoment,
} from '@/lib/liveCorrection/voice/motivation';
import PhraseCard, { PHRASE_COLUMNS, type PhraseRow } from '@/components/admin/coachVoice/PhraseCard';
import MotivationSection, { type CustomPhrasePatch } from '@/components/admin/coachVoice/MotivationSection';
import NamePhrasesSection, { type TemplatePatch } from '@/components/admin/coachVoice/NamePhrasesSection';

interface VoiceConfig {
  voice_id: string | null;
  voice_name: string | null;
  model_id: string | null;
  stability: number;
  similarity_boost: number;
  language_code: string;
  motivation_enabled: boolean;
}

const DEFAULT_CONFIG: VoiceConfig = {
  voice_id: null, voice_name: null, model_id: null, stability: 0.4, similarity_boost: 1, language_code: 'pt', motivation_enabled: true,
};
const SIGNED_URL_SECONDS = 60 * 60 * 6;
const MOTIVATION_CATEGORY = 'Motivação';

const toTemplate = (r: any): NameTemplate => ({
  id: r.id, texto: r.texto,
  momento: isVoiceMoment(r.momento) ? r.momento : 'rep_completa',
  frequencia: isVoiceFrequency(r.frequencia) ? r.frequencia : 'as_vezes',
  ativo: r.ativo !== false,
});

const VozCorrecaoAoVivo = () => {
  const location = useLocation();
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_CONFIG);
  const [rows, setRows] = useState<Map<string, PhraseRow>>(new Map());
  const [takes, setTakes] = useState<CoachVoiceTake[]>([]);
  const [templates, setTemplates] = useState<NameTemplate[]>([]);
  const [students, setStudents] = useState<NameStudent[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [models, setModels] = useState<ElevenModelOption[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ scope: 'system' | 'names'; done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<{ scope: 'system' | 'names'; message: string } | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const stopBulkRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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

  const fetchPhrases = useCallback(async () => {
    const { data, error } = await supabase.from('coach_voice_phrases').select(PHRASE_COLUMNS);
    if (error) throw error;
    return (data ?? []) as PhraseRow[];
  }, []);

  /** Cria/atualiza as falas "modelo × aluno premium" (aluno novo aparece como "sem áudio"). */
  const syncNames = useCallback(async (tpls: NameTemplate[], studs: NameStudent[], current: PhraseRow[]) => {
    const { upserts } = planNamePhrases(tpls, studs, current.filter((r) => r.tipo === 'nome'));
    if (!upserts.length) return current;
    const { error } = await supabase.from('coach_voice_phrases').upsert(upserts, { onConflict: 'phrase_key' });
    if (error) throw error;
    return fetchPhrases();
  }, [fetchPhrases]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, phraseRows0, tpl, sp] = await Promise.all([
        supabase.from('coach_voice_config').select('*').eq('id', true).maybeSingle(),
        fetchPhrases(),
        supabase.from('coach_voice_templates').select('*').order('created_at'),
        supabase.from('students_profile').select('user_id, voice_name').eq('premium_camera', true),
      ]);
      if (cfg.error || tpl.error || sp.error) throw cfg.error ?? tpl.error ?? sp.error;
      if (cfg.data) {
        const loaded: VoiceConfig = {
          voice_id: cfg.data.voice_id, voice_name: cfg.data.voice_name, model_id: cfg.data.model_id,
          stability: Number(cfg.data.stability), similarity_boost: Number(cfg.data.similarity_boost),
          language_code: cfg.data.language_code, motivation_enabled: cfg.data.motivation_enabled !== false,
        };
        configRef.current = loaded;
        setConfig(loaded);
      }
      const ids = (sp.data ?? []).map((s) => s.user_id);
      const prof = ids.length
        ? await supabase.from('profiles').select('user_id, nome').in('user_id', ids)
        : { data: [] as { user_id: string; nome: string | null }[], error: null };
      if (prof.error) throw prof.error;
      const nameById = new Map((prof.data ?? []).map((p) => [p.user_id, p.nome]));
      const studs: NameStudent[] = (sp.data ?? [])
        .map((s) => ({ user_id: s.user_id, voice_name: s.voice_name, nome: nameById.get(s.user_id) ?? null }))
        .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
      const tpls = (tpl.data ?? []).map(toTemplate);

      let phraseRows = phraseRows0;
      // Fala nova no código entra na lista como "sem áudio".
      const known = new Set(phraseRows.map((r) => r.phrase_key));
      const missing = VOICE_CATALOG.filter((p) => !known.has(p.key));
      if (missing.length) {
        const { error } = await supabase.from('coach_voice_phrases').upsert(
          missing.map((p) => ({ phrase_key: p.key, texto: p.voiceText, categoria: VOICE_CATEGORY_LABELS[p.category] })),
          { onConflict: 'phrase_key', ignoreDuplicates: true },
        );
        if (error) throw error;
        phraseRows = await fetchPhrases();
      }
      phraseRows = await syncNames(tpls, studs, phraseRows);
      setTemplates(tpls);
      setStudents(studs);
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
  }, [fetchPhrases, signTakes, syncNames]);

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

  // Atalho da ficha do aluno: #nome-<id> rola até as falas dele.
  useEffect(() => {
    if (loading || !location.hash.startsWith('#nome-')) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash]);

  const takesByKey = useMemo(() => {
    const m = new Map<string, CoachVoiceTake[]>();
    for (const t of takes) m.set(t.phrase_key, [...(m.get(t.phrase_key) ?? []), t]);
    return m;
  }, [takes]);

  const approvedCount = VOICE_CATALOG.filter((p) => {
    const r = rows.get(p.key);
    return r?.approved_take_id && (takesByKey.get(p.key) ?? []).some((t) => t.id === r.approved_take_id);
  }).length;
  const emptyPhrases = VOICE_CATALOG.filter((p) => !(takesByKey.get(p.key)?.length));
  const customRows = useMemo(() => [...rows.values()].filter((r) => r.tipo === 'personalizada'), [rows]);
  /** Falas com nome que contam agora: modelo ativo × aluno premium, com linha criada. */
  const nameKeys = useMemo(() => {
    const keys: string[] = [];
    for (const s of students) for (const t of templates) {
      if (!t.ativo) continue;
      const key = namePhraseKey(t.id, s.user_id);
      if (rows.has(key)) keys.push(key);
    }
    return keys;
  }, [students, templates, rows]);
  const emptyNameKeys = nameKeys.filter((k) => !(takesByKey.get(k)?.length));

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

  const runBulk = async (scope: 'system' | 'names', list: string[]) => {
    if (!list.length) return;
    stopBulkRef.current = false;
    setBulkError(null);
    setBulk({ scope, done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      if (stopBulkRef.current) break;
      try {
        await generate(list[i]);
        setBulk({ scope, done: i + 1, total: list.length });
      } catch (e) {
        const phrase = rowsRef.current.get(list[i])?.texto ?? list[i];
        setBulkError({ scope, message: `Parou em "${phrase}": ${e instanceof Error ? e.message : 'erro'}` });
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

  const patchRow = (key: string, patch: Partial<PhraseRow>) =>
    setRows((m) => { const r = m.get(key); return r ? new Map(m).set(key, { ...r, ...patch }) : m; });

  const saveText = async (key: string, texto: string) => {
    const clean = texto.trim();
    const row = rows.get(key);
    if (!row || !clean || clean === row.texto) return;
    const { error } = await supabase.from('coach_voice_phrases').update({ texto: clean }).eq('phrase_key', key);
    if (error) { toast.error('Não foi possível salvar o texto.'); return; }
    patchRow(key, { texto: clean });
  };

  // --- Motivação (personalizadas) ---
  const addCustom = async (texto: string, momento: VoiceMoment, frequencia: VoiceFrequency) => {
    const row = {
      phrase_key: customPhraseKey(crypto.randomUUID()), texto, categoria: MOTIVATION_CATEGORY,
      tipo: 'personalizada' as const, momento, frequencia, ativo: true,
    };
    const { data, error } = await supabase.from('coach_voice_phrases').insert(row).select(PHRASE_COLUMNS).single();
    if (error || !data) { toast.error('Não foi possível adicionar a fala.'); return false; }
    setRows((m) => new Map(m).set(row.phrase_key, data as PhraseRow));
    return true;
  };
  const updateCustom = async (key: string, patch: CustomPhrasePatch) => {
    const before = rows.get(key);
    patchRow(key, patch);
    const { error } = await supabase.from('coach_voice_phrases').update(patch).eq('phrase_key', key);
    if (error) { toast.error('Não foi possível salvar.'); if (before) patchRow(key, before); }
  };
  const deleteCustom = async (key: string) => {
    const { error } = await supabase.from('coach_voice_phrases').delete().eq('phrase_key', key).eq('tipo', 'personalizada');
    if (error) { toast.error('Não foi possível apagar.'); return; }
    setRows((m) => { const n = new Map(m); n.delete(key); return n; });
    setTakes((list) => list.filter((t) => t.phrase_key !== key));
  };

  // --- Falas com nome ---
  const resync = async (tpls: NameTemplate[], studs: NameStudent[]) => {
    try {
      const next = await syncNames(tpls, studs, [...rowsRef.current.values()]);
      setRows(new Map(next.map((r) => [r.phrase_key, r])));
    } catch {
      toast.error('Não foi possível atualizar as falas com nome.');
    }
  };
  const addTemplate = async () => {
    const { data, error } = await supabase.from('coach_voice_templates')
      .insert({ texto: 'Bora, {nome}!', momento: 'rep_completa', frequencia: 'as_vezes' }).select('*').single();
    if (error || !data) { toast.error('Não foi possível criar o modelo.'); return; }
    const next = [...templates, toTemplate(data)];
    setTemplates(next);
    await resync(next, students);
  };
  const updateTemplate = async (id: string, patch: TemplatePatch) => {
    const { error } = await supabase.from('coach_voice_templates').update(patch).eq('id', id);
    if (error) { toast.error('Não foi possível salvar o modelo.'); return; }
    const next = templates.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTemplates(next);
    if (patch.texto || patch.momento || patch.frequencia) await resync(next, students);
  };
  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from('coach_voice_templates').delete().eq('id', id);
    if (error) { toast.error('Não foi possível apagar o modelo.'); return; }
    setTemplates((list) => list.filter((t) => t.id !== id));
    setRows((m) => { const n = new Map(m); for (const [k, r] of m) if (r.template_id === id) n.delete(k); return n; });
  };
  const saveVoiceName = async (userId: string, value: string) => {
    const student = students.find((s) => s.user_id === userId);
    if (!student) return;
    const clean = value.trim();
    const firstName = (student.nome ?? '').trim().split(/\s+/)[0] ?? '';
    const stored = clean && clean !== firstName ? clean : null;
    if (stored === (student.voice_name ?? null)) return;
    const { error } = await supabase.from('students_profile').update({ voice_name: stored }).eq('user_id', userId);
    if (error) { toast.error('Não foi possível salvar o nome.'); return; }
    const next = students.map((s) => (s.user_id === userId ? { ...s, voice_name: stored } : s));
    setStudents(next);
    await resync(templates, next);
  };

  const ready = !!config.voice_id;
  const running = bulk != null;
  const cardDisabled = !ready || busyKey != null || running;

  return (
    <AppLayout title="Voz da Correção ao vivo">
      <div className="max-w-3xl mx-auto space-y-4 pb-10" data-testid="coach-voice-page">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Falas de motivação</p>
              <p className="text-xs text-muted-foreground">Liga ou desliga para todos os alunos. Cada aluno também tem a própria chave na ficha.</p>
            </div>
            <Switch
              checked={config.motivation_enabled}
              onCheckedChange={(v) => void saveConfig({ motivation_enabled: v })}
              aria-label="Falas de motivação"
              data-testid="coach-voice-motivation-toggle"
            />
          </CardContent>
        </Card>

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
              {bulk?.scope === 'system' ? (
                <Button variant="outline" onClick={() => { stopBulkRef.current = true; }}>
                  <Square className="h-4 w-4 mr-1.5" /> Parar
                </Button>
              ) : (
                <Button onClick={() => runBulk('system', emptyPhrases.map((p) => p.key))} disabled={!ready || !emptyPhrases.length || busyKey != null || loading || running} data-testid="coach-voice-generate-all">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Gerar todas sem áudio ({emptyPhrases.length})
                </Button>
              )}
              <span className="text-sm" data-testid="coach-voice-counter">
                <span className="font-bold text-primary">{approvedCount}</span> de {VOICE_CATALOG.length} aprovadas
              </span>
            </div>
            {bulk?.scope === 'system' && (
              <div className="space-y-1">
                <Progress value={(bulk.done / bulk.total) * 100} />
                <p className="text-xs text-muted-foreground">Gerando {Math.min(bulk.done + 1, bulk.total)} de {bulk.total}…</p>
              </div>
            )}
            {bulkError?.scope === 'system' && <p className="text-sm text-destructive" role="alert">{bulkError.message}</p>}
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
          <>
            {VOICE_CATEGORY_ORDER.map((cat) => {
              const list = VOICE_CATALOG.filter((p) => p.category === cat);
              if (!list.length) return null;
              return (
                <section key={cat} className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{VOICE_CATEGORY_LABELS[cat]}</h2>
                  {list.map((p) => (
                    <PhraseCard
                      key={p.key}
                      phraseKey={p.key}
                      defaultText={p.voiceText}
                      cameraText={p.text}
                      row={rows.get(p.key)}
                      takes={takesByKey.get(p.key) ?? []}
                      urls={urls}
                      busy={busyKey === p.key}
                      disabled={cardDisabled}
                      error={rowErrors[p.key] ?? null}
                      onGenerate={() => generate(p.key).catch(() => undefined)}
                      onApprove={approve}
                      onSaveText={(t) => saveText(p.key, t)}
                    />
                  ))}
                </section>
              );
            })}
            <MotivationSection
              rows={customRows}
              takesByKey={takesByKey}
              urls={urls}
              busyKey={busyKey}
              disabled={cardDisabled}
              rowErrors={rowErrors}
              onGenerate={(k) => generate(k).catch(() => undefined)}
              onApprove={approve}
              onSaveText={saveText}
              onAdd={addCustom}
              onUpdate={updateCustom}
              onDelete={deleteCustom}
            />
            <NamePhrasesSection
              templates={templates}
              students={students}
              rowsByKey={rows}
              takesByKey={takesByKey}
              urls={urls}
              busyKey={busyKey}
              disabled={cardDisabled}
              rowErrors={rowErrors}
              pendingCount={emptyNameKeys.length}
              bulk={bulk?.scope === 'names' ? bulk : null}
              bulkError={bulkError?.scope === 'names' ? bulkError.message : null}
              onGenerate={(k) => generate(k).catch(() => undefined)}
              onApprove={approve}
              onGenerateAll={() => runBulk('names', emptyNameKeys)}
              onStopAll={() => { stopBulkRef.current = true; }}
              onTemplateAdd={addTemplate}
              onTemplateUpdate={updateTemplate}
              onTemplateDelete={deleteTemplate}
              onVoiceNameSave={saveVoiceName}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default VozCorrecaoAoVivo;
