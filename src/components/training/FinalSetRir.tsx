import { Button } from '@/components/ui/button';

export function FinalSetRir({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <div className="flex items-center gap-1 px-2 pb-2 flex-wrap">
    <span className="text-xs text-muted-foreground mr-1">RIR (opcional)</span>
    {['0', '1', '2', '3'].map(v => {
      const selected = v === '3' ? Number(value) >= 3 : value === v;
      return <Button key={v} type="button" size="icon" variant={selected ? 'default' : 'outline'}
        aria-label={`RIR ${v === '3' ? '3 ou mais' : v}`} aria-pressed={selected}
        className="h-11 w-11 touch-manipulation" onClick={() => onChange(selected ? '' : v)}>
        {v === '3' ? '3+' : v}
      </Button>;
    })}
  </div>;
}