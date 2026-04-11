import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, ChevronRight, Weight, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AssessmentRow {
  id: string;
  created_at: string;
  peso?: number | null;
  gordura?: number | null;
}

const MinhasAvaliacoes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadAssessments();
  }, [user]);

  const loadAssessments = async () => {
    const { data: avals } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });

    if (!avals) { setLoading(false); return; }

    const enriched = await Promise.all(
      avals.map(async (a) => {
        const { data: anth } = await supabase.from('anthropometrics').select('peso').eq('assessment_id', a.id).maybeSingle();
        const { data: comp } = await supabase.from('composition').select('percentual_gordura').eq('assessment_id', a.id).maybeSingle();
        return { ...a, peso: anth?.peso, gordura: comp?.percentual_gordura };
      })
    );
    setAssessments(enriched);
    setLoading(false);
  };

  return (
    <AppLayout title="Minhas Avaliações">
      <div className="space-y-4 animate-fade-in">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assessments.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma avaliação realizada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          assessments.map((a, i) => (
            <Card
              key={a.id}
              className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors active:scale-[0.98]"
              onClick={() => navigate(`/relatorio/${a.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-4 mt-1.5">
                      {a.peso != null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Weight className="h-3 w-3" /> {a.peso} kg
                        </span>
                      )}
                      {a.gordura != null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <TrendingUp className="h-3 w-3" /> {a.gordura}% gordura
                        </span>
                      )}
                    </div>
                    {i === 0 && (
                      <span className="inline-block mt-2 text-[10px] uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                        Mais recente
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppLayout>
  );
};

export default MinhasAvaliacoes;
