// Temporary self-test: records one fake usage row (no AI call) to verify the logger in the real runtime.
import { recordAiUsage, setAiUsageStudent, withAiUsage } from '../_shared/aiUsage.ts';

Deno.serve(withAiUsage('teste_interno', 'ai-usage-selftest', async () => {
  setAiUsageStudent('0feb5458-15cb-490a-9341-90bd57795495');
  await new Promise((r) => setTimeout(r, 10));
  recordAiUsage({ provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 100, imageCount: 1, ok: true });
  return new Response('ok');
}));
