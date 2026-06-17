import { supabase } from '@/integrations/supabase/client';
import { deductClassCredit, ClassPackage } from '@/hooks/useFinancial';

/**
 * Reconciliação Agenda × Pacotes de Aulas.
 *
 * Para cada aula MARCADA COMO REALIZADA (concluido) ou FALTA SEM AVISO (falta)
 * verifica se existe débito de crédito (class_credits_log com action_type
 * 'use_credit' apontando para o calendar_event_id). Quando não existe,
 * tenta corrigir automaticamente se houver UM ÚNICO pacote ativo válido
 * com saldo > 0. Caso contrário, devolve item pendente para revisão manual.
 */

export type ReconciliationStatus =
  | 'ok'                  // débito existente, nada a fazer
  | 'auto_fixed'          // corrigido automaticamente agora
  | 'no_package'          // aluno sem pacote ativo
  | 'multiple_packages'   // mais de 1 pacote ativo → ambíguo
  | 'zero_balance'        // pacote ativo, mas sem saldo
  | 'expired_package'     // único pacote ativo está vencido
  | 'no_students'         // evento sem alunos vinculados
  | 'error';              // falha inesperada

export interface ReconciliationItem {
  eventId: string;
  eventTitle: string;
  eventStart: string;
  studentId: string;
  studentName: string;
  status: ReconciliationStatus;
  message: string;
  packageId?: string | null;
  balanceBefore?: number;
  balanceAfter?: number;
}

export interface ReconciliationResult {
  scanned: number;
  ok: number;
  fixed: number;
  pending: number;
  items: ReconciliationItem[];
}

/** Status do evento que consomem crédito. */
const CREDIT_EVENT_STATUS = ['concluido', 'falta'] as const;

function pickValidActivePackage(pkgs: ClassPackage[]): {
  pkg: ClassPackage | null;
  reason: Exclude<ReconciliationStatus, 'ok' | 'auto_fixed' | 'no_students' | 'error'>;
} {
  const today = new Date().toISOString().slice(0, 10);
  const active = pkgs.filter(p => p.status === 'ativo');
  if (active.length === 0) return { pkg: null, reason: 'no_package' };

  const notExpired = active.filter(p => !p.expiry_date || p.expiry_date >= today);
  if (notExpired.length === 0) return { pkg: null, reason: 'expired_package' };

  if (notExpired.length > 1) return { pkg: null, reason: 'multiple_packages' };

  const pkg = notExpired[0];
  if (pkg.remaining_classes <= 0) return { pkg, reason: 'zero_balance' };
  return { pkg, reason: 'no_package' }; // unused — handled by caller
}

/**
 * Verifica e, quando seguro, corrige inconsistências em uma janela de datas
 * (padrão: últimos 60 dias). Pode rodar em modo "dry-run" para apenas
 * inspecionar sem aplicar correções.
 */
