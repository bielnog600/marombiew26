import { supabase } from '@/integrations/supabase/client';
import { deductClassCredit, ClassPackage } from '@/hooks/useFinancial';
import { OPERATIONAL_TIMEZONE } from '@/lib/financial';

/**
 * Reconciliação Agenda × Pacotes de Aulas.
 *
 * Regra canônica: uma aula só pode consumir crédito de um pacote que estava
 * VIGENTE NA DATA DA AULA (start_date <= data da aula <= expiry_date, quando
 * houver). O estado atual do pacote (ativo/esgotado/cancelado) nunca é usado
 * para decidir a que pacote pertence uma aula histórica.
 *
 * Esta ferramenta reconcilia apenas CRÉDITOS: nunca altera o status de um
 * evento da Agenda.
 */

export type ReconciliationStatus =
  | 'ok'                  // débito já existente, nada a fazer
  | 'ready_to_fix'        // pacote válido identificado — pronto para conciliar (dry-run)
  | 'fixed'               // débito aplicado agora
  | 'no_valid_package'    // nenhum pacote vigente na data da aula
  | 'multiple_packages'   // mais de um pacote vigente na data → ambíguo
  | 'zero_balance'        // pacote identificado, mas sem saldo atual
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
  packageName?: string | null;
  packageStart?: string | null;
  packageExpiry?: string | null;
  balanceBefore?: number;
  balanceAfter?: number;
  totalClasses?: number;
  usedClasses?: number;
}

export interface ReconciliationResult {
  scanned: number;
  ok: number;
  ready: number;
  fixed: number;
  pending: number;
  items: ReconciliationItem[];
}

/** Status do evento que consomem crédito. */
const CREDIT_EVENT_STATUS = ['concluido', 'falta'] as const;

/** Data civil (YYYY-MM-DD) de um instante no timezone operacional. */
export function civilDateInTimezone(iso: string, timeZone: string = OPERATIONAL_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export interface PackageValidityFields {
  student_id?: string;
  start_date?: string | null;
  expiry_date?: string | null;
}

/**
 * O pacote estava vigente na data civil da aula?
 * Não usa status atual nem saldo: é uma relação puramente histórica.
 */
export function packageWasValidForEvent(
  pkg: PackageValidityFields,
  eventStart: string,
  opts: { studentId?: string; timeZone?: string } = {},
): boolean {
  if (opts.studentId && pkg.student_id && pkg.student_id !== opts.studentId) return false;
  const day = civilDateInTimezone(eventStart, opts.timeZone || OPERATIONAL_TIMEZONE);
  const start = (pkg.start_date || '').slice(0, 10);
  if (!start) return false;
  if (day < start) return false;
  const expiry = (pkg.expiry_date || '').slice(0, 10);
  if (expiry && day > expiry) return false;
  return true;
}

export type PackageSelection =
  | { kind: 'single'; pkg: ClassPackage }
  | { kind: 'none' }
  | { kind: 'multiple'; candidates: ClassPackage[] };

/** Seleciona o pacote historicamente elegível para a data da aula. */
export function selectPackageForEvent(
  pkgs: ClassPackage[],
  eventStart: string,
  studentId?: string,
): PackageSelection {
  const candidates = pkgs.filter(p => packageWasValidForEvent(p, eventStart, { studentId }));
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length > 1) return { kind: 'multiple', candidates };
  return { kind: 'single', pkg: candidates[0] };
}

function fmtRange(pkg: ClassPackage): string {
  const s = (pkg.start_date || '').slice(0, 10);
  const e = (pkg.expiry_date || '').slice(0, 10);
  return e ? `${s} → ${e}` : `${s} → sem validade`;
}

/**
 * Verifica e, quando seguro, aplica os débitos em falta numa janela de datas.
 * Padrão: primeiro dia do mês atual → hoje.
 */
