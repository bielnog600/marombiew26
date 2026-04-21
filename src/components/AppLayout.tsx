import React from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentPresence } from '@/hooks/useStudentPresence';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, title }) => {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  // Faz o aluno entrar na presence channel 'students-online' enquanto o app estiver aberto
  useStudentPresence();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {!isMobile && (
            <header className="h-14 flex items-center border-b border-border px-4 shrink-0">
              <SidebarTrigger className="mr-4" />
              {title && <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>}
              <div className="ml-auto flex items-center">
                {role === 'admin' && <NotificationBell />}
              </div>
            </header>
          )}
          {isMobile && role === 'admin' && (
            <header className="h-12 flex items-center justify-between border-b border-border px-4 shrink-0">
              {title && <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>}
              <NotificationBell />
            </header>
          )}
          <main className={`flex-1 overflow-auto ${isMobile ? 'p-4 pb-4' : 'p-4 md:p-6'}`} style={isMobile ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' } : undefined}>
            {children}
          </main>
        </div>
        {isMobile && <BottomNav />}
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
