import { chooseMessageIndex } from './planWhatsAppMessage';

const lastIndices = new Map<string, number>();

/** Browser boundary; blocked storage still avoids repetition within this session. */
export function nextPlanWhatsAppMessageIndex(studentId: string, planType: string, count: number): number {
  const key = `whatsapp:plan-message:${encodeURIComponent(studentId)}:${encodeURIComponent(planType)}`;
  let previous = lastIndices.get(key) ?? null;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null && /^\d+$/.test(stored)) previous = Number(stored);
  } catch { /* Storage may be blocked by the browser. */ }
  const index = chooseMessageIndex(count, previous, Math.random());
  lastIndices.set(key, index);
  try { localStorage.setItem(key, String(index)); } catch { /* Keep session fallback. */ }
  return index;
}