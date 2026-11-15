import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { CardioBlock, CardioBlockIntensity, CardioBlockType, CardioProtocol } from '@/lib/cardioParser';
import { isHardBlock, mmss, repeatIntervalPair } from '@/lib/cardioIntervals';

const TYPES: Array<{ value: CardioBlockType; label: string }> = [
  { value: 'aquecimento', label: 'Aquecimento' },
  { value: 'principal', label: 'Principal' },
  { value: 'pico', label: 'Pico' },
  { value: 'recuperacao', label: 'Recuperação' },
  { value: 'desaceleracao', label: 'Desaceleração' },
];
const INTENSITIES: Array<{ value: CardioBlockIntensity; label: string }> = [
  { value: 'leve', label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'forte', label: 'Forte' },
  { value: 'maxima', label: 'Máxima' },
];

/** Posição na bike (opcional): "—" = não definido. */
const NO_POSITION = 'none';
const BIKE_POSITIONS: Array<{ value: NonNullable<CardioBlock['bikePosition']> | typeof NO_POSITION; label: string }> = [
  { value: NO_POSITION, label: '—' },
  { value: 'sentado', label: 'Sentado' },
  { value: 'em_pe', label: 'Em pé' },
  { value: 'alternado', label: 'Alternado' },
];

/** "2:30" / "150" / "2,5" → segundos. */
export function parseDurationInput(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Math.min(59, Number(m[2]));
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 10 && t.includes(',') ? n * 60 : n);
}

const numOrUndef = (v: string) => {
  const t = v.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const totalMin = (blocks: CardioBlock[]) => Math.round(blocks.reduce((s, b) => s + (b.durationSec || 0), 0) / 60);

const NumField: React.FC<{ label: string; value?: number; onChange: (v: number | undefined) => void }> = ({ label, value, onChange }) => {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  return (
    <label className="space-y-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal" value={text} className="h-8 text-xs"
        onChange={e => { setText(e.target.value); onChange(numOrUndef(e.target.value)); }}
      />
    </label>
  );
};

const DurationField: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [text, setText] = useState(mmss(value));
  return (
    <label className="space-y-0.5">
      <span className="text-[10px] text-muted-foreground">Tempo (min:seg)</span>
      <Input
        value={text} className="h-8 text-xs" placeholder="2:00"
        onChange={e => { setText(e.target.value); const s = parseDurationInput(e.target.value); if (s) onChange(s); }}
        onBlur={() => setText(mmss(value))}
      />
    </label>
  );
};

