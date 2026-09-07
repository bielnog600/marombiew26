import { describe, it, expect } from 'vitest';
import {
  classifyExerciseEquipmentStyle,
  isExerciseAllowedByProfile,
  equipmentStylePreferenceScore,
  normalizeExerciseProfile,
} from '../../supabase/functions/_shared/exerciseEquipmentProfile';
import { enforceExerciseProfile } from '../../supabase/functions/_shared/exerciseProfileEnforcement';
import { evaluateVariationCandidate, selectVariation } from '../../supabase/functions/_shared/variationSelection';

const CATALOG = [
  { nome: 'PUXADA ALTA ART.', grupo: 'COSTAS' },
  { nome: 'PUXADA ALTA ART. 2', grupo: 'COSTAS' },
  { nome: 'PUXADA ALTA ABERTA', grupo: 'COSTAS' },
  { nome: 'PUXADA ALTA TRIÂNGULO', grupo: 'COSTAS' },
  { nome: 'REMADA NEUTRA ART.', grupo: 'COSTAS' },
  { nome: 'REMADA TRIÂNGULO', grupo: 'COSTAS' },
  { nome: 'REMADA MÁQUINA', grupo: 'COSTAS' },
];

const dayWith = (exercise: string, variation: string | null = null) => ({
  day: 'A - Costas',
  exercises: [
    { exercise, series: '3', series2: '-', reps: '8-12', rir: '2', pause: '90s', variation },
  ],
});

describe('classificador de estilo de equipamento', () => {
  const articulated = [
    'PUXADA ALTA ART.',
    'PUXADA ALTA ART. 2',
    'REMADA NEUTRA ART.',
    'REMADA SUPINADA ART.',
    'REMADA UNIL. ART.',
    'SUPINO RETO ARTICULADO',
    'SUPINO INCLINADO ART.',
    'LEG PRESS 45 ART',
  ];
  for (const name of articulated) {
    it(`${name} → articulated`, () => {
      expect(classifyExerciseEquipmentStyle(name)).toBe('articulated');
    });
  }

  const basic = ['REMADA MÁQUINA', 'REMADA TRIÂNGULO', 'PUXADA ALTA ABERTA', 'PUXADA ALTA NEUTRA'];
  for (const name of basic) {
    it(`${name} → basic`, () => {
      expect(classifyExerciseEquipmentStyle(name)).toBe('basic');
    });
  }

  it('MÁQUINA/MACHINE não vira articulado automaticamente', () => {
    expect(classifyExerciseEquipmentStyle('SUPINO MÁQUINA')).toBe('basic');
    expect(classifyExerciseEquipmentStyle('CHEST PRESS MACHINE')).toBe('basic');
  });

  it('metadata explícita tem precedência', () => {
    expect(classifyExerciseEquipmentStyle('REMADA MÁQUINA', { equipment_type: 'articulada' })).toBe('articulated');
  });

  it('normalizeExerciseProfile faz default para mixed', () => {
    expect(normalizeExerciseProfile(undefined)).toBe('mixed');
    expect(normalizeExerciseProfile('qualquer')).toBe('mixed');
    expect(normalizeExerciseProfile('basic')).toBe('basic');
    expect(normalizeExerciseProfile('articulated_plus_basic')).toBe('articulated_plus_basic');
  });
});

