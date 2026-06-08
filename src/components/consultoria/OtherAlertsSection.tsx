import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, X, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@/hooks/useNotifications';
import type { BehavioralAlert } from '@/hooks/useBehavioralAlerts';
import BehavioralAlertCard from './BehavioralAlertCard';

interface Props {
  notifications: Notification[];
  behavioralAlerts: BehavioralAlert[];
  onDismiss: (id: string) => void;
  onUpdateBehavioral: (id: string, status: 'resolvido' | 'snoozed') => void;
}

const OtherAlertsSection: React.FC<Props> = ({
  notifications,
  behavioralAlerts,
  onDismiss,
  onUpdateBehavioral,
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const total = notifications.length + behavioralAlerts.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 hover:bg-secondary/60 transition-colors">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Outros avisos</span>
            <Badge variant="outline" className="text-[10px]">{total}</Badge>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {total === 0 ? (
          <Card>
            <CardContent className="py-4 text-center text-xs text-muted-foreground">
              Nenhum aviso adicional.
            </CardContent>
          </Card>
        ) : (
          <>
            {behavioralAlerts.map((a) => (
              <BehavioralAlertCard key={a.id} alert={a} onUpdateStatus={onUpdateBehavioral} />
            ))}
            {notifications.map((n) => (
              <Card key={n.id}>
                <CardContent className="p-2.5 flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 min-w-0 hover:opacity-80"
                    onClick={() => navigate(`/alunos/${n.studentId}`)}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-semibold shrink-0">
                      {n.studentName[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-medium truncate">{n.studentName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{n.title}</p>
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => onDismiss(n.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default OtherAlertsSection;