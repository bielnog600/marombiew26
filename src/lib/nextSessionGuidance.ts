import type { StudentWeeklySummary } from '@/hooks/useStudentsWeeklySummary';

const firstName = (full: string) => (full || 'aluno').split(' ')[0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[], max = 2) => {
  const arr = items.slice(0, max);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
};

/**
 * Gera um parágrafo curto, direto e acionável com orientação para a próxima
 * sessão/semana do aluno, baseado em aderência + progressão da semana.
 */
export const buildNextSessionGuidance = (s: StudentWeeklySummary): string => {
  const name = firstName(s.studentName);
  const a = s.adherence;
  const p = s.progression;

  if (!a || !p) {
    return `Sem plano ativo ou sem registros suficientes para ${name}. Próxima sessão: cobrar registro de carga e reps em todos os exercícios para gerar base de progressão.`;
  }

  const parts: string[] = [];

  // 1. Direção da semana
  switch (a.status) {
    case 'apto_avancar':
      parts.push(p.improved.length > 0
        ? `${cap(name)}, semana boa — pode avançar.`
        : `${cap(name)}, aderência ok, mas sem evolução clara — avance com cautela.`);
      break;
    case 'manter_semana':
      parts.push(`${cap(name)}, manter a semana atual e consolidar execução.`);
      break;
    case 'repetir_semana':
      parts.push(`${cap(name)}, repetir a semana — aderência ficou baixa.`);
      break;
    case 'sugerir_reanalise':
      parts.push(`${cap(name)}, registros confusos — vou reanalisar o plano antes de progredir.`);
      break;
    case 'dados_insuficientes':
      parts.push(`${cap(name)}, faltou registro de carga/reps — sem base para progredir.`);
      break;
  }

  // 2. Exercícios que evoluíram → aumentar carga / topo da faixa
  const improvedTop = p.improved
    .filter((d) => d.weightDelta > 0 || d.repsDelta > 0)
    .slice(0, 2)
    .map((d) => d.exercise);
  if (improvedTop.length > 0 && a.status !== 'repetir_semana') {
    parts.push(`Na próxima sessão, subir carga ou buscar o topo da faixa em ${list(improvedTop)}.`);
  }

  // 3. Exercícios que regrediram → manter/reduzir e ajustar execução
  const regressedTop = p.regressed.slice(0, 2).map((d) => d.exercise);
  if (regressedTop.length > 0) {
    parts.push(`Em ${list(regressedTop)}, manter (ou reduzir) a carga e focar em amplitude e controle.`);
  }

  // 4. Sem registros
  const missingTop = (p.missing || []).slice(0, 2);
  if (missingTop.length > 0) {
    parts.push(`Sem base confiável em ${list(missingTop)} — pedir para registrar carga e reps na próxima sessão.`);
  }

  // 5. Fechamento conservador quando aderência baixa
  if (a.status === 'repetir_semana' || a.status === 'manter_semana') {
    if (improvedTop.length === 0 && regressedTop.length === 0) {
      parts.push('Semana conservadora: mesmo plano, foco em presença e execução.');
    }
  }

  return parts.join(' ');
};