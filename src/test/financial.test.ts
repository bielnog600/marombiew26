import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  formatMoney, normalizeCurrency, monthKey, monthRange, monthLabel, isValidMonthKey,
  recentMonthKeys, effectivePaymentStatus, daysUntilDue, isDueSoon,
  emptyMoney, addMoney, formatMoneyByCurrency, packageCountsAsOwnRevenue,
  packageIsEnding, packageCanBeDeleted, planIsDueInMonth, planDueDateForMonth,
  summarizeMonth, receivedByStudentInMonth, packageIsRelevantInMonth,
  pickNextClass, formatNextClassLabel, monthUtcRangeForTimezone, localDateTimeToUtcIso,
  paymentBelongsToMonth,
} from '@/lib/financial';

describe('moeda', () => {
  it('formata euro e real com o símbolo correto', () => {
    expect(formatMoney(30, 'EUR')).toBe('€30.00');
    expect(formatMoney(30, 'BRL')).toBe('R$30.00');
  });

  it('assume euro quando a moeda é desconhecida ou ausente', () => {
    expect(normalizeCurrency(null)).toBe('EUR');
    expect(normalizeCurrency('USD')).toBe('EUR');
    expect(formatMoney(10, undefined)).toBe('€10.00');
  });

  it('nunca converte moedas: soma cada uma separadamente', () => {
    const m = emptyMoney();
    addMoney(m, 100, 'EUR');
    addMoney(m, 250, 'BRL');
    expect(m).toEqual({ EUR: 100, BRL: 250 });
    expect(formatMoneyByCurrency(m)).toBe('€100.00 + R$250.00');
  });

  it('mostra a moeda base quando não há valores', () => {
    expect(formatMoneyByCurrency(emptyMoney())).toBe('€0.00');
  });
});

describe('meses', () => {
  it('gera a chave do mês', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(monthKey(new Date(2026, 11, 1))).toBe('2026-12');
  });

  it('valida chaves de mês', () => {
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-1')).toBe(false);
  });

  it('devolve o intervalo correto, incluindo fevereiro bissexto', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2026-04')).toEqual({ start: '2026-04-01', end: '2026-04-30' });
  });

  it('rejeita mês inválido', () => {
    expect(() => monthRange('2026-00')).toThrow();
  });

  it('rotula em português', () => {
    expect(monthLabel('2026-03')).toBe('Março 2026');
  });

  it('lista meses recentes do mais novo para o mais antigo', () => {
    const list = recentMonthKeys(new Date(2026, 1, 10), 3);
    expect(list).toEqual(['2026-02', '2026-01', '2025-12']);
  });
});

describe('estado efetivo do pagamento', () => {
  const today = new Date(2026, 8, 10); // 2026-09-10

  it('pendente com vencimento passado é vencido', () => {
    expect(effectivePaymentStatus({ status: 'pendente', due_date: '2026-09-01' }, today)).toBe('vencido');
  });

  it('pendente com vencimento hoje continua pendente', () => {
    expect(effectivePaymentStatus({ status: 'pendente', due_date: '2026-09-10' }, today)).toBe('pendente');
  });

  it('pendente sem vencimento continua pendente', () => {
    expect(effectivePaymentStatus({ status: 'pendente', due_date: null }, today)).toBe('pendente');
  });

  it('nunca altera pago, cancelado ou reembolsado', () => {
    expect(effectivePaymentStatus({ status: 'pago', due_date: '2020-01-01' }, today)).toBe('pago');
    expect(effectivePaymentStatus({ status: 'cancelado', due_date: '2020-01-01' }, today)).toBe('cancelado');
    expect(effectivePaymentStatus({ status: 'reembolsado', due_date: '2020-01-01' }, today)).toBe('reembolsado');
  });
});

describe('vencimentos próximos', () => {
  const today = new Date(2026, 8, 10);

  it('conta dias até o vencimento', () => {
    expect(daysUntilDue('2026-09-17', today)).toBe(7);
    expect(daysUntilDue('2026-09-05', today)).toBe(-5);
    expect(daysUntilDue(null, today)).toBeNull();
  });

  it('marca como a vencer apenas dentro da janela de 7 dias', () => {
    expect(isDueSoon('2026-09-12', today)).toBe(true);
    expect(isDueSoon('2026-09-17', today)).toBe(true);
    expect(isDueSoon('2026-09-18', today)).toBe(false);
    expect(isDueSoon('2026-09-01', today)).toBe(false);
  });
});