describe('perfil basic — hard gate', () => {
  it('bloqueia articulado e permite básico', () => {
    expect(isExerciseAllowedByProfile('REMADA NEUTRA ART.', 'basic')).toBe(false);
    expect(isExerciseAllowedByProfile('REMADA TRIÂNGULO', 'basic')).toBe(true);
    expect(isExerciseAllowedByProfile('REMADA NEUTRA ART.', 'mixed')).toBe(true);
    expect(isExerciseAllowedByProfile('REMADA NEUTRA ART.', 'articulated_plus_basic')).toBe(true);
  });

  it('variação articulada é rejeitada com profile_conflict', () => {
    const verdict = evaluateVariationCandidate({
      day: dayWith('PUXADA ALTA ABERTA'),
      exerciseName: 'PUXADA ALTA ABERTA',
      candidate: 'PUXADA ALTA ART.',
      catalog: CATALOG,
      options: { exerciseProfile: 'basic' },
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe('profile_conflict');
  });

  it('principal articulado é substituído por básico e o plano final fica sem articulados', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.', 'PUXADA ALTA ART.')] };
    const audit = enforceExerciseProfile(plan, 'basic', CATALOG, {});
    expect(audit.status).toBe('REPAIRED');
    expect(audit.violations.length).toBeGreaterThanOrEqual(1);
    const main = plan.days[0].exercises[0].exercise;
    expect(classifyExerciseEquipmentStyle(main)).toBe('basic');
    const variation = plan.days[0].exercises[0].variation;
    if (variation) expect(classifyExerciseEquipmentStyle(variation)).toBe('basic');
  });

  it('sem candidato seguro não inventa exercício e marca revisão', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.')] };
    const audit = enforceExerciseProfile(plan, 'basic', [{ nome: 'REMADA NEUTRA ART.', grupo: 'COSTAS' }], {});
    expect(audit.status).toBe('REVIEW_REQUIRED');
    expect(plan.days[0].exercises[0].exercise).toBe('REMADA NEUTRA ART.');
  });

  it('restrição do aluno vence a preferência de perfil', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.')] };
    const audit = enforceExerciseProfile(plan, 'basic', CATALOG, {
      restrictionsText: 'Proibido REMADA TRIÂNGULO; Proibido REMADA MÁQUINA',
    });
    const main = plan.days[0].exercises[0].exercise;
    expect(main).not.toBe('REMADA TRIÂNGULO');
    expect(main).not.toBe('REMADA MÁQUINA');
    expect(audit.violations.length).toBe(1);
  });

  it('perfis mixed e articulated_plus_basic não removem articulados', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.')] };
    const audit = enforceExerciseProfile(plan, 'mixed', CATALOG, {});
    expect(audit.status).toBe('PASS');
    expect(plan.days[0].exercises[0].exercise).toBe('REMADA NEUTRA ART.');

    const plan2 = { days: [dayWith('REMADA NEUTRA ART.')] };
    expect(enforceExerciseProfile(plan2, 'articulated_plus_basic', CATALOG, {}).status).toBe('PASS');
    expect(plan2.days[0].exercises[0].exercise).toBe('REMADA NEUTRA ART.');
  });
});

describe('articulated_plus_basic — preferência na VARIAÇÃO', () => {
  it('bônus favorece estilo diferente do principal', () => {
    const score = (candidate: string) =>
      equipmentStylePreferenceScore({
        mainName: 'PUXADA ALTA ART.',
        candidate,
        profile: 'articulated_plus_basic',
      });
    expect(score('PUXADA ALTA ABERTA')).toBeGreaterThan(score('PUXADA ALTA ART. 2'));
  });

  it('principal articulado recebe variação BÁSICA equivalente', () => {
    const day = dayWith('PUXADA ALTA ART.');
    const pick = selectVariation({
      day,
      exerciseName: 'PUXADA ALTA ART.',
      catalog: CATALOG,
      usedVariations: new Set<string>(),
      options: { exerciseProfile: 'articulated_plus_basic' },
    });
    expect(pick).not.toBeNull();
    expect(classifyExerciseEquipmentStyle(pick!.name)).toBe('basic');
  });

  it('caso inverso: principal básico pode receber variação articulada', () => {
    const day = dayWith('PUXADA ALTA ABERTA');
    const pick = selectVariation({
      day,
      exerciseName: 'PUXADA ALTA ABERTA',
      catalog: CATALOG,
      usedVariations: new Set<string>(),
      options: { exerciseProfile: 'articulated_plus_basic' },
    });
    expect(pick).not.toBeNull();
    expect(classifyExerciseEquipmentStyle(pick!.name)).toBe('articulated');
  });

  it('sem articulado equivalente no catálogo mantém a opção básica', () => {
    const catalog = [
      { nome: 'PUXADA ALTA ABERTA', grupo: 'COSTAS' },
      { nome: 'PUXADA ALTA TRIÂNGULO', grupo: 'COSTAS' },
    ];
    const pick = selectVariation({
      day: dayWith('PUXADA ALTA ABERTA'),
      exerciseName: 'PUXADA ALTA ABERTA',
      catalog,
      usedVariations: new Set<string>(),
      options: { exerciseProfile: 'articulated_plus_basic' },
    });
    expect(pick?.name).toBe('PUXADA ALTA TRIÂNGULO');
  });

  it('perfil nunca vence equivalência funcional (grupo diferente é rejeitado)', () => {
    const verdict = evaluateVariationCandidate({
      day: dayWith('PUXADA ALTA ABERTA'),
      exerciseName: 'PUXADA ALTA ABERTA',
      candidate: 'SUPINO RETO ARTICULADO',
      catalog: [...CATALOG, { nome: 'SUPINO RETO ARTICULADO', grupo: 'PEITO' }],
      options: { exerciseProfile: 'articulated_plus_basic' },
    });
    expect(verdict.valid).toBe(false);
  });
});

