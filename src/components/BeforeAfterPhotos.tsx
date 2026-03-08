import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Camera, ZoomIn } from 'lucide-react';

interface BeforeAfterPhotosProps {
  currentAssessmentId: string;
  studentId: string;
  allAssessments: { id: string; created_at: string }[];
}

const BeforeAfterPhotos = ({ currentAssessmentId, studentId, allAssessments }: BeforeAfterPhotosProps) => {
  const [currentPhotos, setCurrentPhotos] = useState<any[]>([]);
  const [previousPhotos, setPreviousPhotos] = useState<any[]>([]);
  const [previousDate, setPreviousDate] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [zoomPhoto, setZoomPhoto] = useState<{ before?: string; after?: string; label?: string } | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [currentAssessmentId, studentId]);

  const loadPhotos = async () => {
    // Sort assessments by date ascending
    const sorted = [...allAssessments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const currentIdx = sorted.findIndex(a => a.id === currentAssessmentId);
    const current = sorted[currentIdx];
    const previous = currentIdx > 0 ? sorted[currentIdx - 1] : null;

    if (current) {
      setCurrentDate(new Date(current.created_at).toLocaleDateString('pt-BR'));
      const { data } = await supabase
        .from('assessment_photos')
        .select('*')
        .eq('assessment_id', current.id)
        .order('tipo');
      setCurrentPhotos(data ?? []);
    }

    if (previous) {
      setPreviousDate(new Date(previous.created_at).toLocaleDateString('pt-BR'));
      const { data } = await supabase
        .from('assessment_photos')
        .select('*')
        .eq('assessment_id', previous.id)
        .order('tipo');
      setPreviousPhotos(data ?? []);
    }
  };

  // Group photos by tipo for side-by-side comparison
  const allTypes = new Set<string>();
  currentPhotos.forEach(p => allTypes.add(p.tipo || 'geral'));
  previousPhotos.forEach(p => allTypes.add(p.tipo || 'geral'));

  const typeLabels: Record<string, string> = {
    frente: 'Frente',
    costas: 'Costas',
    lado_direito: 'Lado Direito',
    lado_esquerdo: 'Lado Esquerdo',
    geral: 'Foto',
  };

  if (currentPhotos.length === 0 && previousPhotos.length === 0) return null;

  const types = Array.from(allTypes);

  return (
    <>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" /> Fotos — Antes e Depois
          </CardTitle>
          {previousDate && (
            <p className="text-xs text-muted-foreground">
              Comparando: {previousDate} → {currentDate}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {types.map(tipo => {
            const before = previousPhotos.find(p => (p.tipo || 'geral') === tipo);
            const after = currentPhotos.find(p => (p.tipo || 'geral') === tipo);
            const label = typeLabels[tipo] || tipo;

            if (!before && !after) return null;

            return (
              <div key={tipo} className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground text-center">{label}</p>
                <div
                  className="grid grid-cols-2 gap-2 cursor-pointer group"
                  onClick={() => setZoomPhoto({ before: before?.url, after: after?.url, label })}
                >
                  {/* Before */}
                  <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black flex items-center justify-center">
                    {before ? (
                      <>
                        <img src={before.url} className="w-full h-full object-contain" alt={`Antes - ${label}`} />
                        <div className="absolute top-1 left-1 bg-background/80 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          ANTES
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <ZoomIn className="w-6 h-6 text-white" />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem foto anterior</p>
                    )}
                  </div>

                  {/* After */}
                  <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black flex items-center justify-center">
                    {after ? (
                      <>
                        <img src={after.url} className="w-full h-full object-contain" alt={`Depois - ${label}`} />
                        <div className="absolute top-1 left-1 bg-primary/80 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
                          DEPOIS
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <ZoomIn className="w-6 h-6 text-white" />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem foto atual</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Show remaining current photos without match */}
          {currentPhotos.length > 0 && previousPhotos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Apenas a avaliação atual possui fotos. A comparação estará disponível após a próxima avaliação.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Zoom Dialog */}
      <Dialog open={!!zoomPhoto} onOpenChange={() => setZoomPhoto(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 sm:p-4 glass-card">
          <p className="text-sm font-semibold text-center mb-2">{zoomPhoto?.label}</p>
          <div className="grid grid-cols-2 gap-2 max-h-[80vh] overflow-auto">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-center text-muted-foreground">ANTES</p>
              {zoomPhoto?.before ? (
                <img
                  src={zoomPhoto.before}
                  className="w-full rounded-lg object-contain max-h-[75vh]"
                  alt="Antes"
                />
              ) : (
                <div className="flex items-center justify-center aspect-[3/4] bg-secondary/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Sem foto</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-center text-primary">DEPOIS</p>
              {zoomPhoto?.after ? (
                <img
                  src={zoomPhoto.after}
                  className="w-full rounded-lg object-contain max-h-[75vh]"
                  alt="Depois"
                />
              ) : (
                <div className="flex items-center justify-center aspect-[3/4] bg-secondary/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Sem foto</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BeforeAfterPhotos;
