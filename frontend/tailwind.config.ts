import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/components/**/*.{js,vue,ts}',
    './src/layouts/**/*.vue',
    './src/pages/**/*.vue',
    './src/plugins/**/*.{js,ts}',
    './src/app.vue',
    './src/error.vue',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        'sketch-heading': ['Caveat', 'cursive'],
        'sketch-body': ['Patrick Hand', 'cursive'],
        'sketch-accent': ['Kalam', 'cursive'],
      },
      colors: {
        paper: {
          light: '#faf8f3',
          dark: '#2d2a24',
          lines: '#e8e0d5',
          'lines-dark': '#3d3830',
        },
        ink: {
          dark: '#2c2416',
          light: '#f5f0e6',
          blue: '#4a6fa5',
          'blue-dark': '#6a8fc5',
          red: '#a54a4a',
          'red-dark': '#c56a6a',
          green: '#4a7a5a',
          'green-dark': '#6a9a7a',
        },
        accent: {
          gold: '#c9a227',
          'gold-dark': '#e9c247',
          terracotta: '#c67b5c',
          'terracotta-dark': '#e69b7c',
          sage: '#87a878',
          'sage-dark': '#a7c898',
        },
      },
      animation: {
        wobble: 'wobble 0.5s ease-in-out',
        'wobble-slow': 'wobble 1s ease-in-out infinite',
        draw: 'draw 0.8s ease-out forwards',
        pop: 'pop 0.3s ease-out',
        scribble: 'scribble 0.3s ease-in-out',
        'fade-slide': 'fadeSlide 0.4s ease-out',
        'unfold': 'unfold 0.3s ease-out',
        'pencil-write': 'pencilWrite 1.5s ease-in-out infinite',
        'check-draw': 'checkDraw 0.4s ease-out forwards',
        'underline-draw': 'underlineDraw 0.3s ease-out forwards',
      },
      keyframes: {
        wobble: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-2deg)' },
          '75%': { transform: 'rotate(2deg)' },
        },
        draw: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scribble: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px)' },
          '75%': { transform: 'translateX(2px)' },
        },
        fadeSlide: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        unfold: {
          '0%': { transform: 'scaleY(0) rotateX(-10deg)', opacity: '0', transformOrigin: 'top' },
          '100%': { transform: 'scaleY(1) rotateX(0deg)', opacity: '1', transformOrigin: 'top' },
        },
        pencilWrite: {
          '0%': { transform: 'translateX(0) rotate(-45deg)' },
          '50%': { transform: 'translateX(10px) rotate(-45deg)' },
          '100%': { transform: 'translateX(0) rotate(-45deg)' },
        },
        checkDraw: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
        underlineDraw: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
      boxShadow: {
        'sketchy': '3px 3px 0 rgba(44, 36, 22, 0.2)',
        'sketchy-dark': '3px 3px 0 rgba(245, 240, 230, 0.1)',
        'sketchy-hover': '4px 4px 0 rgba(44, 36, 22, 0.25)',
        'sketchy-hover-dark': '4px 4px 0 rgba(245, 240, 230, 0.15)',
      },
      borderRadius: {
        'sketchy': '255px 15px 225px 15px/15px 225px 15px 255px',
        'sketchy-sm': '15px 255px 15px 225px/225px 15px 255px 15px',
      },
    },
  },
  plugins: [],
} satisfies Config
