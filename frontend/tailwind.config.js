/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#F4F7FC',
        pearl:    '#0B1A2E',
        copper:   '#2860E8',
        slate:    '#FFFFFF',
        dim:      '#4E6880',
        'copper-light': '#1A4BD4',
        'slate-light':  '#E8F0FC',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '8xl':  ['6rem',   { lineHeight: '1' }],
        '9xl':  ['8rem',   { lineHeight: '1' }],
        '10xl': ['10rem',  { lineHeight: '0.9' }],
      },
      boxShadow: {
        'diffuse': '0 40px 80px rgba(0,0,0,0.6)',
        'copper-glow': '0 0 60px rgba(40,96,232,0.3)',
      },
      borderWidth: {
        'half': '0.5px',
      },
      animation: {
        'counter': 'counter 2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
