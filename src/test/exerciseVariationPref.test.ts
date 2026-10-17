import { describe, it, expect } from 'vitest';
import { variationPrefKey, backendVariationPref } from '@/lib/exerciseVariationPref';

describe('preferência de variação por exercício', () => {
  it('chaves diferentes para exercícios diferentes com a mesma variação', () => {
    expect(variationPrefKey({ exercise: 'Puxada alta neutra', variation: 'Puxada alta triângulo' }))
      .not.toBe(variationPrefKey({ exercise: 'Puxada alta aberta', variation: 'Puxada alta triângulo' }));
  });
  it('registro antigo sem nome da variação é ignorado (mostra o original)', () => {
    expect(backendVariationPref({ __preferred_variation: true }, 'PUXADA ALTA TRIÂNGULO')).toBeUndefined();
  });
  it('vale quando foi salvo para a mesma variação', () => {
    expect(backendVariationPref({ __preferred_variation: true, __preferred_variation_name: 'PUXADA ALTA TRIÂNGULO' }, 'puxada alta triângulo')).toBe(true);
  });
  it('não vale se o plano trocou a variação', () => {
    expect(backendVariationPref({ __preferred_variation: true, __preferred_variation_name: 'PUXADA ALTA ABERTA' }, 'PUXADA ALTA TRIÂNGULO')).toBeUndefined();
  });
});
