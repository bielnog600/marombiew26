import { Input } from '@/components/ui/input';

/** An untouched placeholder remains an empty draft, including after focus/blur. */
export const StudentWeightInput = ({ value, placeholder, disabled, onChange, setNumber }: {
  value: string; placeholder: string; disabled: boolean; onChange: (value: string) => void; setNumber: number;
}) => (
  <Input type="text" inputMode="decimal" aria-label={`Carga da série ${setNumber}`}
    value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
    className="h-9 text-center bg-background/50 border-border/50 placeholder:text-muted-foreground"
    disabled={disabled} />
);