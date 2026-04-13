import React, { useState, useEffect } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Button } from '@/components/ui/button';
import { Download, Share, X } from 'lucide-react';

const InstallBanner = () => {
  const { canPrompt, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('install_banner_dismissed');
    if (wasDismissed) {
      const dismissedAt = parseInt(wasDismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('install_banner_dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) setDismissed(true);
  };

  if (isInstalled || dismissed) return null;
  if (!canPrompt && !isIOS) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 animate-fade-in">
      <div className="bg-card border border-border rounded-xl p-3 shadow-lg flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Instalar App</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground">
              Toque em <Share className="inline h-3 w-3" /> e depois "Adicionar à Tela de Início"
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Acesse offline, mais rápido</p>
          )}
        </div>
        {canPrompt && (
          <Button size="sm" onClick={handleInstall} className="shrink-0">
            Instalar
          </Button>
        )}
        <button onClick={handleDismiss} className="text-muted-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallBanner;
