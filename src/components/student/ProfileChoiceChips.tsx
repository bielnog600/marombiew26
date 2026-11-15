import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  OBJETIVO_OPTIONS, RACA_OPTIONS, joinObjetivo, parseObjetivo,
} from '../../../supabase/functions/_shared/studentProfileOptions';

/** Objetivo em chips (vários) + "Outro objetivo"; devolve o texto salvo no perfil. */
export const ObjetivoChips: React.FC<{ value: string; onChange: (text: string) => void; idPrefix?: string }> = ({ value, onChange, idPrefix = 'objetivo' }) => {
  const [state, setState] = useState(() => parseObjetivo(value));
  const lastEmitted = useRef(joinObjetivo(state.selected, state.outro));

  // Valor trocado de fora (pré-preenchimento/outro aluno) → volta a ler o texto.
  useEffect(() => {
    if ((value ?? '') !== lastEmitted.current) {
      const parsed = parseObjetivo(value);
      setState(parsed);
      lastEmitted.current = value ?? '';
    }
  }, [value]);

  const emit = (next: { selected: string[]; outro: string }) => {
    setState(next);
    const text = joinObjetivo(next.selected, next.outro);
    lastEmitted.current = text;
    onChange(text);
  };

  const toggle = (v: string) => emit({
    ...state,
    selected: state.selected.includes(v) ? state.selected.filter((x) => x !== v) : [...state.selected, v],
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Objetivo">
        {OBJETIVO_OPTIONS.map((o) => {
          const on = state.selected.includes(o.value);
          return (
            <Button key={o.value} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on}
              className="h-auto min-h-9 whitespace-normal text-left" onClick={() => toggle(o.value)}>
              <span>{o.value}{o.desc && <span className={`ml-1 text-xs ${on ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>({o.desc})</span>}</span>
            </Button>
          );
        })}
      </div>
      <Input id={`${idPrefix}-outro`} aria-label="Outro objetivo" placeholder="Outro objetivo..." maxLength={200}
        value={state.outro} onChange={(e) => emit({ ...state, outro: e.target.value })} />
    </div>
  );
};

/** Raça em chips (uma opção; tocar de novo desmarca). */
export const RacaChips: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label="Raça">
    {RACA_OPTIONS.map((o) => {
      const on = value === o.value;
      return (
        <Button key={o.value} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on}
          onClick={() => onChange(on ? '' : o.value)}>
          {o.label}
        </Button>
      );
    })}
  </div>
);
