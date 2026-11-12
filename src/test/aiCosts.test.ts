import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeAiCostUsd, countImageBlocks, openAiQuantities, anthropicQuantities, usageAttribution,
} from '../../supabase/functions/_shared/aiCost';
import { premiumMargin, projectMonth, summarizeAiUsage, periodRange, type AiUsageRow } from '@/lib/aiCosts';
import { weighPlanMeals } from '@/lib/mealWeigh';

const sonnet5 = { input_per_mtok: 2, output_per_mtok: 10, cache_write_per_mtok: 2.5, cache_read_per_mtok: 0.2 };
const haiku55 = {
  input_per_mtok: 0.1, output_per_mtok: 0.5, cache_write_per_mtok: 0.125, cache_read_per_mtok: 0.01,
  long_context_threshold: 100000, long_input_per_mtok: 0.5, long_output_per_mtok: 2.5, long_cache_write_per_mtok: 0.625, long_cache_read_per_mtok: 0.05,
};

describe('AI cost per call', () => {
  it('prices input, output and cache tokens per 1M tokens', () => {
    expect(computeAiCostUsd(sonnet5, { inputTokens: 10000, outputTokens: 2000, cacheWriteTokens: 1000, cacheReadTokens: 5000 })).toBeCloseTo(0.0435, 8);
  });
  it('uses the long-context prices for the whole request above the threshold', () => {
    expect(computeAiCostUsd(haiku55, { inputTokens: 1000, outputTokens: 1000 })).toBeCloseTo(0.0006, 8);
    expect(computeAiCostUsd(haiku55, { inputTokens: 120000, outputTokens: 1000 })).toBeCloseTo(0.0625, 8);
  });
  it('prices ElevenLabs by characters sent (per 1k)', () => {
    expect(computeAiCostUsd({ input_per_mtok: 0, output_per_mtok: 0, per_1k_chars: 0.08 }, { characters: 250 })).toBeCloseTo(0.02, 8);
  });
  it('has no cost (not zero) when the model has no price', () => {
    expect(computeAiCostUsd(null, { inputTokens: 1000 })).toBeNull();
  });
  it('reads Anthropic and OpenAI usage without counting cached tokens twice', () => {
    expect(anthropicQuantities({ input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 10, cache_read_input_tokens: 900 }))
      .toEqual({ inputTokens: 50, outputTokens: 20, cacheWriteTokens: 10, cacheReadTokens: 900, characters: 0 });
    expect(openAiQuantities({ prompt_tokens: 1000, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 400 } }))
      .toMatchObject({ inputTokens: 600, cacheReadTokens: 400, outputTokens: 30 });
  });
  it('counts the photos sent in a request', () => {
    const body = { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image', source: {} }, { type: 'image_url', image_url: {} }] }] };
    expect(countImageBlocks(body)).toBe(2);
  });
  it('keeps student_id null for admin calls and the student they were for in target_student_id', () => {
    expect(usageAttribution('aluno', 'stu-1')).toEqual({ student_id: 'stu-1', target_student_id: 'stu-1' });
    expect(usageAttribution('admin', 'adm-1', 'stu-2')).toEqual({ student_id: null, target_student_id: 'stu-2' });
    expect(usageAttribution('sistema', null)).toEqual({ student_id: null, target_student_id: null });
  });
});

const row = (p: Partial<AiUsageRow>): AiUsageRow => ({
  created_at: '2026-11-10T12:00:00', student_id: null, target_student_id: null, actor_role: 'aluno',
  feature: 'prato_pronto', provider: 'anthropic', model: 'claude-haiku-5-5', cost_usd: 0, ok: true, ...p,
});