export async function reconcileAgendaPackages(opts: {
  adminId: string;
  fromDate?: Date;
  toDate?: Date;
  dryRun?: boolean;
} = { adminId: '' }): Promise<ReconciliationResult> {
  const { adminId, fromDate, toDate, dryRun = false } = opts;
  const from = (fromDate || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)).toISOString();
  const to = (toDate || new Date()).toISOString();

  const items: ReconciliationItem[] = [];

  // 1) Busca eventos que deveriam ter consumido crédito
  let q = supabase
    .from('calendar_events')
    .select('id, title, start_datetime, status, admin_id')
    .in('status', CREDIT_EVENT_STATUS as unknown as Array<'concluido' | 'falta'>)
    .gte('start_datetime', from)
    .lte('start_datetime', to);
  if (adminId) q = q.eq('admin_id', adminId);
  const { data: evsRaw, error: evErr } = await q;

  // 1.b) Detecta eventos AGENDADOS/CONFIRMADOS cujo aluno já completou o treino
  //     próximo ao horário do evento — auto-marca como concluído antes de
  //     conferir o débito de crédito.
  let pendingQ = supabase
    .from('calendar_events')
    .select('id, title, start_datetime, status, admin_id')
    .in('status', ['agendado', 'confirmado'])
    .gte('start_datetime', from)
    .lte('start_datetime', to);
  if (adminId) pendingQ = pendingQ.eq('admin_id', adminId);
  const { data: pendingEvs } = await pendingQ;

  const autoConcluded: typeof evsRaw = [];
  if (pendingEvs && pendingEvs.length > 0) {
    const pIds = pendingEvs.map(e => e.id);
    const { data: pCes } = await supabase
      .from('calendar_event_students')
      .select('event_id, student_id')
      .in('event_id', pIds);
    const studentsByEvent = new Map<string, string[]>();
    (pCes || []).forEach(c => {
      const arr = studentsByEvent.get(c.event_id) || [];
      arr.push(c.student_id);
      studentsByEvent.set(c.event_id, arr);
    });

    const allStudentIds = [...new Set((pCes || []).map(c => c.student_id))];
    let sessions: { student_id: string; completed_at: string; calendar_event_id: string | null }[] = [];
    if (allStudentIds.length > 0) {
      const { data: ws } = await supabase
        .from('workout_sessions')
        .select('student_id, completed_at, calendar_event_id')
        .eq('status', 'completed')
        .in('student_id', allStudentIds)
        .gte('completed_at', new Date(new Date(from).getTime() - 4 * 60 * 60 * 1000).toISOString())
        .lte('completed_at', new Date(new Date(to).getTime() + 6 * 60 * 60 * 1000).toISOString());
      sessions = (ws || []) as any;
    }

    const toConclude: string[] = [];
    for (const ev of pendingEvs) {
      const studs = studentsByEvent.get(ev.id) || [];
      if (studs.length === 0) continue;
      const evStart = new Date(ev.start_datetime).getTime();
      // Janela: 2h antes até 6h depois do início do evento
      const matched = sessions.some(s => {
        if (!studs.includes(s.student_id)) return false;
        if (s.calendar_event_id && s.calendar_event_id !== ev.id) return false;
        const t = new Date(s.completed_at).getTime();
        return t >= evStart - 2 * 3600 * 1000 && t <= evStart + 6 * 3600 * 1000;
      });
      if (matched) {
        toConclude.push(ev.id);
        autoConcluded.push({ ...ev, status: 'concluido' });
      }
    }

    if (toConclude.length > 0 && !dryRun) {
      await supabase
        .from('calendar_events')
        .update({ status: 'concluido' })
        .in('id', toConclude);
    }
  }

  const evs = [...(evsRaw || []), ...autoConcluded];
  if (evs.length === 0) {
    return { scanned: 0, ok: 0, fixed: 0, pending: 0, items: [] };
  }

  const evIds = evs.map(e => e.id);

  // 2) Carrega alunos vinculados a esses eventos
  const { data: ces } = await supabase
    .from('calendar_event_students')
    .select('event_id, student_id')
    .in('event_id', evIds);

  // 3) Carrega débitos já existentes para esses eventos
  const { data: logs } = await supabase
    .from('class_credits_log')
    .select('calendar_event_id, student_id, action_type')
    .in('calendar_event_id', evIds)
    .eq('action_type', 'use_credit');

  const debitedSet = new Set(
    (logs || []).map(l => `${l.calendar_event_id}::${l.student_id}`)
  );

  // 4) Nomes dos alunos
  const studentIds = [...new Set((ces || []).map(c => c.student_id))];
  const nameMap: Record<string, string> = {};
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nome')
      .in('user_id', studentIds);
    profiles?.forEach((p: any) => { nameMap[p.user_id] = p.nome; });
  }

  // 5) Pacotes por aluno (cache)
  const pkgCache: Record<string, ClassPackage[]> = {};
  async function getPackages(studentId: string): Promise<ClassPackage[]> {
    if (pkgCache[studentId]) return pkgCache[studentId];
    const { data } = await supabase
      .from('class_packages')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    pkgCache[studentId] = (data || []) as ClassPackage[];
    return pkgCache[studentId];
  }

  let scanned = 0;
  let ok = 0;
  let fixed = 0;
  let pending = 0;

  for (const ev of evs) {
    const eventStudents = (ces || []).filter(c => c.event_id === ev.id);
    if (eventStudents.length === 0) {
      items.push({
        eventId: ev.id,
        eventTitle: ev.title || 'Evento',
        eventStart: ev.start_datetime,
        studentId: '',
        studentName: '—',
        status: 'no_students',
        message: 'Aula concluída sem alunos vinculados.',
      });
      pending++;
      continue;
    }

    for (const es of eventStudents) {
      scanned++;
      const key = `${ev.id}::${es.student_id}`;
      if (debitedSet.has(key)) {
        ok++;
        continue;
      }

      const pkgs = await getPackages(es.student_id);
      const { pkg, reason } = pickValidActivePackage(pkgs);
      const studentName = nameMap[es.student_id] || 'Aluno';

      // Caso ambíguo / inviável: registrar pendente
      if (!pkg || reason !== 'no_package' || pkg.remaining_classes <= 0) {
        // reason já contém a razão correta; trate cada caso
        let st: ReconciliationStatus = reason;
        let msg = '';
        if (st === 'no_package') {
          msg = 'Aula realizada sem pacote ativo identificado.';
        } else if (st === 'multiple_packages') {
          msg = 'Mais de um pacote ativo — vincule manualmente.';
        } else if (st === 'zero_balance') {
          msg = 'Pacote ativo sem saldo disponível.';
        } else if (st === 'expired_package') {
          msg = 'Único pacote ativo está vencido.';
        }
        items.push({
          eventId: ev.id,
          eventTitle: ev.title || 'Evento',
          eventStart: ev.start_datetime,
          studentId: es.student_id,
          studentName,
          status: st,
          message: msg,
          packageId: pkg?.id ?? null,
        });
        pending++;
        continue;
      }

      // Caso claro → corrigir (ou apenas reportar em dryRun)
      if (dryRun) {
        items.push({
          eventId: ev.id,
          eventTitle: ev.title || 'Evento',
          eventStart: ev.start_datetime,
          studentId: es.student_id,
          studentName,
          status: 'auto_fixed',
          message: `Pronto para correção automática: pacote ${pkg.package_name} (${pkg.remaining_classes} → ${pkg.remaining_classes - 1}).`,
          packageId: pkg.id,
          balanceBefore: pkg.remaining_classes,
          balanceAfter: pkg.remaining_classes - 1,
        });
        fixed++;
        continue;
      }

      try {
        const before = pkg.remaining_classes;
        await deductClassCredit({
          student_id: es.student_id,
          package_id: pkg.id,
          calendar_event_id: ev.id,
          reason: `Correção automática de vínculo/débito — aula de ${new Date(ev.start_datetime).toLocaleString('pt-BR')}`,
          created_by: adminId,
          action_type: 'use_credit',
        });
        // Atualiza cache localmente para refletir novo saldo
        pkg.remaining_classes = before - 1;
        pkg.used_classes = (pkg.used_classes || 0) + 1;

        items.push({
          eventId: ev.id,
          eventTitle: ev.title || 'Evento',
          eventStart: ev.start_datetime,
          studentId: es.student_id,
          studentName,
          status: 'auto_fixed',
          message: `Correção aplicada no pacote ${pkg.package_name}: ${before} → ${before - 1}.`,
          packageId: pkg.id,
          balanceBefore: before,
          balanceAfter: before - 1,
        });
        fixed++;
      } catch (e) {
        console.error('Reconciliação falhou para', ev.id, es.student_id, e);
        items.push({
          eventId: ev.id,
          eventTitle: ev.title || 'Evento',
          eventStart: ev.start_datetime,
          studentId: es.student_id,
          studentName,
          status: 'error',
          message: 'Falha ao aplicar correção automática.',
          packageId: pkg.id,
        });
        pending++;
      }
    }
  }

  return { scanned, ok, fixed, pending, items };
}

