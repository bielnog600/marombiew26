import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  VOICE_FREQUENCY_LABELS, VOICE_FREQUENCY_ORDER, VOICE_MOMENT_LABELS, VOICE_MOMENT_ORDER,
  type VoiceFrequency, type VoiceMoment,
} from '@/lib/liveCorrection/voice/motivation';

interface Props {
  moment: VoiceMoment;
  frequency: VoiceFrequency;
  onMoment(v: VoiceMoment): void;
  onFrequency(v: VoiceFrequency): void;
  disabled?: boolean;
  /** Prefixo dos rótulos acessíveis (ex.: texto da fala). */
  label: string;
}

/** Campos "Quando tocar" e "Frequência" das falas de motivação. */
const MomentFrequencyFields: React.FC<Props> = ({ moment, frequency, onMoment, onFrequency, disabled, label }) => (
  <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">Quando tocar</span>
      <Select value={moment} onValueChange={(v) => onMoment(v as VoiceMoment)} disabled={disabled}>
        <SelectTrigger className="h-9" aria-label={`Quando tocar: ${label}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {VOICE_MOMENT_ORDER.map((m) => <SelectItem key={m} value={m}>{VOICE_MOMENT_LABELS[m]}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">Frequência</span>
      <Select value={frequency} onValueChange={(v) => onFrequency(v as VoiceFrequency)} disabled={disabled}>
        <SelectTrigger className="h-9" aria-label={`Frequência: ${label}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {VOICE_FREQUENCY_ORDER.map((f) => <SelectItem key={f} value={f}>{VOICE_FREQUENCY_LABELS[f]}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  </div>
);

export default MomentFrequencyFields;
