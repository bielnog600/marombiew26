import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface LogRow {
  id: string;
  recipient_user_id: string | null;
  title: string;
  message: string;
  status: string;
  error: string | null;
  data: any;
  created_at: string;
}

interface Profile {
  user_id: string;
  nome: string;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function typeLabel(data: any): string {
  const t = data?.type;
  switch (t) {
    case "workout_reminder": return "Treino";
    case "daily_workout_motivator": return "Treino (motivacional)";
    case "water_reminder": return "Água";
    case "water_reminder_evening": return "Água (noite)";
    case "meal_reminder": return "Almoço";
    case "meal_reminder_dinner": return "Jantar";
    case "reassessment_admin": return "Reavaliação";
    default: return "Geral";
  }
}

export default function PushNotificationsToday() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("push_notification_log")
        .select("id, recipient_user_id, title, message, status, error, data, created_at")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as LogRow[];
      setLogs(rows);

      const ids = [...new Set(rows.map((r) => r.recipient_user_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, nome")
          .in("user_id", ids);
        setProfiles(new Map((profs ?? []).map((p: Profile) => [p.user_id, p.nome])));
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhuma notificação enviada hoje.
        </CardContent>
      </Card>
    );
  }

  // Agrupa por título+mensagem para mostrar destinatários juntos
  const groups = new Map<string, { title: string; message: string; type: string; rows: LogRow[] }>();
  for (const r of logs) {
    const key = `${r.title}||${r.message}||${r.data?.type ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, { title: r.title, message: r.message, type: typeLabel(r.data), rows: [] });
    }
    groups.get(key)!.rows.push(r);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{logs.length} notificação(ões) enviada(s) hoje</span>
        <span>{groups.size} mensagem(ns) distinta(s)</span>
      </div>
      {[...groups.values()].map((g, idx) => {
        const failed = g.rows.filter((r) => r.status !== "sent" && r.status !== "delivered").length;
        const ok = g.rows.length - failed;
        const lastTime = g.rows[0]?.created_at;
        return (
          <Card key={idx} className="glass-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      {g.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatTime(lastTime)}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold truncate">{g.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">{g.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {ok}
                  </span>
                  {failed > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" /> {failed}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                {g.rows.map((r) => {
                  const name = r.recipient_user_id
                    ? (profiles.get(r.recipient_user_id) ?? "Aluno")
                    : "Broadcast";
                  const firstName = name.split(" ")[0];
                  const isError = r.status !== "sent" && r.status !== "delivered";
                  return (
                    <span
                      key={r.id}
                      title={isError ? (r.error ?? r.status) : `${name} • ${formatTime(r.created_at)}`}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        isError
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-secondary text-foreground border-border"
                      }`}
                    >
                      {firstName}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}