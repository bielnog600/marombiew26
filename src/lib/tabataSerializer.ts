// Serializa uma estrutura ParsedTabata de volta para markdown compatível com o parser
import type { ParsedTabata } from './tabataParser';
import { tabataBlockMarkdown } from './tabataProgression';

export function serializeTabata(t: ParsedTabata): string {
  const lines: string[] = [];

  lines.push(`# ${t.title || 'TABATA'}`);
  lines.push('');
  if (t.type) lines.push(`**Tipo:** ${t.type}`);
  if (t.duration) lines.push(`**Duração total:** ${t.duration}`);
  if (t.objective) lines.push(`**Objetivo:** ${t.objective}`);
  if (t.level) lines.push(`**Nível:** ${t.level}`);
  lines.push('');

  if (t.warmupBlock && t.warmupBlock.exercises.length) {
    // Bloco 0 cronometrado substitui a lista de texto.
    lines.push('## Aquecimento');
    lines.push(...tabataBlockMarkdown(t.warmupBlock));
    lines.push('');
  } else if (t.warmup.length) {
    lines.push('## Aquecimento');
    t.warmup.forEach(w => lines.push(`- ${w}`));
    lines.push('');
  }

  if (t.blocks.length) {
    lines.push('## Blocos');
    lines.push('');
    t.blocks.forEach(b => {
      lines.push(...tabataBlockMarkdown(b));
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
