// Cron diário (08h Brasília): envia push motivacional personalizado com o treino do dia do aluno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- Parser mínimo da tabela de treino ----------
interface DayBlock { day: string; exercises: string[] }

function parseTrainingDays(markdown: string): DayBlock[] {
  const days: DayBlock[] = [];
  const lines = (markdown || '').split('\n');
  let lastDay = '';
  let current: DayBlock | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.replace(/\*\*/g, '').trim());
    if (cells.length < 2) continue;
    const first = cells[0].toLowerCase();
    if (first.includes('treino do dia') || first.includes('exercício') || first.includes('exercicio')) continue;
    const dayCell = cells[0];
    const exCell = cells[1];
    if (dayCell && dayCell !== '-' && dayCell.toLowerCase() !== lastDay.toLowerCase()) {
      if (current && current.exercises.length) days.push(current);
      current = { day: dayCell, exercises: [] };
      lastDay = dayCell;
    }
    if (!current) current = { day: lastDay || 'Treino', exercises: [] };
    if (exCell && !exCell.toLowerCase().includes('exerc')) current.exercises.push(exCell);
  }
  if (current && current.exercises.length) days.push(current);
  return days;
}

// ---------- Detecção de grupos musculares ----------
const MUSCLE_KEYWORDS: Record<string, string[]> = {
  'peito': ['supino', 'crucifixo', 'peck', 'peitoral', 'crossover', 'flexão', 'flexao'],
  'costas': ['remada', 'puxada', 'pulldown', 'pull-down', 'pull up', 'pull-up', 'barra fixa', 'levantamento terra', 'deadlift'],
  'ombros': ['desenvolvimento', 'elevação lateral', 'elevacao lateral', 'arnold', 'shoulder', 'encolhimento', 'crucifixo inverso', 'elevação frontal'],
  'bíceps': ['rosca', 'biceps', 'bíceps', 'curl'],
  'tríceps': ['tríceps', 'triceps', 'francês', 'frances', 'pulley triceps', 'corda triceps', 'testa', 'mergulho'],
  'quadríceps': ['agachamento', 'leg press', 'cadeira extensora', 'extensora', 'hack', 'afundo', 'avanço', 'avanco', 'búlgaro', 'bulgaro'],
  'posteriores': ['stiff', 'mesa flexora', 'flexora', 'good morning', 'romeno', 'rdl'],
  'glúteos': ['glúteo', 'gluteo', 'hip thrust', 'elevação pélvica', 'cadeira abdutora', 'abdutora', 'coice', 'kickback'],
  'panturrilha': ['panturrilha', 'gêmeo', 'gemeo', 'calf'],
  'abdômen': ['abdominal', 'abdomen', 'prancha', 'crunch', 'oblíquo', 'obliquo'],
  'cardio': ['esteira', 'bike', 'elíptico', 'eliptico', 'corrida', 'caminhada'],
};

function detectMuscleGroups(exercises: string[]): string[] {
  const found = new Set<string>();
  for (const ex of exercises) {
    const lower = ex.toLowerCase();
    for (const [group, kws] of Object.entries(MUSCLE_KEYWORDS)) {
      if (kws.some(kw => lower.includes(kw))) found.add(group);
    }
  }
  return [...found];
}

// ---------- Selecionar treino do dia ----------
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAY_ALIASES: Record<string, string[]> = {
  'domingo': ['domingo', 'dom'],
  'segunda': ['segunda', 'seg'],
  'terça': ['terça', 'terca', 'ter'],
  'quarta': ['quarta', 'qua'],
  'quinta': ['quinta', 'qui'],
  'sexta': ['sexta', 'sex'],
  'sábado': ['sábado', 'sabado', 'sab'],
};

function pickTodayBlock(days: DayBlock[], todayWeekday: number): DayBlock | null {
  if (days.length === 0) return null;
  const todayName = WEEKDAY_NAMES[todayWeekday];
  const aliases = WEEKDAY_ALIASES[todayName];

  // 1. Match explícito por nome do dia da semana
  const byWeekday = days.find(d => {
    const lower = d.day.toLowerCase();
    return aliases.some(a => lower.includes(a));
  });
  if (byWeekday) return byWeekday;

  // 2. Plano com Treino A/B/C/D — rotaciona pelo dia (pula domingo como descanso se 6 ou menos treinos)
  // Mapeia dias úteis (seg=1 .. sab=6) para índice de treino
  if (todayWeekday === 0 && days.length <= 6) return null; // domingo descanso
  const workIndex = todayWeekday === 0 ? 6 : todayWeekday - 1; // seg=0
  return days[workIndex % days.length] ?? null;
}