describe('Custos de IA summary', () => {
  const now = new Date(2026, 10, 12, 15, 0, 0);
  const range = periodRange('mes', now);
  const rows = [
    row({ id: '1', request_id: 'a', student_id: 'ana', cost_usd: 0.004 }),
    row({ id: '2', request_id: 'b', student_id: 'ana', cost_usd: 0.006 }),
    row({ id: '3', request_id: 'c', feature: 'dieta_ia', actor_role: 'admin', target_student_id: 'bia', cost_usd: 0.1 }),
    row({ id: '4', request_id: 'c', feature: 'dieta_ia', actor_role: 'admin', target_student_id: 'bia', cost_usd: 0.05 }),
    row({ id: '5', request_id: 'z', created_at: '2026-10-30T12:00:00', student_id: 'ana', cost_usd: 9 }),
  ];
  const s = summarizeAiUsage(rows, { ...range, premiumIds: ['ana', 'cris'] });

  it('averages each feature per use (one request = one use, even with retries)', () => {
    const plate = s.byFeature.find((f) => f.feature === 'prato_pronto')!;
    expect(plate.uses).toBe(2);
    expect(plate.avgPerUseUsd).toBeCloseTo(0.005, 8);
    const diet = s.byFeature.find((f) => f.feature === 'dieta_ia')!;
    expect(diet.uses).toBe(1);
    expect(diet.avgPerUseUsd).toBeCloseTo(0.15, 8);
  });
  it('counts only the period and attributes admin calls to the student they were for', () => {
    expect(s.totalUsd).toBeCloseTo(0.16, 8);
    expect(s.byStudent.map((x) => x.studentId)).toEqual(['bia', 'ana']);
  });
  it('scales the cost per active and per premium student to 30 days', () => {
    expect(range.days).toBe(12);
    expect(s.avgPerActiveStudentMonthUsd).toBeCloseTo(((0.16 / 2) * 30) / 12, 8);
    expect(s.avgPerPremiumStudentMonthUsd).toBeCloseTo(((0.01 / 2) * 30) / 12, 8);
  });
  it('projects the month from the days elapsed', () => {
    const p = projectMonth(rows, now);
    expect(p.spentUsd).toBeCloseTo(0.16, 8);
    expect(p.projectedUsd).toBeCloseTo((0.16 / 12) * 30, 8);
  });
  it('computes the premium margin in euros', () => {
    const m = premiumMargin(15, 2, 0.9);
    expect(m.costEur).toBeCloseTo(1.8, 8);
    expect(m.marginEur).toBeCloseTo(13.2, 8);
    expect(m.marginPct).toBeCloseTo(88, 6);
  });
});

describe('AI calls are all instrumented', () => {
  const root = join(__dirname, '../../supabase/functions');
  const dirs = readdirSync(root).filter((d) => !d.startsWith('_') && d !== 'tests' && existsSync(join(root, d, 'index.ts')));
  const read = (d: string) => readdirSync(join(root, d)).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(root, d, f), 'utf8')).join('\n');
  it('never calls an AI provider with a plain fetch', () => {
    for (const d of [...dirs, '_shared']) {
      const src = read(d).replace(/aiFetch\(/g, '');
      expect(src, d).not.toMatch(/fetch\(\s*["'`]https:\/\/(api\.openai\.com|ai\.gateway\.lovable\.dev|api\.anthropic\.com)/);
      expect(src, d).not.toMatch(/fetch\(`\$\{ANTHROPIC_BASE_URL\}/);
    }
  });
  it('wraps every function that calls AI so usage is attributed to the request', () => {
    const calling = dirs.filter((d) => /anthropicChat\(|aiFetch\(/.test(read(d)));
    expect(calling.length).toBeGreaterThanOrEqual(17);
    for (const d of calling) expect(readFileSync(join(root, d, 'index.ts'), 'utf8'), d).toMatch(/withAiUsage\(/);
  });
});

describe('planned meal for weighing', () => {
  it('uses the published meal of the day when the student emptied it, and keeps edited meals', () => {
    const published = [{ name: 'Café', foods: [{ food: 'Iogurte' }, { food: 'Banana' }] }, { name: 'Almoço', foods: [{ food: 'Frango' }] }];
    const student = [{ name: 'Café', foods: [] }, { name: 'Almoço', foods: [{ food: 'Atum' }] }];
    const out = weighPlanMeals(student, published);
    expect(out[0].foods).toHaveLength(2);
    expect(out[1].foods).toEqual([{ food: 'Atum' }]);
  });
});
