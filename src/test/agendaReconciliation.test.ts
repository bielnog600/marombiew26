import { describe, it, expect } from 'vitest';
import {
  packageWasValidForEvent,
  selectPackageForEvent,
  civilDateInTimezone,
} from '@/lib/agendaReconciliation';
import { nextPackageStartDate, packageDatesWarning } from '@/lib/financial';
import { readFileSync } from 'node:fs';

const pack = (over: Partial<any> = {}): any => ({
  id: 'p1',
  student_id: 's1',
  package_name: 'PACK 8',
  total_classes: 8,
  used_classes: 0,
  remaining_classes: 8,
  status: 'ativo',
  start_date: '2026-08-18',
  expiry_date: '2026-09-17',
  ...over,
});

describe('vigência do pacote na data da aula', () => {
  it('aula 21/08 com pacote 18/08 → 17/09 é elegível', () => {
    expect(packageWasValidForEvent(pack(), '2026-08-21T10:00:00Z')).toBe(true);
  });
  it('aula 17/08 não é elegível (antes do início)', () => {
    expect(packageWasValidForEvent(pack(), '2026-08-17T10:00:00Z')).toBe(false);
  });
  it('aula 18/09 não é elegível (depois da validade)', () => {
    expect(packageWasValidForEvent(pack(), '2026-09-18T10:00:00Z')).toBe(false);
  });
  it('pacote sem validade é elegível depois do início', () => {
    expect(packageWasValidForEvent(pack({ expiry_date: null }), '2027-01-05T10:00:00Z')).toBe(true);
  });
  it('pacote esgotado hoje continua sendo candidato histórico', () => {
    expect(packageWasValidForEvent(pack({ status: 'esgotado' }), '2026-08-25T10:00:00Z')).toBe(true);
  });
  it('pacote de outro aluno nunca é elegível', () => {
    expect(packageWasValidForEvent(pack(), '2026-08-21T10:00:00Z', { studentId: 's2' })).toBe(false);
  });
  it('data civil usa o timezone operacional', () => {
    expect(civilDateInTimezone('2026-08-21T23:30:00Z')).toBe('2026-08-22');
  });
});

describe('seleção do pacote para a aula', () => {
  it('não usa pacote ativo criado depois da aula', () => {
    const novo = pack({ id: 'novo', start_date: '2026-09-06', expiry_date: '2026-10-05', remaining_classes: 8 });
    expect(selectPackageForEvent([novo], '2026-08-21T10:00:00Z', 's1')).toEqual({ kind: 'none' });
  });
  it('aula antiga + pacote novo com saldo → nenhum pacote válido', () => {
    const novo = pack({ id: 'novo', start_date: '2026-09-06', expiry_date: null });
    const sel = selectPackageForEvent([novo], '2026-07-01T10:00:00Z', 's1');
    expect(sel.kind).toBe('none');
  });
  it('um pacote vigente → candidato único', () => {
    const sel = selectPackageForEvent([pack()], '2026-08-21T10:00:00Z', 's1');
    expect(sel.kind).toBe('single');
  });
  it('dois pacotes cobrindo a data → multiple_packages', () => {
    const a = pack({ id: 'a' });
    const b = pack({ id: 'b', start_date: '2026-08-01', expiry_date: '2026-08-31' });
    const sel = selectPackageForEvent([a, b], '2026-08-21T10:00:00Z', 's1');
    expect(sel.kind).toBe('multiple');
    if (sel.kind === 'multiple') expect(sel.candidates).toHaveLength(2);
  });
  it('cada aluno de uma aula em dupla é avaliado com seus próprios pacotes', () => {
    const isabella = pack({ id: 'i', student_id: 'isa' });
    const pamela = pack({ id: 'p', student_id: 'pam', start_date: '2026-09-06' });
    expect(selectPackageForEvent([isabella, pamela], '2026-08-21T10:00:00Z', 'isa').kind).toBe('single');
    expect(selectPackageForEvent([isabella, pamela], '2026-08-21T10:00:00Z', 'pam').kind).toBe('none');
  });
});

const SRC = readFileSync('src/lib/agendaReconciliation.ts', 'utf8');

describe('regras estruturais da conciliação', () => {
  it('occurred_at usa a data real da aula', () => {
    expect(SRC).toContain('occurred_at: ev.start_datetime');
  });
  it('mantém o vínculo com o evento da agenda', () => {
    expect(SRC).toContain('calendar_event_id: ev.id');
  });
  it('protege contra débito duplicado', () => {
    expect(SRC).toContain('debitedSet.has');
  });
  it('não altera status de eventos da agenda', () => {
    expect(SRC).not.toContain("update({ status: 'concluido' })");
    expect(SRC).not.toContain('workout_sessions');
  });
  it('só considera concluido e falta', () => {
    expect(SRC).toContain("const CREDIT_EVENT_STATUS = ['concluido', 'falta']");
    expect(SRC).not.toContain("['pendente', 'confirmado']");
  });
  it('dry-run não usa status de "corrigido"', () => {
    expect(SRC).toContain("status: 'ready_to_fix'");
  });
  it('não força saldo negativo', () => {
    expect(SRC).toContain('pkg.remaining_classes <= 0');
    expect(SRC).toContain("status: 'zero_balance'");
  });
});

describe('PackageDialog — datas', () => {
  it('novo pacote: start_date acompanha payment_date', () => {
    expect(nextPackageStartDate('2026-08-18', '2026-09-06', false)).toBe('2026-08-18');
  });
  it('start_date editado manualmente não é sobrescrito', () => {
    expect(nextPackageStartDate('2026-08-18', '2026-09-01', true)).toBe('2026-09-01');
  });
  it('payment_date < start_date gera aviso', () => {
    expect(packageDatesWarning('2026-08-18', '2026-09-06')).toMatch(/pagamento foi registado antes/i);
  });
  it('datas coerentes não geram aviso', () => {
    expect(packageDatesWarning('2026-08-18', '2026-08-18')).toBeNull();
  });
});
