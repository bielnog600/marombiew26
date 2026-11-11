import { useState, useCallback, useEffect, Suspense } from "react";
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
import { lazyWithRetry } from "@/lib/appUpdate/lazyWithRetry";
import { preloadWhenIdle } from "@/lib/appUpdate/idlePreload";
import AppUpdateToast from "@/components/AppUpdateToast";
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const CorrecaoAoVivoTeste = lazyWithRetry(() => import("./pages/CorrecaoAoVivoTeste"));
const PesarRefeicaoTeste = lazyWithRetry(() => import("./pages/PesarRefeicaoTeste"));
const Alunos = lazyWithRetry(() => import("./pages/Alunos"));
const AlunoDetail = lazyWithRetry(() => import("./pages/AlunoDetail"));
const NovaAvaliacao = lazyWithRetry(() => import("./pages/NovaAvaliacao"));
const Relatorio = lazyWithRetry(() => import("./pages/Relatorio"));
const MinhaArea = lazyWithRetry(() => import("./pages/MinhaArea"));
const MinhasAvaliacoes = lazyWithRetry(() => import("./pages/MinhasAvaliacoes"));
const TreinoExecucao = lazyWithRetry(() => import("./pages/TreinoExecucao"));
const PostureAnalysis = lazyWithRetry(() => import("./pages/PostureAnalysis"));
const TreinoIA = lazyWithRetry(() => import("./pages/TreinoIA"));
const DietaIA = lazyWithRetry(() => import("./pages/DietaIA"));
const TabataIA = lazyWithRetry(() => import("./pages/TabataIA"));
const TabataExecucao = lazyWithRetry(() => import("./pages/TabataExecucao"));
const CardioIA = lazyWithRetry(() => import("./pages/CardioIA"));
const CardioExecucao = lazyWithRetry(() => import("./pages/CardioExecucao"));
const Alimentos = lazyWithRetry(() => import("./pages/Alimentos"));
const Exercicios = lazyWithRetry(() => import("./pages/Exercicios"));
const ExerciseMetadataReview = lazyWithRetry(() => import("./pages/ExerciseMetadataReview"));
const HumanFirstReview = lazyWithRetry(() => import("./pages/HumanFirstReview"));
const HumanFirstReviewPreflight = lazyWithRetry(() => import("./pages/HumanFirstReviewPreflight"));
const DietQuestionnaire = lazyWithRetry(() => import("./pages/DietQuestionnaire"));
const Notificacoes = lazyWithRetry(() => import("./pages/Notificacoes"));
const Consultoria = lazyWithRetry(() => import("./pages/Consultoria"));
const Perfil = lazyWithRetry(() => import("./pages/Perfil"));
const MinhasDietas = lazyWithRetry(() => import("./pages/MinhasDietas"));
const MeusTreinos = lazyWithRetry(() => import("./pages/MeusTreinos"));
const TreinoPreview = lazyWithRetry(() => import("./pages/TreinoPreview"));
const Evolucao = lazyWithRetry(() => import("./pages/Evolucao"));
const MeuProgresso = lazyWithRetry(() => import("./pages/MeuProgresso"));

const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Agenda = lazyWithRetry(() => import("./pages/Agenda"));
const MinhaAgenda = lazyWithRetry(() => import("./pages/MinhaAgenda"));
const Financeiro = lazyWithRetry(() => import("./pages/Financeiro"));
const RedeSocial = lazyWithRetry(() => import("./pages/RedeSocial"));
import StudentErrorBoundary from "./components/StudentErrorBoundary";

const queryClient = new QueryClient();

/** Carregamento de tela sem piscar: mantém o fundo do app e mostra só uma barra fina no topo. */
const RouteLoadingBar = () => (
  <div role="status" aria-label="Carregando" className="min-h-screen bg-background">
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/20 pt-[env(safe-area-inset-top)]">
      <div className="h-full w-1/3 animate-route-loading bg-primary" />
    </div>
  </div>
);

/** Depois do login, baixa as telas principais quando o aparelho estiver ocioso. */
const RoutePreloader = () => {
  const { user, role, loading } = useAuth();
  useEffect(() => {
    if (loading || !user || !role) return;
    const screens = role === 'admin'
      ? [Alunos, AlunoDetail]
      : [MeusTreinos, TreinoExecucao, MinhasDietas, Evolucao, MeuProgresso];
    return preloadWhenIdle(screens.map(screen => screen.preload));
  }, [loading, user?.id, role]);
  return null;
};

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
        <BrowserRouter future={{ v7_startTransition: true }}>
          <ScrollToTop />
          <div>
          <AuthProvider>
            <LanguageProvider>
            <AutoTranslate />
            <TabSwipeProvider>
            <AdminTrainerSessionProvider>
            <AppUpdateToast />
            <RoutePreloader />
            <PushNotificationsInit />
            <StudentAppOpenTracker />
            <AdminTrainerSessionMount />
            <StudentErrorBoundary>
            <Suspense fallback={<RouteLoadingBar />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute requiredRole="admin"><Dashboard /></ProtectedRoute>} />
              <Route path="/correcao-ao-vivo-teste" element={<ProtectedRoute requiredRole="admin"><CorrecaoAoVivoTeste /></ProtectedRoute>} />
              <Route path="/pesar-refeicao-teste" element={<ProtectedRoute requiredRole="admin"><PesarRefeicaoTeste /></ProtectedRoute>} />
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
