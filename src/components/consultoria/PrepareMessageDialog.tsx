import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Copy, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import {
  buildFocusAudioScript, buildFocusTextMessage, type FocusItem,
} from '@/lib/weeklyCoachingFocus';

interface Props {
  studentName: string;
  studentPhone: string | null;
  items: FocusItem[];
  onSent?: (selected: FocusItem[]) => void;
}

const PrepareMessageDialog: React.FC<Props> = ({ studentName, studentPhone, items, onSent }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'texto' | 'audio'>('texto');
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [script, setScript] = useState('');
  const [textDirty, setTextDirty] = useState(false);
  const [scriptDirty, setScriptDirty] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(items.map((i) => i.exerciseName));
      setTextDirty(false);
      setScriptDirty(false);
    }
  }, [open, items]);

  const selectedItems = useMemo(
    () => items.filter((i) => selected.includes(i.exerciseName)),
    [items, selected],
  );

  // Regenera só enquanto o treinador não editou manualmente.
  useEffect(() => {
    if (!textDirty) setText(buildFocusTextMessage(studentName, selectedItems));
  }, [selectedItems, studentName, textDirty]);
  useEffect(() => {
    if (!scriptDirty) setScript(buildFocusAudioScript(studentName, selectedItems));
  }, [selectedItems, studentName, scriptDirty]);

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const handleOpenWhatsApp = () => {
    if (!studentPhone) {
      toast({ title: 'Aluno sem telefone cadastrado', variant: 'destructive' });
      return;
    }
    const url = mode === 'texto'
      ? buildWhatsAppUrl(studentPhone, text)
      : buildWhatsAppUrl(studentPhone, '');
    window.open(url, '_blank', 'noopener,noreferrer');
    onSent?.(selectedItems);
    setOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mode === 'texto' ? text : script);
      toast({ title: mode === 'texto' ? 'Mensagem copiada' : 'Roteiro copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs">
          <MessageSquare className="h-3 w-3 mr-1" />
          Preparar mensagem
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Mensagem para {studentName.split(' ')[0]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem orientações nesta semana.</p>
            )}
            {items.map((i) => (
              <label key={i.exerciseName} className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={selected.includes(i.exerciseName)}
                  onCheckedChange={() => toggle(i.exerciseName)}
                  className="mt-0.5"
                />
                <span className="leading-tight">
                  <span className="font-medium">{i.exerciseName}</span>
                  <span className="text-muted-foreground"> — {i.detail.toLowerCase()}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-1 rounded-md bg-secondary/40 p-1">
            {(['texto', 'audio'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? 'default' : 'ghost'}
                className="h-7 flex-1 text-xs"
                onClick={() => setMode(m)}
              >
                {m === 'texto' ? 'Texto' : 'Áudio'}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {mode === 'texto' ? 'Prévia' : 'Roteiro para áudio'}
            </p>
            <Textarea
              value={mode === 'texto' ? text : script}
              onChange={(e) => {
                if (mode === 'texto') { setText(e.target.value); setTextDirty(true); }
                else { setScript(e.target.value); setScriptDirty(true); }
              }}
              rows={mode === 'texto' ? 9 : 6}
              className="text-xs"
            />
            {mode === 'audio' && (
              <p className="text-[10px] text-muted-foreground">
                O WhatsApp abre sem texto preenchido para você gravar o áudio.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCopy}>
              <Copy className="h-3 w-3 mr-1" />
              {mode === 'texto' ? 'Copiar' : 'Copiar roteiro'}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleOpenWhatsApp}
              disabled={!studentPhone}
            >
              <Send className="h-3 w-3 mr-1" />
              {studentPhone ? 'Abrir no WhatsApp' : 'Sem telefone'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrepareMessageDialog;
