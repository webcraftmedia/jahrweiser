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
        'watercolor-heading': ['Cormorant Garamond', 'serif'],
        'watercolor-body': ['Quicksand', 'sans-serif'],
        'watercolor-accent': ['Dancing Script', 'cursive'],
      },
      colors: {
        // Watercolor palette - Light mode
        watercolor: {
          // Backgrounds
          cream: '#faf9f7',
          paper: '#f5f3ef',
          // Primary - Rose/Pink
          rose: {
            light: '#fce4ec',
            DEFAULT: '#f8bbd9',
            medium: '#f48fb1',
            dark: '#ec407a',
          },
          // Secondary - Sky Blue
          sky: {
            light: '#e3f2fd',
            DEFAULT: '#bbdefb',
            medium: '#90caf9',
            dark: '#42a5f5',
          },
          // Accent - Mint
          mint: {
            light: '#e8f5e9',
            DEFAULT: '#c8e6c9',
            medium: '#a5d6a7',
            dark: '#66bb6a',
          },
          // Accent - Peach
          peach: {
            light: '#fff3e0',
            DEFAULT: '#ffe0b2',
            medium: '#ffcc80',
            dark: '#ffa726',
          },
          // Accent - Lavender
          lavender: {
            light: '#f3e5f5',
            DEFAULT: '#e1bee7',
            medium: '#ce93d8',
            dark: '#ab47bc',
          },
          // Text colors
          charcoal: '#4a4a4a',
          'charcoal-light': '#6b6b6b',
        },
        // Dark mode variants
        'watercolor-dark': {
          bg: '#1a1a2e',
          surface: '#25253d',
          'surface-light': '#2d2d4a',
          rose: '#f48fb1',
          sky: '#90caf9',
          mint: '#a5d6a7',
          peach: '#ffcc80',
          lavender: '#ce93d8',
          text: '#e8e8e8',
          'text-muted': '#a0a0a0',
        },
      },
      animation: {
        'bloom': 'bloom 0.6s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'paint-spread': 'paintSpread 0.8s ease-out forwards',
        'soft-pulse': 'softPulse 3s ease-in-out infinite',
        'color-shift': 'colorShift 8s ease-in-out infinite',
        'gentle-bob': 'gentleBob 4s ease-in-out infinite',
      },
      keyframes: {
        bloom: {
          '0%': { transform: 'scale(0.95)', opacity: '0', filter: 'blur(10px)' },
          '100%': { transform: 'scale(1)', opacity: '1', filter: 'blur(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        paintSpread: {
          '0%': { transform: 'scale(0)', opacity: '0', borderRadius: '50%' },
          '50%': { borderRadius: '40%' },
          '100%': { transform: 'scale(1)', opacity: '1', borderRadius: '20px' },
        },
        softPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        colorShift: {
          '0%, 100%': { filter: 'hue-rotate(0deg)' },
          '50%': { filter: 'hue-rotate(15deg)' },
        },
        gentleBob: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-3px) rotate(0.5deg)' },
          '75%': { transform: 'translateY(3px) rotate(-0.5deg)' },
        },
      },
      boxShadow: {
        'watercolor': '0 4px 20px -5px rgba(248, 187, 217, 0.4)',
        'watercolor-lg': '0 10px 40px -10px rgba(248, 187, 217, 0.5)',
        'watercolor-sky': '0 4px 20px -5px rgba(144, 202, 249, 0.4)',
        'watercolor-mint': '0 4px 20px -5px rgba(165, 214, 167, 0.4)',
        'watercolor-peach': '0 4px 20px -5px rgba(255, 204, 128, 0.4)',
        'watercolor-lavender': '0 4px 20px -5px rgba(206, 147, 216, 0.4)',
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07)',
        'soft-lg': '0 10px 30px -5px rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        'soft': '20px',
        'softer': '30px',
        'blob': '60% 40% 30% 70% / 60% 30% 70% 40%',
      },
      backgroundImage: {
        'gradient-watercolor': 'linear-gradient(135deg, #fce4ec 0%, #e3f2fd 50%, #e8f5e9 100%)',
        'gradient-watercolor-dark': 'linear-gradient(135deg, #2d2d4a 0%, #1a1a2e 50%, #25253d 100%)',
        'gradient-rose': 'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
        'gradient-sky': 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
        'gradient-mint': 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
        'gradient-peach': 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
        'gradient-lavender': 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
