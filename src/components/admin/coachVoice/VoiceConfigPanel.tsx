import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { ElevenModelOption, ElevenVoice } from '@/lib/coachVoice/api';

export interface VoiceConfig {
  voice_id: string | null;
  voice_name: string | null;
  model_id: string | null;
  stability: number;
  similarity_boost: number;
  language_code: string;
  motivation_enabled: boolean;
  name_phrases_enabled: boolean;
}

interface Props {
  config: VoiceConfig;
  voices: ElevenVoice[];
  models: ElevenModelOption[];
  providerLoading: boolean;
  providerError: string | null;
  approved: number;
  total: number;
  onReloadProvider(): void;
  onSave(patch: Partial<VoiceConfig>): void;
  /** Só muda a tela enquanto arrasta (salva no fim). */
  onPreview(patch: Partial<VoiceConfig>): void;
}

const ToggleRow: React.FC<{ title: string; hint: string; checked: boolean; onChange(v: boolean): void; testId: string }> = ({ title, hint, checked, onChange, testId }) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} aria-label={title} data-testid={testId} />
  </div>
);

/** Aba "Configuração": voz, modelo, ajustes, chaves gerais e contador geral. */
const VoiceConfigPanel: React.FC<Props> = ({
  config, voices, models, providerLoading, providerError, approved, total, onReloadProvider, onSave, onPreview,
}) => (
  <div className="space-y-4">
    <Card className="glass-card">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <span className="text-sm" data-testid="coach-voice-counter">
          <span className="font-bold text-primary">{approved}</span> de {total} aprovadas
        </span>
        <span className="text-xs text-muted-foreground text-right">Só as aprovadas tocam na câmera; as outras usam a voz do celular.</span>
      </CardContent>
    </Card>

    <Card className="glass-card">
      <CardContent className="p-4 space-y-4">
        <ToggleRow
          title="Falas de motivação"
          hint="Liga ou desliga para todos os alunos. Cada aluno também tem a própria chave na ficha."
          checked={config.motivation_enabled}
          onChange={(v) => onSave({ motivation_enabled: v })}
          testId="coach-voice-motivation-toggle"
        />
        <ToggleRow
          title="Falas com nome do aluno"
          hint="Desligada: a câmera nunca toca as falas com nome. Nada é apagado."
          checked={config.name_phrases_enabled}
          onChange={(v) => onSave({ name_phrases_enabled: v })}
          testId="coach-voice-names-toggle"
        />
      </CardContent>
    </Card>

    <Card className="glass-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Sua voz no ElevenLabs</p>
            <p className="text-xs text-muted-foreground">Uma fala por arquivo. Os ajustes valem para as próximas gravações.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onReloadProvider} disabled={providerLoading} aria-label="Recarregar vozes">
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
              onValueChange={(id) => onSave({ voice_id: id, voice_name: voices.find((v) => v.voice_id === id)?.name ?? null })}
            >
              <SelectTrigger aria-label="Voz"><SelectValue placeholder={providerLoading ? 'Carregando…' : 'Escolha a voz'}>{config.voice_name ?? undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}{v.category ? ` · ${v.category}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Modelo</span>
            <Select value={config.model_id ?? undefined} onValueChange={(id) => onSave({ model_id: id })}>
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
                onValueChange={([v]) => onPreview({ [field]: v } as Partial<VoiceConfig>)}
                onValueCommit={([v]) => onSave({ [field]: v } as Partial<VoiceConfig>)}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="coach-voice-settings-hint">Padrão recomendado 0,20 / 1,0 (estabilidade / similaridade).</p>
        {!config.voice_id && !providerLoading && !providerError && <p className="text-xs text-muted-foreground">Escolha a voz para poder gerar.</p>}
      </CardContent>
    </Card>
  </div>
);

export default VoiceConfigPanel;
