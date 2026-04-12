import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, User, Bell, Briefcase, LogOut, Home, Dumbbell, UtensilsCrossed } from 'lucide-react';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Consultoria', url: '/consultoria', icon: Briefcase },
  { title: 'Alertas', url: '/notificacoes', icon: Bell },
];

const alunoItems = [
  { title: 'Home', url: '/minha-area', icon: Home },
  { title: 'Treinos', url: '/treino-execucao', icon: Dumbbell },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-14 items-center justify-around px-1">
        {items.map((item) => {
          const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');
          return (
            <button
              key={item.title}
              onClick={() => navigate(item.url)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.title}</span>
            </button>
          );
        })}
        {isAdmin && (
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;
