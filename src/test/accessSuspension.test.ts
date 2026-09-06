import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INACTIVITY_SUSPENSION_DAYS,
  TRAINER_REACTIVATION_WHATSAPP,
  buildReactivationWhatsAppUrl,
  isEligibleForInactivitySuspension,
  suspensionReasonLabel,
  getInactiveDays,
  formatInactiveDays,
  formatLastAccessLabel,
} from '@/lib/accessControl';

const NOW = new Date('2026-09-05T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe('regra dos 15 dias', () => {
  it('constante central é 15', () => {
    expect(INACTIVITY_SUSPENSION_DAYS).toBe(15);
  });

  it('aluno ativo com acesso há 10 dias permanece ativo', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: daysAgo(10), now: NOW })).toBe(false);
  });

  it('exatamente 15 dias ainda não suspende', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: daysAgo(15), now: NOW })).toBe(false);
  });

  it('16 dias suspende', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: daysAgo(16), now: NOW })).toBe(true);
  });

  it('nunca acessou (null) não suspende', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: null, now: NOW })).toBe(false);
  });

  it('já suspenso não é reprocessado', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'suspended', lastActiveAt: daysAgo(40), now: NOW })).toBe(false);
  });

  it('admin/professor nunca é suspenso', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: daysAgo(90), isAdmin: true, now: NOW })).toBe(false);
  });

  it('reativação zera a janela (last_active_at = agora)', () => {
    expect(isEligibleForInactivitySuspension({ accessStatus: 'active', lastActiveAt: NOW.toISOString(), now: NOW })).toBe(false);
  });
});

describe('rótulos de motivo', () => {
  it('usa português, sem códigos técnicos', () => {
    expect(suspensionReasonLabel('inactivity')).toBe('Inatividade');
    expect(suspensionReasonLabel('manual')).toBe('Manual');
  });
});

describe('link do WhatsApp', () => {
  it('usa o número do treinador', () => {
    expect(TRAINER_REACTIVATION_WHATSAPP).toBe('351939184666');
    expect(buildReactivationWhatsAppUrl('João')).toContain('https://wa.me/351939184666?text=');
  });

  it('inclui o nome quando disponível e faz encode', () => {
    const url = buildReactivationWhatsAppUrl('João Silva');
    expect(decodeURIComponent(url.split('text=')[1])).toBe(
      'Olá Fabiel! Sou João Silva. Meu acesso ao MAROMBIEW está suspenso e gostaria de solicitar a reativação da minha conta.',
    );
    expect(url).not.toContain(' ');
  });

  it('funciona sem nome', () => {
    const url = buildReactivationWhatsAppUrl(null);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(
      'Olá Fabiel! Meu acesso ao MAROMBIEW está suspenso e gostaria de solicitar a reativação da minha conta.',
    );
  });

  it('não inclui dados sensíveis', () => {
    const url = buildReactivationWhatsAppUrl('João');
    expect(url).not.toMatch(/@/);
    expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe('dias sem acesso (helper central)', () => {
  it('null quando não há last_active_at', () => {
    expect(getInactiveDays(null, NOW)).toBeNull();
    expect(formatInactiveDays(null)).toBeNull();
  });

  it('nunca negativo', () => {
    expect(getInactiveDays(new Date(NOW.getTime() + 5 * 86400000), NOW)).toBe(0);
  });

  it('16 dias', () => {
    expect(formatInactiveDays(getInactiveDays(daysAgo(16), NOW))).toBe('16 dias sem acesso');
  });

  it('25 dias', () => {
    expect(formatInactiveDays(getInactiveDays(daysAgo(25), NOW))).toBe('25 dias sem acesso');
  });

  it('singular em 1 dia', () => {
    expect(formatInactiveDays(getInactiveDays(daysAgo(1), NOW))).toBe('1 dia sem acesso');
  });

  it('rótulo do admin usa o mesmo cálculo', () => {
    expect(formatLastAccessLabel(getInactiveDays(daysAgo(16), NOW))).toBe('há 16 dias');
    expect(formatLastAccessLabel(getInactiveDays(daysAgo(1), NOW))).toBe('há 1 dia');
    expect(formatLastAccessLabel(null)).toBe('ainda não acessou');
  });
});

describe('unificação suspensão ↔ ativo (UI Consultoria)', () => {
  const src = readFileSync('src/components/consultoria/ConsultoriaStudentSearch.tsx', 'utf8');

  it('não existe mais botão separado de desativar/reativar aluno', () => {
    expect(src).not.toContain('toggleAtivo');
    expect(src).not.toContain('Desativar aluno');
    expect(src).not.toContain('Reativar aluno');
  });

  it('só existem as ações Suspender acesso e Ativar conta', () => {
    expect(src).toContain("'Ativar conta'");
    expect(src).toContain("'Suspender acesso'");
  });

  it('filtro "Desativados" foi removido e "Suspensos" permanece', () => {
    expect(src).not.toContain("label: 'Desativados'");
    expect(src).toContain("label: 'Suspensos'");
  });

  it('badge principal usa somente ATIVO/SUSPENSO', () => {
    expect(src).toContain("'SUSPENSO' : 'ATIVO'");
    expect(src).not.toContain('DESATIVADO');
  });

  it('estado local sincroniza ativo com o access_status após a RPC', () => {
    expect(src).toContain("ativo: type !== 'suspend',");
  });

  it('a transição continua vindo do backend (RPCs)', () => {
    expect(src).toContain('suspend_student_access');
    expect(src).toContain('reactivate_student_access');
  });
});

describe('unificação suspensão ↔ ativo (backend)', () => {
  const sql = readFileSync('supabase/migrations/20260905235833_9747adfa-a68a-48ea-8249-38db1265b97e.sql', 'utf8')
    .replace(/\s+/g, ' ');

  it('suspensão manual grava ativo = false', () => {
    expect(sql).toMatch(/suspend_student_access[\s\S]*access_status = 'suspended', ativo = false/);
  });

  it('suspensão automática grava ativo = false', () => {
    expect(sql).toMatch(/run_inactivity_suspension[\s\S]*access_status = 'suspended', ativo = false/);
  });

  it('reativação grava ativo = true e reinicia last_active_at', () => {
    expect(sql).toMatch(/reactivate_student_access[\s\S]*access_status = 'active', ativo = true/);
    expect(sql).toMatch(/reactivate_student_access[\s\S]*last_active_at = now\(\)/);
  });

  it('mantém a regra dos 15 dias', () => {
    expect(sql).toContain("interval '15 days'");
  });

  it('backfill só toca em quem já está suspenso', () => {
    expect(sql).toMatch(/UPDATE public\.students_profile SET ativo = false WHERE access_status = 'suspended' AND ativo IS DISTINCT FROM false/);
  });
});
