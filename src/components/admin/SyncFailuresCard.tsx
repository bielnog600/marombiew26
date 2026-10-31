import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SyncFailure {
  id: string;
  table_name: string;
  op: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

/** Lista as últimas falhas de sincronização do aluno; não renderiza nada se não houver. */
export default function SyncFailuresCard({ studentId }: { studentId: string }) {
  const { data } = useQuery({
    queryKey: ['client-sync-failures', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_sync_failures' as any)
        .select('id, table_name, op, error_code, error_message, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as SyncFailure[];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <Card className="glass-card mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Falhas de sincronização
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((f) => (
          <div key={f.id} className="text-xs border-b border-border/40 pb-2 last:border-0">
            <div className="flex justify-between gap-2 text-muted-foreground">
              <span>{new Date(f.created_at).toLocaleString('pt-BR')}</span>
              <span>{f.table_name} · {f.op}</span>
            </div>
            <div className="text-foreground break-words">
              {f.error_code ? `${f.error_code} — ` : ''}{f.error_message ?? 'Erro desconhecido'}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
