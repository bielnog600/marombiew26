import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { workoutDayLabel } from '@/lib/activeWorkoutSession';

interface Props {
  open: boolean;
  dayName: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const CancelWorkoutDialog = ({ open, dayName, onOpenChange, onConfirm }: Props) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancelar o treino de {workoutDayLabel(dayName, 'short')}?</AlertDialogTitle>
        <AlertDialogDescription>
          O treino não vai contar como feito. As séries já registradas continuam no seu histórico.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Voltar</AlertDialogCancel>
        <AlertDialogAction onClick={(e) => { e.preventDefault(); onConfirm(); }}>Cancelar treino</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default CancelWorkoutDialog;