describe('pacotes', () => {
  it('pacote ligado a um pagamento não conta receita duas vezes', () => {
    expect(packageCountsAsOwnRevenue({ payment_id: null })).toBe(true);
    expect(packageCountsAsOwnRevenue({ payment_id: 'abc' })).toBe(false);
  });

  it('detecta pacote a acabar apenas quando ativo', () => {
    expect(packageIsEnding({ status: 'ativo', remaining_classes: 2 })).toBe(true);
    expect(packageIsEnding({ status: 'ativo', remaining_classes: 3 })).toBe(false);
    expect(packageIsEnding({ status: 'esgotado', remaining_classes: 0 })).toBe(false);
  });

  it('só permite apagar pacote sem aulas consumidas', () => {
    expect(packageCanBeDeleted({ used_classes: 0 })).toBe(true);
    expect(packageCanBeDeleted({ used_classes: 1 })).toBe(false);
  });
});

describe('planos recorrentes', () => {
  const base = { status: 'active', billing_frequency: 'monthly', start_date: '2026-01-10', end_date: null as string | null, due_day: 5 };

  it('vigente no mês de início', () => {
    expect(planIsDueInMonth(base, '2026-01')).toBe(true);
  });

  it('não vigente antes do início', () => {
    expect(planIsDueInMonth(base, '2025-12')).toBe(false);
  });

  it('não vigente depois do fim', () => {
    expect(planIsDueInMonth({ ...base, end_date: '2026-03-31' }, '2026-04')).toBe(false);
    expect(planIsDueInMonth({ ...base, end_date: '2026-03-31' }, '2026-03')).toBe(true);
  });

  it('planos pausados ou encerrados não geram cobrança', () => {
    expect(planIsDueInMonth({ ...base, status: 'paused' }, '2026-02')).toBe(false);
    expect(planIsDueInMonth({ ...base, status: 'ended' }, '2026-02')).toBe(false);
  });

  it('calcula o vencimento do mês limitado ao último dia', () => {
    expect(planDueDateForMonth({ due_day: 5 }, '2026-02')).toBe('2026-02-05');
    expect(planDueDateForMonth({ due_day: 28 }, '2026-02')).toBe('2026-02-28');
    expect(planDueDateForMonth({ due_day: 31 }, '2026-02')).toBe('2026-02-28');
  });
});

describe('isolamento mensal do resumo', () => {
  const today = new Date(2026, 7, 15); // 2026-08-15
  const base = { student_id: 'a1', amount: 100, currency: 'EUR', status: 'pendente', paid_at: null, reference_month: null };

  it('cobrança de agosto pendente aparece em agosto', () => {
    const t = summarizeMonth([{ ...base, due_date: '2026-08-20' }], [], '2026-08', today);
    expect(t.toReceive.EUR).toBe(100);
  });

  it('cobrança de setembro pendente não aparece em agosto', () => {
    const t = summarizeMonth([{ ...base, due_date: '2026-09-20' }], [], '2026-08', today);
    expect(t.toReceive.EUR).toBe(0);
  });

  it('vencida de setembro não entra em vencidos de agosto', () => {
    const later = new Date(2026, 8, 25);
    const t = summarizeMonth([{ ...base, due_date: '2026-09-10' }], [], '2026-08', later);
    expect(t.overdue.EUR).toBe(0);
    const setembro = summarizeMonth([{ ...base, due_date: '2026-09-10' }], [], '2026-09', later);
    expect(setembro.overdue.EUR).toBe(100);
  });

  it('aluno com dívida em agosto e setembro conta uma vez em agosto', () => {
    const later = new Date(2026, 8, 25);
    const t = summarizeMonth([
      { ...base, due_date: '2026-08-10' },
      { ...base, due_date: '2026-09-10' },
    ], [], '2026-08', later);
    expect(t.studentsOverdue).toBe(1);
    expect(t.overdue.EUR).toBe(100);
  });

  it('dueSoon de setembro não aparece no resumo de agosto', () => {
    const near = new Date(2026, 7, 30); // 30/08
    const t = summarizeMonth([{ ...base, due_date: '2026-09-02' }], [], '2026-08', near);
    expect(t.dueSoon.EUR).toBe(0);
  });

  it('pagamento efetuado em setembro de cobrança de agosto entra na receita de setembro', () => {
    const p = { ...base, status: 'pago', due_date: '2026-08-10', paid_at: '2026-09-03T10:00:00Z' };
    expect(summarizeMonth([p], [], '2026-08', today).received.EUR).toBe(0);
    expect(summarizeMonth([p], [], '2026-09', today).received.EUR).toBe(100);
  });

  it('total previsto usa apenas os dados do mês', () => {
    const t = summarizeMonth([
      { ...base, status: 'pago', due_date: '2026-08-01', paid_at: '2026-08-02T10:00:00Z' },
      { ...base, due_date: '2026-08-20', amount: 50 },
      { ...base, due_date: '2026-09-20', amount: 999 },
    ], [], '2026-08', today);
    expect(t.expectedTotal.EUR).toBe(150);
  });

  it('reference_month tem prioridade sobre due_date', () => {
    const t = summarizeMonth([{ ...base, due_date: '2026-09-05', reference_month: '2026-08' }], [], '2026-08', today);
    expect(t.toReceive.EUR).toBe(100);
  });

  it('pendente sem due_date nem reference_month não polui o resumo', () => {
    const t = summarizeMonth([{ ...base, due_date: null }], [], '2026-08', today);
    expect(t.toReceive.EUR).toBe(0);
  });
});

