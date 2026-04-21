import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Joins the 'students-online' realtime channel so admins can see who is currently online.
 * Should be mounted once per aluno session (e.g. in the aluno layout).
 */
export const useStudentPresence = () => {
  const { user, role } = useAuth();

  useEffect(() => {
    if (!user || role !== 'aluno') return;

    const channel = supabase.channel('students-online', {
      config: { presence: { key: user.id } },
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role]);
};