import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_EUR_RATE, EUR_RATE_SETTING_KEY, type AiUsageRow } from '@/lib/aiCosts';

const db = supabase as any;
export const USAGE_COLS = 'id, created_at, student_id, target_student_id, actor_role, feature, provider, model, cost_usd, ok, request_id, image_count, input_tokens, output_tokens, characters, price_found';

/** All usage rows since `from` (paged, newest first), optionally only those of one student. */
export async function loadUsageSince(from: Date, studentId?: string | null, max = 20000): Promise<AiUsageRow[]> {
  const out: AiUsageRow[] = [];
  const page = 1000;
  for (let offset = 0; offset < max; offset += page) {
    let q = db.from('ai_usage_logs').select(USAGE_COLS).gte('created_at', from.toISOString())
      .order('created_at', { ascending: false }).range(offset, offset + page - 1);
    if (studentId) q = q.or(`student_id.eq.${studentId},target_student_id.eq.${studentId}`);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as AiUsageRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadEurRate(): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', EUR_RATE_SETTING_KEY).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EUR_RATE;
}

export async function saveEurRate(rate: number): Promise<boolean> {
  const { error } = await db.from('app_settings').upsert({ key: EUR_RATE_SETTING_KEY, value: rate, updated_at: new Date().toISOString() });
  return !error;
}

export interface PriceRow {
  id: string;
  provider: string;
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cache_write_per_mtok: number | null;
  cache_read_per_mtok: number | null;
  per_1k_chars: number | null;
  long_context_threshold: number | null;
  long_input_per_mtok: number | null;
  long_output_per_mtok: number | null;
  notes: string;
  source_url: string | null;
  updated_at: string;
}

export async function loadPrices(): Promise<PriceRow[]> {
  const { data } = await db.from('ai_model_prices').select('*').order('provider').order('model');
  return (data ?? []) as PriceRow[];
}
