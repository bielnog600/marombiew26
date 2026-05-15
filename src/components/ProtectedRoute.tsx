import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'aluno';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      const boot = document.getElementById('boot-splash');
      if (boot) {
        boot.classList.add('boot-leaving');
        setTimeout(() => {
          boot.remove();
          sessionStorage.setItem('_splashDone', '1');
        }, 340);
      }
    }
  }, [loading]);

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === 'admin' ? '/dashboard' : '/minha-area'} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
