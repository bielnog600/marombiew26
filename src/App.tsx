import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import AlunoDetail from "./pages/AlunoDetail";
import NovaAvaliacao from "./pages/NovaAvaliacao";
import Relatorio from "./pages/Relatorio";
import MinhaArea from "./pages/MinhaArea";
import PostureAnalysis from "./pages/PostureAnalysis";
import TreinoIA from "./pages/TreinoIA";
import DietaIA from "./pages/DietaIA";
import Alimentos from "./pages/Alimentos";
import DietQuestionnaire from "./pages/DietQuestionnaire";
import Notificacoes from "./pages/Notificacoes";
import WhatsAppWeb from "./pages/WhatsAppWeb";
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <BrowserRouter>
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
              <Route path="/alimentos" element={<ProtectedRoute requiredRole="admin"><Alimentos /></ProtectedRoute>} />
              <Route path="/questionario-dieta" element={<DietQuestionnaire />} />
              <Route path="/notificacoes" element={<ProtectedRoute requiredRole="admin"><Notificacoes /></ProtectedRoute>} />
              <Route path="/minha-area" element={<ProtectedRoute requiredRole="aluno"><MinhaArea /></ProtectedRoute>} />
              <Route path="/minhas-avaliacoes" element={<ProtectedRoute requiredRole="aluno"><MinhaArea /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
