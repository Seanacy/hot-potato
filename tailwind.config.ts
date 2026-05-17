import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        potato: {
          bg: '#0a0a0f',
          surface: '#111118',
          'surface-2': '#1a1a24',
          border: '#1e1e2e',
          text: '#e4e4e7',
          muted: '#71717a',
          green: '#22c55e',
          'green-dim': '#16a34a',
          red: '#ef4444',
          'red-dim': '#dc2626',
          amber: '#f59e0b',
          accent: '#f97316',
          'accent-dim': '#ea580c',
        },
      },
    },
  },
  plugins: [],
}
export default config
