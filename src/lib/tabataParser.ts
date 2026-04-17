// Parser para extrair blocos TABATA estruturados do markdown gerado pela IA
export interface TabataExercise {
  name: string;
  workSeconds: number;
  restSeconds: number;
  observation?: string;
}

export interface TabataBlock {
  name: string;
  format: string;
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  exercises: TabataExercise[];
  restAfterBlock: number;
}

export interface ParsedTabata {
  title: string;
  type: string;
  duration: string;
  objective: string;
  level: string;
  warmup: string[];
  blocks: TabataBlock[];
  cooldown: string[];
  rawMarkdown: string;
}

const TIME_RE = /(\d+)\s*s/i;

export function parseTabata(markdown: string): ParsedTabata {
  const result: ParsedTabata = {
    title: '',
    type: '',
    duration: '',
    objective: '',
    level: '',
    warmup: [],
    blocks: [],
    cooldown: [],
    rawMarkdown: markdown,
  };

  if (!markdown) return result;

  const lines = markdown.split('\n');
  let currentSection: 'warmup' | 'cooldown' | 'block' | null = null;
  let currentBlock: TabataBlock | null = null;
  let inTable = false;
  let tableHeaderSkipped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Title
    if (!result.title && /^#\s+/.test(trimmed)) {
      result.title = trimmed.replace(/^#\s+/, '').replace(/[🔥💪🧘⚠️📋⚡]/g, '').trim();
      continue;
    }

    // Metadata
    const meta = trimmed.match(/^\*\*(Tipo|Duração total|Objetivo|Nível):\*\*\s*(.+)$/i);
    if (meta) {
      const key = meta[1].toLowerCase();
      const val = meta[2].trim();
      if (key === 'tipo') result.type = val;
      else if (key.startsWith('dura')) result.duration = val;
      else if (key === 'objetivo') result.objective = val;
      else if (key === 'nível') result.level = val;
      continue;
    }

    // Section headers
    if (/^##\s+.*aquecimento/i.test(trimmed)) {
      currentSection = 'warmup';
      currentBlock = null;
      inTable = false;
      continue;
    }
    if (/^##\s+.*desaquecimento|alongamento/i.test(trimmed)) {
      currentSection = 'cooldown';
      currentBlock = null;
      inTable = false;
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      currentSection = null;
      currentBlock = null;
      inTable = false;
      continue;
    }

    // Block header (### Bloco N)
    if (/^###\s+/.test(trimmed)) {
      const blockName = trimmed.replace(/^###\s+/, '').trim();
      currentBlock = {
        name: blockName,
        format: '',
        rounds: 8,
        workSeconds: 20,
        restSeconds: 10,
        exercises: [],
        restAfterBlock: 60,
      };
      result.blocks.push(currentBlock);
      currentSection = 'block';
      inTable = false;
      tableHeaderSkipped = false;
      continue;
    }

    // Block format: **Formato:** 8 rounds × 20s / 10s
    if (currentBlock && /^\*\*Formato:\*\*/i.test(trimmed)) {
      currentBlock.format = trimmed.replace(/^\*\*Formato:\*\*\s*/i, '');
      const roundsMatch = currentBlock.format.match(/(\d+)\s*rounds?/i);
      const timesMatch = currentBlock.format.match(/(\d+)\s*s.*?(\d+)\s*s/i);
      if (roundsMatch) currentBlock.rounds = parseInt(roundsMatch[1]);
      if (timesMatch) {
        currentBlock.workSeconds = parseInt(timesMatch[1]);
        currentBlock.restSeconds = parseInt(timesMatch[2]);
      }
      continue;
    }

    // Rest after block
    if (currentBlock && /descanso após bloco/i.test(trimmed)) {
      const m = trimmed.match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1]);
        currentBlock.restAfterBlock = /min/i.test(trimmed) ? n * 60 : n;
      }
      continue;
    }

    // Table parsing for blocks
    if (currentBlock && trimmed.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeaderSkipped = false;
        continue;
      }
      // Skip the separator line
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        tableHeaderSkipped = true;
        continue;
      }
      if (!tableHeaderSkipped) continue;

      const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
      if (cells.length >= 2) {
        const exerciseName = cells[1];
        const workCell = cells[2] || `${currentBlock.workSeconds}s`;
        const restCell = cells[3] || `${currentBlock.restSeconds}s`;
        const obs = cells[4] || '';
        const workMatch = workCell.match(TIME_RE);
        const restMatch = restCell.match(TIME_RE);
        if (exerciseName && exerciseName !== '...') {
          currentBlock.exercises.push({
            name: exerciseName,
            workSeconds: workMatch ? parseInt(workMatch[1]) : currentBlock.workSeconds,
            restSeconds: restMatch ? parseInt(restMatch[1]) : currentBlock.restSeconds,
            observation: obs && obs !== '...' ? obs : undefined,
          });
        }
      }
      continue;
    } else {
      inTable = false;
    }

    // Bullets for warmup/cooldown
    if ((currentSection === 'warmup' || currentSection === 'cooldown') && /^[-*]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s+/, '').trim();
      if (currentSection === 'warmup') result.warmup.push(item);
      else result.cooldown.push(item);
    }
  }

  return result;
}
