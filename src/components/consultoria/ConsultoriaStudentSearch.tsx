import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Search, ChevronRight, AlertTriangle, Activity, Send, UserX, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SendNotificationDialog from './SendNotificationDialog';
import { toast } from 'sonner';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  lastOpen: string | null;
  daysSinceOpen: number | null;
  workouts30d: number;
  adherence: number;
  risk: 'baixo' | 'medio' | 'alto';
  hasPlan: boolean;
  ativo: boolean;
}

type FilterKey = 'todos' | 'risco_alto' | 'sem_plano' | 'baixa_aderencia' | 'ativos' | 'desativados';

const ConsultoriaStudentSearch: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('todos');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map(r => r.user_id);
      if (ids.length === 0) { setLoading(false); return; }

      const since30 = new Date(); since30.setDate(since30.getDate() - 30);
      const sinceIso = since30.toISOString();

      const [profilesRes, eventsRes, sessionsRes, plansRes, activeRes] = await Promise.all([
        supabase.from('profiles').select('user_id, nome, email, telefone').in('user_id', ids),
        supabase.from('student_events').select('student_id, created_at').eq('event_type', 'app_opened').in('student_id', ids).order('created_at', { ascending: false }),
        supabase.from('workout_sessions').select('student_id, completed_at, status').in('student_id', ids).gte('completed_at', sinceIso).eq('status', 'completed'),
        supabase.from('ai_plans').select('student_id').in('student_id', ids),
        supabase.from('students_profile').select('user_id, ativo').in('user_id', ids),
      ]);

      const lastOpenMap = new Map<string, string>();
      for (const e of (eventsRes.data ?? [])) {
        if (!lastOpenMap.has(e.student_id)) lastOpenMap.set(e.student_id, e.created_at);
      }
      const workoutsMap = new Map<string, number>();
      for (const s of (sessionsRes.data ?? [])) workoutsMap.set(s.student_id, (workoutsMap.get(s.student_id) ?? 0) + 1);
      const planSet = new Set((plansRes.data ?? []).map(p => p.student_id));
      const activeMap = new Map<string, boolean>();
      for (const a of (activeRes.data ?? [])) activeMap.set(a.user_id, a.ativo !== false);

      const list: StudentRow[] = (profilesRes.data ?? []).map(p => {
        const lastOpen = lastOpenMap.get(p.user_id) ?? null;
        const daysSinceOpen = lastOpen ? differenceInDays(new Date(), new Date(lastOpen)) : null;
        const workouts30d = workoutsMap.get(p.user_id) ?? 0;
        const adherence = Math.min(100, Math.round((workouts30d / 17) * 100));
        const risk: StudentRow['risk'] = !lastOpen || daysSinceOpen! >= 5 ? 'alto' : daysSinceOpen! >= 3 ? 'medio' : 'baixo';
        return {
          id: p.user_id, name: p.nome || 'Sem nome', email: p.email, phone: p.telefone,
          lastOpen, daysSinceOpen, workouts30d, adherence, risk, hasPlan: planSet.has(p.user_id),
          ativo: activeMap.get(p.user_id) ?? true,
        };
      });

      setRows(list.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      // Filtros que NÃO são "desativados" só consideram alunos ativos
      if (filter !== 'desativados' && !r.ativo) return false;
      switch (filter) {
        case 'risco_alto': return r.risk === 'alto';
        case 'sem_plano': return !r.hasPlan;
        case 'baixa_aderencia': return r.adherence < 40;
        case 'ativos': return r.risk === 'baixo';
        case 'desativados': return !r.ativo;
        default: return true;
      }
    });
  }, [rows, query, filter]);

  const filters: { value: FilterKey; label: string; count: number }[] = [
    { value: 'todos', label: 'Todos', count: rows.filter(r => r.ativo).length },
    { value: 'ativos', label: 'Engajados', count: rows.filter(r => r.ativo && r.risk === 'baixo').length },
    { value: 'risco_alto', label: 'Risco abandono', count: rows.filter(r => r.ativo && r.risk === 'alto').length },
    { value: 'baixa_aderencia', label: 'Baixa aderência', count: rows.filter(r => r.ativo && r.adherence < 40).length },
    { value: 'sem_plano', label: 'Sem plano', count: rows.filter(r => r.ativo && !r.hasPlan).length },
    { value: 'desativados', label: 'Desativados', count: rows.filter(r => !r.ativo).length },
  ];

  const toggleAtivo = async (id: string, currentAtivo: boolean) => {
    const newAtivo = !currentAtivo;
    const { error } = await supabase
      .from('students_profile')
      .update({ ativo: newAtivo })
      .eq('user_id', id);
    if (error) {
      toast.error('Erro ao atualizar status do aluno');
      return;
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ativo: newAtivo } : r));
    toast.success(newAtivo ? 'Aluno reativado — alertas voltam a aparecer' : 'Aluno desativado — alertas serão ocultados');
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar aluno por nome ou email..."
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filter === f.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${filter === f.value ? 'bg-background/20' : 'bg-muted'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum aluno encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const riskColor = r.risk === 'alto' ? 'bg-destructive/15 text-destructive border-destructive/30' : r.risk === 'medio' ? 'bg-orange-500/15 text-orange-500 border-orange-500/30' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
            return (
              <Card key={r.id} className="hover:bg-secondary/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm shrink-0">
                      {r.name[0]?.toUpperCase()}
                    </div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/alunos/${r.id}?tab=comportamento`)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <Badge variant="outline" className={`text-[9px] ${riskColor}`}>
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          {r.risk}
                        </Badge>
                        {!r.hasPlan && <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500 border-orange-500/30">Sem plano</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />
                          {r.lastOpen ? formatDistanceToNow(new Date(r.lastOpen), { locale: ptBR, addSuffix: true }) : 'nunca abriu'}
                        </span>
                        <span>{r.workouts30d} treinos/30d</span>
                        <span className={r.adherence >= 70 ? 'text-emerald-500' : r.adherence >= 40 ? 'text-orange-500' : 'text-destructive'}>{r.adherence}% aderência</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <SendNotificationDialog
                        studentId={r.id}
                        studentName={r.name}
                        trigger={<Button variant="ghost" size="icon" className="h-8 w-8" title="Enviar notificação"><Send className="h-3.5 w-3.5" /></Button>}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/alunos/${r.id}?tab=comportamento`)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConsultoriaStudentSearch;