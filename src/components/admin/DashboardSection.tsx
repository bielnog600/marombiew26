import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Only for the console log. */
  name: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates one Dashboard block: if it breaks while rendering, only that block shows a small
 * message (with "Tentar novamente") and the rest of the Dashboard keeps working.
 */
class DashboardSection extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Dashboard] bloco falhou', { bloco: this.props.name, mensagem: err.message, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="glass-card flex items-center gap-3 rounded-2xl border border-destructive/40 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="flex-1 text-sm text-muted-foreground">Não foi possível mostrar este bloco.</p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false })}>
          Tentar novamente
        </Button>
      </div>
    );
  }
}

export default DashboardSection;
