import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, AlertTriangle, Scale, History } from 'lucide-react';
import { PROTOCOLS, type CalcProtocolId, type ProtocolId } from '@/lib/skinfoldProtocols';
import {
  COMPATIBILITY_LABEL, PROTOCOL_CHANGE_WARNING,
  type Compatibility, type ProtocolEvaluation, type Recommendation,
} from '@/lib/protocolRecommendation';

const compatibilityClass = (c: Compatibility) => {
  switch (c) {
    case 'high': return 'bg-primary/15 text-primary border-primary/30';
    case 'moderate': return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
    case 'low': return 'bg-orange-500/15 text-orange-500 border-orange-500/30';
    default: return 'bg-destructive/15 text-destructive border-destructive/30';
  }
};

interface Props {
  recommendation: Recommendation;
  /** 'auto' = seguir a recomendação; 'manual' = sem cálculo por dobras */
  selected: ProtocolId;
  onSelect: (value: ProtocolId, manual: boolean) => void;
  previousProtocol?: CalcProtocolId | null;
  selectedEvaluation: ProtocolEvaluation | null;
}

const ProtocolAnalysisCard: React.FC<Props> = ({
  recommendation, selected, onSelect, previousProtocol, selectedEvaluation,
}) => {
  const [compareOpen, setCompareOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(selected !== 'auto');
  const [pendingChange, setPendingChange] = useState<ProtocolId | null>(null);

  const rec = recommendation.recommended;

  const applySelection = (value: ProtocolId, manual: boolean) => {
    const target = value === 'auto' ? rec?.protocol : value;
    if (previousProtocol && target && target !== previousProtocol && value !== 'manual') {
      setPendingChange(value);
      return;
    }
    onSelect(value, manual);
  };

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" /> Análise do Protocolo
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          O sistema compara sexo, idade, perfil, população de referência, qualidade das medidas e histórico de
          avaliações para sugerir o protocolo mais compatível.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!rec && (
          <p className="text-sm text-yellow-500">
            Nenhum protocolo elegível com as medidas atuais. Verifique dobras ausentes, qualidade das aferições,
            sexo e idade do aluno.
          </p>
        )}

        {rec && (
          <div className="rounded-lg border border-border/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {recommendation.continuityRecommended ? 'Protocolo mantido para comparação' : 'Protocolo recomendado'}
                </span>
                <p className="text-lg font-bold text-foreground">{rec.label}</p>
              </div>
              <Badge variant="outline" className={compatibilityClass(rec.compatibility)}>
                Compatibilidade: {COMPATIBILITY_LABEL[rec.compatibility].toUpperCase()}
              </Badge>
            </div>

            {recommendation.continuityRecommended && recommendation.continuityReason && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <History className="h-3 w-3 mt-0.5 shrink-0" /> {recommendation.continuityReason}
              </p>
            )}

            <ul className="space-y-1">
              {rec.reasons.map((r) => (
                <li key={r} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" /> {r}
                </li>
              ))}
              {rec.warnings.map((w) => (
                <li key={w} className="text-xs text-yellow-500 flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>

            <div>
              <span className="text-xs text-muted-foreground">% Gordura estimado: </span>
              <span className="font-bold text-primary">
                {rec.bodyFat != null ? `${rec.bodyFat.toFixed(1).replace('.', ',')}%` : '—'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={selected === 'auto' ? 'default' : 'outline'} onClick={() => applySelection('auto', false)}>
                Usar recomendado
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
                Comparar protocolos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setManualOpen((v) => !v)}>
                Escolher manualmente
              </Button>
            </div>
          </div>
        )}

        {(manualOpen || selected !== 'auto') && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Protocolo oficial da avaliação</Label>
            <Select value={selected} onValueChange={(v) => applySelection(v as ProtocolId, v !== 'auto')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Protocolo recomendado automaticamente</SelectItem>
                {(Object.keys(PROTOCOLS) as CalcProtocolId[]).map((id) => (
                  <SelectItem key={id} value={id}>{PROTOCOLS[id].label}</SelectItem>
                ))}
                <SelectItem value="manual">Manual (sem cálculo por dobras)</SelectItem>
              </SelectContent>
            </Select>
            {selectedEvaluation && (
              <p className="text-[11px] text-muted-foreground">
                {selectedEvaluation.label} • Compatibilidade: {COMPATIBILITY_LABEL[selectedEvaluation.compatibility]}
                {selectedEvaluation.warnings.length > 0 && ` • ${selectedEvaluation.warnings[0]}`}
              </p>
            )}
          </div>
        )}

        {recommendation.dispersion && (
          <p className="text-[11px] text-muted-foreground">
            Faixa entre protocolos elegíveis: {recommendation.dispersion.min.toFixed(1).replace('.', ',')}% –{' '}
            {recommendation.dispersion.max.toFixed(1).replace('.', ',')}% • Dispersão:{' '}
            {recommendation.dispersion.range.toFixed(1).replace('.', ',')} pontos percentuais. Cada equação é um modelo
            diferente — o resultado oficial continua sendo o de um único protocolo.
          </p>
        )}

        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Comparar protocolos</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {recommendation.evaluations
                .slice()
                .sort((a, b) => Number(b.eligible) - Number(a.eligible))
                .map((e) => (
                  <div key={e.protocol} className="rounded-lg border border-border/60 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{e.label}</span>
                      <div className="flex items-center gap-2">
                        {rec?.protocol === e.protocol && <Badge variant="outline" className="text-[10px]">Recomendado</Badge>}
                        <Badge variant="outline" className={`text-[10px] ${compatibilityClass(e.compatibility)}`}>
                          {COMPATIBILITY_LABEL[e.compatibility]}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm">
                      {e.bodyFat != null ? `${e.bodyFat.toFixed(1).replace('.', ',')}%` : 'Não elegível'}
                      {e.sum != null && <span className="text-[11px] text-muted-foreground"> • Σ {e.sum.toFixed(1).replace('.', ',')} mm</span>}
                    </p>
                    {(e.warnings[0] || e.reasons[0]) && (
                      <p className="text-[11px] text-muted-foreground">{e.warnings[0] ?? e.reasons[0]}</p>
                    )}
                    {e.eligible && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                        onClick={() => { applySelection(e.protocol, true); setCompareOpen(false); }}>
                        Usar este protocolo
                      </Button>
                    )}
                  </div>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ferramenta profissional. O relatório do aluno mostra apenas o protocolo oficial selecionado.
            </p>
          </DialogContent>
        </Dialog>

        <AlertDialog open={pendingChange !== null} onOpenChange={(o) => !o && setPendingChange(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Atenção</AlertDialogTitle>
              <AlertDialogDescription>{PROTOCOL_CHANGE_WARNING}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setPendingChange(null); onSelect(previousProtocol as ProtocolId, true); }}>
                Manter protocolo anterior
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (pendingChange) onSelect(pendingChange, pendingChange !== 'auto');
                setPendingChange(null);
              }}>
                Alterar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default ProtocolAnalysisCard;
