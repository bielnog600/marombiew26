import { describe, it, expect } from 'vitest';
import {
  INACTIVITY_SUSPENSION_DAYS,
  TRAINER_REACTIVATION_WHATSAPP,
  buildReactivationWhatsAppUrl,
  isEligibleForInactivitySuspension,
  suspensionReasonLabel,
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
