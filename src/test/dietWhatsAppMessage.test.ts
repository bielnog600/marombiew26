import { describe, it, expect } from 'vitest';
import {
  buildDietWhatsAppMessage,
  resolveCarbCycleWhatsAppDays,
  resolveLinearDietTargets,
  resolveDietWhatsAppState,
  formatMacroDayLine,
} from '@/lib/dietWhatsAppMessage';

const izisProtocols = {
  carb_cycling: { enabled: true, assignments: { seg: 'medium', ter: 'high', qua: 'low', qui: 'high', sex: 'low', sab: 'low', dom: 'medium' } },
  weekly_day_targets: {
    dom: { type: 'medium', kcal: 1742, p: 148, c: 121, g: 74 },
    ter: { type: 'high', kcal: 1930, p: 148, c: 168, g: 74 },
    seg: { type: 'medium', kcal: 1742, p: 148, c: 121, g: 74 },
    qua: { type: 'low', kcal: 1634, p: 148, c: 94, g: 74 },
    qui: { type: 'high', kcal: 1930, p: 148, c: 168, g: 74 },
    sex: { type: 'low', kcal: 1634, p: 148, c: 94, g: 74 },
    sab: { type: 'low', kcal: 1634, p: 148, c: 94, g: 74 },
  },
};

const linearPlan = {
  titulo: 'Dieta Cutting',
  conteudo_json: { targets: { kcal: 1800, p: 150, c: 150, g: 60 } },
  protocols: null,
};

