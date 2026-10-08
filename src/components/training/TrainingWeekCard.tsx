import React, { useMemo, useState } from 'react';
import { CalendarClock, Flame, Info, Pencil, RefreshCcw, Target, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import {
  PHASE_FOCUS,
  PHASE_GUIDELINES,
  TRAINING_PHASES,
  type TrainingPhase,
} from '@/lib/trainingPhase';

export interface TrainingWeekPlanMeta {
  id: string;
  fase?: string | null;
  fase_inicio_data?: string | null;
}

const NOME: Record<TrainingPhase, string> = {
  semana_1: 'Base técnica',
  semana_2: 'Intensificação',
  semana_3: 'Overload',
  deload: 'Deload',
};

const CURTO: Record<TrainingPhase, string> = {
  semana_1: 'S1',
  semana_2: 'S2',
  semana_3: 'S3',
  deload: 'Deload',
};

/** O que o treinador cobra na sessão, por semana (curto, de beira de aparelho). */
const COBRAR: Record<TrainingPhase, string[]> = {
  semana_1: ['Carga que permite 2–3 reps na reserva', 'Execução e amplitude completas', 'Ajustar carga para as próximas semanas'],
  semana_2: ['Séries perto da falha técnica (0–1 rep na reserva)', 'Técnicas marcadas: drop-set, rest-pause, myo-reps', 'Sem perder execução'],
  semana_3: ['Superar a semana anterior: +carga ou +reps', 'Bateu o topo da faixa: sobe a carga', 'Execução segura, sem roubar'],
  deload: ['Cargas mais leves, sair das séries com folga', 'Menos volume, sem técnicas avançadas', 'Foco em recuperar'],
};

const ICONE: Record<TrainingPhase, React.ElementType> = {
  semana_1: Target,
  semana_2: Flame,
  semana_3: TrendingUp,
  deload: RefreshCcw,
};

const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** YYYY-MM-DD de hoje menos `dias` (data local, como o admin enxerga). */
const isoMenosDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Card da semana do ciclo no Modo Treino: em que semana o aluno está, o que
 * fazer nela e quando vira a próxima. Mesma fonte de verdade do app
 * (resolveCurrentTrainingPhase: data de início do ciclo, 7 dias por semana).
 * Sem data de início, avisa e deixa o treinador acertar a semana ali mesmo.
 */
export const TrainingWeekCard: React.FC<{
  plan: TrainingWeekPlanMeta | null;
  /** Fase já usada na sessão (resolvida ao clicar em Treinar). */
  sessionPhase?: string | null;
  sessionId?: string | null;
  onPhaseChange?: (phase: TrainingPhase, plan: TrainingWeekPlanMeta) => void;
}> = ({ plan, sessionPhase, sessionId, onPhaseChange }) => {
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const resolvido = useMemo(() => resolveCurrentTrainingPhase(plan ?? null), [plan]);
  const fase: TrainingPhase = (TRAINING_PHASES as string[]).includes(String(sessionPhase))
    ? (sessionPhase as TrainingPhase)
    : resolvido.phase;
  const idx = TRAINING_PHASES.indexOf(fase);
  const temData = resolvido.source === 'timeline' && resolvido.cycleStart && resolvido.daysIn !== null;
  const diaNaSemana = temData ? (resolvido.daysIn! % 7) + 1 : null;
  const faltam = diaNaSemana ? 7 - diaNaSemana + 1 : null;
  const proxima = TRAINING_PHASES[(idx + 1) % TRAINING_PHASES.length];
  const viraEm = temData
    ? new Date(resolvido.cycleStart!.getTime() + (Math.floor(resolvido.daysIn! / 7) + 1) * 7 * 86400000)
    : null;
  const Icone = ICONE[fase];
  const deload = fase === 'deload';

  const definirSemana = async (nova: TrainingPhase) => {
    if (!plan?.id) return;
    setSalvando(true);
    try {
      const novaIdx = TRAINING_PHASES.indexOf(nova);
      // Começo do ciclo de modo que HOJE caia no 1º dia da semana escolhida.
      const inicio = isoMenosDias(novaIdx * 7);
      const { error } = await supabase
        .from('ai_plans')
        .update({ fase_inicio_data: inicio, fase: nova } as any)
        .eq('id', plan.id);
      if (error) throw error;
      if (sessionId) {
        await supabase.from('workout_sessions').update({ phase: nova } as any).eq('id', sessionId);
      }
      const atualizado = { ...plan, fase: nova, fase_inicio_data: inicio };
      onPhaseChange?.(nova, atualizado);
      toast.success(`Ciclo ajustado: hoje é ${CURTO[nova]} (${NOME[nova]}).`);
      setAberto(false);
    } catch (e: any) {
      toast.error(`Não consegui ajustar a semana: ${e?.message ?? 'erro'}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-xl border p-3',
        deload ? 'border-border bg-muted/40' : 'border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              deload ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
            )}
          >
            <Icone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {deload ? 'Semana 4 de 4' : `Semana ${idx + 1} de 4`}
              {diaNaSemana ? ` · dia ${diaNaSemana} de 7` : ''}
            </p>
            <p className="text-base font-bold leading-tight">{NOME[fase]}</p>
            <p className="text-xs text-muted-foreground">{PHASE_FOCUS[fase]}</p>
          </div>
        </div>
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
              <Pencil className="h-3 w-3" /> Ajustar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <p className="text-xs font-semibold">Em que semana o aluno está hoje?</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ajusta o início do ciclo no plano. Vale para esta sessão e para as próximas.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {TRAINING_PHASES.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={p === fase ? 'default' : 'outline'}
                  disabled={salvando}
                  onClick={() => definirSemana(p)}
                >
                  {CURTO[p]} · {NOME[p]}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Linha do ciclo */}
      <div className="mt-3 grid grid-cols-4 gap-1">
        {TRAINING_PHASES.map((p, i) => (
          <div key={p} className="space-y-1">
            <div
              className={cn(
                'h-1.5 rounded-full',
                i < idx ? 'bg-primary/50' : i === idx ? (deload ? 'bg-muted-foreground' : 'bg-primary') : 'bg-border',
              )}
            />
            <p className={cn('text-center text-[10px]', i === idx ? 'font-bold text-foreground' : 'text-muted-foreground')}>
              {CURTO[p]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-background/60 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">O que cobrar hoje</p>
        <ul className="mt-1 space-y-0.5">
          {COBRAR[fase].map((linha) => (
            <li key={linha} className="flex gap-1.5 text-xs">
              <span className="text-primary">•</span>
              {linha}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{PHASE_GUIDELINES[fase]}</p>
      </div>

      {temData && viraEm ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          {faltam === 1 ? 'Último dia desta semana' : `Faltam ${faltam} dias`} · {CURTO[proxima]} ({NOME[proxima]}) a partir de {ddmm(viraEm)}
        </p>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Este plano não tem data de início do ciclo, então o app está considerando {CURTO[fase]}. Toque em Ajustar e diga em que semana o aluno está.
        </p>
      )}
    </div>
  );
};

export default TrainingWeekCard;
