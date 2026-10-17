// Controle do aviso "Entendi" de métodos em grupo (Superset, Bi-set, etc.).
// Não há coluna de preferências no banco; persiste em localStorage por user_id,
// valendo para sempre naquele aparelho/navegador (uma vez por usuário e por tipo).

export type GroupIntroMethod = 'superset' | 'biset' | 'dropset' | 'rest_pause' | 'cluster';

const keyFor = (userId: string) => `marombiew_group_intro_seen_${userId}`;

const readAll = (userId: string): GroupIntroMethod[] => {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GroupIntroMethod[]) : [];
  } catch {
    return [];
  }
};

export const hasSeenGroupIntro = (userId: string | null | undefined, method: GroupIntroMethod): boolean => {
  if (!userId) return false;
  return readAll(userId).includes(method);
};

export const markGroupIntroSeen = (userId: string | null | undefined, method: GroupIntroMethod): void => {
  if (!userId) return;
  try {
    const seen = readAll(userId);
    if (!seen.includes(method)) {
      seen.push(method);
      window.localStorage.setItem(keyFor(userId), JSON.stringify(seen));
    }
  } catch {
    // storage indisponível: o aviso simplesmente reaparece na próxima vez
  }
};
