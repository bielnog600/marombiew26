import { describe, it, expect, beforeEach } from 'vitest';
import { hasSeenGroupIntro, markGroupIntroSeen } from '@/lib/groupIntroSeen';

describe('groupIntroSeen (aviso uma vez por usuário e por tipo)', () => {
  beforeEach(() => window.localStorage.clear());

  it('não visto inicialmente; visto após marcar', () => {
    expect(hasSeenGroupIntro('u1', 'superset')).toBe(false);
    markGroupIntroSeen('u1', 'superset');
    expect(hasSeenGroupIntro('u1', 'superset')).toBe(true);
  });

  it('é por tipo: superset visto não esconde bi-set', () => {
    markGroupIntroSeen('u1', 'superset');
    expect(hasSeenGroupIntro('u1', 'biset')).toBe(false);
  });

  it('é por usuário: outro usuário ainda vê o aviso', () => {
    markGroupIntroSeen('u1', 'superset');
    expect(hasSeenGroupIntro('u2', 'superset')).toBe(false);
  });

  it('sem userId nunca marca nem considera visto', () => {
    markGroupIntroSeen(null, 'superset');
    expect(hasSeenGroupIntro(null, 'superset')).toBe(false);
  });

  it('marcar duas vezes não duplica nem falha', () => {
    markGroupIntroSeen('u1', 'biset');
    markGroupIntroSeen('u1', 'biset');
    expect(hasSeenGroupIntro('u1', 'biset')).toBe(true);
  });
});
