import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, Plus, CheckCircle, Clock, Eye, Loader2, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Props {
  studentId: string;
  studentPhone?: string;
  studentName?: string;
}

const DietQuestionnairesList: React.FC<Props> = ({ studentId, studentPhone, studentName }) => {
  const [questionnaires, setQuestionnaires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewItem, setViewItem] = useState<any>(null);

  useEffect(() => {
    loadQuestionnaires();
  }, [studentId]);

  const loadQuestionnaires = async () => {
    const { data } = await supabase
      .from('diet_questionnaires')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    setQuestionnaires(data ?? []);
    setLoading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    const { data, error } = await supabase
      .from('diet_questionnaires')
      .insert({ student_id: studentId })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar questionário: ' + error.message);
    } else {
      toast.success('Questionário criado! Copie o link e envie ao aluno.');
      setQuestionnaires(prev => [data, ...prev]);
    }
    setCreating(false);
  };

  const getLink = (token: string) => `${window.location.origin}/questionario-dieta?token=${token}`;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getLink(token));
    toast.success('Link copiado!');
  };

  const sendWhatsApp = (token: string) => {
    if (!studentPhone) {
      toast.error('Aluno não possui telefone cadastrado.');
      return;
    }
    const phone = studentPhone.replace(/\D/g, '');
    const link = getLink(token);
    const msg = encodeURIComponent(`Olá${studentName ? ` ${studentName}` : ''}! 🏋️\n\nPreencha seu questionário de dieta para montarmos seu plano alimentar personalizado:\n\n${link}\n\nQualquer dúvida, estou à disposição!`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const SINTOMAS_LABELS: Record<string, string> = {
    fraqueza: 'Fraqueza muscular',
    dor_cabeca: 'Dor de cabeça',
    reduziu_peso: 'Reduziu peso',
    pele_fina: 'Pele mais fina',
    fome_excessiva: 'Fome excessiva',
    insonia: 'Insônia',
    baixa_energia: 'Baixa energia',
    irritabilidade: 'Irritabilidade',
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Button onClick={handleCreate} disabled={creating} className="font-semibold">
        <Plus className="mr-2 h-4 w-4" /> {creating ? 'Criando...' : 'Novo Questionário de Dieta'}
      </Button>

      {questionnaires.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-6 text-center text-muted-foreground">
            Nenhum questionário enviado ainda.
          </CardContent>
        </Card>
      ) : (
        questionnaires.map(q => (
          <Card key={q.id} className="glass-card hover:border-primary/30 transition-colors">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {q.status === 'completed' ? (
                    <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" /> Respondido</Badge>
                  ) : (
                    <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> Pendente</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Criado em {new Date(q.created_at).toLocaleDateString('pt-BR')}
                  {q.responded_at && ` • Respondido em ${new Date(q.responded_at).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {q.status === 'completed' && (
                  <Button variant="ghost" size="icon" onClick={() => setViewItem(q)} title="Ver respostas">
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => sendWhatsApp(q.token)} title="Enviar via WhatsApp">
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => copyLink(q.token)} title="Copiar link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* View dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Respostas do Questionário</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <InfoRow label="Estilo de Dieta" value={viewItem.estilo_dieta} />
              <InfoRow label="Fase Atual" value={viewItem.fase_atual} />
              <InfoRow label="Nº Refeições" value={viewItem.num_refeicoes} />
              <InfoRow label="Horário do Treino" value={viewItem.horario_treino} />
              <InfoRow label="Dias de Treino" value={viewItem.dias_treino} />
              <InfoRow label="Usa Hormônios" value={viewItem.usa_hormonios} />
              <InfoRow label="Restrições" value={viewItem.restricoes_alimentares} />
              <InfoRow label="Preferências" value={viewItem.preferencias_alimentares} />
              <InfoRow label="Como se sente" value={viewItem.como_se_sente} />
              
              <div>
                <span className="text-muted-foreground font-medium">Sintomas:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(SINTOMAS_LABELS).map(([key, label]) => 
                    viewItem[key] ? <Badge key={key} variant="destructive" className="text-xs">{label}</Badge> : null
                  )}
                  {Object.entries(SINTOMAS_LABELS).every(([key]) => !viewItem[key]) && (
                    <span className="text-muted-foreground">Nenhum sintoma relatado</span>
                  )}
                </div>
              </div>

              <InfoRow label="Observações" value={viewItem.observacoes} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: any }) => (
  <div>
    <span className="text-muted-foreground font-medium">{label}:</span>{' '}
    <span>{value || '-'}</span>
  </div>
);

export default DietQuestionnairesList;
