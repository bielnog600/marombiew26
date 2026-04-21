import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const adminOrder = ['/dashboard', '/alunos', '/consultoria'];
const alunoOrder = ['/minha-area', '/meus-treinos', '/minhas-dietas', '/minhas-avaliacoes', '/perfil'];

const EDGE_PX = 28;       // toque deve começar dentro desta distância de uma das bordas
const TRIGGER_PX = 60;    // deslocamento horizontal mínimo para navegar
const MAX_OFF_AXIS = 60;  // ignora se o movimento vertical for maior que isso

/**
 * Mobile-only edge-swipe navigation. Funciona apenas quando o toque COMEÇA
 * próximo a uma das bordas laterais — assim não conflita com carrosséis,
 * sliders ou rolagem interna. A direção do movimento decide se avança ou volta.
 * O BottomNav permanece fixo; só o conteúdo da rota muda.
 */
const EdgeSwipeNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const order = role === 'admin' ? adminOrder : alunoOrder;
    const idx = order.findIndex((p) => location.pathname === p || location.pathname.startsWith(p + '/'));

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const w = window.innerWidth;
      const nearEdge = t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX;
      if (!nearEdge) return;
      startRef.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || idx === -1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dy > MAX_OFF_AXIS) return;
      if (Math.abs(dx) < TRIGGER_PX) return;

      if (dx < 0) {
        // Arrastou para a esquerda → próxima aba
        const next = order[idx + 1];
        if (next) navigate(next);
      } else {
        // Arrastou para a direita → aba anterior
        const prev = order[idx - 1];
        if (prev) navigate(prev);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [location.pathname, role, navigate]);

  return null;
};

export default EdgeSwipeNav;