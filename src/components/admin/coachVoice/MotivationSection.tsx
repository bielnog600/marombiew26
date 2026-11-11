import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { CoachVoiceTake } from '@/lib/coachVoice/api';
import {
  isVoiceFrequency, isVoiceMoment, type VoiceFrequency, type VoiceMoment,
} from '@/lib/liveCorrection/voice/motivation';
import PhraseCard, { type PhraseRow } from './PhraseCard';
import MomentFrequencyFields from './MomentFrequencyFields';
import ConfirmDeleteButton from './ConfirmDeleteButton';

export interface CustomPhrasePatch { momento?: VoiceMoment; frequencia?: VoiceFrequency; ativo?: boolean }

interface Props {
  rows: PhraseRow[];
  takesByKey: Map<string, CoachVoiceTake[]>;
  urls: Record<string, string>;
  busyKey: string | null;
  disabled: boolean;
  rowErrors: Record<string, string>;
  onGenerate(key: string): void;
  onApprove(take: CoachVoiceTake): void;
  onSaveText(key: string, text: string): void;
  onAdd(texto: string, momento: VoiceMoment, frequencia: VoiceFrequency): Promise<boolean>;
  onUpdate(key: string, patch: CustomPhrasePatch): void;
  onDelete(key: string): void;
}

/** Categoria "Motivação": falas que o admin escreve e escolhe quando tocam. */
const MotivationSection: React.FC<Props> = ({
  rows, takesByKey, urls, busyKey, disabled, rowErrors, onGenerate, onApprove, onSaveText, onAdd, onUpdate, onDelete,
}) => {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [moment, setMoment] = useState<VoiceMoment>('rep_completa');
  const [frequency, setFrequency] = useState<VoiceFrequency>('as_vezes');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    const ok = await onAdd(clean, moment, frequency);
    setSaving(false);
    if (ok) { setText(''); setAdding(false); }
  };

  return (
    <section className="space-y-2" data-testid="coach-voice-motivation">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Motivação</h2>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="coach-voice-add-phrase">
            <Plus className="h-4 w-4 mr-1" /> Adicionar fala
          </Button>
        )}
      </div>
      {adding && (
        <Card className="glass-card border-primary/40">
          <CardContent className="p-3 space-y-2">
            <Input
              autoFocus
              aria-label="Texto da nova fala"
              placeholder='Ex.: "Bora! Bora!", "Isso, mantém!", "Última! Vai!"'
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            />
            <MomentFrequencyFields label="nova fala" moment={moment} frequency={frequency} onMoment={setMoment} onFrequency={setFrequency} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setText(''); }}>Cancelar</Button>
              <Button size="sm" onClick={submit} disabled={!text.trim() || saving}>Salvar fala</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {!rows.length && !adding && (
        <p className="text-xs text-muted-foreground">Nenhuma fala de motivação ainda. Elas tocam só depois do número e da correção, no máximo 1 a cada 3 reps.</p>
      )}
      {rows.map((r) => (
        <PhraseCard
          key={r.phrase_key}
          phraseKey={r.phrase_key}
          defaultText={r.texto}
          row={r}
          takes={takesByKey.get(r.phrase_key) ?? []}
          urls={urls}
          busy={busyKey === r.phrase_key}
          disabled={disabled}
          error={rowErrors[r.phrase_key] ?? null}
          inactive={!r.ativo}
          onGenerate={() => onGenerate(r.phrase_key)}
          onApprove={onApprove}
          onSaveText={(t) => onSaveText(r.phrase_key, t)}
        >
          <MomentFrequencyFields
            label={r.texto}
            moment={isVoiceMoment(r.momento) ? r.momento : 'rep_completa'}
            frequency={isVoiceFrequency(r.frequencia) ? r.frequencia : 'sempre'}
            onMoment={(v) => onUpdate(r.phrase_key, { momento: v })}
            onFrequency={(v) => onUpdate(r.phrase_key, { frequencia: v })}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={r.ativo} onCheckedChange={(v) => onUpdate(r.phrase_key, { ativo: v })} aria-label={`Ativa: ${r.texto}`} />
              {r.ativo ? 'Ativa' : 'Desativada'}
            </label>
            <ConfirmDeleteButton
              label={`Apagar fala ${r.texto}`}
              title="Apagar esta fala?"
              description={`"${r.texto}" e as gravações dela saem da Correção ao vivo.`}
              onConfirm={() => onDelete(r.phrase_key)}
            />
          </div>
        </PhraseCard>
      ))}
    </section>
  );
};

export default MotivationSection;
