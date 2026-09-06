import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { reconcileAgendaPackages, ReconciliationResult, ReconciliationStatus, ReconciliationItem } from '@/lib/agendaReconciliation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied?: () => void;
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  ok: 'Já conciliada',
  ready_to_fix: 'Pronto para conciliar',
  fixed: 'Conciliada',
  no_valid_package: 'Sem pacote válido na data',
  multiple_packages: 'Múltiplos pacotes',
  zero_balance: 'Saldo insuficiente',
  no_students: 'Sem aluno',
  error: 'Erro',
};

const STATUS_COLOR: Record<ReconciliationStatus, string> = {
  ok: 'bg-green-500/20 text-green-300 border-green-500/30',
  ready_to_fix: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  fixed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  no_valid_package: 'bg-red-500/20 text-red-300 border-red-500/30',
  multiple_packages: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  zero_balance: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  no_students: 'bg-muted text-muted-foreground border-muted',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendaReconciliationDialog({ open, onOpenChange, onApplied }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(todayStr());
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  const run = async (dryRun: boolean) => {
    if (!user) return;
    if (dryRun) setLoading(true); else setApplying(true);
    try {
      const r = await reconcileAgendaPackages({
        adminId: user.id,
        fromDate: new Date(`${fromDate}T00:00:00`),
        toDate: new Date(`${toDate}T23:59:59`),
        dryRun,
      });
      setResult(r);
      if (!dryRun) {
        if (r.fixed > 0) toast.success(`${r.fixed} aula(s) conciliada(s)`);
        if (r.pending > 0) toast.warning(`${r.pending} caso(s) precisam de revisão manual`);
        if (r.fixed === 0 && r.pending === 0) toast.success('Nenhuma inconsistência encontrada');
        onApplied?.();
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao executar reconciliação');
    } finally {
      setLoading(false);
      setApplying(false);
    }
  };

  const pendingItems = (result?.items || []).filter(
    i => i.status !== 'ok' && i.status !== 'ready_to_fix' && i.status !== 'fixed'
  );
  const doneItems = (result?.items || []).filter(i => i.status === 'ready_to_fix' || i.status === 'fixed');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Reconciliar Agenda × Pacotes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Verifica aulas realizadas (ou faltas sem aviso) no período escolhido e confirma
            se houve débito de crédito. O crédito só é debitado de um pacote que estava
            <b> vigente na data da aula</b>, e o consumo fica registado com a data real da aula.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data inicial</Label>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setResult(null); }} />
            </div>
            <div>
              <Label className="text-xs">Data final</Label>
              <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setResult(null); }} />
            </div>
          </div>

          {!result && (
            <div className="flex gap-2">
              <Button onClick={() => run(true)} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Apenas verificar
              </Button>
              <Button variant="outline" onClick={() => run(false)} disabled={applying} className="gap-2">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Verificar e corrigir
              </Button>
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Verificadas" value={result.scanned} />
                <Stat label="Já conciliadas" value={result.ok} tone="ok" />
                <Stat label={result.fixed > 0 ? 'Conciliadas' : 'Prontas'} value={result.fixed > 0 ? result.fixed : result.ready} tone="fixed" />
                <Stat label="Precisam revisão" value={result.pending} tone="pending" />
              </div>

              <ScrollArea className="h-[40vh] rounded-md border border-border/50 p-2">
                {result.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-400" />
                    Nenhuma inconsistência detectada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {doneItems.map((it, i) => (
                      <ItemRow key={`f-${i}`} item={it} />
                    ))}
                    {pendingItems.map((it, i) => (
                      <ItemRow key={`p-${i}`} item={it} />
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2">
                {result.ready > 0 && (
                  <Button onClick={() => { setResult(null); run(false); }} disabled={applying} className="gap-2">
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Aplicar {result.ready} conciliação(ões)
                  </Button>
                )}
                <Button variant="outline" onClick={() => run(true)} disabled={loading} className="gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verificar novamente
                </Button>
                <Button variant="ghost" onClick={() => setResult(null)}>Limpar</Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'fixed' | 'pending' }) {
  const cls =
    tone === 'ok' ? 'text-green-400'
    : tone === 'fixed' ? 'text-emerald-400'
    : tone === 'pending' ? 'text-amber-400'
    : 'text-foreground';
  return (
    <div className="rounded-md border border-border/50 bg-card px-2 py-1.5 text-center">
      <p className={`text-lg font-bold leading-tight ${cls}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function ItemRow({ item }: { item: ReconciliationItem }) {
  const isPending = item.status !== 'ok' && item.status !== 'ready_to_fix' && item.status !== 'fixed';
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-secondary/30 p-2">
      {isPending
        ? <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        : <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{item.studentName}</p>
          <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[item.status]}`}>
            {STATUS_LABEL[item.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {format(new Date(item.eventStart), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — {item.eventTitle}
        </p>
        {item.packageName && (
          <p className="text-[11px] text-muted-foreground">
            Pacote: {item.packageName} · Vigência: {(item.packageStart || '').slice(0, 10)} → {(item.packageExpiry || '').slice(0, 10) || 'sem validade'}
            {typeof item.balanceBefore === 'number' && (
              <> · Saldo: {item.balanceBefore}{typeof item.balanceAfter === 'number' ? ` → ${item.balanceAfter}` : ''}</>
            )}
          </p>
        )}
        <p className="text-xs text-foreground/80 mt-0.5">{item.message}</p>
      </div>
    </div>
  );
}
