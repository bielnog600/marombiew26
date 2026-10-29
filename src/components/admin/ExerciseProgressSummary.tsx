import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { performanceSetsText, type exerciseProgress } from '@/lib/adminExerciseProgress';

export type ExerciseProgressData = ReturnType<typeof exerciseProgress>;
const fmt = (v: number) => Math.round(v*10)/10;
export function ExerciseProgressSummary({ data, loading, error }: { data: ExerciseProgressData; loading: boolean; error: string | null }) {
  if (data.status === 'excluded') return null;
  if (loading) return <p className="text-xs text-muted-foreground">Carregando histórico do exercício…</p>;
  if (error) return <p className="text-xs text-destructive">Histórico indisponível: {error}</p>;
  return <section className="min-w-0 space-y-2 border-t border-border pt-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <strong className={cn(data.status === 'up' ? 'text-chart-2' : data.status === 'down' ? 'text-destructive' : 'text-foreground')}>
        {data.status === 'up' ? data.loadDelta > 0 ? `↑ carga (+${fmt(data.loadDelta)} kg / +${fmt(data.loadPercent)}%)` : `↑ reps (+${data.repsDelta} reps na mesma carga)`
          : data.status === 'down' ? `↓ caiu (${data.loadDelta ? `${fmt(data.loadDelta)} kg` : `${data.repsDelta} reps na mesma carga`})`
          : data.status === 'same' ? '= manteve' : data.status === 'pending' ? 'Aguardando séries realizadas' : 'Primeira vez (sem histórico)'}
      </strong>
      {(data.recordLoad || data.recordVolume) && <Badge className="text-[10px]">Recorde · {data.recordLoad ? 'carga' : ''}{data.recordLoad && data.recordVolume ? ' e ' : ''}{data.recordVolume ? 'volume de série' : ''}</Badge>}
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <div className="min-w-0"><p className="text-muted-foreground">Última {data.date ? `(${new Date(data.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})})` : ''}</p><p className="break-words">{performanceSetsText(data.previous)}</p></div>
      <div className="min-w-0"><p className="text-muted-foreground">Hoje</p><p className="break-words">{performanceSetsText(data.done)}</p></div>
    </div>
    <p>Volume hoje: <strong>{fmt(data.todayVolume).toLocaleString('pt-BR')} kg</strong> · última: {fmt(data.lastVolume).toLocaleString('pt-BR')} kg</p>
    <p className="text-muted-foreground">PR: {fmt(data.prLoad)} kg · volume de série {fmt(data.prSetVolume).toLocaleString('pt-BR')} kg</p>
    {data.alerts.map(a => <p key={a.set} className={a.kind === 'above' ? 'text-primary' : 'text-destructive'}>Série {a.set}: {a.kind === 'above' ? 'acima da meta → subir carga' : 'abaixo da meta'}</p>)}
  </section>;
}