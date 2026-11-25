export type Dados = {
  nome: string; email: string; ddi: string; telefone: string; senha: string;
  sexo: string; nascimento: string; altura: string; peso: string;
  tempo: string; dias: string; local: string;
  objetivo: string; lesoes: string; termos: boolean;
};

/** Altura em cm; aceita metros (1.70 / 1,70) e converte para 170. */
export function alturaCm(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'));
  if (!isFinite(n)) return null;
  return n > 0 && n < 3 ? Math.round(n * 100) : Math.round(n);
}

export function pesoKg(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'));
  return isFinite(n) ? n : null;
}

export function idade(nasc: string, hoje = new Date()): number | null {
  const d = new Date(nasc + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  let a = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) a--;
  return a;
}

export function imc(altura: string, peso: string): number | null {
  const a = alturaCm(altura), p = pesoKg(peso);
  if (!a || !p || a < 120 || a > 230 || p < 30 || p > 250) return null;
  return p / ((a / 100) ** 2);
}

export function forcaSenha(s: string): number {
  let f = 0;
  if (s.length >= 8) f++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) f++;
  if (/\d/.test(s)) f++;
  if (/[^A-Za-z0-9]/.test(s)) f++;
  return f;
}

/** Retorna a mensagem de erro da etapa (1–4) e o campo, ou null. */
export function validarEtapa(etapa: number, d: Dados, hoje = new Date()): { msg: string; campo?: string } | null {
  if (etapa === 1) {
    if (d.nome.trim().length < 3) return { msg: 'Digite seu nome completo.', campo: 'nome' };
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return { msg: 'Digite um e-mail válido.', campo: 'email' };
    if (d.telefone.replace(/\D/g, '').length < 8) return { msg: 'Digite um telefone válido.', campo: 'telefone' };
    if (d.senha.length < 8) return { msg: 'A senha precisa ter pelo menos 8 caracteres.', campo: 'senha' };
  }
  if (etapa === 2) {
    if (!d.sexo) return { msg: 'Selecione o sexo.' };
    const i = idade(d.nascimento, hoje);
    if (i === null || i < 12 || i > 90) return { msg: 'Informe uma data de nascimento válida (12 a 90 anos).', campo: 'nascimento' };
    const a = alturaCm(d.altura);
    if (!a || a < 120 || a > 230) return { msg: 'Altura deve estar entre 120 e 230 cm.', campo: 'altura' };
    const p = pesoKg(d.peso);
    if (!p || p < 30 || p > 250) return { msg: 'Peso deve estar entre 30 e 250 kg.', campo: 'peso' };
  }
  if (etapa === 3) {
    if (!d.tempo) return { msg: 'Diga há quanto tempo você treina.' };
    if (!d.dias) return { msg: 'Escolha quantos dias por semana.' };
    if (!d.local) return { msg: 'Escolha onde você treina.' };
  }
  if (etapa === 4) {
    if (!d.objetivo) return { msg: 'Escolha seu objetivo.' };
    if (!d.termos) return { msg: 'Aceite os termos para continuar.' };
  }
  return null;
}

export function metadadosCadastro(d: Dados) {
  return {
    telefone: `${d.ddi} ${d.telefone.replace(/[^\d ]/g, '').trim()}`,
    sexo: d.sexo, data_nascimento: d.nascimento,
    altura: alturaCm(d.altura), peso: pesoKg(d.peso),
    tempo_treino: d.tempo, dias_treino_semana: Number(d.dias), local_treino: d.local,
    objetivo: d.objetivo, lesoes: d.lesoes.trim(),
  };
}
