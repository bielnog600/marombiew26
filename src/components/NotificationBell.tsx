import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';

const NotificationBell: React.FC = () => {
  const { count, highPriorityCount } = useNotifications();
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate('/notificacoes')}
      title="Notificações"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className={`absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
            highPriorityCount > 0 ? 'bg-destructive animate-pulse' : 'bg-primary'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Button>
  );
};

export default NotificationBell;
