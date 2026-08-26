/**
 * Gerador ÚNICO e determinístico da mensagem de WhatsApp de progressão.
 * Usado tanto na Consultoria quanto no card da Home do admin.
 */
import type { AttentionPriority } from './trainingIntensityAttention';
import { RPE_TARGET_LABEL } from './trainingIntensityAttention';

export interface ContactRecommendation {
  exerciseName: string;
  nextAction: 'increase_load' | 'increase_reps' | 'maintain';
  suggestedIncrement: number;
}

export interface ContactMessageInput {
  studentName: string;
  rpe?: number | null;
  priority: AttentionPriority;
  recommendations: ContactRecommendation[];
}

const firstName = (name: string) => (name || 'Aluno').trim().split(/\s+/)[0];

const formatKg = (kg: number) => {
  const rounded = Math.round(kg * 10) / 10;
  return String(rounded).replace('.', ',');
};

export const formatRecommendationLine = (r: ContactRecommendation): string => {
  if (r.nextAction === 'increase_load' && r.suggestedIncrement > 0) {
    return `• ${r.exerciseName}: +${formatKg(r.suggestedIncrement)} kg`;
  }
  if (r.nextAction === 'increase_reps') {
    return `• ${r.exerciseName}: +1 rep`;
  }
  return `• ${r.exerciseName}: manter carga`;
};

export const buildProgressionContactMessage = (input: ContactMessageInput): string => {
  const name = firstName(input.studentName);
  const recs = (input.recommendations || []).filter((r) => r.nextAction !== 'maintain');
  const rpeText = input.rpe != null ? `${String(input.rpe).replace('.', ',')}/10` : null;

  if (input.priority === 'attention_only') {
    return `Oi ${name}! ${rpeText ? `Vi que seu último treino ficou em ${rpeText} de esforço.` : 'Analisei seu último treino.'}\n\nNo próximo, quero que você tente se aproximar um pouco mais do esforço planejado, mantendo a execução controlada.\n\nPor enquanto não precisa alterar carga automaticamente. Se completar as séries com muita sobra novamente, me avisa.`;
  }

  if (recs.length === 0) {
    return `Oi ${name}! Analisei seus treinos e a constância está ótima. Nessa semana vamos manter as cargas e focar na técnica perfeita. Bora pra cima!`;
  }

  const recText = recs.map(formatRecommendationLine).join('\n');

  if (input.priority === 'high') {
    return `Oi ${name}! Analisei seu último treino e vi que o esforço ficou em ${rpeText ?? 'abaixo do alvo'}.\n\nNo próximo treino podemos subir um pouco a intensidade.\n\nSugestões:\n${recText}\n\nA meta é manter boa execução e aproximar as séries principais de um esforço ${RPE_TARGET_LABEL}, sem perder técnica. Se sentir que a execução piorou, mantém a carga e me chama.`;
  }

  return `Oi ${name}! Seu esforço ficou dentro do alvo${rpeText ? ` (${rpeText})` : ''} e já temos progressão disponível para o próximo treino:\n\n${recText}\n\nMantém a execução controlada e me conta como foi.`;
};
