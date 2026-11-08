import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TabSwipeProvider } from "@/contexts/TabSwipeContext";
import { AdminTrainerSessionProvider } from "@/contexts/AdminTrainerSessionContext";
import AdminTrainerSessionMount from "@/components/training/AdminTrainerSessionMount";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreenContainer from "@/components/SplashScreen";
import InstallBanner from "@/components/InstallBanner";
import OfflineIndicator from "@/components/OfflineIndicator";
import ScrollToTop from "@/components/ScrollToTop";
import PushNotificationsInit from "@/components/PushNotificationsInit";
import StudentAppOpenTracker from "@/components/StudentAppOpenTracker";
import { LanguageProvider } from "@/i18n";
import AutoTranslate from "@/i18n/AutoTranslate";
import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Alunos = lazy(() => import("./pages/Alunos"));
const AlunoDetail = lazy(() => import("./pages/AlunoDetail"));
const NovaAvaliacao = lazy(() => import("./pages/NovaAvaliacao"));
const Relatorio = lazy(() => import("./pages/Relatorio"));
const MinhaArea = lazy(() => import("./pages/MinhaArea"));
const MinhasAvaliacoes = lazy(() => import("./pages/MinhasAvaliacoes"));
const TreinoExecucao = lazy(() => import("./pages/TreinoExecucao"));
const PostureAnalysis = lazy(() => import("./pages/PostureAnalysis"));
const TreinoIA = lazy(() => import("./pages/TreinoIA"));
const DietaIA = lazy(() => import("./pages/DietaIA"));
const TabataIA = lazy(() => import("./pages/TabataIA"));
const TabataExecucao = lazy(() => import("./pages/TabataExecucao"));
const CardioIA = lazy(() => import("./pages/CardioIA"));
const CardioExecucao = lazy(() => import("./pages/CardioExecucao"));
const Alimentos = lazy(() => import("./pages/Alimentos"));
const Exercicios = lazy(() => import("./pages/Exercicios"));
const ExerciseMetadataReview = lazy(() => import("./pages/ExerciseMetadataReview"));
const HumanFirstReview = lazy(() => import("./pages/HumanFirstReview"));
const HumanFirstReviewPreflight = lazy(() => import("./pages/HumanFirstReviewPreflight"));
const DietQuestionnaire = lazy(() => import("./pages/DietQuestionnaire"));
const Notificacoes = lazy(() => import("./pages/Notificacoes"));
const Consultoria = lazy(() => import("./pages/Consultoria"));
const Perfil = lazy(() => import("./pages/Perfil"));
const MinhasDietas = lazy(() => import("./pages/MinhasDietas"));
const MeusTreinos = lazy(() => import("./pages/MeusTreinos"));
const TreinoPreview = lazy(() => import("./pages/TreinoPreview"));
const Evolucao = lazy(() => import("./pages/Evolucao"));
const MeuProgresso = lazy(() => import("./pages/MeuProgresso"));

const NotFound = lazy(() => import("./pages/NotFound"));
const Agenda = lazy(() => import("./pages/Agenda"));
const MinhaAgenda = lazy(() => import("./pages/MinhaAgenda"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const RedeSocial = lazy(() => import("./pages/RedeSocial"));
import StudentErrorBoundary from "./components/StudentErrorBoundary";

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
        {showSplash && <SplashScreenContainer onFinish={handleSplashFinish} />}
        <OfflineIndicator />
        <InstallBanner />
        <BrowserRouter>
          <ScrollToTop />
          <div>
          <AuthProvider>
            <LanguageProvider>
            <AutoTranslate />
            <TabSwipeProvider>
            <AdminTrainerSessionProvider>
            <PushNotificationsInit />
            <StudentAppOpenTracker />
            <AdminTrainerSessionMount />
            <StudentErrorBoundary>
            <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>}>
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
              <Route path="/cardio-ia/:studentId" element={<ProtectedRoute requiredRole="admin"><CardioIA /></ProtectedRoute>} />
              <Route path="/cardio-execucao" element={<ProtectedRoute><CardioExecucao /></ProtectedRoute>} />
              <Route path="/alimentos" element={<ProtectedRoute requiredRole="admin"><Alimentos /></ProtectedRoute>} />
              <Route path="/alimentos-escaneados" element={<Navigate to="/alimentos?aba=escaneados" replace />} />
              <Route path="/exercicios" element={<ProtectedRoute requiredRole="admin"><Exercicios /></ProtectedRoute>} />
              <Route path="/exercicios/metadados" element={<ProtectedRoute requiredRole="admin"><ExerciseMetadataReview /></ProtectedRoute>} />
              <Route path="/exercicios/metadados/human-first" element={<ProtectedRoute requiredRole="admin"><HumanFirstReview /></ProtectedRoute>} />
              <Route path="/exercicios/metadados/human-first/preflight" element={<ProtectedRoute requiredRole="admin"><HumanFirstReviewPreflight /></ProtectedRoute>} />
              <Route path="/questionario-dieta" element={<DietQuestionnaire />} />
              <Route path="/notificacoes" element={<Navigate to="/consultoria" replace />} />
              <Route path="/consultoria" element={<ProtectedRoute requiredRole="admin"><Consultoria /></ProtectedRoute>} />
              <Route path="/agenda" element={<ProtectedRoute requiredRole="admin"><Agenda /></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute requiredRole="admin"><Financeiro /></ProtectedRoute>} />
              <Route path="/rede-social" element={<ProtectedRoute requiredRole="admin"><RedeSocial /></ProtectedRoute>} />
              
              <Route path="/minha-area" element={<ProtectedRoute requiredRole="aluno"><MinhaArea /></ProtectedRoute>} />
              <Route path="/meus-treinos" element={<ProtectedRoute requiredRole="aluno"><MeusTreinos /></ProtectedRoute>} />
              <Route path="/minhas-avaliacoes" element={<ProtectedRoute requiredRole="aluno"><MinhasAvaliacoes /></ProtectedRoute>} />
              <Route path="/treino-execucao" element={<ProtectedRoute requiredRole="aluno"><TreinoExecucao /></ProtectedRoute>} />
              <Route path="/treino-preview" element={<ProtectedRoute requiredRole="aluno"><TreinoPreview /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute requiredRole="aluno"><Perfil /></ProtectedRoute>} />
              <Route path="/minhas-dietas" element={<ProtectedRoute requiredRole="aluno"><MinhasDietas /></ProtectedRoute>} />
              <Route path="/evolucao" element={<ProtectedRoute requiredRole="aluno"><Evolucao /></ProtectedRoute>} />
              <Route path="/meu-progresso" element={<ProtectedRoute requiredRole="aluno"><MeuProgresso /></ProtectedRoute>} />
              <Route path="/minha-agenda" element={<ProtectedRoute requiredRole="aluno"><MinhaAgenda /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </StudentErrorBoundary>
            </AdminTrainerSessionProvider>
            </TabSwipeProvider>
            </LanguageProvider>
          </AuthProvider>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
