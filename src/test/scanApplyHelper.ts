import { act, fireEvent, screen, within } from '@testing-library/react';

/** Concluir um scan pergunta Substituir / Adicionar / Revisar: responde (padrão "Adicionar ao que já tem"). */
export async function answerScanApply(option: RegExp = /Adicionar ao que já tem/) {
  const choice = await screen.findByTestId('scan-apply-choice');
  fireEvent.click(within(choice).getByRole('radio', { name: option }));
  await act(async () => { fireEvent.click(within(choice).getByRole('button', { name: 'Continuar' })); });
}
