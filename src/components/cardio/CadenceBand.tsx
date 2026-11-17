import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Settings2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CADENCE_FLASH_MS, cadenceHint, cadenceIntervalMs, createCadenceScheduler, readCadencePrefs, toggleCadenceMute,
  withSound, writeCadencePrefs, type CadenceBeatMode, type CadencePrefs, type CadenceSound, type ScheduledBeat,
} from '@/lib/cadenceMetronome';
import { cadenceToneFor, createCadenceAudio, type CadenceAudio } from '@/lib/cadenceAudio';
import { playerAudioContext } from '@/lib/playerBeeper';

type Props = {
  rpm: number;
  /** Início do bloco (Date.now), já empurrado pelas pausas. */
  anchorMs: number;
  /** Fim do bloco (Date.now). */
  blockEndMs: number;
  paused: boolean;
  /** Som do player desligado no topo: a cadência também fica muda. */
  playerMuted: boolean;
  /** Só para testes. */
  audioFactory?: () => CadenceAudio;
};

const LONG_PRESS_MS = 550;

/** Faixa de cadência da bike: luz no ritmo, "70 rpm", barrinhas 1-2-3-4, mudo e configuração. */
const CadenceBand: React.FC<Props> = ({ rpm, anchorMs, blockEndMs, paused, playerMuted, audioFactory }) => {
  const [prefs, setPrefsState] = useState<CadencePrefs>(() => readCadencePrefs());
  const [beat, setBeat] = useState<ScheduledBeat | null>(null);
  const [flash, setFlash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const audio = useMemo(() => (audioFactory ? audioFactory() : createCadenceAudio(playerAudioContext)), [audioFactory]);
  const flashTimers = useRef(new Set<number>());
  const onBeatRef = useRef<(b: ScheduledBeat) => void>(() => {});
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  onBeatRef.current = (b) => {
    if (b.sound) {
      const s = prefsRef.current.sound;
      if (s !== 'mute') audio.play(cadenceToneFor(s, b.accent), b.delayMs);
    }
    const on = window.setTimeout(() => {
      flashTimers.current.delete(on);
      setBeat(b);
      setFlash(true);
      const off = window.setTimeout(() => { flashTimers.current.delete(off); setFlash(false); }, CADENCE_FLASH_MS);
      flashTimers.current.add(off);
    }, b.delayMs);
    flashTimers.current.add(on);
  };

  const scheduler = useMemo(() => createCadenceScheduler({
    now: () => Date.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    onBeat: (b) => onBeatRef.current(b),
  }), []);

  const clearFlashes = () => {
    flashTimers.current.forEach((id) => window.clearTimeout(id));
    flashTimers.current.clear();
    setFlash(false);
  };

  // Troca de rpm / modo / bloco: recomeça do zero (sem beeps agendados do ritmo antigo).
  // Na pausa as barrinhas ficam paradas onde estavam.
  useEffect(() => {
    if (paused) return;
    scheduler.stop();
    audio.cancelAll();
    clearFlashes();
  }, [rpm, anchorMs, blockEndMs, prefs.mode, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBeat(null); }, [rpm, prefs.mode]);

  useEffect(() => {
    if (paused) { scheduler.stop(); audio.cancelAll(); clearFlashes(); return; }
    const silent = prefs.sound === 'mute' || playerMuted;
    if (silent) audio.cancelAll();
    scheduler.start({ rpm, mode: prefs.mode, anchorMs, blockEndMs, sound: prefs.sound, playerMuted });
  }, [rpm, anchorMs, blockEndMs, paused, prefs.mode, prefs.sound, playerMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { scheduler.stop(); audio.cancelAll(); clearFlashes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPrefs = (p: CadencePrefs) => { setPrefsState(p); writeCadencePrefs(p); };

  // Toque longo na faixa abre a configuração.
  const pressTimer = useRef<number | null>(null);
  const clearPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };
  useEffect(() => clearPress, []);

  const muted = prefs.sound === 'mute';
  const bar = beat?.bar ?? 0;

  return (
    <>
      <div
        data-testid="cadence-band"
        data-rpm={rpm}
        data-interval-ms={Math.round(cadenceIntervalMs(rpm, prefs.mode))}
        data-flash={flash ? 'true' : 'false'}
        data-bar={bar}
        onPointerDown={() => { clearPress(); pressTimer.current = window.setTimeout(() => setSettingsOpen(true), LONG_PRESS_MS); }}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        onContextMenu={(e) => { e.preventDefault(); clearPress(); setSettingsOpen(true); }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-tabata-brand/30 bg-tabata-panel px-3 py-2.5 select-none [-webkit-touch-callout:none] transition-colors duration-75',
          flash && 'motion-safe:bg-tabata-brand/10',
        )}
      >
        <span
          aria-hidden
          data-testid="cadence-light"
          className={cn(
            'h-11 w-11 shrink-0 rounded-full transition-[transform,box-shadow,background-color] duration-75',
            flash
              ? 'bg-tabata-brand motion-safe:scale-[1.12] motion-safe:shadow-[0_0_22px_6px_hsl(var(--tabata-brand)/0.55)]'
              : 'bg-tabata-brand/25',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="leading-none">
            <span className="text-3xl font-black tabular-nums text-tabata-brand" data-testid="cadence-rpm">{rpm}</span>
            <span className="ml-1 text-sm font-bold text-tabata-soft">rpm</span>
          </p>
          <p className="mt-1 text-[11px] leading-tight text-tabata-soft">{cadenceHint(prefs.mode)}</p>
          <div className="mt-1.5 flex gap-1" aria-label={bar ? `Volta ${bar} de 4` : 'Contagem de voltas'}>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                data-lit={i <= bar ? 'true' : 'false'}
                className={cn('h-1.5 flex-1 rounded-full transition-colors duration-75', i <= bar ? 'bg-tabata-brand' : 'bg-tabata-border')}
              />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            aria-label={muted ? 'Ligar som da cadência' : 'Silenciar cadência'}
            aria-pressed={muted}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPrefs(toggleCadenceMute(prefs))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-tabata-border bg-tabata-bg active:scale-95"
          >
            {muted ? <VolumeX className="h-5 w-5 text-tabata-soft" /> : <Volume2 className="h-5 w-5 text-tabata-brand" />}
          </button>
          <button
            type="button"
            aria-label="Configurar cadência"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setSettingsOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-tabata-soft active:scale-95"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
          style={{ background: 'hsl(var(--tabata-bg) / 0.8)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          data-testid="cadence-settings"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-tabata-border bg-tabata-panel p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black">Ritmo da cadência</p>
            <ChoiceGroup<CadenceBeatMode>
              label="Beep em cada"
              value={prefs.mode}
              options={[{ value: 'volta', label: 'Volta completa' }, { value: 'perna', label: 'Cada perna (2×)' }]}
              onChange={(mode) => setPrefs({ ...prefs, mode })}
            />
            <ChoiceGroup<CadenceSound>
              label="Som"
              value={prefs.sound}
              options={[{ value: 'beep', label: 'Beep' }, { value: 'click', label: 'Clique' }, { value: 'mute', label: 'Mudo' }]}
              onChange={(sound) => setPrefs(withSound(prefs, sound))}
            />
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="h-12 w-full rounded-2xl bg-tabata-brand font-black uppercase text-tabata-bg"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </>
  );
};

function ChoiceGroup<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-tabata-soft">{label}</p>
      <div className={cn('grid gap-1.5', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-11 rounded-xl border px-2 text-sm font-bold',
              value === o.value ? 'border-tabata-brand bg-tabata-brand text-tabata-bg' : 'border-tabata-border bg-tabata-bg text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default CadenceBand;
