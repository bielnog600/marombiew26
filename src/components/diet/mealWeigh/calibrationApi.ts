/**
 * Leitura/gravação da calibração das estimativas (tabela estimate_corrections,
 * função estimate_calibration_samples e o liga/desliga em app_settings).
 * Tudo "melhor esforço": se falhar, a estimativa segue sem ajuste e a
 * refeição salva normalmente.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  CALIBRATION_SETTING_KEY, EMPTY_SAMPLES, calibrationEnabledFrom, recentPromptCorrections, samplesFromRpc,
  type CalibrationSamples, type EstimateCorrectionRow, type PromptCorrection,
} from '@/lib/mealWeigh/calibration';

const db = supabase as any;

export async function loadCalibrationEnabled(): Promise<boolean> {
  try {
    const { data, error } = await db.from('app_settings').select('value').eq('key', CALIBRATION_SETTING_KEY).maybeSingle();
    if (error) return true;
    return calibrationEnabledFrom(data?.value);
  } catch {
    return true;
  }
}

export async function saveCalibrationEnabled(enabled: boolean): Promise<boolean> {
  try {
    const { error } = await db.from('app_settings')
      .upsert({ key: CALIBRATION_SETTING_KEY, value: enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return !error;
  } catch {
    return false;
  }
}

/** Últimas 5 correções do aluno, para a IA. */
export async function loadRecentCorrections(studentId: string): Promise<PromptCorrection[]> {
  try {
    const { data, error } = await db.from('estimate_corrections')
      .select('food_name, estimated_g, real_g, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return recentPromptCorrections(data ?? []);
  } catch {
    return [];
  }
}

export async function loadCalibrationSamples(foodKeys: string[]): Promise<CalibrationSamples> {
  const keys = [...new Set((foodKeys ?? []).filter(Boolean))].slice(0, 40);
  if (keys.length === 0) return EMPTY_SAMPLES;
  try {
    const { data, error } = await db.rpc('estimate_calibration_samples', { _food_keys: keys });
    if (error) return EMPTY_SAMPLES;
    return samplesFromRpc(data ?? []);
  } catch {
    return EMPTY_SAMPLES;
  }
}

/**
 * Grava as correções de uma refeição (uma por estimativa: editar de novo só
 * atualiza). O aluno não sobrescreve nem apaga uma correção feita pelo admin.
 */
export async function saveEstimateCorrections(
  studentId: string,
  upserts: EstimateCorrectionRow[],
  removeIds: string[] = [],
  opts: { asAdmin?: boolean } = {},
): Promise<void> {
  const ids = [...new Set([...upserts.map((r) => r.estimate_id), ...removeIds])];
  if (ids.length === 0) return;
  try {
    let adminIds = new Set<string>();
    let existingIds = new Set<string>(removeIds);
    if (!opts.asAdmin) {
      const { data } = await db.from('estimate_corrections').select('estimate_id, fonte').eq('student_id', studentId).in('estimate_id', ids);
      const rows = (data ?? []) as { estimate_id: string; fonte: string }[];
      adminIds = new Set(rows.filter((r) => r.fonte === 'admin').map((r) => r.estimate_id));
      existingIds = new Set(rows.map((r) => r.estimate_id));
    }
    const rows = upserts.filter((r) => !adminIds.has(r.estimate_id));
    if (rows.length > 0) {
      const { error } = await db.from('estimate_corrections').upsert(rows, { onConflict: 'student_id,estimate_id' });
      if (error) console.warn('[calibração] correções não gravadas', error.message);
    }
    const del = removeIds.filter((id) => existingIds.has(id) && !adminIds.has(id));
    if (del.length > 0) await db.from('estimate_corrections').delete().eq('student_id', studentId).in('estimate_id', del);
  } catch (e) {
    console.warn('[calibração] correções não gravadas', (e as Error)?.message);
  }
}
