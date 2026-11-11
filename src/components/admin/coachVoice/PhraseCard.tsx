import React, { useEffect, useState } from 'react';
import { CheckCircle2, History, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { CoachVoiceTake } from '@/lib/coachVoice/api';
import { phraseStatus, type PhraseStatus } from '@/lib/coachVoice/voiceTabs';

export interface PhraseRow {
  phrase_key: string;
  texto: string;
  categoria: string;
  approved_take_id: string | null;
  tipo: 'sistema' | 'personalizada' | 'nome';
  momento: string | null;
  frequencia: string;
  ativo: boolean;
  student_id: string | null;
  template_id: string | null;
}

export const PHRASE_COLUMNS = 'phrase_key, texto, categoria, approved_take_id, tipo, momento, frequencia, ativo, student_id, template_id';

export type { PhraseStatus };
export const statusOf = (row: PhraseRow | undefined, takes: CoachVoiceTake[]): PhraseStatus =>
  phraseStatus(row?.approved_take_id, takes.map((t) => t.id));

const STATUS_BADGE: Record<PhraseStatus, { label: string; className: string }> = {
  approved: { label: 'Aprovada', className: 'bg-primary/15 text-primary border-primary/40' },
  pending: { label: 'Para aprovar', className: 'bg-secondary text-foreground border-border' },
  empty: { label: 'Sem áudio', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export interface PhraseCardProps {
  phraseKey: string;
  /** Texto inicial quando ainda não há linha no servidor. */
  defaultText: string;
  /** Texto que a câmera procura (só falas do sistema); mostra o aviso quando a gravação difere. */
  cameraText?: string;
  row: PhraseRow | undefined;
  takes: CoachVoiceTake[];
  urls: Record<string, string>;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  /** Texto fixo (falas com nome: vem do modelo). */
  readOnlyText?: boolean;
  /** Fala desativada: aparece apagada. */
  inactive?: boolean;
  onGenerate(): void;
  onApprove(take: CoachVoiceTake): void;
  onSaveText?(text: string): void;
  /** Controles extras (quando tocar, frequência, ativo, apagar). */
  children?: React.ReactNode;
}

const TakePlayer: React.FC<{ take: CoachVoiceTake; urls: Record<string, string>; className?: string }> = ({ take, urls, className }) =>
  urls[take.file_path]
    ? <audio controls preload="none" src={urls[take.file_path]} className={cn('h-8 min-w-[140px]', className)} />
    : <span className={cn('text-xs text-muted-foreground', className)}>Carregando áudio…</span>;

/** Linha compacta: texto, selo, player da aprovada (ou da mais nova), gerar e versões num popover. */
const PhraseCard: React.FC<PhraseCardProps> = ({
  phraseKey, defaultText, cameraText, row, takes, urls, busy, disabled, error, readOnlyText, inactive,
  onGenerate, onApprove, onSaveText, children,
}) => {
  const [text, setText] = useState(row?.texto ?? defaultText);
  useEffect(() => { setText(row?.texto ?? defaultText); }, [row?.texto, defaultText]);
  const status = statusOf(row, takes);
  const badge = STATUS_BADGE[status];
  const approvedTake = takes.find((t) => t.id === row?.approved_take_id) ?? null;
  const shown = approvedTake ?? takes[0] ?? null;
  return (
    <div
      className={cn('glass-card rounded-2xl border border-border/60 p-2.5 space-y-2', inactive && 'opacity-60')}
      data-testid={`coach-voice-phrase-${phraseKey}`}
    >
      <div className="flex items-center gap-2">
        {readOnlyText ? (
          <p className="flex-1 min-w-0 text-sm font-medium">{text}</p>
        ) : (
          <Input
            aria-label={`Texto da fala ${cameraText ?? text}`}
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onSaveText?.(text)}
            className="h-8 flex-1 min-w-0"
          />
        )}
        <span
          className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.className)}
          data-testid={`coach-voice-status-${phraseKey}`}
        >
          {badge.label}
        </span>
      </div>
      {cameraText != null && text.trim() !== cameraText && <p className="text-[11px] text-muted-foreground">Na câmera: “{cameraText}”</p>}
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {shown && <TakePlayer take={shown} urls={urls} className="flex-1" />}
        {shown && !approvedTake && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onApprove(shown)}>Aprovar</Button>
        )}
        <Button size="sm" className="h-8" variant={takes.length ? 'outline' : 'default'} onClick={onGenerate} disabled={disabled}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mic className="h-3.5 w-3.5 mr-1.5" />}
          {takes.length ? 'Gerar de novo' : 'Gerar'}
        </Button>
        {takes.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 px-2" aria-label={`Versões de ${text}`}>
                <History className="h-3.5 w-3.5 mr-1" /> {takes.length}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] max-h-80 overflow-y-auto p-2 space-y-1.5">
              <p className="px-1 text-xs font-semibold text-muted-foreground">Versões</p>
              {takes.map((t, i) => {
                const approved = row?.approved_take_id === t.id;
                return (
                  <div key={t.id} className={cn('space-y-1 rounded-xl border p-2', approved ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">Versão {takes.length - i} · {formatWhen(t.created_at)}</span>
                      {approved ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Aprovada</span>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => onApprove(t)}>Aprovar</Button>
                      )}
                    </div>
                    <TakePlayer take={t} urls={urls} className="w-full" />
                    {t.texto !== (row?.texto ?? '') && <p className="text-[11px] text-muted-foreground">Gerada com: “{t.texto}”</p>}
                  </div>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {shown && shown.texto !== (row?.texto ?? '') && <p className="text-[11px] text-muted-foreground">Gerada com: “{shown.texto}”</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
};

export default PhraseCard;
