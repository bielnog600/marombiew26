import React, { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import logo from '@/assets/logo_marombiew.png';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Iniciando...');

  useEffect(() => {
    const steps = [
      { pct: 20, msg: 'Carregando recursos...' },
      { pct: 50, msg: 'Verificando atualizações...' },
      { pct: 80, msg: 'Preparando aplicativo...' },
      { pct: 100, msg: 'Pronto!' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i].pct);
        setStatus(steps[i].msg);
        i++;
      } else {
        clearInterval(interval);
        // Check for SW update
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) {
              reg.update().catch(() => {});
            }
          });
        }
        setTimeout(onFinish, 400);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <img src={logo} alt="MarombiewPro" className="h-24 w-24 rounded-2xl" />
        <h1 className="text-2xl font-bold text-gradient">MarombiewPro</h1>
        <div className="w-56 space-y-2">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-center">{status}</p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
