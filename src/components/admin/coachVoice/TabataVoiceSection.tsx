import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CoachVoiceTake } from '@/lib/coachVoice/api';
import {
  TABATA_ADD_OPTIONS, TABATA_GROUP_NOTE, TABATA_VOICE_MOMENT_INFO, TABATA_VOICE_SEEDS, defaultAddGroup, tabataVoiceGroup,
  type TabataMoment, type TabataVoiceGroup,
} from '@/lib/tabataVoiceCues';
import PhraseCard, { type PhraseRow } from './PhraseCard';
import ConfirmDeleteButton from './ConfirmDeleteButton';

interface Props {
  /** Todas as falas do TABATA (para saber se o grupo tem alguma aprovada). */
  rows: PhraseRow[];
  /** As que passam no filtro da aba. */
  isVisible(key: string): boolean;
  isApproved(key: string): boolean;
  takesByKey: Map<string, CoachVoiceTake[]>;
  urls: Record<string, string>;
  busyKey: string | null;
  disabled: boolean;
  rowErrors: Record<string, string>;
  onGenerate(key: string): void;
  onApprove(take: CoachVoiceTake): void;
  onSaveText(key: string, text: string): void;
  onAdd(group: TabataVoiceGroup, texto: string): Promise<boolean>;
  onDelete(key: string): void;
}

const seedOrder = new Map(TABATA_VOICE_SEEDS.map((s, i) => [s.key, i]));
const byOrder = (a: PhraseRow, b: PhraseRow) =>
  (seedOrder.get(a.phrase_key) ?? 999) - (seedOrder.get(b.phrase_key) ?? 999) || a.texto.localeCompare(b.texto, 'pt-BR');

/** Contagem toca quando há "3, 2, 1…" + largada aprovadas, ou a versão antiga com "bora!". */
function momentPlays(moment: TabataMoment, rows: PhraseRow[], isApproved: (k: string) => boolean): boolean {
  const has = (g: TabataVoiceGroup) => rows.some((r) => tabataVoiceGroup(r.phrase_key) === g && isApproved(r.phrase_key));
  if (moment === 'contagem' || moment === 'largada') return (has('contagem') && has('largada')) || has('contagembora');
  const info = TABATA_VOICE_MOMENT_INFO.find((m) => m.id === moment)!;
  return info.groups.some(has);
}

const AddVariation: React.FC<{ moment: TabataMoment; onAdd: Props['onAdd'] }> = ({ moment, onAdd }) => {
  const [text, setText] = useState('');
  const [group, setGroup] = useState<TabataVoiceGroup>(defaultAddGroup(moment));
  const [saving, setSaving] = useState(false);
  const options = TABATA_ADD_OPTIONS[moment];
  const submit = async () => {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    const ok = await onAdd(group, clean);
    setSaving(false);
    if (ok) setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`tabata-voice-add-${moment}`}>
      <Input
        aria-label={`Nova variação: ${moment}`}
        placeholder="Nova variação…"
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        className="h-9 flex-1 min-w-[160px]"
      />
      {options && (
        <Select value={group} onValueChange={(v) => setGroup(v as TabataVoiceGroup)}>
          <SelectTrigger className="h-9 w-[210px]" aria-label="Quando tocar"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.group} value={o.group}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Button size="sm" variant="outline" onClick={submit} disabled={!text.trim() || saving}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    </div>
  );
};

/** Aba TABATA: falas agrupadas por momento, cada grupo com várias variações. */
const TabataVoiceSection: React.FC<Props> = ({
  rows, isVisible, isApproved, takesByKey, urls, busyKey, disabled, rowErrors, onGenerate, onApprove, onSaveText, onAdd, onDelete,
}) => (
  <div className="space-y-5" data-testid="tabata-voice-section">
    {TABATA_VOICE_MOMENT_INFO.map((m) => {
      const groupRows = rows.filter((r) => {
        const g = tabataVoiceGroup(r.phrase_key);
        return g != null && m.groups.includes(g);
      }).sort(byOrder);
      const shown = groupRows.filter((r) => isVisible(r.phrase_key));
      const approved = groupRows.filter((r) => isApproved(r.phrase_key)).length;
      const plays = momentPlays(m.id, rows, isApproved);
      return (
        <section key={m.id} className="space-y-2" data-testid={`tabata-voice-moment-${m.id}`}>
          <div className="px-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{m.title}</h2>
              <span className={cn('text-[11px]', plays ? 'text-muted-foreground' : 'text-destructive')}>
                {approved} de {groupRows.length} aprovadas{plays ? '' : ' · toca o bipe'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{m.when}</p>
          </div>
          {shown.map((r) => {
            const g = tabataVoiceGroup(r.phrase_key)!;
            const note = TABATA_GROUP_NOTE[g];
            return (
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
                onGenerate={() => onGenerate(r.phrase_key)}
                onApprove={onApprove}
                onSaveText={(t) => onSaveText(r.phrase_key, t)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{note ?? ''}</span>
                  <ConfirmDeleteButton
                    label={`Remover variação ${r.texto}`}
                    title="Remover esta variação?"
                    description={`"${r.texto}" e as gravações dela deixam de tocar no Player do TABATA.`}
                    onConfirm={() => onDelete(r.phrase_key)}
                  />
                </div>
              </PhraseCard>
            );
          })}
          {groupRows.length > 0 && !shown.length && (
            <p className="px-1 text-xs text-muted-foreground">Nenhuma fala neste filtro.</p>
          )}
          <AddVariation moment={m.id} onAdd={onAdd} />
        </section>
      );
    })}
  </div>
);

export default TabataVoiceSection;
