import React, { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTabSwipe } from '@/contexts/TabSwipeContext';
import {
  LayoutDashboard, Users, ClipboardList, User, Briefcase, LogOut,
  Home, Dumbbell, UtensilsCrossed, Apple, Settings2,
} from 'lucide-react';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Consultoria', url: '/consultoria', icon: Briefcase },
  { title: 'Alimentos', url: '/alimentos', icon: Apple },
  { title: 'Exercícios', url: '/exercicios', icon: Settings2 },
];

const alunoItems = [
  { title: 'Home', url: '/minha-area', icon: Home },
  { title: 'Treinos', url: '/meus-treinos', icon: Dumbbell },
  { title: 'Dieta', url: '/minhas-dietas', icon: UtensilsCrossed },
  { title: 'Avaliações', url: '/minhas-avaliacoes', icon: ClipboardList },
  { title: 'Perfil', url: '/perfil', icon: User },
];

const BottomNav: React.FC = () => {
  const { role, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = role === 'admin' ? adminItems : alunoItems;
  const { dragProgress, isDragging } = useTabSwipe();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pillRect, setPillRect] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = items.findIndex(
    (it) => location.pathname === it.url || location.pathname.startsWith(it.url + '/')
  );

  // Mede posição do tab ativo e do vizinho na direção do drag para interpolar o pill
  useLayoutEffect(() => {
    if (activeIndex === -1) { setPillRect(null); return; }
    const container = containerRef.current;
    const activeBtn = itemRefs.current[activeIndex];
    if (!container || !activeBtn) return;
    const cRect = container.getBoundingClientRect();
    const aRect = activeBtn.getBoundingClientRect();
    const activeLeft = aRect.left - cRect.left;
    const activeWidth = aRect.width;

    // dragProgress: <0 indo p/ próximo; >0 indo p/ anterior
    let neighborIdx = activeIndex;
    if (dragProgress < 0) neighborIdx = Math.min(items.length - 1, activeIndex + 1);
    else if (dragProgress > 0) neighborIdx = Math.max(0, activeIndex - 1);

    const neighborBtn = itemRefs.current[neighborIdx];
    if (!neighborBtn || neighborIdx === activeIndex || dragProgress === 0) {
      setPillRect({ left: activeLeft, width: activeWidth });
      return;
    }
    const nRect = neighborBtn.getBoundingClientRect();
    const neighborLeft = nRect.left - cRect.left;
    const neighborWidth = nRect.width;

    const t = Math.min(1, Math.abs(dragProgress) / 0.5); // chega ao vizinho a 50% da tela
    const left = activeLeft + (neighborLeft - activeLeft) * t;
    const width = activeWidth + (neighborWidth - activeWidth) * t;
    setPillRect({ left, width });
  }, [activeIndex, dragProgress, items.length, location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 2px)' }}
    >
      <div className="mx-2 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/30 shadow-2xl">
        <div ref={containerRef} className="relative flex items-center justify-around px-2 h-14">
          {/* Pill amarelo único que segue o dedo */}
          {pillRect && activeIndex !== -1 && (
            <motion.div
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 h-12 rounded-2xl bg-primary pointer-events-none"
              animate={{ left: pillRect.left, width: pillRect.width }}
              transition={
                isDragging
                  ? { type: 'tween', duration: 0 }
                  : { type: 'spring', stiffness: 500, damping: 35 }
              }
            />
          )}
          {items.map((item, i) => {
            const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');
            return (
              <button
                key={item.title}
                ref={(el) => (itemRefs.current[i] = el)}
                onClick={() => navigate(item.url)}
                className="relative flex items-center justify-center h-12 transition-all duration-300 outline-none"
                style={{ minWidth: isActive ? 56 : 44 }}
              >
                <motion.div
                  className="relative z-10"
                  animate={{
                    scale: isActive ? 1 : 0.9,
                  }}
                  whileTap={{ scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <item.icon
                    className={`h-5 w-5 transition-colors duration-200 ${
                      isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                </motion.div>
              </button>
            );
          })}
          {isAdmin && (
            <button
              onClick={handleSignOut}
              className="relative z-10 flex items-center justify-center h-12 outline-none"
              style={{ minWidth: 44 }}
            >
              <motion.div
                whileTap={{ scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <LogOut className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
              </motion.div>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
