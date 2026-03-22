import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, ScanLine, LogOut, User, Apple } from 'lucide-react';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Alimentos', url: '/alimentos', icon: Apple },
];

const alunoItems = [
  { title: 'Minha Área', url: '/minha-area', icon: LayoutDashboard },
  { title: 'Avaliações', url: '/minhas-avaliacoes', icon: ClipboardList },
];

const BottomNav: React.FC = () => {
  const { role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = role === 'admin' ? adminItems : alunoItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-14">
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
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] text-muted-foreground"
        >
          <LogOut className="h-5 w-5" />
          <span>Sair</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
