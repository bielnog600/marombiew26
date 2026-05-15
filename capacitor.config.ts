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
     contentInset: "always",
   },
   android: {
     allowMixedContent: true,
   },
   plugins: {
     ScreenOrientation: {
       orientation: "portrait"
     }
   }
};

export default config;