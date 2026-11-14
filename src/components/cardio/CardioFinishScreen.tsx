import React, { useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Star, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CardioProtocol } from '@/lib/cardioParser';
import { mmss } from '@/lib/cardioIntervals';
import { toneColor, type PhaseTone } from '@/lib/tabataPlayerView';
import {
  EFFORT_LABELS, FINISH_MODALITIES, estimateCardioKcal, type CardioFinishModality,
} from '@/lib/cardioPlayerView';

export interface CardioFinishValues {
  durationSec: number;
  durationEdited: boolean;
  rpe: number | null;
  rating: number | null;
  modality: CardioFinishModality;
  distanceKm: number | null;
  avgHeartRate: number | null;
  kcal: number | null;
  notes: string;
}

interface Props {
  protocol: CardioProtocol;
  durationSec: number;
  completedBlocks: number;
  totalBlocks: number;
  weightKg: number | null;
  preview?: boolean;
  saving?: boolean;
  onSubmit: (v: CardioFinishValues) => void;
  onClose: () => void;
}

const EFFORT_TONE: PhaseTone[] = ['rest', 'rest', 'moderado', 'forte', 'maximo'];
const parseNum = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() && Number.isFinite(n) ? n : null;
};

/** Tela cheia "Finalizar Cardio": duração real editável, Como foi?, estrelas, modalidade e detalhes. */
const CardioFinishScreen: React.FC<Props> = ({
  protocol, durationSec, completedBlocks, totalBlocks, weightKg, preview, saving, onSubmit, onClose,
}) => {
  const [duration, setDuration] = useState(Math.max(0, Math.round(durationSec)));
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [minText, setMinText] = useState('');
  const [secText, setSecText] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [modality, setModality] = useState<CardioFinishModality>(protocol.modality);
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const [kcalText, setKcalText] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const distanceKm = parseNum(distance);
  const estimated = useMemo(
    () => estimateCardioKcal({ modality, protocol, durationSec: duration, weightKg, distanceKm }),
    [modality, protocol, duration, weightKg, distanceKm],
  );
  const kcal = kcalText != null ? parseNum(kcalText) : estimated;

  const openEdit = () => {
    setMinText(String(Math.floor(duration / 60)));
    setSecText(String(duration % 60).padStart(2, '0'));
    setEditing(true);
  };
  const saveEdit = () => {
    const m = Math.max(0, Math.min(600, Math.round(Number(minText) || 0)));
    const s = Math.max(0, Math.min(59, Math.round(Number(secText) || 0)));
    const next = m * 60 + s;
    if (next > 0) { setDuration(next); setEdited(true); }
    setEditing(false);
  };

  const submit = () => onSubmit({
    durationSec: duration, durationEdited: edited, rpe, rating, modality, distanceKm,
    avgHeartRate: parseNum(hr), kcal: kcal != null ? Math.round(kcal) : null, notes,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-tabata-bg text-foreground"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      data-testid="cardio-finish"
    >
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose} className="h-10 w-10 rounded-full hover:bg-tabata-panel">
          <X className="h-5 w-5" />
        </Button>
        <p className="text-[11px] uppercase tracking-widest text-tabata-soft">Finalizar cardio</p>
        <span className="w-10" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-32 space-y-5">
        <div className="flex flex-col items-center text-center gap-2 pt-2">
          <div className="h-16 w-16 rounded-full flex items-center justify-center bg-tabata-brand/15">
            <Trophy className="h-8 w-8 text-tabata-brand" />
          </div>
          <h1 className="text-2xl font-black">Boa! Sessão concluída!</h1>
          {editing ? (
            <div className="flex items-center gap-2" data-testid="cardio-duration-edit">
              <Input aria-label="Minutos" inputMode="numeric" value={minText} onChange={e => setMinText(e.target.value)} className="h-10 w-16 text-center bg-tabata-panel border-tabata-border" />
              <span className="font-black">:</span>
              <Input aria-label="Segundos" inputMode="numeric" value={secText} onChange={e => setSecText(e.target.value)} className="h-10 w-16 text-center bg-tabata-panel border-tabata-border" />
              <Button size="icon" aria-label="Salvar duração" onClick={saveEdit} className="h-10 w-10 rounded-full bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90">
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-tabata-soft" data-testid="cardio-finish-duration">
              <span className="text-lg font-black tabular-nums text-foreground">{mmss(duration)}</span>
              <button type="button" aria-label="Editar duração" onClick={openEdit} className="rounded-full p-1.5 hover:bg-tabata-panel">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              · {completedBlocks} {completedBlocks === 1 ? 'fase' : 'fases'}{totalBlocks ? ` de ${totalBlocks}` : ''}
            </p>
          )}
        </div>

        <section className="rounded-2xl bg-tabata-panel p-4 space-y-3 border border-tabata-border">
          <p className="text-sm font-bold">Como foi?</p>
          <div role="radiogroup" aria-label="Como foi?" className="flex items-end justify-between gap-2 h-20">
            {EFFORT_LABELS.map((label, i) => {
              const v = i + 1;
              const active = rpe != null && v <= rpe;
              const tone = EFFORT_TONE[i];
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={rpe === v}
                  aria-label={label}
                  onClick={() => setRpe(v)}
                  className="flex-1 rounded-lg transition-all"
                  style={{
                    height: `${28 + i * 18}%`,
                    background: active ? toneColor(tone) : toneColor(tone, 0.16),
                    boxShadow: rpe === v ? `0 0 0 2px ${toneColor(tone)}` : undefined,
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-tabata-soft">
            <span>Muito fácil</span><span>Muito difícil</span>
          </div>
          <p className="text-center text-sm font-bold h-5" data-testid="cardio-effort-label">
            {rpe ? EFFORT_LABELS[rpe - 1] : <span className="font-normal text-tabata-soft">Toque numa barra</span>}
          </p>
        </section>

        <section className="rounded-2xl bg-tabata-panel p-4 space-y-3 border border-tabata-border">
          <p className="text-sm font-bold">Gostou da sessão?</p>
          <div role="radiogroup" aria-label="Gostou da sessão?" className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)} className="p-1"
              >
                <Star className={cn('h-8 w-8 transition-colors', rating && n <= rating ? 'fill-tabata-brand text-tabata-brand' : 'text-tabata-border')} />
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-bold">Modalidade</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modalidade">
            {FINISH_MODALITIES.map(m => (
              <button
                key={m.value} type="button" role="radio" aria-checked={modality === m.value}
                onClick={() => setModality(m.value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-bold border transition-colors',
                  modality === m.value ? 'bg-tabata-brand text-tabata-bg border-tabata-brand' : 'bg-tabata-panel border-tabata-border text-tabata-soft',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-tabata-panel p-4 space-y-3 border border-tabata-border">
          <p className="text-sm font-bold">Detalhes <span className="font-normal text-tabata-soft">(opcional)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] text-tabata-soft">Distância (km)</span>
              <Input inputMode="decimal" placeholder="0,0" value={distance} onChange={e => setDistance(e.target.value)} className="bg-tabata-bg border-tabata-border" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-tabata-soft">FC média (bpm)</span>
              <Input inputMode="numeric" placeholder="—" value={hr} onChange={e => setHr(e.target.value)} className="bg-tabata-bg border-tabata-border" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] text-tabata-soft">Calorias estimadas</span>
            <Input
              inputMode="numeric" aria-label="Calorias estimadas"
              value={kcalText ?? String(estimated)}
              onChange={e => setKcalText(e.target.value)}
              className="bg-tabata-bg border-tabata-border"
            />
            <span className="text-[11px] text-tabata-soft" data-testid="cardio-kcal-estimate">
              ~{estimated} kcal estimado{weightKg ? '' : ' (peso padrão 70 kg)'}
              {kcalText != null && (
                <button type="button" className="ml-2 underline" onClick={() => setKcalText(null)}>usar estimativa</button>
              )}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-tabata-soft">Observação</span>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Como se sentiu, ajustes na máquina…" className="min-h-[72px] bg-tabata-bg border-tabata-border" />
          </label>
        </section>
        {preview && <p className="text-center text-[11px] text-tabata-soft">Pré-visualização: nada é salvo.</p>}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 px-4 pt-3 bg-tabata-bg border-t border-tabata-border"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <Button
          onClick={submit} disabled={saving}
          className="h-14 w-full rounded-2xl text-base font-black uppercase tracking-wider bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Concluir cardio'}
        </Button>
      </div>
    </div>
  );
};

export default CardioFinishScreen;
