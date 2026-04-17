import React, { useEffect } from 'react';
import logo from '@/assets/logo_marombiew.png';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update().catch(() => {});
        });
      }
      onFinish();
    }, 2200);

    return () => clearTimeout(timer);
  }, [onFinish]);

  const size = 170;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Visible arc (~25% of circle)
  const arc = circumference * 0.25;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background animate-splash-out">
      <div className="relative" style={{ width: size, height: size, animation: 'splash-logo-in 0.7s ease-out' }}>
        <svg
          width={size}
          height={size}
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: '1.2s' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
            fill="none"
            opacity={0.25}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--primary))"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference - arc}`}
          />
        </svg>
        <img
          src={logo}
          alt="MarombiewPro"
          className="absolute inset-0 m-auto rounded-2xl"
          style={{ width: size - 28, height: size - 28 }}
        />
      </div>
    </div>
  );
};

export default SplashScreen;
