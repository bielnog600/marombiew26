import { describe, expect, it } from 'vitest';
import { buildQuantitativeProgressionRecommendation as build } from '@/lib/quantitativeProgression';
import { buildExercisePerformance, type ExerciseLog } from '@/lib/weeklyProgression';
import { buildSessionProgressionRecommendations } from '@/lib/sessionProgression';
import { buildWeeklyFocus } from '@/lib/weeklyCoachingFocus';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const now = new Date('2026-10-29T23:36:00Z');
const rows = (name: string, weights: number[], reps: number[], session = 'latest', at = '2026-10-29'): ExerciseLog[] => weights.map((w, i) => ({
  exercise_name: name, session_id: session, performed_at: `${at}T10:00:00Z`, set_number: i + 1,
  set_type: 'work', weight_kg: w, reps: reps[i], rir: i === weights.length - 1 ? 2 : null,
}));
const recommend = (name: string, weights: number[], reps: number[], min: number, max: number, step: number, source = 'reduce_load', recognition?: number) => {
  const current = rows(name, weights, reps);
  const base = Math.max(...weights);
  // Explicit synthetic equipment evidence: not a claim about unprovided historical rows.
  const previous = rows(name, [base - step, base], [max, max], 'previous', '2026-10-26');
  const performance = { ...buildExercisePerformance(name, current, previous, { min, max }), nextAction: source as 'reduce_load' | 'increase_load' };
  return build({ performance, recentLogs: recognition == null ? current : [{ ...current[0], set_type: 'recognition', set_number: 0, weight_kg: recognition }, ...current],
    previousLogs: previous, historyLogs: previous, prescribedSets: current.map(s => ({ setNumber: s.set_number ?? 1, reps: `${min}-${max}` })), now });
};

