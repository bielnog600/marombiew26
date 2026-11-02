// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error script .mjs sem tipos
import { bundleOfficeCore, OUT_FILE } from '../../scripts/build-office-core.mjs';

describe('bundle do servidor', () => {
  it('está atualizado com o código do admin', async () => {
    expect(readFileSync(OUT_FILE, 'utf8')).toBe(await bundleOfficeCore());
  }, 30000);
});
