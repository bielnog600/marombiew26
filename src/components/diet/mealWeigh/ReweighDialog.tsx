import React, { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onCancel: () => void;
  /** Abre a pesagem com os itens salvos para pesar só o novo. */
  onAdd: () => void;
  /** Só depois da confirmação: começa uma pesagem nova desta refeição. */
  onRestart: () => void;
}

/** Refeição já pesada no dia: adicionar alimento (padrão) ou refazer do zero (com confirmação). */
const ReweighDialog: React.FC<Props> = ({ open, onCancel, onAdd, onRestart }) => {
  const [confirmRestart, setConfirmRestart] = useState(false);
  return (
    <>
      <AlertDialog open={open && !confirmRestart} onOpenChange={(o) => { if (!o && !confirmRestart) onCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Essa refeição já tem alimentos pesados</AlertDialogTitle>
            <AlertDialogDescription>O que você quer fazer?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button className="h-12 gap-1.5 text-base font-semibold" onClick={onAdd}>
              <Plus className="h-4 w-4" /> Adicionar alimento
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setConfirmRestart(true)}>
              <RotateCcw className="h-4 w-4" /> Refazer do zero
            </Button>
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={open && confirmRestart} onOpenChange={(o) => { if (!o) setConfirmRestart(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a pesagem atual desta refeição?</AlertDialogTitle>
            <AlertDialogDescription>
              Você começa a pesagem de novo. Os alimentos já pesados saem desta refeição quando você salvar a nova pesagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmRestart(false); onRestart(); }}>
              Apagar e refazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ReweighDialog;
