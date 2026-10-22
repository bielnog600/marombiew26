import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  detail: string | null;
}

/**
 * Última linha de defesa da área do aluno: se qualquer tela quebrar durante a
 * renderização, mostra uma mensagem amigável com botão de recarregar em vez
 * de deixar a tela preta/vazia. Registra no console a mensagem do erro e a
 * rota (e expõe um detalhe técnico recolhível) para facilitar o diagnóstico.
 */
class StudentErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, detail: null };

  static getDerivedStateFromError(error: unknown): State {
    const detail = error instanceof Error ? error.message : String(error);
    return { hasError: true, detail };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[StudentErrorBoundary]', {
      rota: window.location.pathname,
      mensagem: err.message,
      stack: err.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
        <AlertTriangle className="h-10 w-10 text-primary" />
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-foreground">
            Algo deu errado ao carregar esta tela
          </h1>
          <p className="text-sm text-muted-foreground">
            Não se preocupe, seus dados estão salvos. Tente recarregar.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        {this.state.detail && (
          <details className="max-w-xs text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Detalhes técnicos</summary>
            <p className="mt-1 break-words font-mono">
              {this.state.detail} · {window.location.pathname}
            </p>
          </details>
        )}
      </div>
    );
  }
}

export default StudentErrorBoundary;
