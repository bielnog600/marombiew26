import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('bundle do servidor (office-gerar)', () => {
  it('está atualizado com o código do admin', () => {
    let out = '';
    try {
      out = execFileSync('node', ['./scripts/build-office-core.mjs', '--check'], { encoding: 'utf8' });
    } catch (e: any) {
      out = String(e.stderr || e.stdout || e.message);
    }
    expect(out).toContain('officeCore.js atualizado');
  }, 60000);
});
