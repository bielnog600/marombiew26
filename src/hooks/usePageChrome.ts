import { useEffect } from 'react';

interface UsePageChromeOptions {
  safeAreaBackground: string;
  themeColor?: string;
}

const getThemeColorFromToken = (tokenName: string) => {
  const token = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  return token ? `hsl(${token})` : 'hsl(220 20% 7%)';
};

export const usePageChrome = ({ safeAreaBackground, themeColor }: UsePageChromeOptions) => {
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const defaultThemeColor = getThemeColorFromToken('--background');

    document.documentElement.style.setProperty('--safe-area-top-background', safeAreaBackground);
    metaThemeColor?.setAttribute('content', themeColor ?? defaultThemeColor);

    return () => {
      document.documentElement.style.setProperty('--safe-area-top-background', defaultThemeColor);
      metaThemeColor?.setAttribute('content', defaultThemeColor);
    };
  }, [safeAreaBackground, themeColor]);
};