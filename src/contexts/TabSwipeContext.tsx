import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const adminOrder = ['/dashboard', '/alunos', '/consultoria'];
const alunoOrder = ['/minha-area', '/meus-treinos', '/minhas-dietas', '/minhas-avaliacoes', '/perfil'];

const TRIGGER_RATIO = 0.25;   // fração da largura para confirmar troca
const MAX_OFF_AXIS = 80;      // ignora se vertical excede isso (rolagem)
const ACTIVATE_PX = 12;       // distância horizontal para "começar" o drag

interface TabSwipeState {
  /** -1..+1: -1 = totalmente no próximo, +1 = totalmente no anterior */
  dragProgress: number;
  isDragging: boolean;
}

const TabSwipeContext = createContext<TabSwipeState>({ dragProgress: 0, isDragging: false });

export const useTabSwipe = () => useContext(TabSwipeContext);

export const TabSwipeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();

  const [dragProgress, setDragProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const activeRef = useRef(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const order = role === 'admin' ? adminOrder : alunoOrder;
    const idx = order.findIndex((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
    if (idx === -1) return;

    const reset = () => {
      startRef.current = null;
      activeRef.current = false;
      draggingRef.current = false;
      setIsDragging(false);
      setDragProgress(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // Ignora quando toca em controles interativos onde swipe horizontal já tem significado
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-swipe], input[type="range"], [role="slider"], .embla, [data-swipeable]')) return;
      startRef.current = { x: t.clientX, y: t.clientY, id: t.identifier };
      activeRef.current = true;
      draggingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start || !activeRef.current) return;
      const t = Array.from(e.touches).find((x) => x.identifier === start.id) ?? e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);

      if (!draggingRef.current) {
        if (dy > MAX_OFF_AXIS) { reset(); return; }
        if (Math.abs(dx) < ACTIVATE_PX) return;
        if (Math.abs(dx) < dy) { reset(); return; }
        // Só ativa o drag se houver vizinho na direção
        const dir = dx < 0 ? +1 : -1; // +1 próximo, -1 anterior
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= order.length) { reset(); return; }
        draggingRef.current = true;
        setIsDragging(true);
      }

      const w = window.innerWidth || 1;
      // dx negativo => próximo => progress negativo
      let progress = dx / w;
      if (progress > 1) progress = 1;
      if (progress < -1) progress = -1;
      // Limita às bordas (sem vizinho disponível)
      if (progress > 0 && idx === 0) progress = 0;
      if (progress < 0 && idx === order.length - 1) progress = 0;
      setDragProgress(progress);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start) { reset(); return; }
      const t = e.changedTouches[0];
      const dx = t ? t.clientX - start.x : 0;
      const w = window.innerWidth || 1;
      const ratio = dx / w;

      if (draggingRef.current && Math.abs(ratio) >= TRIGGER_RATIO) {
        if (ratio < 0) {
          const next = order[idx + 1];
          if (next) navigate(next);
        } else {
          const prev = order[idx - 1];
          if (prev) navigate(prev);
        }
      }
      reset();
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [location.pathname, role, navigate]);

  return (
    <TabSwipeContext.Provider value={{ dragProgress, isDragging }}>
      {children}
    </TabSwipeContext.Provider>
  );
};