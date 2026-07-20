import React from 'react';
import { CalendarDays, Settings, Plus, ShieldCheck, UserSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onSettingsClick: () => void;
  onAgendarClick: () => void;
  onReconcileClick?: () => void;
  onLookupClick?: () => void;
}

export const AgendaHeader: React.FC<Props> = ({ onSettingsClick, onAgendarClick, onReconcileClick, onLookupClick }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Agenda
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie seus atendimentos e compromissos</p>
      </div>
      <div className="flex gap-2">
        {onLookupClick && (
          <Button size="icon" variant="ghost" onClick={onLookupClick} className="h-9 w-9" title="Consultar aulas do aluno">
            <UserSearch className="h-4 w-4 text-primary" />
          </Button>
        )}
        {onReconcileClick && (
          <Button size="icon" variant="ghost" onClick={onReconcileClick} className="h-9 w-9" title="Reconciliar pacotes">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onSettingsClick} className="h-9 w-9">
          <Settings className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={onAgendarClick} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Agendar
        </Button>
      </div>
    </div>
  );
};
