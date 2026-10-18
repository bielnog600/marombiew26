import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
}

/**
 * Última linha de defesa da área do aluno: se qualquer tela quebrar durante a
 * renderização, mostra uma mensagem amigável com botão de recarregar em vez
 * de deixar a tela preta/vazia.
 */
class StudentErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[StudentErrorBoundary]', error, info.componentStack);
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
      </div>
    );
  }
}

export default StudentErrorBoundary;
