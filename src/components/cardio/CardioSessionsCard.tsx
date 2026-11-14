import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HeartPulse, Star } from 'lucide-react';
import { loadStudentCardioSessions, type CardioSessionSummary } from '@/lib/cardioSessionApi';
import { mmss, ptNumber } from '@/lib/cardioIntervals';
import { effortLabel, finishModalityLabel } from '@/lib/cardioPlayerView';

/** Cardios concluídos pelo aluno, com o "Como foi?", estrelas e detalhes do fim (só leitura). */
const CardioSessionsCard: React.FC<{ studentId: string; title?: string }> = ({ studentId, title = 'Cardios feitos' }) => {
  const [rows, setRows] = useState<CardioSessionSummary[] | null>(null);
  useEffect(() => {
    let off = false;
    loadStudentCardioSessions(studentId).then((r) => { if (!off) setRows(r); }, () => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [studentId]);
  if (!rows || rows.length === 0) return null;
  return (
    <Card className="glass-card" data-testid="cardio-sessions-card">
      <CardContent className="p-4 space-y-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <HeartPulse className="h-3.5 w-3.5 text-primary" /> {title}
        </p>
        {rows.map((r) => {
          const details = [
            r.modality ? finishModalityLabel(r.modality) : null,
            r.distance_km ? `${ptNumber(Number(r.distance_km))} km` : null,
            r.average_heart_rate ? `FC ${r.average_heart_rate} bpm` : null,
            r.estimated_calories ? `~${r.estimated_calories} kcal` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={r.id} className="space-y-0.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-medium">{r.protocol_name || 'Cardio'}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {r.rpe ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{effortLabel(r.rpe)}</span>
                  ) : null}
                  {r.rating ? (
                    <span className="flex items-center gap-0.5 text-[11px] font-bold text-primary" aria-label={`${r.rating} estrelas`}>
                      <Star className="h-3 w-3 fill-current" />{r.rating}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {r.completed_at ? new Date(r.completed_at).toLocaleDateString('pt-BR') : ''} · {mmss(r.duration_seconds || 0)} · {r.completed_blocks}/{r.total_blocks} fases
                {details ? ` · ${details}` : ''}
              </p>
              {r.notes ? <p className="text-[11px] italic text-muted-foreground line-clamp-2">“{r.notes}”</p> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default CardioSessionsCard;
