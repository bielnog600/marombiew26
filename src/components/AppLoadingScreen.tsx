/** Tela de carregamento visível (nunca preta) enquanto a sessão é conferida. */
const AppLoadingScreen = () => (
  <div role="status" aria-label="Carregando" className="fixed inset-0 z-[50] flex items-center justify-center bg-background">
    <div className="h-12 w-12 rounded-full border-4 border-muted border-t-primary animate-spin" />
  </div>
);
export default AppLoadingScreen;
