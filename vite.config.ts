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
      filename: "app-sw.js",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],
      devOptions: {
        enabled: false,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/~oauth/, /^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/onesignal\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,jpg,jpeg,webp}"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
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
        orientation: "portrait-primary",
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
