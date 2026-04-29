import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.bd351d2ca0ba4d9590f681bcd1b438ec",
  appName: "marombiew26",
  webDir: "dist",
  server: {
    url: "https://bd351d2c-a0ba-4d95-90f6-81bcd1b438ec.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  ios: {
    // Bloqueia rota\u00e7\u00e3o no iOS \u2014 apenas retrato.
    contentInset: "always",
  },
  android: {
    // Bloqueia rota\u00e7\u00e3o no Android \u2014 apenas retrato.
    allowMixedContent: true,
  },
};

export default config;