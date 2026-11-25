import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login';

const { auth, signIn, resetPassword, toastError, toastSuccess } = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, role: null as null | 'admin' | 'aluno', loading: false },
  signIn: vi.fn(),
  resetPassword: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...auth, signIn }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { resetPasswordForEmail: resetPassword } } }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

function renderLogin(inicial = '/login') {
  return render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<div>Cadastro novo</div>} />
        <Route path="/dashboard" element={<div>Dashboard admin</div>} />
        <Route path="/minha-area" element={<div>Área do aluno</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('tela de login', () => {
  beforeEach(() => {
    auth.user = null;
    auth.role = null;
    auth.loading = false;
    signIn.mockReset().mockResolvedValue({ error: null });
    resetPassword.mockReset().mockResolvedValue({ error: null });
    toastError.mockReset();
    toastSuccess.mockReset();
  });
  afterEach(cleanup);

  it('remove as abas e oferece navegação real para o cadastro', () => {
    renderLogin();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bom te ver de volta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('mantém o envio do e-mail e da senha ao entrar', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluno@exemplo.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('aluno@exemplo.com', '12345678'));
  });

  it('mostra e oculta a senha sem alterar o valor', () => {
    renderLogin();
    const campo = screen.getByLabelText('Senha');
    fireEvent.change(campo, { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveValue('segredo');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('envia recuperação somente depois de informar o e-mail', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    expect(resetPassword).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Digite seu e-mail para recuperar a senha');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ALUNO@EXEMPLO.COM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('aluno@exemplo.com', {
      redirectTo: `${window.location.origin}/login`,
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Enviamos um link de recuperação para seu e-mail.');
  });

  it('mantém os redirecionamentos antigos para o cadastro', () => {
    renderLogin('/login?tab=signup');
    expect(screen.getByText('Cadastro novo')).toBeInTheDocument();
  });

  it.each([['admin', '/dashboard', 'Dashboard admin'], ['aluno', '/minha-area', 'Área do aluno']] as const)(
    'preserva o destino do papel %s', async (role, _rota, texto) => {
      auth.user = { id: 'usuario' };
      auth.role = role;
      renderLogin();
      expect(await screen.findByText(texto)).toBeInTheDocument();
    },
  );
});
