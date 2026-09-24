/**
 * Agenda de treino para o Jarvis (operações ADITIVAS da ponte).
 *
 *   consultar_agenda_treino { student_id, limite? }
 *   consultar_treino_hoje   { student_id }
 *   agendar_treino          { student_id, data: "YYYY-MM-DD", hora: "HH:MM", duracao_min?, observacao?, forcar? }
 *   remarcar_treino         { agendamento_id, nova_data: "YYYY-MM-DD", nova_hora?, forcar? }
 *   resumo_do_dia           { data?: "YYYY-MM-DD", student_id? }  → agenda do dia + treinos realizados
 *
 * Usa as mesmas tabelas e o mesmo jeito de gravar da tela Agenda:
 * calendar_events (o horário) + calendar_event_students (o aluno).
 * student_id = user_id do aluno (profiles.user_id), igual ao resto da ponte.
 * Datas e horas entram e saem no horário de Lisboa; no banco ficam em UTC.
 */

const FUSO = "Europe/Lisbon";
const STATUS_IGNORADOS = ["cancelado", "reagendado"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-jarvis-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Rec = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Db = any;

/* ─────────────── datas no fuso de Lisboa ─────────────── */

function partesNoFuso(momento: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(momento)
      .map((p) => [p.type, p.value]),
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/** "16", "16h", "16:00", "16h30", "4:30" → "HH:MM". */
function normalizarHora(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?\s*(?:h|hs|horas)?$/i.exec(valor.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function dataValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(valor.trim()) ? valor.trim() : null;
}

/** Data + hora de Lisboa → instante UTC (trata horário de verão). */
function lisboaParaUtc(data: string, hora: string): Date {
  const [y, mo, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const alvo = Date.UTC(y, mo - 1, d, h, mi);
  let utc = alvo;
  for (let i = 0; i < 2; i++) {
    const p = partesNoFuso(new Date(utc));
    const [py, pmo, pd] = p.data.split("-").map(Number);
    const [ph, pmi] = p.hora.split(":").map(Number);
    utc += alvo - Date.UTC(py, pmo - 1, pd, ph, pmi);
  }
  return new Date(utc);
}

function somarDias(data: string, dias: number): string {
  const base = new Date(`${data}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function diaDaSemana(data: string): string {
  return DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()] ?? "";
}

function dataCurta(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

function mapearEvento(ev: Rec) {
  const inicio = partesNoFuso(new Date(String(ev.start_datetime)));
  return {
    agendamento_id: ev.id,
    data: inicio.data,
    hora: inicio.hora,
    dia: diaDaSemana(inicio.data),
    titulo: ev.title ?? null,
    status: ev.status ?? null,
    tipo: ev.event_type ?? null,
  };
}

/* ─────────────── consultas ─────────────── */

async function adminId(supabase: Db): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** Eventos do aluno a partir de "de" (e antes de "ate"), sem cancelados/reagendados. */
async function eventosDoAluno(
  supabase: Db,
  studentId: string,
  de: Date,
  ate: Date | null,
): Promise<Rec[]> {
  let q = supabase
    .from("calendar_event_students")
    .select(
      "event_id, attendance_status, calendar_events!inner(id, title, event_type, start_datetime, end_datetime, status)",
    )
    .eq("student_id", studentId)
    .gte("calendar_events.start_datetime", de.toISOString());
  if (ate) q = q.lt("calendar_events.start_datetime", ate.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Rec[])
    .map((linha) => linha.calendar_events as Rec)
    .filter((ev) => ev && !STATUS_IGNORADOS.includes(String(ev.status)))
    .sort((a, b) => String(a.start_datetime).localeCompare(String(b.start_datetime)));
}

/** Conflitos no horário: agenda do aluno e do Fabiew (admin). */
async function conflitos(
  supabase: Db,
  inicio: Date,
  fim: Date,
  alunos: string[],
  admin: string | null,
  ignorarEventoId?: string,
): Promise<Rec[]> {
  const achados = new Map<string, Rec>();
  const sobrepoe = (ev: Rec) =>
    new Date(String(ev.start_datetime)) < fim &&
    new Date(String(ev.end_datetime)) > inicio &&
    !STATUS_IGNORADOS.includes(String(ev.status)) &&
    ev.id !== ignorarEventoId;

  if (admin) {
    const { data } = await supabase
      .from("calendar_events")
      .select("id, title, start_datetime, end_datetime, status")
      .eq("admin_id", admin)
      .lt("start_datetime", fim.toISOString())
      .gt("end_datetime", inicio.toISOString());
    for (const ev of (data ?? []) as Rec[]) if (sobrepoe(ev)) achados.set(String(ev.id), ev);
  }
  for (const aluno of alunos) {
    const dia = new Date(inicio.getTime() - 24 * 3600_000);
    for (const ev of await eventosDoAluno(supabase, aluno, dia, fim)) {
      if (sobrepoe(ev)) achados.set(String(ev.id), ev);
    }
  }
  return [...achados.values()];
}

function textoConflito(lista: Rec[]): string {
  const itens = lista
    .slice(0, 3)
    .map((ev) => {
      const p = partesNoFuso(new Date(String(ev.start_datetime)));
      return `"${ev.title || "sem título"}" às ${p.hora}`;
    })
    .join(", ");
  return `Conflito de horário: já tem ${itens}. Pergunte ao Fabiew se agenda mesmo assim (forcar=true).`;
}

/* ─────────────── handler ─────────────── */

/**
 * Trata as operações de agenda. Devolve null quando a operação não é de agenda,
 * para o index.ts seguir com as outras.
 */
export async function tratarAgenda(
  operacao: string,
  body: Rec,
  supabase: Db,
): Promise<Response | null> {
  if (
    ![
      "consultar_agenda_treino",
      "consultar_treino_hoje",
      "agendar_treino",
      "remarcar_treino",
      "resumo_do_dia",
    ].includes(operacao)
  ) {
    return null;
  }

  const hoje = partesNoFuso(new Date()).data;

  if (operacao === "consultar_agenda_treino") {
    const studentId = String(body.student_id ?? "").trim();
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    const limite = Math.min(Math.max(Number(body.limite ?? 5) || 5, 1), 20);
    const eventos = await eventosDoAluno(supabase, studentId, lisboaParaUtc(hoje, "00:00"), null);
    return json({ itens: eventos.slice(0, limite).map(mapearEvento) });
  }

  if (operacao === "consultar_treino_hoje") {
    const studentId = String(body.student_id ?? "").trim();
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    const eventos = await eventosDoAluno(
      supabase,
      studentId,
      lisboaParaUtc(hoje, "00:00"),
      lisboaParaUtc(somarDias(hoje, 1), "00:00"),
    );
    const itens = eventos.map(mapearEvento);
    return json({ tem_treino: itens.length > 0, itens, hoje });
  }

  if (operacao === "resumo_do_dia") {
    return json(await resumoDoDia(supabase, dataValida(body.data) ?? hoje, String(body.student_id ?? "").trim() || null));
  }

  if (operacao === "agendar_treino") {
    const studentId = String(body.student_id ?? "").trim();
    const data = dataValida(body.data);
    const hora = normalizarHora(body.hora);
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    if (!data) return json({ erro: "Data inválida. Mande no formato YYYY-MM-DD." }, 400);
    if (!hora) {
      return json(
        { erro: "Falta o horário. Pergunte ao Fabiew a hora do treino antes de agendar." },
        400,
      );
    }
    const duracao = Math.min(Math.max(Number(body.duracao_min ?? 60) || 60, 15), 240);
    const inicio = lisboaParaUtc(data, hora);
    const fim = new Date(inicio.getTime() + duracao * 60_000);
    if (inicio.getTime() < Date.now() - 5 * 60_000) {
      return json({ erro: `Esse horário (${dataCurta(data)} às ${hora}) já passou.` }, 400);
    }

    const [{ data: perfil }, admin] = await Promise.all([
      supabase.from("profiles").select("nome").eq("user_id", studentId).maybeSingle(),
      adminId(supabase),
    ]);
    if (!perfil) return json({ erro: "Aluno não encontrado (student_id)." }, 404);
    if (!admin) return json({ erro: "Admin não encontrado para ser dono do agendamento." }, 500);

    if (body.forcar !== true) {
      const choque = await conflitos(supabase, inicio, fim, [studentId], admin);
      if (choque.length > 0) return json({ erro: textoConflito(choque), conflito: true }, 409);
    }

    const observacao = typeof body.observacao === "string" ? body.observacao.trim() : "";
    const { data: evento, error } = await supabase
      .from("calendar_events")
      .insert({
        admin_id: admin,
        title: String(perfil.nome ?? "Treino"),
        event_type: "personal_presencial",
        start_datetime: inicio.toISOString(),
        end_datetime: fim.toISOString(),
        location: "",
        notes: [observacao, "Agendado pelo Jarvis."].filter(Boolean).join("\n"),
        status: "confirmado",
      })
      .select("id, title, event_type, start_datetime, end_datetime, status")
      .single();
    if (error || !evento) return json({ erro: error?.message ?? "Falha ao criar o evento." }, 500);

    const { error: erroAluno } = await supabase
      .from("calendar_event_students")
      .insert({ event_id: evento.id, student_id: studentId, attendance_status: "pendente" });
    if (erroAluno) {
      await supabase.from("calendar_events").delete().eq("id", evento.id);
      return json({ erro: `Falha ao ligar o aluno ao evento: ${erroAluno.message}` }, 500);
    }

    return json({ agendamento: mapearEvento(evento) });
  }

  // remarcar_treino — mesmo jeito da tela: cria o novo, copia alunos, marca o antigo "reagendado".
  const agendamentoId = String(body.agendamento_id ?? "").trim();
  const novaData = dataValida(body.nova_data);
  if (!agendamentoId) return json({ erro: "agendamento_id_obrigatorio" }, 400);
  if (!novaData) return json({ erro: "Nova data inválida. Mande no formato YYYY-MM-DD." }, 400);

  const { data: original, error: erroOriginal } = await supabase
    .from("calendar_events")
    .select("id, admin_id, title, event_type, start_datetime, end_datetime, location, notes, status")
    .eq("id", agendamentoId)
    .maybeSingle();
  if (erroOriginal) return json({ erro: erroOriginal.message }, 500);
  if (!original) return json({ erro: "Agendamento não encontrado." }, 404);

  const inicioOriginal = new Date(String(original.start_datetime));
  const duracaoMs = Math.max(
    new Date(String(original.end_datetime)).getTime() - inicioOriginal.getTime(),
    15 * 60_000,
  );
  const horaOriginal = partesNoFuso(inicioOriginal);
  const novaHora = normalizarHora(body.nova_hora) ?? horaOriginal.hora;
  const inicio = lisboaParaUtc(novaData, novaHora);
  const fim = new Date(inicio.getTime() + duracaoMs);
  if (inicio.getTime() < Date.now() - 5 * 60_000) {
    return json({ erro: `Esse horário (${dataCurta(novaData)} às ${novaHora}) já passou.` }, 400);
  }

  const { data: vinculos } = await supabase
    .from("calendar_event_students")
    .select("student_id")
    .eq("event_id", agendamentoId);
  const alunos = ((vinculos ?? []) as Rec[]).map((v) => String(v.student_id));

  if (body.forcar !== true) {
    const choque = await conflitos(
      supabase,
      inicio,
      fim,
      alunos,
      String(original.admin_id ?? "") || null,
      agendamentoId,
    );
    if (choque.length > 0) return json({ erro: textoConflito(choque), conflito: true }, 409);
  }

  const notaOrigem = `Reagendado de ${dataCurta(horaOriginal.data)} às ${horaOriginal.hora}.`;
  const { data: novo, error: erroNovo } = await supabase
    .from("calendar_events")
    .insert({
      admin_id: original.admin_id,
      title: original.title || "Treino (reagendado)",
      event_type: original.event_type,
      start_datetime: inicio.toISOString(),
      end_datetime: fim.toISOString(),
      location: original.location || "",
      status: "confirmado",
      notes: [notaOrigem, original.notes].filter(Boolean).join("\n"),
    })
    .select("id, title, event_type, start_datetime, end_datetime, status")
    .single();
  if (erroNovo || !novo) return json({ erro: erroNovo?.message ?? "Falha ao remarcar." }, 500);

  if (alunos.length > 0) {
    await supabase.from("calendar_event_students").insert(
      alunos.map((student_id) => ({
        event_id: novo.id,
        student_id,
        attendance_status: "pendente",
      })),
    );
  }

  const notaDestino = `Reagendado para ${dataCurta(novaData)} às ${novaHora} (Jarvis).`;
  await supabase
    .from("calendar_events")
    .update({
      status: "reagendado",
      notes: original.notes ? `${original.notes}\n${notaDestino}` : notaDestino,
    })
    .eq("id", agendamentoId);

  return json({ agendamento: mapearEvento(novo) });
}

/* ─────────────── resumo do dia: agenda + treinos realizados ─────────────── */

function horaLisboa(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : partesNoFuso(d).hora;
}

function numero(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

async function nomesDosAlunos(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("user_id, nome").in("user_id", unicos);
  return new Map(((data ?? []) as Rec[]).map((p) => [String(p.user_id), String(p.nome ?? "").trim()]));
}

async function resumoDoDia(supabase: Db, data: string, studentId: string | null) {
  const de = lisboaParaUtc(data, "00:00").toISOString();
  const ate = lisboaParaUtc(somarDias(data, 1), "00:00").toISOString();

  // Agenda do dia (todos os horários do Fabiew, ou só do aluno pedido).
  const { data: eventosBrutos, error: erroEventos } = await supabase
    .from("calendar_events")
    .select(
      "id, title, event_type, start_datetime, end_datetime, status, calendar_event_students(student_id, attendance_status)",
    )
    .gte("start_datetime", de)
    .lt("start_datetime", ate)
    .order("start_datetime", { ascending: true });
  if (erroEventos) throw new Error(erroEventos.message);
  const eventos = ((eventosBrutos ?? []) as Rec[])
    .filter((ev) => !STATUS_IGNORADOS.includes(String(ev.status)))
    .filter(
      (ev) =>
        !studentId ||
        ((ev.calendar_event_students ?? []) as Rec[]).some((s) => s.student_id === studentId),
    );

  // Treinos do dia (sessões iniciadas no dia, no horário de Lisboa).
  let consulta = supabase
    .from("workout_sessions")
    .select(
      "id, student_id, day_name, phase, status, duration_minutes, exercises_completed, total_exercises, total_sets, total_volume_kg, avg_rpe, started_at, started_at_real, completed_at, completed_at_real, executed_by, session_mode, created_at",
    )
    .or(
      `and(started_at.gte.${de},started_at.lt.${ate}),and(started_at.is.null,created_at.gte.${de},created_at.lt.${ate})`,
    )
    .order("started_at", { ascending: true });
  if (studentId) consulta = consulta.eq("student_id", studentId);
  const { data: sessoesBrutas, error: erroSessoes } = await consulta;
  if (erroSessoes) throw new Error(erroSessoes.message);
  const todas = (sessoesBrutas ?? []) as Rec[];
  const sessoes = todas.filter((s) => s.status !== "abandoned");
  const abandonadas = todas.length - sessoes.length;

  // Séries registradas das sessões (para exercícios, volume e melhor série).
  const idsSessao = sessoes.map((s) => String(s.id));
  const logsPorSessao = new Map<string, Rec[]>();
  if (idsSessao.length > 0) {
    const { data: logs } = await supabase
      .from("exercise_set_logs")
      .select("session_id, exercise_name, set_number, reps, weight_kg, rpe, rir")
      .in("session_id", idsSessao)
      .order("set_number", { ascending: true });
    for (const log of (logs ?? []) as Rec[]) {
      const chave = String(log.session_id);
      logsPorSessao.set(chave, [...(logsPorSessao.get(chave) ?? []), log]);
    }
  }

  const nomes = await nomesDosAlunos(supabase, [
    ...sessoes.map((s) => String(s.student_id)),
    ...eventos.flatMap((ev) =>
      ((ev.calendar_event_students ?? []) as Rec[]).map((s) => String(s.student_id)),
    ),
  ]);

  const agenda = eventos.map((ev) => {
    const alunos = ((ev.calendar_event_students ?? []) as Rec[]).map((s) => ({
      student_id: s.student_id,
      nome: nomes.get(String(s.student_id)) ?? null,
      presenca: s.attendance_status ?? null,
    }));
    return {
      agendamento_id: ev.id,
      hora: horaLisboa(ev.start_datetime),
      hora_fim: horaLisboa(ev.end_datetime),
      titulo: ev.title ?? null,
      tipo: ev.event_type ?? null,
      status: ev.status ?? null,
      realizado: ev.status === "concluido",
      alunos,
    };
  });

  const realizados = sessoes.map((s) => {
    const logs = logsPorSessao.get(String(s.id)) ?? [];
    const porExercicio = new Map<string, { series: number; volume: number; melhor: Rec | null }>();
    for (const log of logs) {
      const nome = String(log.exercise_name ?? "-");
      const atual = porExercicio.get(nome) ?? { series: 0, volume: 0, melhor: null };
      const peso = numero(log.weight_kg) ?? 0;
      const reps = numero(log.reps) ?? 0;
      atual.series += 1;
      atual.volume += peso * reps;
      const melhorPeso = numero(atual.melhor?.weight_kg) ?? -1;
      if (!atual.melhor || peso > melhorPeso) atual.melhor = log;
      porExercicio.set(nome, atual);
    }
    const exercicios = [...porExercicio.entries()].map(([nome, info]) => {
      const peso = numero(info.melhor?.weight_kg);
      const reps = numero(info.melhor?.reps);
      return {
        exercicio: nome,
        series: info.series,
        melhor_serie:
          peso !== null && peso > 0
            ? `${peso} kg x ${reps ?? "?"}`
            : reps !== null
              ? `${reps} reps`
              : null,
        volume_kg: Math.round(info.volume),
      };
    });
    const volumeLogs = exercicios.reduce((acc, e) => acc + e.volume_kg, 0);
    const inicio = (s.started_at_real ?? s.started_at ?? s.created_at) as string | null;
    const fim = (s.completed_at_real ?? s.completed_at) as string | null;
    const duracao =
      numero(s.duration_minutes) ||
      (inicio && fim
        ? Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000))
        : null);
    return {
      sessao_id: s.id,
      student_id: s.student_id,
      aluno_nome: nomes.get(String(s.student_id)) ?? null,
      dia_treino: s.day_name ?? null,
      fase: s.phase ?? null,
      status: s.status,
      inicio: horaLisboa(inicio),
      fim: s.status === "in_progress" ? null : horaLisboa(fim),
      duracao_min: s.status === "in_progress" ? null : duracao,
      exercicios_feitos: numero(s.exercises_completed),
      exercicios_total: numero(s.total_exercises),
      series: numero(s.total_sets) || logs.length,
      volume_kg: Math.round(numero(s.total_volume_kg) || volumeLogs) || null,
      rpe_medio: numero(s.avg_rpe),
      feito_com: s.executed_by === "coach" ? "com o Fabiew" : "sozinho(a) no app",
      modo: s.session_mode ?? null,
      exercicios,
    };
  });

  return {
    data,
    dia: diaDaSemana(data),
    agenda,
    realizados,
    abandonados: abandonadas,
  };
}
