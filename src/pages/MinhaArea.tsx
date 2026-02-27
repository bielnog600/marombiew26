import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, TrendingUp, Weight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MinhaArea = () => {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [latestAnthro, setLatestAnthro] = useState<any>(null);
  const [latestComp, setLatestComp] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const { data: avals } = await supabase
      .from('assessments')
      .select('*')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });
    setAssessments(avals ?? []);

    if (avals && avals.length > 0) {
      const latest = avals[0];
      const { data: an } = await supabase.from('anthropometrics').select('*').eq('assessment_id', latest.id).maybeSingle();
      setLatestAnthro(an);
      const { data: co } = await supabase.from('composition').select('*').eq('assessment_id', latest.id).maybeSingle();
      setLatestComp(co);

      const histPromises = avals.reverse().map(async (a) => {
        const { data: anth } = await supabase.from('anthropometrics').select('peso, imc').eq('assessment_id', a.id).maybeSingle();
        const { data: comp } = await supabase.from('composition').select('percentual_gordura').eq('assessment_id', a.id).maybeSingle();
        return {
          data: new Date(a.created_at).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
          peso: anth?.peso,
          gordura: comp?.percentual_gordura,
        };
      });
      setHistory(await Promise.all(histPromises));
    }
  };

  return (
    <AppLayout title="Minha Área">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="p-5 text-center">
              <Weight className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Peso Atual</p>
              <p className="text-2xl font-bold">{latestAnthro?.peso ?? '-'} <span className="text-sm text-muted-foreground">kg</span></p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 text-center">
              <TrendingUp className="h-8 w-8 text-chart-2 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">% Gordura</p>
              <p className="text-2xl font-bold">{latestComp?.percentual_gordura ?? '-'}<span className="text-sm text-muted-foreground">%</span></p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 text-center">
              <ClipboardList className="h-8 w-8 text-chart-3 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Avaliações</p>
              <p className="text-2xl font-bold">{assessments.length}</p>
            </CardContent>
          </Card>
        </div>

        {history.length > 1 && (
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Evolução do Peso</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="data" stroke="hsl(220 10% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(220 18% 10%)', border: '1px solid hsl(220 14% 18%)', borderRadius: '8px', color: 'hsl(0 0% 95%)' }} />
                    <Line type="monotone" dataKey="peso" stroke="hsl(45 100% 50%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Minhas Avaliações</CardTitle></CardHeader>
          <CardContent>
            {assessments.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma avaliação ainda.</p>
            ) : (
              <div className="space-y-2">
                {assessments.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                    onClick={() => window.location.href = `/relatorio/${a.id}`}>
                    <span className="text-sm font-medium">
                      {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default MinhaArea;
