import React, { useCallback, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { emptyDaysMessage } from '@/lib/workoutEmptyDays';

/** Pergunta "Remover dia e salvar" / "Cancelar" quando há dias sem exercícios. */
export const useEmptyDaysConfirm = () => {
  const [names, setNames] = useState<string[] | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((empty: string[]) => {
    if (empty.length === 0) return Promise.resolve(true);
    setNames(empty);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setNames(null);
  };

  const dialog = (
    <AlertDialog open={!!names} onOpenChange={(v) => { if (!v) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{names ? emptyDaysMessage(names) : ''}</AlertDialogTitle>
          <AlertDialogDescription>Dias sem exercícios não são salvos no plano.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>Remover dia e salvar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
};
