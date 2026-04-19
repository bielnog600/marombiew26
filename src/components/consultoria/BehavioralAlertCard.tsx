import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, Eye, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BehavioralAlert } from '@/hooks/useBehavioralAlerts';

interface Props {
  alert: BehavioralAlert;
  onUpdateStatus: (id: string, status: BehavioralAlert['status']) => void;
}

const priorityConfig = {
  alta: { Icon: AlertOctagon, color: 'text-destructive', badge: 'bg-destructive text-destructive-foreground', ring: 'ring-1 ring-destructive/30' },
  media: { Icon: AlertTriangle, color: 'text-orange-500', badge: 'bg-orange-500/15 text-orange-600 border-orange-500/30', ring: '' },
  baixa: { Icon: Info, color: 'text-blue-500', badge: 'bg-blue-500/15 text-blue-600 border-blue-500/30', ring: '' },
};

const BehavioralAlertCard: React.FC<Props> = ({ alert, onUpdateStatus }) => {
  const navigate = useNavigate();
  const cfg = priorityConfig[alert.priority];
  const { Icon } = cfg;
  const initials = alert.studentName?.[0]?.toUpperCase() ?? '?';

  return (
    <Card className={`hover:shadow-md transition-shadow ${cfg.ring}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 min-w-0"
            onClick={() => navigate(`/alunos/${alert.student_id}`)}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-xs shrink-0">
              {initials}
            </div>
            <span className="font-medium text-sm truncate">{alert.studentName}</span>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.badge}`}>
              {alert.priority.toUpperCase()}
            </Badge>
            {alert.status === 'lido' && (
              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">lido</Badge>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 pl-9">
          <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.color}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">{alert.title}</p>
            {alert.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 pl-9">
          {alert.status !== 'lido' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onUpdateStatus(alert.id, 'lido')}
            >
              <Eye className="h-3 w-3 mr-1" />
              Marcar lido
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
            onClick={() => onUpdateStatus(alert.id, 'resolvido')}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolver
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => navigate(`/alunos/${alert.student_id}`)}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Ficha
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BehavioralAlertCard;
