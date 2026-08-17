/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#0b0f1a',
        panel: '#131a29',
        'panel-raised': '#1c2536',
        border: {
          DEFAULT: '#212a3d',
          strong: '#2f3b52',
        },
        content: {
          primary: '#efe7d8',
          secondary: '#a89e8c',
          tertiary: '#6f6858',
        },
        gold: {
          DEFAULT: '#c9a466',
          light: '#d9bd85',
          dark: '#a8823f',
        },
        status: {
          rehearsal: '#f59e0b',
          'stage-rehearsal': '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
}
