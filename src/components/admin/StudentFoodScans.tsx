import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ScanBarcode } from 'lucide-react';
import FoodScanResult, { ScoreDot, type ScanRecord } from '@/components/diet/FoodScanResult';

export default function StudentFoodScans({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<ScanRecord[]>([]);
  const [open, setOpen] = useState<ScanRecord | null>(null);
  useEffect(() => {
    supabase.from('food_scans').select('*').eq('aluno_id', studentId).order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => setRows((data ?? []) as unknown as ScanRecord[]));
  }, [studentId]);

  return (
    <Card className="glass-card">
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-2"><ScanBarcode className="h-4 w-4 text-primary" /> Produtos escaneados</h3>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum escaneamento ainda.</p>}
        {rows.map((r) => (
          <button key={r.id} onClick={() => setOpen(r)} className="w-full flex items-center gap-3 rounded-lg bg-secondary/40 p-2 text-left">
            {r.image_url ? <img src={r.image_url} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-secondary" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.product_name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString('pt-BR')}{r.consumed_grams ? ` · consumiu ${r.consumed_grams} g` : ''}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-sm"><ScoreDot score={r.score ?? 0} /> {r.score}</span>
          </button>
        ))}
      </CardContent>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Escaneamento</DialogTitle>
          {open && <FoodScanResult scan={open} readOnly />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
