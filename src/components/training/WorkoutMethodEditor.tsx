import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { methodParameters, methodPatch, methodSummary, seriesMethod, type MethodParameters, type SeriesMethod } from '@/lib/workoutExecutionMethods';
import { pyramidPatch, pyramidType } from '@/lib/workoutPyramid';

export function WorkoutMethodEditor({ exercise, onChange }: { exercise: ParsedExercise; onChange: (patch: Partial<ParsedExercise>) => void }) {
  const method = seriesMethod(exercise), params = methodParameters(exercise);
  const pyramid = pyramidType(exercise);
  const update = (key: keyof MethodParameters, value: number | string) => onChange(methodPatch(method, { ...params, [key]: value }));
  const number = (key: keyof MethodParameters, label: string, min: number, max: number) => (
    <label className="text-xs text-muted-foreground space-y-1" key={key}>{label}
      <Input aria-label={label} type="number" min={min} max={max} value={params[key]} onChange={e => update(key, Math.min(max, Math.max(min, Number(e.target.value))))} className="h-8" />
    </label>
  );
  return <div className="space-y-2">
    <Select value={pyramid ? 'piramide' : method} onValueChange={v => onChange(v === 'piramide' ? pyramidPatch(exercise, 'crescente') : methodPatch(v as SeriesMethod))}>
      <SelectTrigger aria-label="Método" className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{[['nenhum', 'Sem método'], ['dropset', 'Drop set'], ['restpause', 'Rest-pause'], ['cluster', 'Cluster'], ['piramide', 'Pirâmide']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
    </Select>
    {pyramid && <>
      <Select value={pyramid} onValueChange={v => onChange(pyramidPatch(exercise, v as 'crescente' | 'decrescente'))}>
        <SelectTrigger aria-label="Tipo de pirâmide" className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="crescente">Crescente</SelectItem><SelectItem value="decrescente">Decrescente</SelectItem></SelectContent>
      </Select>
      <p className="text-xs text-primary">{methodSummary(exercise)}</p>
    </>}
    {!pyramid && method !== 'nenhum' && <>
      <Select value={params.aplicar} onValueChange={v => update('aplicar', v)}>
        <SelectTrigger aria-label="Aplicar em" className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ultima">Última série</SelectItem><SelectItem value="todas">Todas as séries</SelectItem></SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-2">
        {method === 'dropset' && <>{number('drops', 'Número de drops', 1, 3)}{number('reducao_pct', 'Redução de carga (%)', 1, 90)}</>}
        {method === 'restpause' && <>{number('minis', 'Mini-séries', 1, 5)}{number('pausa_s', 'Pausa interna (s)', 10, 20)}</>}
        {method === 'cluster' && <>{number('blocos', 'Blocos por série', 2, 6)}{number('reps_bloco', 'Reps por bloco', 1, 20)}{number('pausa_s', 'Pausa interna (s)', 15, 30)}</>}
      </div>
      <p className="text-xs text-primary">{methodSummary(exercise)}</p>
    </>}
  </div>;
}