/**
 * Versão pontual para um único evento — útil para mostrar indicador
 * no detalhe do evento sem rodar varredura completa.
 */
export async function checkEventReconciliation(eventId: string): Promise<{
  studentId: string;
  studentName: string;
  status: ReconciliationStatus;
  message: string;
}[]> {
  const { data: ev } = await supabase
    .from('calendar_events')
    .select('id, status')
    .eq('id', eventId)
    .single();
  if (!ev || !(CREDIT_EVENT_STATUS as readonly string[]).includes(ev.status)) {
    return [];
  }

  const { data: ces } = await supabase
    .from('calendar_event_students')
    .select('student_id')
    .eq('event_id', eventId);
  if (!ces || ces.length === 0) return [];

  const { data: logs } = await supabase
    .from('class_credits_log')
    .select('student_id')
    .eq('calendar_event_id', eventId)
    .eq('action_type', 'use_credit');
  const debited = new Set((logs || []).map(l => l.student_id));

  const studentIds = ces.map(c => c.student_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nome')
    .in('user_id', studentIds);
  const nameMap: Record<string, string> = {};
  profiles?.forEach((p: any) => { nameMap[p.user_id] = p.nome; });

  const out: { studentId: string; studentName: string; status: ReconciliationStatus; message: string }[] = [];
  for (const es of ces) {
    if (debited.has(es.student_id)) {
      out.push({
        studentId: es.student_id,
        studentName: nameMap[es.student_id] || 'Aluno',
        status: 'ok',
        message: 'Crédito debitado corretamente.',
      });
      continue;
    }
    const { data: pkgs } = await supabase
      .from('class_packages')
      .select('*')
      .eq('student_id', es.student_id);
    const { pkg, reason } = pickValidActivePackage((pkgs || []) as ClassPackage[]);
    let status: ReconciliationStatus = reason;
    let message = '';
    if (!pkg) {
      if (status === 'no_package') message = 'Aula realizada sem pacote ativo.';
      else if (status === 'expired_package') message = 'Pacote ativo está vencido.';
      else if (status === 'multiple_packages') message = 'Mais de um pacote ativo — vincule manualmente.';
    } else if (pkg.remaining_classes <= 0) {
      status = 'zero_balance';
      message = 'Pacote ativo sem saldo.';
    } else {
      status = 'auto_fixed'; // potencial
      message = `Débito pendente — pode ser corrigido automaticamente (${pkg.package_name}).`;
    }
    out.push({
      studentId: es.student_id,
      studentName: nameMap[es.student_id] || 'Aluno',
      status,
      message,
    });
  }
  return out;
}