import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, ClipboardList, User, Bell, Briefcase, LogOut,
  Home, Dumbbell, UtensilsCrossed, Heart,
} from 'lucide-react';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Consultoria', url: '/consultoria', icon: Briefcase },
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
        <div className="flex items-center justify-around px-2 h-14">
          {items.map((item) => {
            const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');
            return (
              <button
                key={item.title}
                onClick={() => navigate(item.url)}
                className="relative flex items-center justify-center h-12 transition-all duration-300 outline-none"
                style={{ minWidth: isActive ? 56 : 44 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-2xl bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
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
              className="relative flex items-center justify-center h-12 outline-none"
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
