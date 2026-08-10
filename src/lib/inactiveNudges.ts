// Mensagens variadas para cutucar alunos inativos no WhatsApp.
const TEMPLATES: ((n: string, d: number) => string)[] = [
  (n, d) => `Oi ${n}! 👋 Notei que faz ${d} dias que você não registra treino no app. Tá tudo bem por aí?`,
  (n, d) => `${n}, sumiu! 😅 Já são ${d} dias sem treino registrado. Bora retomar hoje?`,
  (n, d) => `E aí ${n}! 💪 Seu último registro foi há ${d} dias. Que tal um treino leve pra voltar ao ritmo?`,
  (n, d) => `Oi ${n}! Passando pra saber se precisa de algum ajuste no plano — ${d} dias sem registro por aqui.`,
  (n, d) => `${n}, constância é o que traz resultado 🔥 Faz ${d} dias que o app não vê você. Vamos marcar o próximo treino?`,
  (n, d) => `Bom te lembrar, ${n} 🙂 Já tem ${d} dias sem treino no app. Quer que eu simplifique a semana pra você?`,
  (n, d) => `Oi ${n}! Se a rotina apertou, a gente adapta 👍 São ${d} dias sem registro. Me conta como posso ajudar.`,
  (n, d) => `${n}, seu treino tá te esperando! 🏋️ Último registro há ${d} dias. Bora hoje?`,
  (n, d) => `Fala ${n}! Meta é voltar sem culpa 😉 ${d} dias parado no app. Começamos com 20 minutinhos?`,
  (n, d) => `Oi ${n}! Vi que faz ${d} dias sem treino registrado. Prefere que eu monte uma semana mais curta?`,
];

export const pickInactiveNudge = (fullName: string, days: number): string => {
  const first = (fullName || 'aluno').trim().split(' ')[0];
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return t(first, days);
};
