import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { VOICE_CATALOG, VOICE_CATEGORY_LABELS, type VoicePhrase } from '@/lib/liveCorrection/voice/phrases';
import { COACH_VOICE_BUCKET } from '@/lib/liveCorrection/voice/browserVoice';
import { TABATA_VOICE_CATALOG, TABATA_VOICE_MOMENTS } from '@/lib/coachVoice/tabataVoiceCatalog';
import {
  callCoachVoice, findOwnVoice, type CoachVoiceTake, type ElevenModelOption, type ElevenVoice,
} from '@/lib/coachVoice/api';
import {
  VOICE_TABS, VOICE_TAB_LABELS, approvalCount, correctionGroups, emptyKeys, matchesFilter,
  readLastVoiceTab, saveLastVoiceTab, systemPhrasesForTab, isVoiceTab,
  type PhraseFilter, type VoiceTab,
} from '@/lib/coachVoice/voiceTabs';
import {
  customPhraseKey, isVoiceFrequency, isVoiceMoment, namePhraseKey, planNamePhrases,
  type NameStudent, type NameTemplate, type VoiceFrequency, type VoiceMoment,
} from '@/lib/liveCorrection/voice/motivation';
import PhraseCard, { PHRASE_COLUMNS, statusOf, type PhraseRow } from '@/components/admin/coachVoice/PhraseCard';
import MotivationSection, { type CustomPhrasePatch } from '@/components/admin/coachVoice/MotivationSection';
import NamePhrasesSection, { type TemplatePatch } from '@/components/admin/coachVoice/NamePhrasesSection';
import VoiceConfigPanel, { type VoiceConfig } from '@/components/admin/coachVoice/VoiceConfigPanel';
import VoiceTabToolbar from '@/components/admin/coachVoice/VoiceTabToolbar';