// ============ HARDENING ============
import { readFileSync } from 'node:fs';
import {
  verifyExerciseProfileFinal,
  countArticulated,
  applyArticulatedPreference,
} from '../../supabase/functions/_shared/exerciseProfileEnforcement';
import { mapMachineIdsToEquipmentCapabilities } from '../../supabase/functions/_shared/equipmentAvailability';
import { emptyExerciseProfileAudit } from '../../supabase/functions/_shared/exerciseEquipmentProfile';

describe('hardening — garantia final do perfil BASIC', () => {
  it('A) principal articulado sem substituto seguro → REVIEW_REQUIRED e bloqueio', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.')] };
    const audit = enforceExerciseProfile(plan, 'basic', [{ nome: 'REMADA NEUTRA ART.', grupo: 'COSTAS' }], {});
    const finalAudit = verifyExerciseProfileFinal(plan, 'basic', audit, []);
    expect(finalAudit.status).toBe('REVIEW_REQUIRED');
    const reviewRequiredByProfile = finalAudit.status === 'REVIEW_REQUIRED';
    expect(reviewRequiredByProfile).toBe(true);
    expect(!reviewRequiredByProfile).toBe(false); // autoPublishAllowed
  });

  it('B) após repair, countArticulated do plano final é 0', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.', 'PUXADA ALTA ART.')] };
    const audit = enforceExerciseProfile(plan, 'basic', CATALOG, {});
    expect(audit.status).toBe('REPAIRED');
    expect(countArticulated(plan, CATALOG)).toBe(0);
    expect(verifyExerciseProfileFinal(plan, 'basic', audit, CATALOG).status).toBe('REPAIRED');
  });

  it('C) variação articulada sobrevivente é detectada pelo gate final', () => {
    const plan = { days: [dayWith('PUXADA ALTA ABERTA', 'PUXADA ALTA ART.')] };
    const passAudit = emptyExerciseProfileAudit('basic');
    const finalAudit = verifyExerciseProfileFinal(plan, 'basic', passAudit, CATALOG);
    expect(finalAudit.status).toBe('REVIEW_REQUIRED');
    expect(finalAudit.violations.some((v) => v.offending === 'PUXADA ALTA ART.')).toBe(true);
  });

  it('gate final não interfere em mixed/articulated_plus_basic', () => {
    const plan = { days: [dayWith('REMADA NEUTRA ART.')] };
    expect(verifyExerciseProfileFinal(plan, 'mixed', emptyExerciseProfileAudit('mixed'), CATALOG).status).toBe('PASS');
  });
});

describe('hardening — articulated_plus_basic nos exercícios principais', () => {
  it('D) principal básico com candidato articulado Tier A seguro é atualizado', () => {
    const plan = { days: [dayWith('PUXADA ALTA ABERTA')] };
    const audit = applyArticulatedPreference(plan, CATALOG, { referenceMode: 'free' });
    expect(plan.days[0].exercises[0].exercise).toBe('PUXADA ALTA ART.');
    expect(audit.status).toBe('REPAIRED');
    expect(audit.opportunities?.[0]?.applied).toBe(true);
  });

  it('E) referência exata nunca é trocada só pelo perfil', () => {
    const plan = { days: [dayWith('PUXADA ALTA ABERTA')] };
    const audit = applyArticulatedPreference(plan, CATALOG, { referenceMode: 'exact' });
    expect(plan.days[0].exercises[0].exercise).toBe('PUXADA ALTA ABERTA');
    expect(audit.status).toBe('PASS');
    expect(audit.opportunities?.[0]?.reason).toBe('reference_exact');
  });

  it('E2) âncora protegida também preserva o exercício', () => {
    const plan = { days: [dayWith('PUXADA ALTA ABERTA')] };
    const audit = applyArticulatedPreference(plan, CATALOG, {
      referenceMode: 'free',
      protectedAnchors: ['PUXADA ALTA ABERTA'],
    });
    expect(plan.days[0].exercises[0].exercise).toBe('PUXADA ALTA ABERTA');
    expect(audit.opportunities?.[0]?.reason).toBe('protected_anchor');
  });

  it('F) sem articulado equivalente o básico é mantido, sem revisão', () => {
    const catalog = [
      { nome: 'PUXADA ALTA ABERTA', grupo: 'COSTAS' },
      { nome: 'PUXADA ALTA TRIÂNGULO', grupo: 'COSTAS' },
    ];
    const plan = { days: [dayWith('PUXADA ALTA ABERTA')] };
    const audit = applyArticulatedPreference(plan, catalog, { referenceMode: 'free' });
    expect(plan.days[0].exercises[0].exercise).toBe('PUXADA ALTA ABERTA');
    expect(audit.status).toBe('PASS');
  });

  it('G) equipamento disponível limita o repair (só halteres/barras)', () => {
    const plan = { days: [dayWith('PUXADA ALTA ABERTA')] };
    const audit = applyArticulatedPreference(plan, CATALOG, {
      referenceMode: 'free',
      availableEquipment: mapMachineIdsToEquipmentCapabilities(['halteres', 'barras_anilhas']),
    });
    expect(plan.days[0].exercises[0].exercise).toBe('PUXADA ALTA ABERTA');
    expect(audit.repairs.length).toBe(0);
  });
});

