import React from 'react';
import { Card } from '@/components/ui/card';
import { Flame, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseTabata } from '@/lib/tabataParser';

interface TabataDoDiaCardProps {
  conteudo: string;
}

const TabataDoDiaCard: React.FC<TabataDoDiaCardProps> = ({ conteudo }) => {
  const navigate = useNavigate();
  const parsed = parseTabata(conteudo);

  if (!parsed.blocks.length) return null;

  const totalExercises = parsed.blocks.reduce((sum, b) => sum + b.exercises.length, 0);
  const isAdapted = /adaptado/i.test(parsed.type);
  const isIntense = /intenso/i.test(parsed.type);

  const intensityChip = isAdapted
    ? { label: 'ADAPTADO', cls: 'bg-green-500/20 text-green-400 border-green-500/40' }
    : isIntense
    ? { label: 'INTENSO', cls: 'bg-red-500/20 text-red-400 border-red-500/40' }
    : { label: parsed.type?.toUpperCase() || 'MODERADO', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };

  return (
    <Card
      className="glass-card overflow-hidden cursor-pointer group border-primary/20"
      onClick={() => navigate('/tabata-execucao', { state: { tabata: parsed } })}
    >
      <div className="relative p-4 bg-gradient-to-br from-red-500/10 via-orange-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-500/20 flex items-center justify-center shrink-0">
            <Flame className="h-6 w-6 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">TABATA do Dia</p>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${intensityChip.cls}`}>
                {intensityChip.label}
              </span>
            </div>
            <h3 className="text-sm font-bold uppercase truncate">{parsed.title || 'Treino TABATA'}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {parsed.duration || `${parsed.blocks.length} blocos`} • {totalExercises} exercícios
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform">
            <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TabataDoDiaCard;
