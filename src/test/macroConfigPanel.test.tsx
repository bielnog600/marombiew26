import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MacroConfigPanel from '@/components/diet/MacroConfigPanel';
import {
  defaultMacroConfig,
  resolveMacroConfig,
  setMacroPerKg,
  setMacroGrams,
  getMacroPrescription,
  type MacroConfig,
} from '@/lib/macroConfig';

const body = { weightKg: 88, leanMassKg: 73.5 };

const renderPanel = (config: MacroConfig, onChange = vi.fn()) => {
  const resolution = resolveMacroConfig({ kcalTarget: 2750, config, body });
  render(
    <MacroConfigPanel
      config={config}
      body={body}
      resolution={resolution}
      closingMacro={null}
      targetKcal={2750}
      onChange={onChange}
      onClosingMacroChange={vi.fn()}
    />,
  );
  return onChange;
};

describe('MacroConfigPanel — digitação decimal', () => {
  it('A. permite digitar "2,2" no campo g/kg', () => {
    const onChange = renderPanel(defaultMacroConfig());
    const input = screen.getByLabelText('Proteína g/kg') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2' } });
    expect(input.value).toBe('2');
    fireEvent.change(input, { target: { value: '2,' } });
    expect(input.value).toBe('2,'); // a vírgula não desaparece
    fireEvent.change(input, { target: { value: '2,2' } });
    expect(input.value).toBe('2,2');

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as MacroConfig;
    expect(next.protein.perKg).toBe(2.2);
    expect(next.protein.grams).toBeCloseTo(193.6, 1);
  });

  it('B. permite digitar "0.8" com ponto', () => {
    const onChange = renderPanel(defaultMacroConfig());
    const input = screen.getByLabelText('Gordura g/kg') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.8' } });
    expect(input.value).toBe('0.8');
    fireEvent.blur(input);
    const next = onChange.mock.calls.at(-1)![0] as MacroConfig;
    expect(next.fat.perKg).toBe(0.8);
    expect(next.fat.grams).toBeCloseTo(70.4, 1);
  });
});

describe('Hardening — regras de estado', () => {
  it('H. limpar o valor de um macro não deixa valor antigo escondido', () => {
    const cleared = setMacroPerKg(
      { perKg: 2.2, grams: 193.6, basis: 'body_weight', locked: true },
      null,
      body,
    );
    expect(cleared.perKg).toBeNull();
    expect(cleared.grams).toBeNull();

    const clearedGrams = setMacroGrams(
      { perKg: 2.2, grams: 193.6, basis: 'body_weight', locked: true },
      null,
      body,
    );
    expect(clearedGrams.perKg).toBeNull();
    expect(clearedGrams.grams).toBeNull();
  });

  it('E. base massa magra mantém o g/kg correto na prescrição', () => {
    const config: MacroConfig = {
      protein: { perKg: 2.2, grams: null, basis: 'lean_mass', locked: true },
      fat: { perKg: 0.8, grams: null, basis: 'body_weight', locked: true },
      carbs: { perKg: null, grams: null, basis: 'body_weight', locked: false },
    };
    const resolution = resolveMacroConfig({ kcalTarget: 2750, config, body });
    const prescription = getMacroPrescription(config, resolution, body)!;
    expect(prescription.protein.grams).toBeCloseTo(161.7, 1);
    expect(prescription.protein.perKg).toBeCloseTo(2.2, 2); // e não 161,7/88
    expect(prescription.protein.basisLabel).toBe('massa magra');
    expect(prescription.fat.perKg).toBeCloseTo(0.8, 2);
  });

  it('F. os gramas da prescrição são exatamente os exibidos na resolução', () => {
    const config = defaultMacroConfig();
    const resolution = resolveMacroConfig({ kcalTarget: 2750, config, body });
    const prescription = getMacroPrescription(config, resolution, body)!;
    expect(prescription.protein.grams).toBe(resolution.grams!.protein);
    expect(prescription.carbs.grams).toBe(resolution.grams!.carbs);
    expect(prescription.fat.grams).toBe(resolution.grams!.fat);
  });
});