describe('auditoria dos casos informados — carga base e decisões', () => {
  it.each([
    ['Wemerson CADEIRA ABDUTORA', [50,70,70], [30,15,15], 12,15,5,70,75],
    ['Rute LEG PRESS', [70,80,80], [12,12,12], 12,12,10,80,90],
    ['Cristina REMADA TRIÂNGULO', [30,40,50], [12,10,12], 10,15,5,50,50],
  ] as const)('%s parte da maior carga de trabalho', (name,w,r,min,max,step,base,target) => {
    const q = recommend(name,[...w],[...r],min,max,step);
    expect(q.currentLoadKg).toBe(base); expect(q.recommendedLoadKg).toBe(target);
    expect(q.currentReps).toBe(Math.min(...r.filter((_,i) => w[i] === base)));
  });
  it.each([
    ['Carone LEG PRESS 45 ART',100,40], ['Carone KICK BACK',30,20], ['Carone HIPEREXTENSÃO LOMBAR',19,10],
  ] as const)('%s exclui a carga de reconhecimento', (name,base,prep) => {
    const q = recommend(name,[base,base],[10,10],8,12,1,'reduce_load',prep);
    expect(q.currentLoadKg).toBe(base); expect(q.recommendedLoadKg).toBe(base);
    expect(q.seriesTargets?.length).toBe(2);
  });
  it.each([
    ['Pâmela BICEPS CORDA',15,[12,12,10],12,15,7.5],
    ['Cristina SUPINO VERTICAL 2',27.5,[10,10],8,10,2.5],
    ['Thalita STIFF ROMENO',40,[10,10,10],6,8,5],
    ['Johan FLY MACHINE',15,[12,12,12],12,15,2.5],
    ['Carone AFUNDO SMITH 2',7.5,[11,10],10,12,2.5],
  ] as const)('%s não reduz por queda histórica quando está na faixa', (name,w,r,min,max,step) => {
    const q = recommend(name,r.map(() => w),[...r],min,max,step);
    expect(q.action).not.toBe('reduce_load'); expect(q.recommendedLoadKg).toBeGreaterThanOrEqual(w);
    if (name === 'Thalita STIFF ROMENO') expect(q.recommendedLoadKg).toBe(45);
  });
  it.each([
    ['Johan PUXADA ALTA ABERTA',55,[12,10,10],10,12,5],
    ['Johan REMADA NEUTRA MAQ.',40,[12,8,8,9],6,12,2.5],
    ['Johan REMADA TRIÂNGULO',50,[12,10,10],6,12,5],
    ['Thalita SUPINO RETO',20,[8,7,6],6,8,2],
  ] as const)('%s só busca reps quando nem todas atingiram o topo', (name,w,r,min,max,step) => {
    const q = recommend(name,r.map(() => w),[...r],min,max,step,'increase_load');
    expect(q.action).toBe('increase_reps'); expect(q.recommendedLoadKg).toBe(w);
  });
  it.each([
    ['Johan CADEIRA FLEXORA',40,[15,15,15],8,12,5,45],
    ['Johan CRUCIFIXO INVERSO BANCO',18,[16],12,15,2,20],
    ['Thalita CADEIRA FLEXORA',50,[12,12,12],8,10,5,55],
    ['Thalita LEG 180',60,[12,12,12],8,12,5,65],
    ['Suzane PUXADA ALTA ABERTA',20,[18,12,12],8,12,5,25],
    ['Suzane CADEIRA FLEXORA',60,[15,12,12],10,12,5,65],
  ] as const)('%s preserva o aumento correto', (name,w,r,min,max,step,target) => {
    const q = recommend(name,r.map(() => w),[...r],min,max,step,'increase_load');
    expect(q.action).toBe('increase_load'); expect(q.recommendedLoadKg).toBe(target);
  });
  it.each([12,16,30])('Thalita REMADA UNILATERAL 10→15 bloqueia 50%% mesmo com %i reps', reps => {
    const q = recommend('REMADA UNILATERAL',[10],[reps],8,12,5,'increase_load');
    expect(q.action).toBe('increase_reps'); expect(q.recommendedLoadKg).toBe(10); expect(q.targetReps).toBe(reps + 1);
  });
  it.each([
    ['Katia BÚLGARO',18,'increase_load'], ['Wemerson LEG 180',90,'reduce_load'],
    ['Carone PULL DOWN',20,'reduce_load'], ['Carone FACE PULL',20,'reduce_load'],
    ['Carone KICK BACK',30,'reduce_load'], ['Carone LEG PRESS 45',100,'reduce_load'],
    ['Thalita MESA FLEXORA',20,'reduce_load'],
  ] as const)('%s não declara mudar kg se a carga é igual', (name,w,source) => {
    const current = rows(name,[w,w],[10,10]);
    const q = build({ performance: { ...buildExercisePerformance(name,current,[],{min:8,max:12}), nextAction:source }, recentLogs:current, now });
    expect(q.recommendedLoadKg).toBe(w); expect(['increase_load','reduce_load']).not.toContain(q.action);
  });
  it('Isabella CADEIRA ABDUTORA em 19/09 não sugere kg após 28 dias', () => {
    const c = rows('CADEIRA ABDUTORA',[50,50,50],[15,15,15],'old','2026-09-19');
    const p = buildExercisePerformance('CADEIRA ABDUTORA',c,[],{min:12,max:15});
    const q = build({ performance:p, recentLogs:c, now });
    expect(q.basis).toBe('retomar_referencia'); expect(q.currentLoadKg).toBeNull(); expect(q.recommendedLoadKg).toBeNull();
    expect(q.seriesTargets).toEqual([]);
    const focus = buildWeeklyFocus({ performances:[p], quantitative:[q] });
    expect(focus[0].actionType).toBe('maintain'); expect(focus[0].loadText).toBeNull();
  });
  it('28 dias é inclusivo; 28 dias + 1 ms exige retomada', () => {
    const c = rows('SUPINO',[40],[12]);
    const p = buildExercisePerformance('SUPINO',c,[],{min:8,max:12});
    const at = Date.parse(c[0].performed_at);
    expect(build({performance:p,recentLogs:c,now:new Date(at + 28*86400000)}).basis).toBe('metas_por_serie');
    expect(build({performance:p,recentLogs:c,now:new Date(at + 28*86400000 + 1)}).basis).toBe('retomar_referencia');
  });
  it('redução só abaixo do mínimo e para carga observada menor', () => {
    const q = recommend('SUPINO',[40,40],[5,5],6,8,2,'reduce_load');
    expect(q.action).toBe('reduce_load'); expect(q.currentLoadKg).toBe(40); expect(q.recommendedLoadKg).toBe(38);
  });
  it('aluno/admin e foco usam a mesma decisão corrigida, não nextAction antigo', () => {
    const name = 'PUXADA ALTA ABERTA';
    const c = rows(name,[55,55,55],[12,10,10]);
    const prev = rows(name,[50,50,50],[12,12,12],'prev','2026-10-26');
    const ex: ParsedExercise = {exercise:name,series:'3',series2:'',reps:'10-12',rir:'2',pause:'60',description:'',variation:''};
    const p = {...buildExercisePerformance(name,c,prev,{min:10,max:12}), nextAction:'increase_load' as const};
    const q = build({performance:p,recentLogs:c,previousLogs:prev,historyLogs:prev,prescribedSets:[1,2,3].map(setNumber=>({setNumber,reps:'10-12'})),now});
    const snapshot = buildSessionProgressionRecommendations({exercises:[ex],logs:[...prev,...c],currentSessionId:'new',activePhase:'semana_2',configuredIncrements:{},now});
    expect(snapshot.recommendations[name].action).toBe(q.action);
    expect(snapshot.recommendations[name].recommendedLoadKg).toBe(q.recommendedLoadKg);
    expect(buildWeeklyFocus({performances:[p],quantitative:[q]})[0].actionType).toBe('increase_reps');
  });
  it('pirâmide crescente usa metas e cargas individuais, resumo usa maior carga', () => {
    const c = rows('REMADA',[30,40,50],[12,10,8]);
    const q = build({performance:buildExercisePerformance('REMADA',c,[],{min:8,max:12}),recentLogs:c,
      prescribedSets:[{setNumber:1,reps:'12'},{setNumber:2,reps:'10'},{setNumber:3,reps:'8'}],setSchemeMode:'pyramid_up',now});
    expect(q.currentLoadKg).toBe(50); expect(q.currentReps).toBe(8);
    expect(q.seriesTargets?.map(s=>[s.currentLoadKg,s.targetReps])).toEqual([[30,12],[40,10],[50,8]]);
  });
  it('sem carga e reconhecimento não contaminam base nem RIR', () => {
    const c = [...rows('SUPINO',[0,40,40],[30,12,12]),{...rows('SUPINO',[100],[30])[0],set_type:'recognition',set_number:4,rir:0}];
    const q = build({performance:buildExercisePerformance('SUPINO',c,[],{min:8,max:12}),recentLogs:c,historyLogs:rows('SUPINO',[38],[12],'prev','2026-10-26'),now});
    expect(q.currentLoadKg).toBe(40); expect(q.recommendedLoadKg).toBe(42);
  });
});