// ---------- Frases motivacionais variadas ----------
const MOTIVATION_TEMPLATES: Array<(name: string, focus: string) => string> = [
  (n, f) => `Vamos com tudo, ${n}! Hoje é ${f}. Foca na amplitude e cadência. 💥`,
  (n, f) => `${n}, dia de ${f}! Cada repetição te aproxima da sua melhor versão. 🔥`,
  (n, f) => `Bom dia, ${n}! Treino de ${f} te espera. Mente forte, técnica perfeita. 💪`,
  (n, f) => `${n}, hoje vamos atacar ${f}! Conexão mente-músculo no máximo. ⚡`,
  (n, f) => `Levanta, ${n}! ${f} no foco. Você não vai treinar, você vai dominar. 🏋️`,
  (n, f) => `${n}, é dia de ${f}! Capricha na execução, o resultado vem certo. ✨`,
  (n, f) => `Show, ${n}! Treino de ${f} hoje. Respira, contrai, executa. 🎯`,
  (n, f) => `${n}, ${f} te chamando! Sem desculpa, com foco. Bora! 🚀`,
  (n, f) => `E aí, ${n}? Hoje é ${f}. Cada série conta — entrega o seu melhor. 💯`,
  (n, f) => `${n}, dia de ativar ${f}! Carga controlada, técnica afiada. 🔝`,
  (n, f) => `Acorda guerreiro(a), ${n}! ${f} hoje. Disciplina vence motivação. 🥇`,
  (n, f) => `${n}, treino de ${f} liberado! Foco total nos primeiros 5 minutos. 🧠`,
];

function buildMessage(name: string, muscles: string[], dayLabel: string): { title: string; body: string } {
  const focus = muscles.length > 0 ? muscles.join(' e ') : dayLabel;
  const firstName = (name || 'campeão').split(' ')[0];
  const tpl = MOTIVATION_TEMPLATES[Math.floor(Math.random() * MOTIVATION_TEMPLATES.length)];
  return {
    title: `Treino do dia 💪 ${dayLabel}`,
    body: tpl(firstName, focus),
  };
}

// ---------- Push via OneSignal ----------
async function sendPush(userId: string, title: string, message: string) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('player_id')
    .eq('user_id', userId)
    .eq('active', true);
  const playerIds = [...new Set((subs ?? []).map(s => s.player_id).filter(Boolean))];
  if (playerIds.length === 0) return false;

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      data: { type: 'daily_workout_motivator' },
    }),
  });
  return res.ok;
}

async function alreadyRanToday(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('push_reminder_runs')
    .select('id')
    .eq('reminder_key', 'daily_workout_motivator')
    .eq('run_date', today)
    .is('user_id', null)
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    if (!force && (await alreadyRanToday())) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already_ran' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    // Brasília é UTC-3
    const brasiliaNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayWeekday = brasiliaNow.getUTCDay(); // 0=domingo

    // Alunos ativos
    const { data: students } = await supabase
      .from('students_profile')
      .select('user_id')
      .eq('ativo', true);
    const studentIds = (students ?? []).map(s => s.user_id);
    if (studentIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Nomes
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nome')
      .in('user_id', studentIds);
    const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.nome]));

    // Plano de treino mais recente (não draft) por aluno
    const { data: plans } = await supabase
      .from('ai_plans')
      .select('student_id, conteudo, titulo, created_at, is_draft')
      .in('student_id', studentIds)
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

    const planByStudent = new Map<string, { conteudo: string; titulo: string }>();
    for (const p of plans ?? []) {
      if (!planByStudent.has(p.student_id)) {
        planByStudent.set(p.student_id, { conteudo: p.conteudo, titulo: p.titulo });
      }
    }

    let sent = 0;
    let skippedNoPlan = 0;
    let skippedRest = 0;

    for (const studentId of studentIds) {
      const plan = planByStudent.get(studentId);
      if (!plan) { skippedNoPlan++; continue; }
      const days = parseTrainingDays(plan.conteudo);
      const todayBlock = pickTodayBlock(days, todayWeekday);
      if (!todayBlock) { skippedRest++; continue; }

      const muscles = detectMuscleGroups(todayBlock.exercises);
      const name = nameMap.get(studentId) || '';
      const { title, body } = buildMessage(name, muscles, todayBlock.day);

      const ok = await sendPush(studentId, title, body);
      if (ok) sent++;
    }

    if (!force) {
      await supabase.from('push_reminder_runs').insert({ reminder_key: 'daily_workout_motivator', user_id: null });
    }

    return new Response(JSON.stringify({ ok: true, sent, skippedNoPlan, skippedRest, weekday: todayWeekday }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('daily-workout-motivator error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});