export async function reconcileAgendaPackages(opts: {
  adminId: string;
  fromDate?: Date;
  toDate?: Date;
  dryRun?: boolean;
} = { adminId: '' }): Promise<ReconciliationResult> {
  const { adminId, fromDate, toDate, dryRun = false } = opts;
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const from = (fromDate || defaultFrom).toISOString();
  const to = (toDate || now).toISOString();

  const items: ReconciliationItem[] = [];

  // 1) Eventos que deveriam ter consumido crédito (status explícito apenas).
  let q = supabase
    .from('calendar_events')
    .select('id, title, start_datetime, status, admin_id')
    .in('status', CREDIT_EVENT_STATUS as unknown as Array<'concluido' | 'falta'>)
    .gte('start_datetime', from)
    .lte('start_datetime', to);
  if (adminId) q = q.eq('admin_id', adminId);
  const { data: evsRaw } = await q;

  const evs = evsRaw || [];
  if (evs.length === 0) {
    return { scanned: 0, ok: 0, ready: 0, fixed: 0, pending: 0, items: [] };
  }

  const evIds = evs.map(e => e.id);

  // 2) Alunos vinculados
  const { data: ces } = await supabase
    .from('calendar_event_students')
    .select('event_id, student_id')
    .in('event_id', evIds);

  // 3) Débitos já existentes (proteção contra duplicidade)
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
      .order('start_date', { ascending: false });
    pkgCache[studentId] = (data || []) as ClassPackage[];
    return pkgCache[studentId];
  }

  let scanned = 0;
  let ok = 0;
  let ready = 0;
  let fixed = 0;
  let pending = 0;

  const base = (ev: typeof evs[number]) => ({
    eventId: ev.id,
    eventTitle: ev.title || 'Evento',
    eventStart: ev.start_datetime,
  });

  for (const ev of evs) {
    const eventStudents = (ces || []).filter(c => c.event_id === ev.id);
    if (eventStudents.length === 0) {
      items.push({
        ...base(ev),
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
      const studentName = nameMap[es.student_id] || 'Aluno';

      if (debitedSet.has(`${ev.id}::${es.student_id}`)) {
        ok++;
        continue;
      }

      const pkgs = await getPackages(es.student_id);
      const selection = selectPackageForEvent(pkgs, ev.start_datetime, es.student_id);

      if (selection.kind === 'none') {
        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'no_valid_package',
          message: 'Nenhum pacote encontrado com vigência compatível com esta aula.',
          packageId: null,
        });
        pending++;
        continue;
      }

      if (selection.kind === 'multiple') {
        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'multiple_packages',
          message: `Mais de um pacote era válido na data desta aula (${selection.candidates
            .map(c => `${c.package_name} ${fmtRange(c)}`)
            .join(' | ')}). Selecione manualmente o pacote correto.`,
          packageId: null,
        });
        pending++;
        continue;
      }

      const pkg = selection.pkg;
      const detail = {
        packageId: pkg.id,
        packageName: pkg.package_name,
        packageStart: pkg.start_date,
        packageExpiry: pkg.expiry_date,
        totalClasses: pkg.total_classes,
        usedClasses: pkg.used_classes,
      };

      if (pkg.remaining_classes <= 0) {
        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'zero_balance',
          message: `Pacote identificado (${pkg.package_name}, ${fmtRange(pkg)}), mas o saldo atual é ${pkg.remaining_classes}. Não é possível debitar sem criar saldo negativo.`,
          balanceBefore: pkg.remaining_classes,
          ...detail,
        });
        pending++;
        continue;
      }

      if (dryRun) {
        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'ready_to_fix',
          message: `Pronto para conciliar no pacote ${pkg.package_name} (${fmtRange(pkg)}): saldo ${pkg.remaining_classes} → ${pkg.remaining_classes - 1}.`,
          balanceBefore: pkg.remaining_classes,
          balanceAfter: pkg.remaining_classes - 1,
          ...detail,
        });
        ready++;
        continue;
      }

      try {
        const before = pkg.remaining_classes;
        await deductClassCredit({
          student_id: es.student_id,
          package_id: pkg.id,
          calendar_event_id: ev.id,
          reason: `Conciliação Agenda × Pacotes — aula de ${civilDateInTimezone(ev.start_datetime)}`,
          created_by: adminId,
          action_type: 'use_credit',
          // CRÍTICO: a data do consumo é a data da aula, não a data da conciliação.
          occurred_at: ev.start_datetime,
        });
        pkg.remaining_classes = before - 1;
        pkg.used_classes = (pkg.used_classes || 0) + 1;
        debitedSet.add(`${ev.id}::${es.student_id}`);

        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'fixed',
          message: `Conciliado no pacote ${pkg.package_name} (${fmtRange(pkg)}): ${before} → ${before - 1}.`,
          balanceBefore: before,
          balanceAfter: before - 1,
          ...detail,
        });
        fixed++;
      } catch (e) {
        console.error('Reconciliação falhou para', ev.id, es.student_id, e);
        items.push({
          ...base(ev),
          studentId: es.student_id,
          studentName,
          status: 'error',
          message: 'Falha ao aplicar o débito.',
          ...detail,
        });
        pending++;
      }
    }
  }

  return { scanned, ok, ready, fixed, pending, items };
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
    .select('id, status, start_datetime')
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
    const studentName = nameMap[es.student_id] || 'Aluno';
    if (debited.has(es.student_id)) {
      out.push({ studentId: es.student_id, studentName, status: 'ok', message: 'Crédito debitado corretamente.' });
      continue;
    }
    const { data: pkgs } = await supabase
      .from('class_packages')
      .select('*')
      .eq('student_id', es.student_id);
    const selection = selectPackageForEvent((pkgs || []) as ClassPackage[], ev.start_datetime, es.student_id);

    if (selection.kind === 'none') {
      out.push({
        studentId: es.student_id, studentName,
        status: 'no_valid_package',
        message: 'Nenhum pacote com vigência compatível com esta aula.',
      });
    } else if (selection.kind === 'multiple') {
      out.push({
        studentId: es.student_id, studentName,
        status: 'multiple_packages',
        message: 'Mais de um pacote era válido na data desta aula — vincule manualmente.',
      });
    } else if (selection.pkg.remaining_classes <= 0) {
      out.push({
        studentId: es.student_id, studentName,
        status: 'zero_balance',
        message: `Pacote identificado (${selection.pkg.package_name}) sem saldo atual.`,
      });
    } else {
      out.push({
        studentId: es.student_id, studentName,
        status: 'ready_to_fix',
        message: `Débito pendente — pronto para conciliar (${selection.pkg.package_name}).`,
      });
    }
  }
  return out;
}
