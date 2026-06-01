import { supabase } from '@/integrations/supabase/client';
import { getStudentActivePackage, deductClassCredit } from '@/hooks/useFinancial';

/**
 * Janela de tolerância (minutos) para procurar uma aula já agendada
 * antes/depois do horário real de início da sessão de treino.
 */
const MATCH_WINDOW_MIN = 75;

/** Duração operacional padrão (minutos) quando criamos uma aula nova. */
const DEFAULT_DURATION_MIN = 60;

/** Arredonda para baixo para o múltiplo de 30 minutos mais próximo. */
function floorTo30(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30);
  return d;
}

/**
 * Ao iniciar uma sessão de treino pelo admin:
 * 1. procura aula já agendada para o aluno em janela compatível;
 * 2. caso não exista, cria automaticamente uma aula na agenda com
 *    horário operacional arredondado.
 * Retorna o id do evento vinculado.
 */
export async function linkOrCreateAgendaEventForSession(params: {
  studentId: string;
  adminId: string;
  startedAtReal: Date;
  dayName?: string | null;
  phase?: string | null;
}): Promise<{ calendarEventId: string; isNew: boolean }> {
  const { studentId, adminId, startedAtReal, dayName, phase } = params;

  // 1) Buscar eventos do aluno em janela de ± MATCH_WINDOW_MIN
  const windowMs = MATCH_WINDOW_MIN * 60 * 1000;
  const winStart = new Date(startedAtReal.getTime() - windowMs).toISOString();
  const winEnd = new Date(startedAtReal.getTime() + windowMs).toISOString();

  const { data: ces } = await supabase
    .from('calendar_event_students')
    .select('event_id')
    .eq('student_id', studentId);

  const eventIds = (ces || []).map((c: any) => c.event_id);
  if (eventIds.length > 0) {
    const { data: candidates } = await supabase
      .from('calendar_events')
      .select('id, start_datetime, end_datetime, status')
      .in('id', eventIds)
      .gte('start_datetime', winStart)
      .lte('start_datetime', winEnd)
      .not('status', 'in', '(cancelado,concluido,reagendado,falta,falta_justificada)')
      .order('start_datetime', { ascending: true });

    if (candidates && candidates.length > 0) {
      // melhor candidato: mais próximo do startedAtReal
      const startMs = startedAtReal.getTime();
      const best = candidates.reduce((a: any, b: any) => {
        const da = Math.abs(new Date(a.start_datetime).getTime() - startMs);
        const db = Math.abs(new Date(b.start_datetime).getTime() - startMs);
        return db < da ? b : a;
      });
      return { calendarEventId: best.id, isNew: false };
    }
  }

  // 2) Não existe → criar aula nova com horário operacional
  const opStart = floorTo30(startedAtReal);
  const opEnd = new Date(opStart.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);

  const title = dayName
    ? `Treino — ${dayName}${phase ? ` (${phase})` : ''}`
    : 'Treino';

  const { data: created, error } = await supabase
    .from('calendar_events')
    .insert({
      admin_id: adminId,
      title,
      event_type: 'personal_presencial',
      start_datetime: opStart.toISOString(),
      end_datetime: opEnd.toISOString(),
      status: 'confirmado',
      notes: 'Criado automaticamente ao iniciar sessão pelo admin.',
    } as any)
    .select('id')
    .single();
  if (error || !created) throw error || new Error('Falha ao criar evento');

  await supabase
    .from('calendar_event_students')
    .insert({
      event_id: created.id,
      student_id: studentId,
      attendance_status: 'confirmado',
    } as any);

  return { calendarEventId: created.id, isNew: true };
}

/**
 * Ao finalizar uma sessão de treino pelo admin:
 * 1. marca a aula vinculada como "concluído";
 * 2. marca a presença do aluno como "presente";
 * 3. se houver pacote ativo, desconta 1 crédito automaticamente.
 */
export async function completeAgendaEventForSession(params: {
  calendarEventId: string;
  studentId: string;
  adminId: string;
  startedAtReal: Date;
  completedAtReal: Date;
}): Promise<{ deducted: boolean }> {
  const { calendarEventId, studentId, adminId, startedAtReal, completedAtReal } = params;

  // Buscar evento atual
  const { data: ev } = await supabase
    .from('calendar_events')
    .select('start_datetime, end_datetime, notes')
    .eq('id', calendarEventId)
    .single();

  // Recalcular horário operacional (mantém o início se já existir, senão usa real)
  const opStart = ev?.start_datetime
    ? new Date(ev.start_datetime)
    : floorTo30(startedAtReal);

  // Fim operacional: pelo menos 60 min após início ou o fim original (o que for maior)
  const minEnd = new Date(opStart.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);
  const existingEnd = ev?.end_datetime ? new Date(ev.end_datetime) : minEnd;
  const opEnd = existingEnd > minEnd ? existingEnd : minEnd;

  const realInfo = `Sessão real: ${startedAtReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}–${completedAtReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const newNotes = ev?.notes ? `${ev.notes}\n${realInfo}` : realInfo;

  await supabase
    .from('calendar_events')
    .update({
      status: 'concluido',
      start_datetime: opStart.toISOString(),
      end_datetime: opEnd.toISOString(),
      notes: newNotes,
    } as any)
    .eq('id', calendarEventId);

  await supabase
    .from('calendar_event_students')
    .update({ attendance_status: 'presente' } as any)
    .eq('event_id', calendarEventId)
    .eq('student_id', studentId);

  // Desconto automático de crédito (silencioso se não houver pacote)
  let deducted = false;
  try {
    const pkg = await getStudentActivePackage(studentId);
    if (pkg && pkg.remaining_classes > 0) {
      await deductClassCredit({
        student_id: studentId,
        package_id: pkg.id,
        calendar_event_id: calendarEventId,
        reason: 'Aula concluída (sessão de treino do admin)',
        created_by: adminId,
        action_type: 'use_credit',
      });
      deducted = true;
    }
  } catch (e) {
    console.error('Falha ao descontar crédito automático:', e);
  }

  return { deducted };
}