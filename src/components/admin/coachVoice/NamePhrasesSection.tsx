import React, { useEffect, useState } from 'react';
import { Plus, Sparkles, Square, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import type { CoachVoiceTake } from '@/lib/coachVoice/api';
import {
  NAME_PLACEHOLDER, defaultVoiceName, namePhraseKey, renderNameTemplate, spokenName,
  type NameStudent, type NameTemplate, type VoiceFrequency, type VoiceMoment,
} from '@/lib/liveCorrection/voice/motivation';
import PhraseCard, { type PhraseRow } from './PhraseCard';
import MomentFrequencyFields from './MomentFrequencyFields';
import ConfirmDeleteButton from './ConfirmDeleteButton';

export interface TemplatePatch { texto?: string; momento?: VoiceMoment; frequencia?: VoiceFrequency; ativo?: boolean }

interface Props {
  templates: NameTemplate[];
  students: NameStudent[];
  rowsByKey: Map<string, PhraseRow>;
  takesByKey: Map<string, CoachVoiceTake[]>;
  urls: Record<string, string>;
  busyKey: string | null;
  disabled: boolean;
  rowErrors: Record<string, string>;
  pendingCount: number;
  bulk: { done: number; total: number } | null;
  bulkError: string | null;
  onGenerate(key: string): void;
  onApprove(take: CoachVoiceTake): void;
  onGenerateAll(): void;
  onStopAll(): void;
  onTemplateAdd(): void;
  onTemplateUpdate(id: string, patch: TemplatePatch): void;
  onTemplateDelete(id: string): void;
  onVoiceNameSave(userId: string, voiceName: string): void;
}

const TemplateRow: React.FC<{ t: NameTemplate; onUpdate(p: TemplatePatch): void; onDelete(): void }> = ({ t, onUpdate, onDelete }) => {
  const [text, setText] = useState(t.texto);
  useEffect(() => setText(t.texto), [t.texto]);
  const invalid = !text.includes(NAME_PLACEHOLDER);
  return (
    <li className="rounded-xl border border-border p-2.5 space-y-2" data-testid={`coach-voice-template-${t.id}`}>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Modelo ${t.texto}`}
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { const clean = text.trim(); if (clean && !invalid && clean !== t.texto) onUpdate({ texto: clean }); }}
          className="h-9 flex-1"
        />
        <Switch checked={t.ativo} onCheckedChange={(v) => onUpdate({ ativo: v })} aria-label={`Modelo ativo: ${t.texto}`} />
        <ConfirmDeleteButton
          label={`Apagar modelo ${t.texto}`}
          title="Apagar este modelo?"
          description="As falas com nome geradas a partir dele, de todos os alunos, também saem."
          onConfirm={onDelete}
        />
      </div>
      {invalid && <p className="text-[11px] text-destructive">O modelo precisa ter {NAME_PLACEHOLDER} no lugar do nome.</p>}
      <MomentFrequencyFields
        label={t.texto}
        moment={t.momento}
        frequency={t.frequencia}
        onMoment={(v) => onUpdate({ momento: v })}
        onFrequency={(v) => onUpdate({ frequencia: v })}
      />
    </li>
  );
};

const VoiceNameField: React.FC<{ student: NameStudent; onSave(v: string): void }> = ({ student, onSave }) => {
  const [value, setValue] = useState(spokenName(student.voice_name, student.nome));
  useEffect(() => setValue(spokenName(student.voice_name, student.nome)), [student.voice_name, student.nome]);
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground shrink-0">Como falar o nome</span>
      <Input
        aria-label={`Como falar o nome de ${student.nome ?? ''}`}
        value={value}
        maxLength={60}
        placeholder={defaultVoiceName(student.nome)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
        className="h-8 max-w-[180px]"
      />
    </label>
  );
};

/** "Falas com nome": modelos com {nome} viram uma fala por aluno com Correção ao vivo. */
const NamePhrasesSection: React.FC<Props> = (p) => {
  const active = p.templates.filter((t) => t.ativo);
  return (
    <section className="space-y-3" data-testid="coach-voice-names">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Falas com nome</h2>
      <Card className="glass-card">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Modelos com {NAME_PLACEHOLDER}. Na câmera do aluno, as falas com o nome dele têm preferência no sorteio do momento.</p>
            <Button size="sm" variant="outline" onClick={p.onTemplateAdd}><Plus className="h-4 w-4 mr-1" /> Modelo</Button>
          </div>
          <ul className="space-y-2">
            {p.templates.map((t) => (
              <TemplateRow key={t.id} t={t} onUpdate={(patch) => p.onTemplateUpdate(t.id, patch)} onDelete={() => p.onTemplateDelete(t.id)} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            {p.bulk ? (
              <Button variant="outline" onClick={p.onStopAll}><Square className="h-4 w-4 mr-1.5" /> Parar</Button>
            ) : (
              <Button onClick={p.onGenerateAll} disabled={p.disabled || !p.pendingCount} data-testid="coach-voice-generate-names">
                <Sparkles className="h-4 w-4 mr-1.5" /> Gerar falas com nome ({p.pendingCount})
              </Button>
            )}
          </div>
          {p.bulk && (
            <div className="space-y-1">
              <Progress value={(p.bulk.done / p.bulk.total) * 100} />
              <p className="text-xs text-muted-foreground">Gerando {Math.min(p.bulk.done + 1, p.bulk.total)} de {p.bulk.total}…</p>
            </div>
          )}
          {p.bulkError && <p className="text-sm text-destructive" role="alert">{p.bulkError}</p>}
        </CardContent>
      </Card>

      {!p.students.length && <p className="text-xs text-muted-foreground">Nenhum aluno com Correção ao vivo ativa.</p>}
      {p.students.map((s) => {
        const name = spokenName(s.voice_name, s.nome);
        return (
          <div key={s.user_id} id={`nome-${s.user_id}`} className="space-y-2 scroll-mt-20" data-testid={`coach-voice-student-${s.user_id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><UserRound className="h-4 w-4 text-primary" /> {s.nome ?? 'Aluno'}</p>
              <VoiceNameField student={s} onSave={(v) => p.onVoiceNameSave(s.user_id, v)} />
            </div>
            {!name && <p className="text-xs text-muted-foreground">Preencha como falar o nome para criar as falas.</p>}
            {name && active.map((t) => {
              const key = namePhraseKey(t.id, s.user_id);
              const row = p.rowsByKey.get(key);
              return (
                <PhraseCard
                  key={key}
                  phraseKey={key}
                  defaultText={renderNameTemplate(t.texto, name)}
                  row={row}
                  takes={p.takesByKey.get(key) ?? []}
                  urls={p.urls}
                  busy={p.busyKey === key}
                  disabled={p.disabled || !row}
                  error={p.rowErrors[key] ?? null}
                  readOnlyText
                  onGenerate={() => p.onGenerate(key)}
                  onApprove={p.onApprove}
                />
              );
            })}
          </div>
        );
      })}
    </section>
  );
};

export default NamePhrasesSection;
