// Serializa uma estrutura ParsedTabata de volta para markdown compatível com o parser
import type { ParsedTabata } from './tabataParser';

export function serializeTabata(t: ParsedTabata): string {
  const lines: string[] = [];

  lines.push(`# ${t.title || 'TABATA'}`);
  lines.push('');
  if (t.type) lines.push(`**Tipo:** ${t.type}`);
  if (t.duration) lines.push(`**Duração total:** ${t.duration}`);
  if (t.objective) lines.push(`**Objetivo:** ${t.objective}`);
  if (t.level) lines.push(`**Nível:** ${t.level}`);
  lines.push('');

  if (t.warmup.length) {
    lines.push('## Aquecimento');
    t.warmup.forEach(w => lines.push(`- ${w}`));
    lines.push('');
  }

  if (t.blocks.length) {
    lines.push('## Blocos');
    lines.push('');
    t.blocks.forEach(b => {
      lines.push(`### ${b.name}`);
      const fmt = b.format || `${b.rounds} rounds × ${b.workSeconds}s / ${b.restSeconds}s`;
      lines.push(`**Formato:** ${fmt}`);
      lines.push('');
      lines.push('| # | Exercício | Trabalho | Descanso | Observação |');
      lines.push('|---|-----------|----------|----------|------------|');
      b.exercises.forEach((ex, i) => {
        lines.push(
          `| ${i + 1} | ${ex.name} | ${ex.workSeconds}s | ${ex.restSeconds}s | ${ex.observation || '...'} |`
        );
      });
      lines.push('');
      const rest = b.restAfterBlock >= 60 && b.restAfterBlock % 60 === 0
        ? `${b.restAfterBlock / 60} min`
        : `${b.restAfterBlock}s`;
      lines.push(`**Descanso após bloco:** ${rest}`);
      lines.push('');
    });
  }

  if (t.cooldown.length) {
    lines.push('## Desaquecimento');
    t.cooldown.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  return lines.join('\n');
}
