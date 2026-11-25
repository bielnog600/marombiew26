import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const KIND_LABEL: Record<string, string> = {
  error: 'Erro', unhandledrejection: 'Erro assíncrono', boundary: 'Tela quebrou', chunk: 'Arquivo do app', boot: 'App não abriu',
};

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Erros registrados pelo aparelho do aluno (somente leitura, últimos 100). */
const ClientErrorsTab = ({ studentId }: { studentId: string }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['client-errors', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, created_at, kind, route, message, stack, user_agent, app_version, online, standalone, language')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Não foi possível carregar os erros.</p>;
  if (!data?.length) return <Card className="glass-card"><CardContent className="p-6 text-sm text-muted-foreground">Nenhum erro registrado pelo app deste aluno.</CardContent></Card>;

  return (
    <div className="space-y-2">
      {data.map(row => (
        <Card key={row.id} className="glass-card">
          <CardContent className="space-y-1 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{KIND_LABEL[row.kind] ?? row.kind}</Badge>
              <span className="text-muted-foreground">{fmt(row.created_at)}</span>
              <span className="text-muted-foreground">{row.route}</span>
              <span className="text-muted-foreground">{row.standalone ? 'App instalado' : 'Navegador'} · {row.online ? 'online' : 'offline'}{row.language ? ` · ${row.language}` : ''}</span>
            </div>
            <p className="break-words text-sm font-medium">{row.message}</p>
            {(row.stack || row.user_agent) && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Detalhes</summary>
                {row.app_version && <p>Versão: {row.app_version}</p>}
                {row.user_agent && <p className="break-words">{row.user_agent}</p>}
                {row.stack && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono">{row.stack}</pre>}
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ClientErrorsTab;
