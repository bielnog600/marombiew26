import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        tabata: {
          bg: "hsl(var(--tabata-bg) / <alpha-value>)",
          panel: "hsl(var(--tabata-panel) / <alpha-value>)",
          border: "hsl(var(--tabata-border) / <alpha-value>)",
          brand: "hsl(var(--tabata-brand) / <alpha-value>)",
          soft: "hsl(var(--tabata-text-soft) / <alpha-value>)",
          warmup: "hsl(var(--tabata-warmup) / <alpha-value>)",
          moderate: "hsl(var(--tabata-moderate) / <alpha-value>)",
          strong: "hsl(var(--tabata-strong) / <alpha-value>)",
          max: "hsl(var(--tabata-max) / <alpha-value>)",
          rest: "hsl(var(--tabata-rest) / <alpha-value>)",
        },
        score: { bad: "hsl(var(--score-bad))", poor: "hsl(var(--score-poor))", good: "hsl(var(--score-good))", excellent: "hsl(var(--score-excellent))" },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        set: {
          warmup: "hsl(var(--set-warmup))",
          preparatory: "hsl(var(--set-preparatory))",
          recognition: "hsl(var(--set-recognition))",
          work: "hsl(var(--set-work))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "phrase-zoom": {
          "0%": { opacity: "0", transform: "scale(0.4)", filter: "blur(12px)", letterSpacing: "0.6em" },
          "40%": { opacity: "1", transform: "scale(1.15)", filter: "blur(0)", letterSpacing: "0.02em" },
          "70%": { transform: "scale(1)" },
          "100%": { opacity: "1", transform: "scale(1)", filter: "blur(0)", letterSpacing: "0.02em" },
        },
        "phrase-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.95" },
          "50%": { transform: "scale(1.06)", opacity: "1" },
        },
        "shine": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "tabata-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.12)" },
        },
        "route-loading": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "phrase-zoom": "phrase-zoom 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "phrase-breathe": "phrase-breathe 2.4s ease-in-out infinite",
        "shine": "shine 3s linear infinite",
        "route-loading": "route-loading 1.1s ease-in-out infinite",
        "tabata-pulse": "tabata-pulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