/** Editor das etapas de uma sessão de cardio (admin). Só altera o plano que está na tela até salvar. */
const CardioBlocksEditor: React.FC<{ protocol: CardioProtocol; onChange: (p: CardioProtocol) => void }> = ({ protocol, onChange }) => {
  const blocks = protocol.blocks;
  const [rounds, setRounds] = useState('8');
  const [version, setVersion] = useState(0);
  const firstHard = blocks.findIndex(b => isHardBlock(b) && b.type !== 'aquecimento' && b.type !== 'desaceleracao');
  const [pairIndex, setPairIndex] = useState<number>(Math.max(0, firstHard));

  const commit = (next: CardioBlock[], remount = false) => {
    onChange({ ...protocol, blocks: next, totalDurationMin: totalMin(next) });
    if (remount) setVersion(v => v + 1);
  };
  const update = (i: number, patch: Partial<CardioBlock>) => commit(blocks.map((b, k) => {
    if (k !== i) return b;
    const next = { ...b, ...patch } as CardioBlock;
    if ('bikePosition' in patch && !patch.bikePosition) delete next.bikePosition;
    return next;
  }));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next, true);
  };
  const remove = (i: number) => commit(blocks.filter((_, k) => k !== i), true);
  const add = (i: number) => {
    const base = blocks[i] ?? blocks[blocks.length - 1];
    const fresh: CardioBlock = base ? { ...base, notes: undefined } : { name: 'Nova etapa', type: 'principal', durationSec: 60, intensityLabel: 'moderada' };
    const next = [...blocks];
    next.splice(i + 1, 0, fresh);
    commit(next, true);
  };
  const repeat = () => {
    const out = repeatIntervalPair(protocol, Number(rounds), pairIndex);
    if (!out) { toast.error('Escolha uma etapa forte que tenha uma recuperação logo depois.'); return; }
    onChange(out);
    setVersion(v => v + 1);
    toast.success(`Par repetido ${rounds}×.`);
  };

  const showSpeed = protocol.modality === 'passadeira';
  const showLevel = protocol.modality !== 'passadeira';
  const showCadence = protocol.modality === 'bike' || protocol.modality === 'eliptica';
  const showSteps = protocol.modality === 'escada';
  const showPosition = protocol.modality === 'bike';

  return (
    <div className="space-y-3" data-testid="cardio-blocks-editor">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5" /> Repetir par forte/recuperação
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-0.5 flex-1 min-w-[160px]">
            <span className="text-[10px] text-muted-foreground">Par (etapa forte + a seguinte)</span>
            <Select value={String(pairIndex)} onValueChange={v => setPairIndex(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {blocks.slice(0, -1).map((b, i) => (
                  <SelectItem key={i} value={String(i)}>{i + 1}. {b.name} + {blocks[i + 1].name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-0.5 w-20">
            <span className="text-[10px] text-muted-foreground">× ciclos</span>
            <Input inputMode="numeric" value={rounds} onChange={e => setRounds(e.target.value.replace(/\D/g, ''))} className="h-8 text-xs" />
          </label>
          <Button type="button" size="sm" className="h-8" onClick={repeat} disabled={!Number(rounds)}>Repetir</Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Mantém o aquecimento e a desaceleração; troca os ciclos do meio.</p>
      </div>

      {blocks.map((b, i) => (
        <div key={`${version}-${i}`} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
            <Input value={b.name} onChange={e => update(i, { name: e.target.value })} className="h-8 text-sm font-semibold flex-1" aria-label={`Nome da etapa ${i + 1}`} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => add(i)} aria-label="Duplicar etapa"><Plus className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(i)} disabled={blocks.length <= 1} aria-label="Remover etapa"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DurationField value={b.durationSec} onChange={v => update(i, { durationSec: v })} />
            <label className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Tipo</span>
              <Select value={b.type} onValueChange={v => update(i, { type: v as CardioBlockType })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Intensidade</span>
              <Select value={b.intensityLabel} onValueChange={v => update(i, { intensityLabel: v as CardioBlockIntensity })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">{INTENSITIES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Zona</span>
              <Input value={b.targetZone ?? ''} placeholder="Z2" onChange={e => update(i, { targetZone: e.target.value || undefined })} className="h-8 text-xs" />
            </label>
            {showSpeed && <NumField label="Velocidade (km/h)" value={b.speedKmh} onChange={v => update(i, { speedKmh: v })} />}
            {showSpeed && <NumField label="Inclinação (%)" value={b.inclinePct} onChange={v => update(i, { inclinePct: v })} />}
            {showLevel && <NumField label="Nível" value={b.resistanceLevel} onChange={v => update(i, { resistanceLevel: v })} />}
            {showCadence && <NumField label={protocol.modality === 'bike' ? 'Cadência (rpm)' : 'Passadas (spm)'} value={b.cadenceRpm} onChange={v => update(i, { cadenceRpm: v })} />}
            {showSteps && <NumField label="Degraus/min" value={b.stepsPerMin} onChange={v => update(i, { stepsPerMin: v })} />}
            {showPosition && (
              <label className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground">Posição</span>
                <Select
                  value={b.bikePosition ?? NO_POSITION}
                  onValueChange={v => update(i, { bikePosition: v === NO_POSITION ? undefined : (v as CardioBlock['bikePosition']) })}
                >
                  <SelectTrigger className="h-8 text-xs" aria-label={`Posição da etapa ${i + 1}`}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">{BIKE_POSITIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            )}
          </div>
          <Input value={b.notes ?? ''} placeholder="Notas (opcional)" onChange={e => update(i, { notes: e.target.value || undefined })} className="h-8 text-xs" />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-1" onClick={() => add(blocks.length - 1)}>
        <Plus className="h-3.5 w-3.5" /> Adicionar etapa
      </Button>
    </div>
  );
};

export default CardioBlocksEditor;
