import { describe, expect, it } from 'vitest';
import { sortTrainingDays, trainingDaySortKey } from '@/lib/trainingDayOrder';
import { parsedDaysToWorkoutPlan, workoutPlanToParsedDays } from '@/lib/workoutSchema';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';

const day = (name: string): ParsedTrainingDay => ({ day: name, exercises: [] });

describe('ordem canônica dos dias do treino', () => {
  it('troca segunda↔terça: reordena para SEGUNDA antes de TERÇA', () => {
    const sorted = sortTrainingDays([day('TERÇA-FEIRA'), day('SEGUNDA-FEIRA')]);
    expect(sorted.map((d) => d.day)).toEqual(['SEGUNDA-FEIRA', 'TERÇA-FEIRA']);
  });
  it('normaliza acentos, maiúsculas e abreviações', () => {
    const sorted = sortTrainingDays([day('sabado'), day('Seg'), day('terca-feira'), day('QUARTA')]);
    expect(sorted.map((d) => d.day)).toEqual(['Seg', 'terca-feira', 'QUARTA', 'sabado']);
  });
  it('TREINO A…E vêm depois dos dias da semana, em ordem alfabética', () => {
    const sorted = sortTrainingDays([day('TREINO B'), day('SEXTA-FEIRA'), day('TREINO A'), day('SEGUNDA-FEIRA')]);
    expect(sorted.map((d) => d.day)).toEqual(['SEGUNDA-FEIRA', 'SEXTA-FEIRA', 'TREINO A', 'TREINO B']);
  });
  it('rótulos desconhecidos ficam por último, na ordem original', () => {
    const sorted = sortTrainingDays([day('FULL BODY'), day('TERÇA-FEIRA'), day('UPPER')]);
    expect(sorted.map((d) => d.day)).toEqual(['TERÇA-FEIRA', 'FULL BODY', 'UPPER']);
  });
  it('"Treino A" não é confundido com terça-feira', () => {
    expect(trainingDaySortKey('TREINO A')).toBeGreaterThan(trainingDaySortKey('DOMINGO'));
  });
  it('ao salvar (parsedDaysToWorkoutPlan), os dias são gravados ordenados', () => {
    const plan = parsedDaysToWorkoutPlan([day('TERÇA-FEIRA'), day('SEGUNDA-FEIRA'), day('TREINO A')]);
    expect(plan.days.map((d) => d.day)).toEqual(['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'TREINO A']);
  });
  it('na leitura (workoutPlanToParsedDays), planos antigos fora de ordem ficam certos', () => {
    const plan = parsedDaysToWorkoutPlan([day('SEGUNDA-FEIRA'), day('TERÇA-FEIRA')]);
    const shuffled = { ...plan, days: [...plan.days].reverse() };
    expect(workoutPlanToParsedDays(shuffled).map((d) => d.day)).toEqual(['SEGUNDA-FEIRA', 'TERÇA-FEIRA']);
  });
});