const DEFAULT_CONFIG: VoiceConfig = {
  voice_id: null, voice_name: null, model_id: null, stability: 0.4, similarity_boost: 1, language_code: 'pt',
  motivation_enabled: true, name_phrases_enabled: false,
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
  const [bulk, setBulk] = useState<{ scope: VoiceTab; done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<{ scope: VoiceTab; message: string } | null>(null);
  const [tab, setTab] = useState<VoiceTab>(() => (location.hash.startsWith('#nome-') ? 'nomes' : readLastVoiceTab()));
  const [filters, setFilters] = useState<Partial<Record<VoiceTab, PhraseFilter>>>({});
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
          name_phrases_enabled: cfg.data.name_phrases_enabled === true,
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
      const missing = [...VOICE_CATALOG, ...TABATA_VOICE_CATALOG].filter((p) => !known.has(p.key));
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
    if (!location.hash.startsWith('#nome-')) return;
    setTab('nomes');
    if (loading) return;
    const id = location.hash.slice(1);
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return () => window.clearTimeout(t);
  }, [loading, location.hash]);

  const changeTab = (value: string) => {
    if (!isVoiceTab(value)) return;
    setTab(value);
    saveLastVoiceTab(value);
  };

  const takesByKey = useMemo(() => {
    const m = new Map<string, CoachVoiceTake[]>();
    for (const t of takes) m.set(t.phrase_key, [...(m.get(t.phrase_key) ?? []), t]);
    return m;
  }, [takes]);

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
  const statusForKey = useCallback((key: string) => statusOf(rows.get(key), takesByKey.get(key) ?? []), [rows, takesByKey]);
  const groups = useMemo(() => correctionGroups(VOICE_CATALOG), []);
  /** Chaves de cada aba (contador) e as que o "Gerar sem áudio desta aba" pode gerar. */
  const tabKeys = useMemo(() => {
    const sys = (t: VoiceTab) => systemPhrasesForTab(VOICE_CATALOG, t).map((p) => p.key);
    return {
      numeros: sys('numeros'), comandos: sys('comandos'), correcoes: sys('correcoes'),
      tabata: TABATA_VOICE_CATALOG.map((p) => p.key),
      motivacao: customRows.map((r) => r.phrase_key), nomes: nameKeys,
    } as Record<Exclude<VoiceTab, 'config'>, string[]>;
  }, [customRows, nameKeys]);
  const generatableKeys = (t: Exclude<VoiceTab, 'config'>) => {
    const keys = t === 'motivacao' ? customRows.filter((r) => r.ativo).map((r) => r.phrase_key) : tabKeys[t];
    return emptyKeys(keys, statusForKey);
  };
  /** Contador geral: o que pode tocar hoje (sistema + motivação ativa + com nome se ligadas). */
  const overall = approvalCount([
    ...VOICE_CATALOG.map((p) => p.key),
    ...TABATA_VOICE_CATALOG.map((p) => p.key),
    ...customRows.filter((r) => r.ativo).map((r) => r.phrase_key),
    ...(config.name_phrases_enabled ? nameKeys : []),
  ], statusForKey);
  const filterOf = (t: VoiceTab): PhraseFilter => filters[t] ?? 'todas';
  const visible = (t: VoiceTab, key: string) => matchesFilter(statusForKey(key), filterOf(t));

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

  const runBulk = async (scope: VoiceTab, list: string[]) => {
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

  const systemCard = (p: VoicePhrase) => (
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
  );

  const toolbar = (t: Exclude<VoiceTab, 'config'>, extra: { label?: string; testId?: string; hide?: boolean } = {}) => {
    const { approved, total } = approvalCount(tabKeys[t], statusForKey);
    const pending = generatableKeys(t);
    return (
      <VoiceTabToolbar
        tab={t}
        approved={approved}
        total={total}
        filter={filterOf(t)}
        onFilter={(f) => setFilters((m) => ({ ...m, [t]: f }))}
        pending={pending.length}
        generateLabel={extra.label}
        generateTestId={extra.testId}
        hideGenerate={extra.hide}
        disabled={!ready || busyKey != null || loading || running}
        bulk={bulk?.scope === t ? bulk : null}
        bulkError={bulkError?.scope === t ? bulkError.message : null}
        onGenerate={() => runBulk(t, pending)}
        onStop={() => { stopBulkRef.current = true; }}
      />
    );
  };

  const body = (content: () => React.ReactNode) => (loading ? (
    <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
  ) : loadError ? (
    <Card className="glass-card"><CardContent className="p-4 flex items-center justify-between gap-3">
      <p className="text-sm text-destructive">{loadError}</p>
      <Button size="sm" variant="outline" onClick={load}>Tentar de novo</Button>
    </CardContent></Card>
  ) : content());

  const empty = <p className="text-xs text-muted-foreground px-1">Nenhuma fala neste filtro.</p>;
  const systemList = (t: 'numeros' | 'comandos') => {
    const list = systemPhrasesForTab(VOICE_CATALOG, t).filter((p) => visible(t, p.key));
    if (!list.length) return empty;
    if (t === 'numeros') return <div className="space-y-2">{list.map(systemCard)}</div>;
    // Comandos: início/fim e posição em blocos.
    const cats = [...new Set(list.map((p) => p.category))];
    return (
      <div className="space-y-4">
        {cats.map((c) => (
          <section key={c} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{VOICE_CATEGORY_LABELS[c]}</h2>
            {list.filter((p) => p.category === c).map(systemCard)}
          </section>
        ))}
      </div>
    );
  };

  const corrections = () => {
    const shown = groups
      .map((g) => ({ g, list: g.phrases.filter((p) => visible('correcoes', p.key)) }))
      .filter((x) => x.list.length);
    if (!shown.length) return empty;
    return (
      <Accordion type="multiple" className="space-y-2">
        {shown.map(({ g, list }) => {
          const c = approvalCount(g.phrases.map((p) => p.key), statusForKey);
          return (
            <AccordionItem key={g.id} value={g.id} className="glass-card rounded-2xl border border-border/60 px-3" data-testid={`coach-voice-group-${g.id}`}>
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums"><span className="font-bold text-primary">{c.approved}</span> de {c.total}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">{list.map(systemCard)}</AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  };

  return (
    <AppLayout title="Voz da Correção ao vivo">
      <div className="max-w-3xl mx-auto pb-10" data-testid="coach-voice-page">
        <Tabs value={tab} onValueChange={changeTab} className="space-y-3">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card p-1">
            {VOICE_TABS.map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                data-testid={`coach-voice-tab-${t}`}
              >
                {VOICE_TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="config" className="mt-0">
            <VoiceConfigPanel
              config={config}
              voices={voices}
              models={models}
              providerLoading={providerLoading}
              providerError={providerError}
              approved={overall.approved}
              total={overall.total}
              onReloadProvider={loadProvider}
              onSave={(patch) => void saveConfig(patch)}
              onPreview={(patch) => setConfig((c) => ({ ...c, ...patch }))}
            />
          </TabsContent>

          <TabsContent value="numeros" className="mt-0 space-y-3">
            {toolbar('numeros')}
            {body(() => systemList('numeros'))}
          </TabsContent>

          <TabsContent value="comandos" className="mt-0 space-y-3">
            {toolbar('comandos')}
            {body(() => systemList('comandos'))}
          </TabsContent>

          <TabsContent value="correcoes" className="mt-0 space-y-3">
            {toolbar('correcoes')}
            {body(corrections)}
          </TabsContent>

          <TabsContent value="tabata" className="mt-0 space-y-3">
            {toolbar('tabata')}
            <p className="px-1 text-xs text-muted-foreground">
              Falas do Player do TABATA. Depois de aprovadas, tocam no celular do aluno nos momentos abaixo; sem áudio aprovado, o Player usa o bipe.
            </p>
            {body(() => {
              const list = TABATA_VOICE_CATALOG.filter((p) => visible('tabata', p.key));
              if (!list.length) return empty;
              return (
                <div className="space-y-2">
                  {list.map((p) => (
                    <div key={p.key} className="space-y-1">
                      <p className="px-1 text-[11px] font-semibold text-muted-foreground">{TABATA_VOICE_MOMENTS[p.key]}</p>
                      {systemCard(p)}
                    </div>
                  ))}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="motivacao" className="mt-0 space-y-3">
            {toolbar('motivacao')}
            {body(() => (
              <MotivationSection
                rows={customRows.filter((r) => visible('motivacao', r.phrase_key))}
                hasAny={customRows.length > 0}
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
            ))}
          </TabsContent>

          <TabsContent value="nomes" className="mt-0 space-y-3">
            {toolbar('nomes', { label: 'Gerar falas com nome', testId: 'coach-voice-generate-names', hide: !config.name_phrases_enabled })}
            {body(() => (
              <NamePhrasesSection
                templates={templates}
                students={students}
                rowsByKey={rows}
                takesByKey={takesByKey}
                urls={urls}
                busyKey={busyKey}
                disabled={cardDisabled}
                rowErrors={rowErrors}
                enabled={config.name_phrases_enabled}
                onToggleEnabled={(v) => void saveConfig({ name_phrases_enabled: v })}
                visible={(k) => visible('nomes', k)}
                onGenerate={(k) => generate(k).catch(() => undefined)}
                onApprove={approve}
                onTemplateAdd={addTemplate}
                onTemplateUpdate={updateTemplate}
                onTemplateDelete={deleteTemplate}
                onVoiceNameSave={saveVoiceName}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default VozCorrecaoAoVivo;
