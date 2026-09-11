import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shapes } from 'lucide-react';
import { formatSomatotypeDominance, type SomatotypeResult } from '@/lib/somatotype';

const fmt = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));

const SomatotypeCard: React.FC<{ somatotype: SomatotypeResult; compact?: boolean }> = ({ somatotype, compact }) => {
  const body = somatotype.available ? (
    <div className="space-y-2">
      <p className="text-xl font-bold text-primary">
        {fmt(somatotype.endomorfia)} – {fmt(somatotype.mesomorfia)} – {fmt(somatotype.ectomorfia)}
      </p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="p-2 rounded-lg bg-secondary/50">
          <span className="block text-[10px] text-muted-foreground">Endomorfia</span>
          <span className="font-bold">{fmt(somatotype.endomorfia)}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50">
          <span className="block text-[10px] text-muted-foreground">Mesomorfia</span>
          <span className="font-bold">{fmt(somatotype.mesomorfia)}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50">
          <span className="block text-[10px] text-muted-foreground">Ectomorfia</span>
          <span className="font-bold">{fmt(somatotype.ectomorfia)}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Predominância: {formatSomatotypeDominance(somatotype.dominanceKey, 'pt', somatotype.dominance)}</p>
    </div>
  ) : (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Somatotipo ainda não disponível.</p>
      <p className="text-[11px] text-muted-foreground">Faltam: {somatotype.missing.join(', ')}.</p>
    </div>
  );

  if (compact) return body;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shapes className="h-4 w-4 text-primary" /> Somatotipo Heath-Carter
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
};

export default SomatotypeCard;
