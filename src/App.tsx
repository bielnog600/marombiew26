import { useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import InstallBanner from "@/components/InstallBanner";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import AlunoDetail from "./pages/AlunoDetail";
import NovaAvaliacao from "./pages/NovaAvaliacao";
import Relatorio from "./pages/Relatorio";
import MinhaArea from "./pages/MinhaArea";
import MinhasAvaliacoes from "./pages/MinhasAvaliacoes";
import TreinoExecucao from "./pages/TreinoExecucao";
import PostureAnalysis from "./pages/PostureAnalysis";
import TreinoIA from "./pages/TreinoIA";
import DietaIA from "./pages/DietaIA";
import TabataIA from "./pages/TabataIA";
import TabataExecucao from "./pages/TabataExecucao";
import Alimentos from "./pages/Alimentos";
import Exercicios from "./pages/Exercicios";
import DietQuestionnaire from "./pages/DietQuestionnaire";
import Notificacoes from "./pages/Notificacoes";
import Consultoria from "./pages/Consultoria";
import Perfil from "./pages/Perfil";
import MinhasDietas from "./pages/MinhasDietas";
import MeusTreinos from "./pages/MeusTreinos";
import Evolucao from "./pages/Evolucao";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const RootRedirect = () => {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/dashboard' : '/minha-area'} replace />;
};

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashFinish = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    const backgroundToken = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", backgroundToken ? `hsl(${backgroundToken})` : 'hsl(220 20% 7%)');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <InstallBanner />
        <BrowserRouter>
          <div className={showSplash ? '' : 'animate-app-in'}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute requiredRole="admin"><Dashboard /></ProtectedRoute>} />
              <Route path="/alunos" element={<ProtectedRoute requiredRole="admin"><Alunos /></ProtectedRoute>} />
              <Route path="/alunos/:id" element={<ProtectedRoute requiredRole="admin"><AlunoDetail /></ProtectedRoute>} />
              <Route path="/nova-avaliacao/:studentId" element={<ProtectedRoute requiredRole="admin"><NovaAvaliacao /></ProtectedRoute>} />
              <Route path="/avaliacoes" element={<ProtectedRoute requiredRole="admin"><Alunos /></ProtectedRoute>} />
              <Route path="/relatorio/:id" element={<ProtectedRoute><Relatorio /></ProtectedRoute>} />
              <Route path="/postura/:studentId" element={<ProtectedRoute requiredRole="admin"><PostureAnalysis /></ProtectedRoute>} />
              <Route path="/treino-ia/:studentId" element={<ProtectedRoute requiredRole="admin"><TreinoIA /></ProtectedRoute>} />
              <Route path="/dieta-ia/:studentId" element={<ProtectedRoute requiredRole="admin"><DietaIA /></ProtectedRoute>} />
              <Route path="/tabata-ia/:studentId" element={<ProtectedRoute requiredRole="admin"><TabataIA /></ProtectedRoute>} />
              <Route path="/tabata-execucao" element={<ProtectedRoute><TabataExecucao /></ProtectedRoute>} />
              <Route path="/alimentos" element={<ProtectedRoute requiredRole="admin"><Alimentos /></ProtectedRoute>} />
              <Route path="/exercicios" element={<ProtectedRoute requiredRole="admin"><Exercicios /></ProtectedRoute>} />
              <Route path="/questionario-dieta" element={<DietQuestionnaire />} />
              <Route path="/notificacoes" element={<Navigate to="/consultoria" replace />} />
              <Route path="/consultoria" element={<ProtectedRoute requiredRole="admin"><Consultoria /></ProtectedRoute>} />
              
              <Route path="/minha-area" element={<ProtectedRoute requiredRole="aluno"><MinhaArea /></ProtectedRoute>} />
              <Route path="/meus-treinos" element={<ProtectedRoute requiredRole="aluno"><MeusTreinos /></ProtectedRoute>} />
              <Route path="/minhas-avaliacoes" element={<ProtectedRoute requiredRole="aluno"><MinhasAvaliacoes /></ProtectedRoute>} />
              <Route path="/treino-execucao" element={<ProtectedRoute requiredRole="aluno"><TreinoExecucao /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute requiredRole="aluno"><Perfil /></ProtectedRoute>} />
              <Route path="/minhas-dietas" element={<ProtectedRoute requiredRole="aluno"><MinhasDietas /></ProtectedRoute>} />
              <Route path="/evolucao" element={<ProtectedRoute requiredRole="aluno"><Evolucao /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
