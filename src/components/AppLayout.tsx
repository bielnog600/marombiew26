import React from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import BottomNav from '@/components/BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, title }) => {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 shrink-0">
            {!isMobile && <SidebarTrigger className="mr-4" />}
            {title && <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>}
          </header>
          <main className={`flex-1 p-4 md:p-6 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
            {children}
          </main>
        </div>
        {isMobile && <BottomNav />}
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
