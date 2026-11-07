import { describe, expect, it } from 'vitest';
import { chooseSummaryFit } from '@/lib/fitSummaryLine';

describe('chooseSummaryFit', () => {
  it('mantém o tamanho base quando cabe', () => {
    expect(chooseSummaryFit(400, 300, 200, 14)).toEqual({ variant: 'full', px: 14 });
  });
  it('reduz a fonte até caber, sem passar de 11px', () => {
    const fit = chooseSummaryFit(300, 350, 250, 14);
    expect(fit.variant).toBe('full');
    expect(fit.px).toBeGreaterThanOrEqual(11);
    expect(fit.px).toBeLessThan(14);
  });
  it('usa a forma compacta quando a completa precisaria de menos de 11px', () => {
    const fit = chooseSummaryFit(300, 500, 320, 14);
    expect(fit.variant).toBe('compact');
    expect(fit.px).toBeGreaterThanOrEqual(11);
  });
});