describe('dietWhatsAppMessage', () => {
  it('A. primeiro envio contém "Sua nova Dieta"', () => {
    const msg = buildDietWhatsAppMessage({ firstName: 'Izis', plan: linearPlan, resendState: 'new' });
    expect(msg).toContain('Sua nova Dieta já está disponível no app.');
  });

  it('B/C. nunca contém "seu nova" nem "Sua nova dieta"', () => {
    const msg = buildDietWhatsAppMessage({ firstName: 'Izis', plan: linearPlan, resendState: 'new' });
    expect(msg.toLowerCase()).not.toContain('seu nova');
    expect(msg).not.toContain('Sua nova dieta');
  });

  it('D. linear usa conteudo_json.targets e mostra apenas kcal', () => {
    expect(resolveLinearDietTargets(linearPlan.conteudo_json)).toEqual({ kcal: 1800, p: 150, c: 150, g: 60 });
    const msg = buildDietWhatsAppMessage({ firstName: 'Izis', plan: linearPlan, resendState: 'new' });
    expect(msg).toContain('🔥 1800 kcal');
    expect(msg).toContain('Proteína: 150 g');
  });

  it('E/F/G/K. carb cycling mostra ciclo em ordem SEG→DOM com metas do protocolo', () => {
    const msg = buildDietWhatsAppMessage({
      firstName: 'Izis',
      plan: { titulo: 'Dieta', conteudo_json: { targets: { kcal: 1740, p: 148, c: 120, g: 74 } }, protocols: izisProtocols },
      resendState: 'new',
    });
    expect(msg).not.toContain('Meta diária');
    expect(msg).toContain('🟡 Segunda — MEDIUM\n🔥 1742 kcal · P 148g · C 121g · G 74g');
    expect(msg).toContain('🟢 Terça — HIGH\n🔥 1930 kcal · P 148g · C 168g · G 74g');
    expect(msg).toContain('🔵 Quarta — LOW\n🔥 1634 kcal · P 148g · C 94g · G 74g');
    expect(msg).not.toContain('1919');
    const order = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map(d => msg.indexOf(d));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('H. weekly_day_targets tem prioridade sobre assignments', () => {
    const days = resolveCarbCycleWhatsAppDays({
      carb_cycling: { enabled: true, assignments: { ter: 'low' } },
      weekly_day_targets: { ter: { type: 'high', kcal: 1930 } },
    })!;
    expect(days.find(d => d.key === 'ter')).toMatchObject({ type: 'HIGH', kcal: 1930 });
  });

  const rubinhoProtocols = {
    carb_cycling: {
      enabled: false,
      assignments: { seg: 'medium', ter: 'high', qua: 'medium', qui: 'high', sex: 'medium', sab: 'medium', dom: 'medium' },
    },
    weekly_day_targets: null,
    weekly_energy_schedule: { enabled: true },
  };
  const rubinhoPlan = {
    titulo: 'Dieta',
    conteudo_json: { targets: { kcal: 1770, p: 183, c: 111, g: 66 } },
    protocols: rubinhoProtocols,
  };

  it('A–F. enabled=false com assignments residuais não vira Carb Cycling', () => {
    expect(resolveCarbCycleWhatsAppDays(rubinhoProtocols)).toBeNull();
    const msg = buildDietWhatsAppMessage({ firstName: 'Rubinho', plan: rubinhoPlan, resendState: 'new' });
    expect(msg).not.toContain('Ciclo de Carboidratos');
    expect(msg).not.toContain('HIGH');
    expect(msg).not.toContain('MEDIUM');
    expect(msg).not.toContain('LOW');
    expect(msg).toContain('Sua nova Dieta já está disponível no app.');
  });

  it('G–J. linear mostra somente kcal', () => {
    const msg = buildDietWhatsAppMessage({ firstName: 'Rubinho', plan: rubinhoPlan, resendState: 'new' });
    expect(msg).toContain('🔥 1770 kcal');
    expect(msg).toContain('🥩 Proteína: 183 g');
    expect(msg).toContain('🍞 Carboidratos: 111 g');
    expect(msg).toContain('🥑 Gorduras: 66 g');
  });

  it('K/L. Carb Cycling verdadeiro continua funcionando', () => {
    expect(resolveCarbCycleWhatsAppDays({ carb_cycling: { enabled: true, assignments: { ter: 'high', qua: 'low' } } })).not.toBeNull();
    const msg = buildDietWhatsAppMessage({ firstName: 'Izis', plan: { titulo: 'D', conteudo_json: null, protocols: izisProtocols }, resendState: 'new' });
    expect(msg).toContain('Ciclo de Carboidratos');
    expect(msg).toContain('🟢 Terça — HIGH\n🔥 1930 kcal · P 148g · C 168g · G 74g');
  });

  it('P/Q/R/S/T/U. macros ausentes, enabled=false e inferência legacy', () => {
    const partial = resolveCarbCycleWhatsAppDays({
      carb_cycling: { enabled: true, assignments: {} },
      weekly_day_targets: { ter: { type: 'high', kcal: 1930, c: 168 }, qua: { type: 'low', kcal: 1634 } },
    })!;
    const ter = partial.find(d => d.key === 'ter')!;
    expect(formatMacroDayLine(ter)).toBe('🔥 1930 kcal · C 168g');
    expect(formatMacroDayLine(ter)).not.toContain('P 0g');

    expect(resolveCarbCycleWhatsAppDays({
      carb_cycling: { enabled: false, assignments: { ter: 'high', qua: 'low' } },
      weekly_day_targets: { ter: { type: 'high', kcal: 1930 }, qua: { type: 'low', kcal: 1634 } },
    })).toBeNull();

    expect(resolveCarbCycleWhatsAppDays({
      weekly_day_targets: { ter: { type: 'high', kcal: 1930 }, qua: { type: 'low', kcal: 1634 } },
    })).not.toBeNull();

    expect(resolveCarbCycleWhatsAppDays({
      carb_cycling: { assignments: { ter: 'high', qua: 'low' } },
    })).toBeNull();
  });

  it('L. terça não mostra 1919 kcal do cardápio real', () => {
    const msg = buildDietWhatsAppMessage({
      firstName: 'Izis',
      plan: { titulo: 'D', conteudo_json: { targets: { kcal: 1919, p: 148, c: 168, g: 75 } }, protocols: izisProtocols },
      resendState: 'new',
    });
    expect(msg).not.toContain('1919');
  });

  it('M. weekly_energy_schedule sozinho não ativa Carb Cycling', () => {
    expect(resolveCarbCycleWhatsAppDays({ weekly_energy_schedule: { enabled: true } })).toBeNull();
  });

  it('I/J. fallback por assignments sem kcal não gera "0 kcal"', () => {
    const msg = buildDietWhatsAppMessage({
      firstName: 'Ana',
      plan: { titulo: 'D', conteudo_json: null, protocols: { carb_cycling: { enabled: true, assignments: { ter: 'high' } } } },
      resendState: 'new',
    });
    expect(msg).toContain('Terça — HIGH');
    expect(msg).not.toContain('0 kcal');
    expect(msg).not.toContain('NaN');
    expect(msg).not.toContain('undefined');
  });

  it('L/M/N. estados de envio', () => {
    expect(resolveDietWhatsAppState(0, null)).toBe('new');
    expect(resolveDietWhatsAppState(2, null)).toBe('adjusted');
    expect(resolveDietWhatsAppState(2, '2026-01-01T00:00:00Z')).toBe('resend');
    expect(buildDietWhatsAppMessage({ firstName: 'Izis', plan: linearPlan, resendState: 'adjusted' }))
      .toContain('Atualizei a sua Dieta');
    expect(buildDietWhatsAppMessage({ firstName: 'Izis', plan: linearPlan, resendState: 'resend' }))
      .toContain('Estou te reenviando as informações da sua Dieta');
  });

  it('dieta linear sem targets não inventa meta', () => {
    const msg = buildDietWhatsAppMessage({ firstName: 'Ana', plan: { titulo: 'D', conteudo_json: null, protocols: null }, resendState: 'new' });
    expect(msg).not.toContain('Meta diária');
    expect(msg).not.toContain('NaN');
  });
});
