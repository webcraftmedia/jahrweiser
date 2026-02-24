import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./src/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Abril Fatface"', 'Georgia', 'serif'],
        hand: ['"Permanent Marker"', 'cursive'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#1e293b', light: '#334155', dark: '#0f172a' },
        ivory: { DEFAULT: '#faf5eb', dark: '#f5edd9' },
        sienna: { DEFAULT: '#c2410c', light: '#ea580c', dark: '#9a3412' },
        mustard: { DEFAULT: '#d97706', light: '#f59e0b', dark: '#b45309' },
        olive: { DEFAULT: '#65a30d', light: '#84cc16', dark: '#4d7c0f' },
        plum: { DEFAULT: '#7e22ce', light: '#9333ea', dark: '#6b21a8' },
        craft: { DEFAULT: '#0d9488', light: '#14b8a6', dark: '#0f766e' },
        poster: {
          bg: '#faf5eb',
          dark: '#1a1714',
          darkCard: '#2a2520',
          darkBorder: '#3d3630',
          darkMuted: '#a8937e',
        },
      },
    },
  },
} satisfies Config
