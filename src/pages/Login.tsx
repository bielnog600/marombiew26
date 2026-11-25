import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuthViewport } from '@/hooks/useAuthViewport';
import './cadastro.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const { signIn, user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tela = useAuthViewport<HTMLDivElement>();
  const wantsSignup = ['signup', 'cadastro', 'register'].includes((searchParams.get('tab') || searchParams.get('mode') || '').toLowerCase());

  useEffect(() => {
    if (!authLoading && user) {
      navigate(role === 'admin' ? '/dashboard' : '/minha-area', { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Preencha todos os campos'); return; }

    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error('Email ou senha inválidos');
        return;
      }
    } catch (error) {
      console.error('Erro no login:', error);
      toast.error('Erro inesperado no login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const recuperarSenha = async () => {
    if (!email.trim()) {
      toast.error('Digite seu e-mail para recuperar a senha');
      return;
    }
    setRecuperando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success('Enviamos um link de recuperação para seu e-mail.');
    } catch (error) {
      console.error('Erro ao recuperar senha:', error);
      toast.error('Não foi possível enviar a recuperação. Tente novamente.');
    } finally {
      setRecuperando(false);
    }
  };

  if (wantsSignup) return <Navigate to="/cadastro" replace />;

  return (
    <div className="cad" ref={tela} data-no-translate>
      <main className="card login-card">
        <div className="hero">
          <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1000&q=80" alt="" />
          <div className="marca"><span className="selo">App de treino e dieta</span><h1>MAROMBIEW</h1></div>
        </div>
        <div className="corpo">
          <h2>Bom te ver de <span>volta</span></h2>
          <p className="sub">Acesse sua conta pra ver seu treino e sua dieta.</p>
          <form onSubmit={handleLogin} className="login-form" noValidate>
            <div className="etapa login-etapa">
              <div className="campo"><Mail /><input aria-label="E-mail" type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="campo"><Lock /><input aria-label="Senha" type={verSenha ? 'text' : 'password'} placeholder="Senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="olho" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <button type="button" className="esqueci" onClick={recuperarSenha} disabled={recuperando}>{recuperando ? 'Enviando...' : 'Esqueci minha senha'}</button>
              <div className="acoes">
                <button type="submit" className="botao" disabled={loading || recuperando}>
                  {loading && <Loader2 size={18} className="animate-spin" />}{loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </div>
          </form>
          <p className="rodape">Não tem conta? <Link to="/cadastro">Criar conta</Link></p>
          <p className="assina">MAROMBIEW · @marombiew</p>
        </div>
      </main>
    </div>
  );
};

export default Login;