describe('receita por aluno', () => {
  const key = '2026-08';
  it('pacote pago sem payment_id aparece na receita por aluno', () => {
    const rows = receivedByStudentInMonth([], [{
      student_id: 'a1', student_name: 'Ana', total_amount: 200, currency: 'EUR',
      payment_id: null, payment_status: 'pago', payment_date: '2026-08-05',
    }], key);
    expect(rows).toEqual([{ name: 'Ana', currency: 'EUR', amount: 200 }]);
  });

  it('pacote com payment_id não duplica receita', () => {
    const rows = receivedByStudentInMonth([{
      student_id: 'a1', student_name: 'Ana', amount: 200, currency: 'EUR',
      status: 'pago', paid_at: '2026-08-05T09:00:00Z', due_date: '2026-08-05',
    }], [{
      student_id: 'a1', student_name: 'Ana', total_amount: 200, currency: 'EUR',
      payment_id: 'pay-1', payment_status: 'pago', payment_date: '2026-08-05',
    }], key);
    expect(rows).toEqual([{ name: 'Ana', currency: 'EUR', amount: 200 }]);
  });
});

describe('vigência de pacote por mês', () => {
  const pkg = { status: 'ativo', start_date: '2026-08-18', expiry_date: '2026-09-17' };
  it('relevante em agosto', () => expect(packageIsRelevantInMonth(pkg, '2026-08')).toBe(true));
  it('relevante em setembro', () => expect(packageIsRelevantInMonth(pkg, '2026-09')).toBe(true));
  it('não relevante em outubro', () => expect(packageIsRelevantInMonth(pkg, '2026-10')).toBe(false));
  it('não relevante em julho', () => expect(packageIsRelevantInMonth(pkg, '2026-07')).toBe(false));
  it('sem expiry_date é relevante de start_date em diante', () => {
    const aberto = { status: 'ativo', start_date: '2026-08-18', expiry_date: null };
    expect(packageIsRelevantInMonth(aberto, '2026-08')).toBe(true);
    expect(packageIsRelevantInMonth(aberto, '2027-05')).toBe(true);
    expect(packageIsRelevantInMonth(aberto, '2026-07')).toBe(false);
  });
  it('pacote cancelado nunca é relevante', () => {
    expect(packageIsRelevantInMonth({ ...pkg, status: 'cancelado' }, '2026-08')).toBe(false);
  });
});

describe('próxima aula', () => {
  const now = new Date('2026-09-08T10:00:00Z');
  it('mostra o evento futuro válido', () => {
    const ev = pickNextClass([{ start_datetime: '2026-09-10T17:00:00Z', status: 'confirmado' }], now);
    expect(ev?.start_datetime).toBe('2026-09-10T17:00:00Z');
  });
  it('sem evento futuro devolve null', () => {
    expect(pickNextClass([{ start_datetime: '2026-09-01T17:00:00Z', status: 'confirmado' }], now)).toBeNull();
  });
  it('evento cancelado não conta', () => {
    expect(pickNextClass([{ start_datetime: '2026-09-10T17:00:00Z', status: 'cancelado' }], now)).toBeNull();
  });
  it('evento concluído não conta', () => {
    expect(pickNextClass([{ start_datetime: '2026-09-10T17:00:00Z', status: 'concluido' }], now)).toBeNull();
  });
  it('usa o evento mais próximo entre vários', () => {
    const ev = pickNextClass([
      { start_datetime: '2026-09-20T17:00:00Z', status: 'confirmado' },
      { start_datetime: '2026-09-11T09:00:00Z', status: 'pendente' },
    ], now);
    expect(ev?.start_datetime).toBe('2026-09-11T09:00:00Z');
  });
  it('formata a próxima aula no timezone operacional', () => {
    expect(formatNextClassLabel('2026-09-10T17:00:00Z')).toBe('10/09 às 18:00');
  });
});

