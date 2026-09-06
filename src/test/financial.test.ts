import { describe, it, expect } from 'vitest';
import {
  formatMoney, normalizeCurrency, monthKey, monthRange, monthLabel, isValidMonthKey,
  recentMonthKeys, effectivePaymentStatus, daysUntilDue, isDueSoon,
  emptyMoney, addMoney, formatMoneyByCurrency, packageCountsAsOwnRevenue,
  packageIsEnding, packageCanBeDeleted, planIsDueInMonth, planDueDateForMonth,
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
