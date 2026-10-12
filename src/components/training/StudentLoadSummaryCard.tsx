import { History, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { normalizeTargetLoadPerSet } from '@/lib/sessionProgression';

/** Presentation only: reuses the existing formatted history/recommendation. */
export const StudentLoadSummaryCard = ({ previousLine, suggestionLine, perSet }: {
  previousLine: string | null;
  suggestionLine: string | null;
  perSet?: unknown;
}) => {
  const targets = normalizeTargetLoadPerSet(perSet);
  if (!previousLine && !suggestionLine && !targets) return null;
  const previous = previousLine?.replace(/^Última vez:\s*/, '').split(' · ');
  const manual = !!targets || !!suggestionLine?.startsWith('Carga alvo:');
  const suggestion = suggestionLine?.replace(/^(Sugestão|Carga alvo):\s*/, '') ?? '';
  const numeric = suggestion.match(/^(\d+(?:[,.]\d+)? kg)(?: · (.*))?$/);
  const SuggestionIcon = manual ? Target : TrendingUp;
  const bothBlocks = !!previous && !!(suggestionLine || targets);

  return (
    <Card className={`mt-3 rounded-lg shadow-none ${manual ? 'border-primary/50' : 'border-border'}`} data-testid="student-load-summary">
      <CardContent className={`p-3 grid items-start ${bothBlocks ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {previous && <div className={`min-w-0 space-y-1.5 text-center ${bothBlocks ? 'pr-3' : ''}`}>
          <div className="flex items-center justify-center gap-1.5 text-primary">
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[10px] uppercase font-semibold">Última vez</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-lg font-semibold text-foreground leading-tight">{previous[0]}</p>
            {previous[1] && <span className="text-xs font-medium text-foreground/80">{previous[1]}</span>}
          </div>
        </div>}
        {(suggestionLine || targets) && <div className={`min-w-0 space-y-1.5 text-center ${bothBlocks ? 'border-l border-border pl-3 self-stretch' : ''}`}>
          <div className="flex items-center justify-center gap-1.5 text-primary">
            <SuggestionIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[10px] uppercase font-semibold">{manual ? 'Carga alvo' : 'Sugestão'}</span>
          </div>
          {targets ? <div className="flex flex-wrap justify-center gap-1.5">
            {targets.map((set) => <span key={set.set_number} className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-sm font-semibold text-primary">
              {set.set_number}° set {String(set.load_kg).replace('.', ',')} kg
            </span>)}
          </div> : numeric ? <>
            <p className={`text-xl font-semibold leading-tight ${manual ? 'text-primary' : 'text-foreground'}`}>{numeric[1]}</p>
            {numeric[2] && <p className="text-sm font-medium text-foreground">{numeric[2]}</p>}
          </> : <p className="text-sm font-semibold leading-snug text-foreground break-words">{suggestion}</p>}
        </div>}
      </CardContent>
    </Card>
  );
};