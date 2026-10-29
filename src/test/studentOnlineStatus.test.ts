import { describe, it, expect } from 'vitest';
import { buildAccessRows } from '@/lib/studentOnlineStatus';

const now = new Date('2026-10-29T10:00:00Z').getTime();
const ago = (min: number) => new Date(now - min * 60000).toISOString();

describe('Acessaram hoje', () => {
  it('quem acessou há 30 min e não está com o app aberto não é online', () => {
    const [r] = buildAccessRows([{ id: 'a', name: 'A', activity: [ago(30)], present: false }], now);
    expect(r.online).toBe(false);
  });
  it('atividade nos últimos 5 min conta como online', () => {
    const [r] = buildAccessRows([{ id: 'a', name: 'A', activity: [ago(4)], present: false }], now);
    expect(r.online).toBe(true);
  });
  it('online primeiro, depois do acesso mais recente ao mais antigo', () => {
    const rows = buildAccessRows([
      { id: 'old', name: 'Old', activity: [ago(120)], present: false },
      { id: 'live', name: 'Live', activity: [ago(200)], present: true },
      { id: 'mid', name: 'Mid', activity: [ago(40)], present: false },
    ], now);
    expect(rows.map((r) => r.id)).toEqual(['live', 'mid', 'old']);
  });
});
