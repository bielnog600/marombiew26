import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ExternalLink, UserMinus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { pickInactiveNudge } from '@/lib/inactiveNudges';
import type { InactiveStudent } from '@/hooks/useInactiveStudents';

interface Props {
  student: InactiveStudent;
  onArchive: (studentId: string) => Promise<unknown> | void;
}

const InactiveStudentCard: React.FC<Props> = ({ student, onArchive }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const daysLabel = student.daysInactive >= 999 ? 'nunca usou o app' : `${student.daysInactive} dias sem atividade`;

  const handleWhatsApp = () => {
    if (!student.studentPhone) return;
    const msg = pickInactiveNudge(student.studentName, student.daysInactive >= 999 ? 30 : student.daysInactive);
    window.open(buildWhatsAppUrl(student.studentPhone, msg), '_blank', 'noopener');
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      await onArchive(student.studentId);
      toast({ title: 'Aluno marcado como “não treina mais”', description: 'Os alertas dele deixam de aparecer.' });
    } finally { setBusy(false); }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15 text-destructive font-semibold text-xs shrink-0">
            {student.studentName[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{student.studentName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{daysLabel}</p>
          </div>
          <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30 shrink-0">
            {student.daysInactive >= 999 ? '—' : `${student.daysInactive}d`}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10"
            onClick={handleWhatsApp}
            disabled={!student.studentPhone}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            {student.studentPhone ? 'WhatsApp' : 'Sem telefone'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${student.studentId}`)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver aluno
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleArchive}
            disabled={busy}
          >
            <UserMinus className="h-3 w-3 mr-1" />
            Não treina mais
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default InactiveStudentCard;
