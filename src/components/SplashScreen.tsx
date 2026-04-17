import React, { useEffect, useState } from 'react';
import logo from '@/assets/logo_marombiew.png';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [20, 50, 80, 100];
    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i]);
        i++;
      } else {
        clearInterval(interval);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) reg.update().catch(() => {});
          });
        }
        setTimeout(onFinish, 400);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [onFinish]);

  const size = 140;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      <div className="relative animate-fade-in" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
            fill="none"
            opacity={0.3}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--primary))"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
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
