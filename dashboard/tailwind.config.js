/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        flow: {
          darkest: '#05080f',
          dark: '#080d1a',
          surface: '#0b1325',
          card: '#0e172e',
          panel: '#101c36',
          border: '#1a2744',
          'border-light': '#25355a',
          cyan: '#00f2fe',
          blue: '#38bdf8',
          accent: '#0ea5e9',
          neon: '#06b6d4',
          emerald: '#10b981',
          green: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          muted: '#64748b',
          subtle: '#94a3b8',
        }
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -4px rgba(6, 182, 212, 0.45)',
        'glow-blue': '0 0 30px -4px rgba(56, 189, 248, 0.4)',
        'glow-emerald': '0 0 25px -4px rgba(16, 185, 129, 0.4)',
        'glow-card': '0 8px 32px 0 rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        'glow-subtle': '0 4px 20px -2px rgba(14, 165, 233, 0.15)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'SF Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'flow-dash': 'flowDash 20s linear infinite',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { opacity: '0.9', filter: 'drop-shadow(0 0 12px rgba(6, 182, 212, 0.6))' },
          '50%': { opacity: '0.6', filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.3))' },
        },
        flowDash: {
          to: { strokeDashoffset: '-1000' }
        }
      }
    },
  },
  plugins: [],
}
