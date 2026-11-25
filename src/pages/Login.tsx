import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logoMarombiew from '@/assets/logo_marombiew.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  if (wantsSignup) return <Navigate to="/cadastro" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex justify-center">
          <img src={logoMarombiew} alt="Marombiew" className="h-32 w-auto object-contain" />
        </div>

        <Card className="glass-card">
          <Tabs defaultValue="login">
            <TabsList className="w-full bg-secondary">
              <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
              <Link
                to="/cadastro"
                className="flex-1 inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground touch-manipulation"
              >
                Cadastrar
              </Link>
            </TabsList>

            <TabsContent value="login">
              <CardHeader className="text-center pt-4 pb-2">
                <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
                <CardDescription>Acesse sua conta</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full font-semibold" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </CardContent>
            </TabsContent>

          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Login;
