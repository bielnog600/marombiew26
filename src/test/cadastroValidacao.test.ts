import { describe, it, expect } from 'vitest';
import { alturaCm, idade, imc, validarEtapa, type Dados } from '@/lib/cadastro/validacao';

const base: Dados = { nome: 'Ana Souza', email: 'a@b.com', ddi: '+351', telefone: '912345678', senha: '12345678',
  sexo: 'feminino', nascimento: '2000-01-01', altura: '170', peso: '65', tempo: 'x', dias: '4', local: 'casa',
  objetivo: 'x', lesoes: '', termos: true };
const hoje = new Date('2026-11-25T12:00:00');

describe('cadastro', () => {
  it('converte metros para cm', () => { expect(alturaCm('1.70')).toBe(170); expect(alturaCm('1,82')).toBe(182); expect(alturaCm('175')).toBe(175); });
  it('idade pela data de nascimento', () => { expect(idade('2000-11-26', hoje)).toBe(25); expect(idade('2000-11-25', hoje)).toBe(26); });
  it('limita idade 12–90', () => {
    expect(validarEtapa(2, { ...base, nascimento: '2016-01-01' }, hoje)?.campo).toBe('nascimento');
    expect(validarEtapa(2, base, hoje)).toBeNull();
  });
  it('IMC com altura em metros', () => { expect(imc('1.70', '65')!.toFixed(1)).toBe('22.5'); });
  it('senha mínima 8', () => { expect(validarEtapa(1, { ...base, senha: '1234567' })?.campo).toBe('senha'); });
  it('termos obrigatórios', () => { expect(validarEtapa(4, { ...base, termos: false })).not.toBeNull(); });
});
