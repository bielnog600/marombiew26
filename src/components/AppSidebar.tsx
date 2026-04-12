import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { LayoutDashboard, Users, ClipboardList, User, LogOut, Dumbbell, Target, Clock, ScanLine, Bot, Apple, Bell, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Alimentos', url: '/alimentos', icon: Apple },
  { title: 'Notificações', url: '/notificacoes', icon: Bell },
  { title: 'Consultoria', url: '/consultoria', icon: Briefcase },
];

const alunoItems = [
  { title: 'Minha Área', url: '/minha-area', icon: LayoutDashboard },
  { title: 'Minhas Avaliações', url: '/minhas-avaliacoes', icon: ClipboardList },
  { title: 'Perfil', url: '/perfil', icon: User },
];

const futureItems: any[] = [];

export function AppSidebar() {
  const { role, signOut, user } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const items = role === 'admin' ? adminItems : alunoItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-3 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shrink-0">
              <Dumbbell className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && <span className="text-lg font-bold text-foreground">MarombiewPro</span>}
          </div>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-secondary"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Em Breve</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {futureItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton disabled className="opacity-40 cursor-not-allowed">
                    <item.icon className="mr-2 h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="mb-2 text-xs text-muted-foreground truncate px-2">
            {user?.email}
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          onClick={handleSignOut}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
