import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const appVersion = Date.now().toString();

const appVersionPlugin = (): Plugin => ({
  name: "app-version",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "app-version.json",
      source: JSON.stringify({ version: appVersion }),
    });
  },
  transformIndexHtml(html: string) {
    return html.replace("</head>", `    <meta name="app-version" content="${appVersion}">\n</head>`);
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    appVersionPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      filename: "sw.js",
      registerType: "prompt",
      // Registro feito em main.tsx (Workbox direto); o plugin não injeta o seu.
      injectRegister: null,
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],
      devOptions: {
        enabled: false,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/~oauth/, /^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/onesignal\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,jpg,jpeg,webp,webmanifest}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 2,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Imagens de exercícios e fotos hospedadas no Supabase Storage
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*\.(png|jpg|jpeg|webp|svg|gif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-images",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: "MAROMBIEW",
        short_name: "MAROMBIEW",
        description: "Treino e dieta personalizada",
        theme_color: "#0F1115",
        background_color: "#0F1115",
        display: "standalone",
         orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    modulePreload: {
      polyfill: false
    },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Small shared helpers must load with React; otherwise the first heavy chunk that
          // uses them (recharts, jspdf) gets pulled into the initial load.
          if (id.includes("commonjsHelpers") || id.includes("vite/preload-helper")) return "vendor";
          if (!id.includes("node_modules")) return undefined;
          const has = (...pkgs: string[]) => pkgs.some((pkg) => id.includes(`/node_modules/${pkg}/`));
          if (has("@babel/runtime", "clsx", "use-sync-external-store")) return "vendor";
          if (has("three", "@react-three/fiber", "@react-three/drei")) return "three";
          if (has("recharts")) return "recharts";
          if (has("jspdf", "jspdf-autotable")) return "jspdf";
          if (has("@zxing/browser", "@zxing/library")) return "zxing";
          if (has("hls.js")) return "hls";
          if (has("framer-motion")) return "framer-motion";
          if (
            has("react", "react-dom", "react-router", "react-router-dom", "scheduler", "@supabase", "@tanstack") ||
            id.includes("/node_modules/@radix-ui/")
          ) return "vendor";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
