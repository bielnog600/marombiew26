import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Ban,
  ChevronRight,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { readConsultoriaPlanSummaries, readConsultoriaWorkoutCounts } from '@/lib/consultoriaData';
import { matchesConsultoriaStudentFilter, studentRisk, workoutAdherence, type ConsultoriaStudentFilter } from '@/lib/consultoriaMetrics';
import {
  formatLastAccessLabel,
  getInactiveDays,
  suspensionReasonLabel,
  type AccessStatus,
  type SuspensionReason,
} from '@/lib/accessControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import SendNotificationDialog from './SendNotificationDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  daysSinceOpen: number | null;
  workouts30d: number;
  adherence: number;
  risk: 'baixo' | 'medio' | 'alto';
  hasTreino: boolean;
  hasDieta: boolean;
  ativo: boolean;
  accessStatus: AccessStatus;
  suspensionReason: SuspensionReason | null;
  suspendedAt: string | null;
  lastActiveAt: string | null;
}

type FilterKey = ConsultoriaStudentFilter;

const ConsultoriaStudentSearch: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [sortOrder, setSortOrder] = useState<'name' | 'last_access'>('name');
  const [confirmAction, setConfirmAction] = useState<{ row: StudentRow; type: 'suspend' | 'reactivate' } | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: studentProfiles, error: studentsError } = await supabase
        .from('students_profile')
        .select('user_id, ativo, access_status, suspension_reason, suspended_at, last_active_at');
      if (studentsError) {
        if (!cancelled) { setLoading(false); toast.error('Não foi possível carregar os alunos.'); }
        return;
      }
      const ids = (studentProfiles ?? []).map(student => student.user_id);
      if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const since30 = new Date();
      since30.setDate(since30.getDate() - 30);
      try {
        const [profilesResult, plans, workoutCounts] = await Promise.all([
          supabase.from('profiles').select('user_id, nome, email, telefone').in('user_id', ids),
          readConsultoriaPlanSummaries(ids),
          readConsultoriaWorkoutCounts(ids, since30),
        ]);
        if (profilesResult.error) throw profilesResult.error;

        const plansByStudent = new Map<string, { dieta?: typeof plans[number]; treino?: typeof plans[number] }>();
        for (const plan of plans) {
          const current = plansByStudent.get(plan.student_id) ?? {};
          current[plan.tipo] = plan;
          plansByStudent.set(plan.student_id, current);
        }
        const accessById = new Map((studentProfiles ?? []).map(student => [student.user_id, student]));
        const list: StudentRow[] = (profilesResult.data ?? []).map(profile => {
          const access = accessById.get(profile.user_id);
          const lastActiveAt = access?.last_active_at ?? null;
          const daysSinceOpen = getInactiveDays(lastActiveAt);
          const workouts30d = workoutCounts.get(profile.user_id) ?? 0;
          const studentPlans = plansByStudent.get(profile.user_id);
          const treino = studentPlans?.treino;
          const adherence = workoutAdherence(workouts30d, treino?.treino_days);
          const risk = studentRisk({
            lastActiveAt,
            adherence,
            hasWorkoutPlan: Boolean(treino),
            workoutPlanCreatedAt: treino?.created_at ?? null,
          });
          return {
            id: profile.user_id,
            name: profile.nome || 'Sem nome',
            email: profile.email ?? '',
            phone: profile.telefone,
            daysSinceOpen,
            workouts30d,
            adherence,
            risk,
            hasTreino: Boolean(treino),
            hasDieta: Boolean(studentPlans?.dieta),
            ativo: access?.ativo !== false,
            accessStatus: (access?.access_status as AccessStatus) ?? 'active',
            suspensionReason: (access?.suspension_reason as SuspensionReason) ?? null,
            suspendedAt: access?.suspended_at ?? null,
            lastActiveAt,
          };
        });
        if (!cancelled) setRows(list.sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) toast.error('Não foi possível carregar os dados de acompanhamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows
      .filter(row => {
        if (normalizedQuery && !row.name.toLowerCase().includes(normalizedQuery) && !row.email.toLowerCase().includes(normalizedQuery)) return false;
        return matchesConsultoriaStudentFilter(row, filter);
      })
      .sort((a, b) => {
        if (sortOrder === 'name') return a.name.localeCompare(b.name);
        return (b.daysSinceOpen ?? 9999) - (a.daysSinceOpen ?? 9999);
      });
  }, [rows, query, filter, sortOrder]);

  const countFilter = (value: FilterKey) => rows.filter(row => matchesConsultoriaStudentFilter(row, value)).length;
  const filters: { value: FilterKey; label: string; count: number }[] = [
    { value: 'todos', label: 'Todos', count: countFilter('todos') },
    { value: 'ativos', label: 'Engajados', count: countFilter('ativos') },
    { value: 'risco_alto', label: 'Risco abandono', count: countFilter('risco_alto') },
    { value: 'baixa_aderencia', label: 'Baixa aderência', count: countFilter('baixa_aderencia') },
    { value: 'sem_treino', label: 'Sem treino', count: countFilter('sem_treino') },
    { value: 'sem_dieta', label: 'Sem dieta', count: countFilter('sem_dieta') },
    { value: 'suspensos', label: 'Suspensos', count: countFilter('suspensos') },
  ];

  const applyAccessChange = async () => {
    if (!confirmAction) return;
    const { row, type } = confirmAction;
    setWorking(true);
    const rpc = type === 'suspend' ? 'suspend_student_access' : 'reactivate_student_access';
    const { error } = await (supabase as any).rpc(rpc, { _user_id: row.id });
    setWorking(false);
    if (error) {
      toast.error(type === 'suspend' ? 'Não foi possível suspender o acesso.' : 'Não foi possível reativar a conta.');
      return;
    }
    setRows(previous => previous.map(current => current.id === row.id ? {
      ...current,
      accessStatus: type === 'suspend' ? 'suspended' : 'active',
      ativo: type !== 'suspend',
      suspensionReason: type === 'suspend' ? 'manual' : null,
      suspendedAt: type === 'suspend' ? new Date().toISOString() : null,
      lastActiveAt: type === 'suspend' ? current.lastActiveAt : new Date().toISOString(),
    } : current));
    toast.success(type === 'suspend' ? 'Acesso suspenso — o aluno sai dos acompanhamentos operacionais.' : 'Conta reativada — o aluno volta aos acompanhamentos.');
    setConfirmAction(null);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar aluno por nome ou email..." className="pl-9" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {filters.map(item => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${filter === item.value ? 'bg-foreground text-background border-foreground' : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'}`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${filter === item.value ? 'bg-background/20' : 'bg-muted'}`}>{item.count}</span>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5" onClick={() => setSortOrder(previous => previous === 'name' ? 'last_access' : 'name')}>
          <ArrowUpDown className="h-3 w-3" />
          {sortOrder === 'name' ? 'Ordenar por Acesso' : 'Ordenar por Nome'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum aluno encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const riskColor = row.risk === 'alto' ? 'bg-destructive/15 text-destructive border-destructive/30' : row.risk === 'medio' ? 'bg-orange-500/15 text-orange-500 border-orange-500/30' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
            return (
              <Card key={row.id} className="hover:bg-secondary/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm shrink-0">{row.name[0]?.toUpperCase()}</div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/alunos/${row.id}?tab=comportamento`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{row.name}</p>
                        <Badge variant="outline" className={`text-[9px] ${row.accessStatus === 'suspended' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'}`}>
                          {row.accessStatus === 'suspended' ? 'SUSPENSO' : 'ATIVO'}
                        </Badge>
                        <Badge variant="outline" className={`text-[9px] ${riskColor}`}><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{row.risk}</Badge>
                        {!row.hasTreino && <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500 border-orange-500/30">Sem treino</Badge>}
                        {!row.hasDieta && <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500 border-orange-500/30">Sem dieta</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />Último acesso: {formatLastAccessLabel(getInactiveDays(row.lastActiveAt))}</span>
                        <span>{row.workouts30d} treinos/30d</span>
                        <span className={row.adherence >= 70 ? 'text-emerald-500' : row.adherence >= 40 ? 'text-orange-500' : 'text-destructive'}>{row.adherence}% aderência</span>
                      </div>
                      {row.accessStatus === 'suspended' && <div className="text-[10px] text-destructive mt-0.5">
                        Motivo: {suspensionReasonLabel(row.suspensionReason)}
                        {row.suspendedAt && ` · Suspenso em ${format(new Date(row.suspendedAt), 'dd/MM/yyyy')}`}
                      </div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <SendNotificationDialog studentId={row.id} studentName={row.name} trigger={<Button variant="ghost" size="icon" className="h-8 w-8" title="Enviar notificação"><Send className="h-3.5 w-3.5" /></Button>} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmAction({ row, type: row.accessStatus === 'suspended' ? 'reactivate' : 'suspend' })} title={row.accessStatus === 'suspended' ? 'Ativar conta' : 'Suspender acesso'}>
                        {row.accessStatus === 'suspended' ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Ban className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/alunos/${row.id}?tab=comportamento`)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={open => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.type === 'suspend' ? `Suspender acesso de ${confirmAction?.row.name}?` : `Reativar acesso de ${confirmAction?.row.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.type === 'suspend'
              ? 'O aluno não poderá acessar o conteúdo do aplicativo até que a conta seja reativada. Ele também deixará de aparecer nos acompanhamentos operacionais enquanto estiver suspenso. Nenhum treino, dieta, avaliação ou histórico será apagado.'
              : 'O aluno voltará a acessar normalmente o MAROMBIEW e será reativado nos acompanhamentos da Consultoria.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={event => { event.preventDefault(); void applyAccessChange(); }}>{confirmAction?.type === 'suspend' ? 'Suspender acesso' : 'Ativar conta'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConsultoriaStudentSearch;
