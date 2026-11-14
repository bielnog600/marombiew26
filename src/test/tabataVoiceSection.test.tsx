import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import TabataVoiceSection from '@/components/admin/coachVoice/TabataVoiceSection';
import type { PhraseRow } from '@/components/admin/coachVoice/PhraseCard';
import { TABATA_VOICE_SEEDS } from '@/lib/tabataVoiceCues';

const row = (phrase_key: string, texto: string, approved = false): PhraseRow => ({
  phrase_key, texto, categoria: 'TABATA', approved_take_id: approved ? `t-${phrase_key}` : null, tipo: 'sistema',
  momento: null, frequencia: 'sempre', ativo: true, student_id: null, template_id: null,
});
const APPROVED = new Set(['tabata_preparado', 'tabata_321_bora', 'tabata_descanse', 'tabata_respira', 'tabata_proximo_bloco']);
const rows = TABATA_VOICE_SEEDS.map(s => row(s.key, s.text, APPROVED.has(s.key)));

const setup = (onAdd = vi.fn(async () => true)) => {
  render(
    <TabataVoiceSection
      rows={rows} isVisible={() => true} isApproved={(k) => APPROVED.has(k)}
      takesByKey={new Map()} urls={{}} busyKey={null} disabled={false} rowErrors={{}}
      onGenerate={vi.fn()} onApprove={vi.fn()} onSaveText={vi.fn()} onAdd={onAdd} onDelete={vi.fn()}
    />,
  );
  return onAdd;
};

describe('aba TABATA — falas por momento', () => {
  it('cada fala aprovada fica no seu momento e o grupo sem aprovada avisa que toca o bipe', () => {
    setup();
    const largada = screen.getByTestId('tabata-voice-moment-largada');
    expect(within(largada).getByText('0 de 5 aprovadas')).toBeInTheDocument();
    const contagem = screen.getByTestId('tabata-voice-moment-contagem');
    expect(within(contagem).getByTestId('coach-voice-phrase-tabata_321_bora')).toBeInTheDocument();
    expect(within(contagem).getByTestId('coach-voice-phrase-tabatav_contagem_321')).toBeInTheDocument();
    expect(within(screen.getByTestId('tabata-voice-moment-descanso')).getByText('1 de 4 aprovadas')).toBeInTheDocument();
    expect(within(screen.getByTestId('tabata-voice-moment-bloco')).getByText('Só antes do bloco Máximo')).toBeInTheDocument();
  });
  it('adicionar uma variação de largada entra no grupo da largada', async () => {
    const onAdd = setup();
    const box = screen.getByTestId('tabata-voice-add-largada');
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: 'Pra cima!' } });
    fireEvent.click(within(box).getByRole('button', { name: /Adicionar/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('largada', 'Pra cima!'));
  });
});
