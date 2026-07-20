import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Search, Package, CalendarCheck, CalendarClock, CalendarX, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface StudentLite { id: string; name: string; email: string | null; }

const StudentClassesLookupDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StudentLite | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingStudents(true);
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map(r => r.user_id);
      if (ids.length === 0) { setStudents([]); setLoadingStudents(false); return; }
      const { data } = await supabase.from('profiles').select('user_id, nome, email').in('user_id', ids);
      const list = (data ?? []).map(p => ({ id: p.user_id, name: p.nome || 'Sem nome', email: p.email }));
      setStudents(list.sort((a, b) => a.name.localeCompare(b.name)));
      setLoadingStudents(false);
    })();
  }, [open]);

  useEffect(() => { if (!open) { setSelected(null); setQuery(''); } }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s => s.name.toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q));
  }, [students, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {selected ? `Aulas de ${selected.name}` : 'Consultar aulas do aluno'}
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="flex flex-col gap-3 min-h-0">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar aluno por nome ou email..." className="pl-9" autoFocus />
            </div>
            <ScrollArea className="max-h-[60vh]">
              {loadingStudents ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno encontrado.</p>
              ) : (
                <div className="space-y-1">
                  {filtered.map(s => (
                    <button key={s.id} onClick={() => setSelected(s)} className="w-full text-left p-3 rounded-lg hover:bg-secondary/50 border border-border/50 transition-colors">
                      <p className="text-sm font-medium">{s.name}</p>
                      {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <StudentClassesDetail student={selected} />
        )}
      </DialogContent>
    </Dialog>
  );
};

const StudentClassesDetail: React.FC<{ student: StudentLite }> = ({ student }) => {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pkgRes, linksRes, creditsRes] = await Promise.all([
        supabase.from('class_packages').select('*').eq('student_id', student.id).order('start_date', { ascending: false }),
        supabase.from('calendar_event_students').select('event_id, attendance_status').eq('student_id', student.id),
        supabase.from('class_credits_log').select('*').eq('student_id', student.id).order('created_at', { ascending: false }).limit(50),
      ]);
      const eventIds = (linksRes.data ?? []).map(l => l.event_id);
      let evs: any[] = [];
      if (eventIds.length > 0) {
        const { data } = await supabase.from('calendar_events').select('*').in('id', eventIds).order('start_datetime', { ascending: false });
        const statusMap = new Map<string, string>();
        (linksRes.data ?? []).forEach(l => statusMap.set(l.event_id, l.attendance_status));
        evs = (data ?? []).map(e => ({ ...e, attendance_status: statusMap.get(e.id) || 'pendente' }));
      }
      setPackages(pkgRes.data ?? []);
      setEvents(evs);
      setCredits(creditsRes.data ?? []);
      setLoading(false);
    })();
  }, [student.id]);

  const now = new Date();

  const stats = useMemo(() => {
    let realizadas = 0, agendadasFuturas = 0, canceladas = 0, faltas = 0;
    for (const ev of events) {
      const start = new Date(ev.start_datetime);
      const st = ev.status as string;
      const att = ev.attendance_status as string;
      if (st === 'cancelado' || att === 'cancelado') { canceladas++; continue; }
      if (st === 'falta' || att === 'falta') { faltas++; continue; }
      if (st === 'concluido' || att === 'presente' || att === 'confirmado' || att === 'atrasado') {
        if (start <= now) { realizadas++; continue; }
      }
      if (start > now) agendadasFuturas++;
      else if (st !== 'cancelado') realizadas++; // past event, assume administrada
    }
    return { realizadas, agendadasFuturas, canceladas, faltas };
  }, [events]);

  const activePackages = packages.filter(p => p.status === 'ativo');
  const totalRemaining = activePackages.reduce((s, p) => s + (p.remaining_classes || 0), 0);

  return (
    <ScrollArea className="min-h-0">
      <div className="space-y-4 pr-3">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard icon={<CalendarCheck className="h-4 w-4" />} label="Realizadas" value={stats.realizadas} tone="emerald" />
              <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Agendadas" value={stats.agendadasFuturas} tone="primary" />
              <StatCard icon={<CalendarX className="h-4 w-4" />} label="Canceladas" value={stats.canceladas} tone="destructive" />
              <StatCard icon={<Package className="h-4 w-4" />} label="Créditos ativos" value={totalRemaining} tone="orange" />
            </div>

            {/* Pacotes */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Pacotes ({packages.length})</h3>
              {packages.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pacote cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {packages.map(p => (
                    <Card key={p.id}>
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">{p.package_name || 'Pacote'}</p>
                          <Badge variant="outline" className={statusColor(p.status)}>{p.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                          <span>Início: <strong className="text-foreground">{fmtDate(p.start_date)}</strong></span>
                          <span>Validade: <strong className="text-foreground">{p.expiry_date ? fmtDate(p.expiry_date) : '—'}</strong></span>
                          <span>Total: <strong className="text-foreground">{p.total_classes}</strong></span>
                          <span>Restantes: <strong className={p.remaining_classes > 0 ? 'text-emerald-500' : 'text-destructive'}>{p.remaining_classes}</strong></span>
                        </div>
                        {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Movimentações de créditos */}
            {credits.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Movimentações de crédito (últimas {credits.length})</h3>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {credits.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/40 bg-secondary/20">
                      <div>
                        <p className="font-medium">{c.action_type}</p>
                        <p className="text-muted-foreground">{fmtDate(c.created_at)} · {c.reason || 'sem observação'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono">{c.balance_before} → {c.balance_after}</p>
                        <p className="text-muted-foreground">qtd {c.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Aulas */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Aulas ({events.length})</h3>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem aulas registradas.</p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-auto">
                  {events.map(ev => {
                    const isPast = new Date(ev.start_datetime) <= now;
                    return (
                      <div key={ev.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/40">
                        <div>
                          <p className="font-medium">{format(new Date(ev.start_datetime), "dd/MM/yyyy · HH:mm", { locale: ptBR })}</p>
                          <p className="text-muted-foreground">{ev.title || ev.event_type}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge variant="outline" className="text-[10px]">{isPast ? 'passada' : 'futura'}</Badge>
                          <span className="text-[10px] text-muted-foreground">status: {ev.status} · presença: {ev.attendance_status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ScrollArea>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: string }> = ({ icon, label, value, tone }) => {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    primary: 'text-primary bg-primary/10 border-primary/30',
    destructive: 'text-destructive bg-destructive/10 border-destructive/30',
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  };
  return (
    <div className={`rounded-lg border p-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-80">{icon}{label}</div>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
};

function fmtDate(v: string) {
  try { return format(new Date(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; }
}

function statusColor(status: string) {
  switch (status) {
    case 'ativo': return 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';
    case 'expirado': return 'text-orange-500 border-orange-500/40 bg-orange-500/10';
    case 'esgotado': return 'text-destructive border-destructive/40 bg-destructive/10';
    case 'cancelado': return 'text-muted-foreground border-border';
    default: return 'text-muted-foreground border-border';
  }
}

export default StudentClassesLookupDialog;