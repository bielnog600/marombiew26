import React, { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Lightbulb, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCardioChoice } from '@/hooks/useCardioChoice';
import { MODALITY_LABEL, totalCardioDurationSec, type CardioBlock, type CardioProtocol } from '@/lib/cardioParser';
import { mmss } from '@/lib/cardioIntervals';
import { blockTone } from '@/lib/cardioPlayerView';
import { toneColor } from '@/lib/tabataPlayerView';
import {
  WEEK_LETTERS, cardioChips, cardioHeadline, cardioSubtitle, cardioWeek, doneBadge, doneFooter, groupCardioSteps,
  groupParams, intensityBars, isPeak, optionStatuses, paramBoxes, shortCardioTitle, stepsLegend, suggestedOption,
  type OptionStatus,
} from '@/lib/cardioChooser';
import { CardioScreen, IntensityBars, ModalityIcon } from '@/components/cardio/choice/CardioChoiceParts';

type NavState = { conteudo?: string | null; planId?: string | null; selected?: number } | null;

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button variant="ghost" size="icon" aria-label="Voltar" onClick={onClick} className="h-10 w-10 rounded-full hover:bg-tabata-panel shrink-0">
    <ChevronLeft className="h-6 w-6" />
  </Button>
);

const StartButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <Button
    onClick={onClick} disabled={disabled} data-testid="cardio-start"
    className="w-full h-14 rounded-2xl text-base font-black uppercase tracking-wide gap-2 bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
  >
    <Play className="h-5 w-5 fill-current" /> {label}
  </Button>
);

/** Tela "Cardio" do aluno: escolher qual cardio fazer hoje (e o detalhe antes de iniciar). */
const CardioAluno: React.FC = () => {
  const { index } = useParams<{ index?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navState = (location.state as NavState) || null;
  const data = useCardioChoice(user?.id, { conteudo: navState?.conteudo, planId: navState?.planId });
  const statuses = useMemo(() => optionStatuses(data.options, data.sessions, data.planId), [data.options, data.sessions, data.planId]);
  const suggestion = useMemo(() => suggestedOption(statuses), [statuses]);

  const canGoBack = location.key !== 'default';

  const startCardio = (i: number, replace: boolean) => {
    const protocol = data.options[i];
    if (!protocol) return;
    navigate('/cardio-execucao', { replace, state: { protocol, planId: data.planId, protocolIndex: i } });
  };

  if (index != null) {
    const i = Number(index);
    const protocol = Number.isInteger(i) ? data.options[i] : undefined;
    // A lista já guardou a seleção; sem histórico (link direto) volta para a lista.
    const back = () => (canGoBack ? navigate(-1) : navigate('/cardio', { replace: true, state: { ...navState, selected: i } }));
    if (!protocol) {
      return (
        <CardioScreen header={<div className="flex items-center gap-1"><BackButton onClick={back} /><h1 className="text-lg font-black">Cardio</h1></div>}>
          <p className="text-sm text-tabata-soft mt-6 text-center">{data.loading ? 'A carregar…' : 'Este cardio já não está no teu plano.'}</p>
        </CardioScreen>
      );
    }
    return <CardioDetail protocol={protocol} onBack={back} onStart={() => startCardio(i, true)} />;
  }

  const selected = navState?.selected != null && data.options[navState.selected] ? navState.selected : suggestion.index;
  const week = cardioWeek(data.sessions, Math.max(1, data.options.length));
  const selectedProtocol = data.options[selected];

  return (
    <CardioScreen
      testId="cardio-choice"
      header={
        <div className="flex items-center gap-1">
          <BackButton onClick={() => (canGoBack ? navigate(-1) : navigate('/minha-area', { replace: true }))} />
          <h1 className="text-lg font-black">Cardio</h1>
        </div>
      }
      footer={data.options.length ? (
        <div className="space-y-1.5">
          <StartButton
            label={`Iniciar ${selectedProtocol ? MODALITY_LABEL[selectedProtocol.modality] : 'cardio'}`}
            disabled={!selectedProtocol}
            onClick={() => startCardio(selected, false)}
          />
          <p className="text-[11px] text-center text-tabata-soft">Toca num cardio para ver as etapas</p>
        </div>
      ) : undefined}
    >
      <p className="text-sm text-tabata-soft mb-4">Escolhe qual cardio fazer hoje.</p>

      {data.options.length === 0 ? (
        <p className="text-sm text-tabata-soft text-center mt-10">
          {data.loading ? 'A carregar…' : 'Ainda não tens um cardio no plano. O Fabiew vai preparar o teu.'}
        </p>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-tabata-border bg-tabata-panel p-4" data-testid="cardio-week">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-tabata-soft">Esta semana</p>
              <p className="text-sm font-black"><span className="text-tabata-brand">{week.count}</span> de {week.total} feitos</p>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mt-3">
              {WEEK_LETTERS.map((l, d) => (
                <div key={d} className="flex flex-col items-center gap-1">
                  <div
                    data-testid={`cardio-week-day-${d}`}
                    data-done={week.done[d] ? 'true' : 'false'}
                    className={cn(
                      'aspect-square w-full max-w-[40px] rounded-lg flex items-center justify-center border',
                      week.done[d] ? 'bg-tabata-rest border-tabata-rest text-tabata-bg' : 'bg-tabata-bg border-tabata-border',
                      d === week.today && 'border-2 border-tabata-brand',
                    )}
                  >
                    {week.done[d] && <Check className="h-4 w-4" strokeWidth={3} />}
                  </div>
                  <span className={cn('text-[10px] font-bold', d === week.today ? 'text-tabata-brand' : 'text-tabata-soft')}>{l}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-tabata-soft">Teus cardios</p>
            {data.options.map((p, i) => (
              <CardioOptionCard
                key={i} protocol={p} status={statuses[i]} selected={i === selected}
                suggested={suggestion.badge && i === suggestion.index}
                onOpen={() => {
                  navigate('/cardio', { replace: true, state: { ...navState, selected: i } });
                  navigate(`/cardio/${i}`, { state: { ...navState, selected: i } });
                }}
              />
            ))}
          </section>
        </div>
      )}
    </CardioScreen>
  );
};

const CardioOptionCard: React.FC<{
  protocol: CardioProtocol; status: OptionStatus | undefined; selected: boolean; suggested: boolean; onOpen: () => void;
}> = ({ protocol, status, selected, suggested, onOpen }) => {
  const done = status?.weekSession ?? null;
  return (
    <button
      type="button" onClick={onOpen} data-testid="cardio-option" data-selected={selected ? 'true' : 'false'}
      className={cn(
        'w-full text-left rounded-2xl border bg-tabata-panel p-3.5 space-y-3 transition-colors',
        selected ? 'border-2 border-tabata-brand' : 'border-tabata-border',
        done && !selected && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <ModalityIcon modality={protocol.modality} />
        <div className="flex-1 min-w-0">
          <p className="font-black text-base leading-tight truncate">{shortCardioTitle(protocol)}</p>
          <p className="text-xs text-tabata-soft truncate">{cardioSubtitle(protocol)}</p>
        </div>
        {suggested ? (
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-tabata-brand text-tabata-bg" data-testid="cardio-suggested">
            Sugerido
          </span>
        ) : done ? (
          <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-tabata-rest/20 text-tabata-rest">{doneBadge(done)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cardioChips(protocol).map(c => (
          <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-tabata-bg border border-tabata-border">{c}</span>
        ))}
      </div>

      <IntensityBars bars={intensityBars(protocol)} className="h-7" testId="cardio-mini-bar" />

      <div className="grid grid-cols-2 gap-2">
        {paramBoxes(protocol).map(b => (
          <div key={b.kind} className={cn('rounded-xl bg-tabata-bg border border-tabata-border p-2 min-w-0', paramBoxes(protocol).length === 1 && 'col-span-2')}>
            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: toneColor(b.kind === 'pico' ? 'forte' : b.kind === 'recup' ? 'rest' : 'moderado') }}>
              {b.label} {b.time}
            </p>
            <p className="text-xs font-semibold truncate">{b.detail || '—'}</p>
          </div>
        ))}
      </div>

      <p className={cn('text-[11px]', done ? 'text-tabata-rest font-semibold' : 'text-tabata-soft')} data-testid="cardio-option-footer">
        {doneFooter(done)}
      </p>
    </button>
  );
};

const POSITION_TAG: Record<string, string> = { em_pe: 'EM PÉ', alternado: 'ALTERNADO' };

const StepRow: React.FC<{ block: CardioBlock; modality: CardioProtocol['modality'] }> = ({ block, modality }) => {
  const tag = modality === 'bike' && block.bikePosition && POSITION_TAG[block.bikePosition] && isPeak(block) ? POSITION_TAG[block.bikePosition] : null;
  const params = groupParams([{ ...block, bikePosition: tag ? undefined : block.bikePosition }], modality);
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-8 w-1.5 rounded-full shrink-0" style={{ background: toneColor(blockTone(block)) }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-bold truncate">{block.name}</p>
          {tag && (
            <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-tabata-strong/20 text-tabata-strong" data-testid="cardio-step-position">{tag}</span>
          )}
        </div>
        {params && <p className="text-xs text-tabata-soft truncate">{params}</p>}
      </div>
      <span className="text-sm font-black tabular-nums shrink-0">{mmss(block.durationSec)}</span>
    </div>
  );
};

const CardioDetail: React.FC<{ protocol: CardioProtocol; onBack: () => void; onStart: () => void }> = ({ protocol, onBack, onStart }) => {
  const groups = groupCardioSteps(protocol.blocks);
  const tip = protocol.coachTip?.trim();
  return (
    <CardioScreen
      testId="cardio-detail"
      header={
        <div className="flex items-center gap-1 min-w-0">
          <BackButton onClick={onBack} />
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight truncate">{shortCardioTitle(protocol)}</h1>
            <p className="text-xs text-tabata-soft truncate" data-testid="cardio-detail-headline">{cardioHeadline(protocol)}</p>
          </div>
        </div>
      }
      footer={<StartButton label="Iniciar cardio" onClick={onStart} />}
    >
      <div className="space-y-5 pt-2">
        <section className="rounded-2xl border border-tabata-border bg-tabata-panel p-4 space-y-2">
          <IntensityBars bars={intensityBars(protocol)} className="h-16" testId="cardio-detail-bar" />
          <div className="flex justify-between text-[10px] font-bold text-tabata-soft tabular-nums">
            <span>0:00</span><span>{mmss(totalCardioDurationSec(protocol))}</span>
          </div>
          <p className="text-xs font-semibold text-center">{stepsLegend(protocol)}</p>
        </section>

        <section className="rounded-2xl border border-tabata-border bg-tabata-panel px-3 py-1 divide-y divide-tabata-border" data-testid="cardio-steps">
          {groups.map(g => g.kind === 'single' ? (
            <StepRow key={g.index} block={g.block} modality={protocol.modality} />
          ) : (
            <div key={g.index} className="py-1">
              {g.blocks.map((b, k) => <StepRow key={k} block={b} modality={protocol.modality} />)}
              <p className="text-xs font-black text-tabata-brand pl-4 pb-1.5">× {g.times} ciclos</p>
            </div>
          ))}
        </section>

        {tip && (
          <section className="rounded-2xl border border-tabata-brand/40 bg-tabata-brand/10 p-4" data-testid="cardio-coach-tip">
            <p className="text-xs font-black uppercase tracking-widest text-tabata-brand flex items-center gap-1.5">
              <Lightbulb className="h-4 w-4" /> Dica do Fabiew
            </p>
            <p className="text-sm mt-1.5 whitespace-pre-line">{tip}</p>
          </section>
        )}
      </div>
    </CardioScreen>
  );
};

export default CardioAluno;