describe('timezone Europe/Lisbon', () => {
  it('aula em 31/08 às 23:30 conta em agosto', () => {
    const { startUtc, endExclusiveUtc } = monthUtcRangeForTimezone('2026-08');
    const aula = localDateTimeToUtcIso('2026-08-31T23:30');
    expect(aula >= startUtc && aula < endExclusiveUtc).toBe(true);
  });

  it('aula em 01/09 às 00:30 conta em setembro', () => {
    const agosto = monthUtcRangeForTimezone('2026-08');
    const setembro = monthUtcRangeForTimezone('2026-09');
    const aula = localDateTimeToUtcIso('2026-09-01T00:30');
    expect(aula < agosto.endExclusiveUtc).toBe(false);
    expect(aula >= setembro.startUtc && aula < setembro.endExclusiveUtc).toBe(true);
  });

  it('respeita o horário de verão (verão UTC+1, inverno UTC+0)', () => {
    expect(monthUtcRangeForTimezone('2026-08').startUtc).toBe('2026-07-31T23:00:00.000Z');
    expect(monthUtcRangeForTimezone('2026-01').startUtc).toBe('2026-01-01T00:00:00.000Z');
    expect(monthUtcRangeForTimezone('2026-10').endExclusiveUtc).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('primeira cobrança do plano recorrente', () => {
  it('start_date 18/09 com due_day 10 vence a 18/09', () => {
    expect(planDueDateForMonth({ due_day: 10, start_date: '2026-09-18' }, '2026-09')).toBe('2026-09-18');
  });
  it('no mês seguinte volta ao dia 10', () => {
    expect(planDueDateForMonth({ due_day: 10, start_date: '2026-09-18' }, '2026-10')).toBe('2026-10-10');
  });
  it('start_date 01/09 com due_day 10 vence a 10/09', () => {
    expect(planDueDateForMonth({ due_day: 10, start_date: '2026-09-01' }, '2026-09')).toBe('2026-09-10');
  });
  it('end_date antes do due_day limita o vencimento', () => {
    expect(planDueDateForMonth({ due_day: 10, start_date: '2026-01-01', end_date: '2026-12-05' }, '2026-12')).toBe('2026-12-05');
  });
  it('end_date noutro mês não altera o vencimento', () => {
    expect(planDueDateForMonth({ due_day: 10, start_date: '2026-01-01', end_date: '2027-03-05' }, '2026-12')).toBe('2026-12-10');
  });
});

describe('UX de créditos (fonte da UI)', () => {
  const tab = readFileSync('src/components/financial/StudentFinancialTab.tsx', 'utf8');
  const adjust = readFileSync('src/components/financial/AdjustCreditsDialog.tsx', 'utf8');
  const hook = readFileSync('src/hooks/useFinancial.ts', 'utf8');

  it('botão +Aula não existe mais', () => {
    expect(tab).not.toMatch(/<Plus className="h-3 w-3 mr-1" \/> Aula/);
  });
  it('botão -Aula não existe mais', () => {
    expect(tab).not.toMatch(/Minus/);
  });
  it('Registar aula continua existindo', () => {
    expect(tab).toContain('Registar aula');
  });
  it('Estornar continua existindo', () => {
    expect(tab).toContain('Estornar');
  });
  it('Ajustar saldo é ação secundária com dialog próprio', () => {
    expect(tab).toContain('Ajustar saldo');
    expect(tab).toContain('AdjustCreditsDialog');
  });
  it('ajustar saldo exige motivo e regista manual_adjustment', () => {
    expect(adjust).toContain('O motivo é obrigatório');
    expect(adjust).toContain("action_type: 'manual_adjustment'");
  });
  it('saldo não pode ficar negativo (bloqueio no helper)', () => {
    expect(hook).toContain('Saldo insuficiente');
    expect(hook).toContain('não pode ficar negativo');
  });
});

describe('pertença ao mês', () => {
  it('usa reference_month quando existe, senão due_date', () => {
    expect(paymentBelongsToMonth({ reference_month: '2026-08', due_date: '2026-09-01' }, '2026-08')).toBe(true);
    expect(paymentBelongsToMonth({ reference_month: null, due_date: '2026-08-31' }, '2026-08')).toBe(true);
    expect(paymentBelongsToMonth({ reference_month: null, due_date: null }, '2026-08')).toBe(false);
  });
});
