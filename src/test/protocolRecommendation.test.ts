import { describe, it, expect } from 'vitest';
import { evaluateFold, median, variationPercent } from '@/lib/measurementQuality';
import { calcSomatotype, caliperToCm } from '@/lib/somatotype';
import { recommendProtocol, evaluateProtocolCompatibility } from '@/lib/protocolRecommendation';
import { calcProtocol } from '@/lib/skinfoldProtocols';

const fullFolds = {
  triceps: 10, subescapular: 12, suprailiaca: 11, abdominal: 15,
  peitoral: 8, axilar_media: 9, coxa: 14, biceps: 5, panturrilha_medial: 8,
};

describe('qualidade de aferição', () => {
  it('TESTE 4 — 12 e 12.3 ficam na tolerância e usam a média', () => {
    const q = evaluateFold(12, 12.3);
    expect(q.status).toBe('consistent');
    expect(q.usedValue).toBeCloseTo(12.2, 1);
    expect(q.needsThird).toBe(false);
  });

  it('TESTE 5 — 12 e 14 exigem terceira aferição', () => {
    const q = evaluateFold(12, 14);
    expect(q.variationPercent).toBeCloseTo(16.7, 1);
    expect(q.status).toBe('needs_third');
    expect(q.usable).toBe(false);
  });

  it('TESTE 6 — três aferições usam a mediana', () => {
    const q = evaluateFold(12, 14, 12.5);
    expect(q.usedValue).toBe(12.5);
    expect(median([12, 14, 12.5])).toBe(12.5);
  });

  it('variação usa o menor valor como base', () => {
    expect(variationPercent(12, 12.4)).toBeCloseTo(3.3, 1);
  });
});

describe('recomendação de protocolo', () => {
  it('TESTE 1 — sexo ausente não assume masculino', () => {
    const r = calcProtocol('jackson_pollock_7', { sex: null, ageYears: 30, values: fullFolds });
    expect(r.bodyFat).toBeNull();
    expect(r.reason).toContain('Sexo');

    const rec = recommendProtocol({ sex: null, ageYears: 30, values: fullFolds });
    expect(rec.eligible.every((e) => e.protocol === 'faulkner_4')).toBe(true);
  });

  it('TESTE 2 — panturrilha preenchida não elege Petroski automaticamente', () => {
    const rec = recommendProtocol({ sex: 'masculino', ageYears: 30, values: fullFolds });
    expect(rec.recommended?.protocol).not.toBe('petroski_4');
  });

  it('TESTE 3 — continuidade mantém o protocolo anterior elegível', () => {
    const rec = recommendProtocol({
      sex: 'masculino', ageYears: 30, values: fullFolds, previousProtocol: 'jackson_pollock_3',
    });
    expect(rec.recommended?.protocol).toBe('jackson_pollock_3');
    expect(rec.continuityRecommended).toBe(true);
  });

  it('TESTE 9/10 — contexto populacional não seleciona protocolo sozinho', () => {
    const br = recommendProtocol({ sex: 'masculino', ageYears: 30, values: fullFolds, populationContext: 'brasil' });
    const pt = recommendProtocol({ sex: 'masculino', ageYears: 30, values: fullFolds, populationContext: 'portugal' });
    const se = recommendProtocol({ sex: 'masculino', ageYears: 30, values: fullFolds, populationContext: 'escandinavia' });
    for (const rec of [br, pt, se]) {
      expect(['guedes_3', 'petroski_4']).not.toContain(rec.recommended?.protocol);
    }
  });

  it('bloqueia quando a dobra obrigatória está divergente sem terceira medida', () => {
    const evaluation = evaluateProtocolCompatibility('jackson_pollock_3', {
      sex: 'masculino', ageYears: 30, values: fullFolds,
      quality: { abdominal: evaluateFold(12, 14) },
    });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.warnings.join(' ')).toContain('Qualidade da aferição insuficiente');
  });

  it('calcula dispersão entre protocolos elegíveis', () => {
    const rec = recommendProtocol({ sex: 'masculino', ageYears: 30, values: { ...fullFolds } });
    expect(rec.dispersion).not.toBeNull();
    expect(rec.dispersion!.range).toBeGreaterThan(0);
  });
});

describe('somatotipo Heath-Carter', () => {
  const complete = {
    alturaCm: 178, pesoKg: 80, tricepsMm: 10, subescapularMm: 12, supraspinaleMm: 9,
    panturrilhaMedialMm: 8, bracoContraidoCm: 38, panturrilhaPerimetroCm: 38,
    umeroCm: 7.2, femurCm: 9.8,
  };

  it('TESTE 7 — medidas completas retornam os três componentes', () => {
    const s = calcSomatotype(complete);
    expect(s.available).toBe(true);
    expect(s.endomorfia).not.toBeNull();
    expect(s.mesomorfia).not.toBeNull();
    expect(s.ectomorfia).not.toBeNull();
    expect(s.dominance).toContain('predominante');
  });

  it('TESTE 8 — sem largura de fêmur não calcula e informa a medida ausente', () => {
    const s = calcSomatotype({ ...complete, femurCm: null });
    expect(s.available).toBe(false);
    expect(s.mesomorfia).toBeNull();
    expect(s.missing.join(' ')).toContain('fêmur');
  });

  it('converte paquímetro de mm para cm', () => {
    expect(caliperToCm(68.5, 'mm')).toBeCloseTo(6.85, 2);
    expect(caliperToCm(6.85, 'cm')).toBeCloseTo(6.85, 2);
  });
});