describe('hardening — metadata do catálogo', () => {
  it('H) REMADA MÁQUINA com equipment_type null → basic', () => {
    const catalog = [{ nome: 'REMADA MÁQUINA', grupo: 'COSTAS', equipment_type: null }];
    const plan = { days: [dayWith('REMADA MÁQUINA')] };
    expect(countArticulated(plan, catalog)).toBe(0);
    expect(enforceExerciseProfile(plan, 'basic', catalog, {}).status).toBe('PASS');
  });

  it('I) REMADA MÁQUINA com equipment_type="articulada" → articulated', () => {
    const catalog = [{ nome: 'REMADA MÁQUINA', grupo: 'COSTAS', equipment_type: 'articulada' }];
    const plan = { days: [dayWith('REMADA MÁQUINA')] };
    expect(countArticulated(plan, catalog)).toBe(1);
    expect(enforceExerciseProfile(plan, 'basic', catalog, {}).status).toBe('REVIEW_REQUIRED');
  });
});

describe('hardening — disponibilidade de equipamento', () => {
  it('mapeia IDs da UI para capacidades canônicas', () => {
    expect(mapMachineIdsToEquipmentCapabilities(['halteres', 'barras_anilhas']).sort()).toEqual(
      ['barbell', 'bodyweight', 'dumbbell'],
    );
    expect(mapMachineIdsToEquipmentCapabilities(['leg_press']).sort()).toEqual(['bodyweight', 'machine']);
    expect(mapMachineIdsToEquipmentCapabilities([])).toEqual([]);
    expect(mapMachineIdsToEquipmentCapabilities(['esteira'])).toEqual([]);
    expect(mapMachineIdsToEquipmentCapabilities(undefined)).toEqual([]);
  });
});

describe('hardening — J) gate no trainer-agent e envio do frontend', () => {
  const agent = readFileSync('supabase/functions/trainer-agent/index.ts', 'utf8');
  const page = readFileSync('src/pages/TreinoIA.tsx', 'utf8');

  it('perfil REVIEW_REQUIRED entra no draftReviewStatus e bloqueia auto publish', () => {
    expect(agent).toContain('const reviewRequiredByProfile =');
    expect(agent).toContain('finalExerciseProfileAudit = verifyExerciseProfileFinal(');
    expect(agent).toMatch(/draftReviewStatus:[\s\S]{0,200}reviewRequiredByProfile/);
    expect(agent).toContain('autoPublishAllowed: !reviewRequiredByRestriction && !reviewRequiredByProfile');
  });

  it('payload devolve o audit final e o frontend consome', () => {
    expect(agent).toContain('exerciseProfileAudit: finalExerciseProfileAudit');
    expect(page).toContain('payload?.exerciseProfileAudit');
    expect(page).toContain('Perfil de exercícios requer revisão');
    expect(page).toContain('Perfil de exercícios ajustado automaticamente');
  });

  it('frontend envia a lista de equipamentos disponíveis', () => {
    expect(page).toContain('available_equipment:');
    expect(agent).toContain('mapMachineIdsToEquipmentCapabilities(available_equipment)');
  });
});
