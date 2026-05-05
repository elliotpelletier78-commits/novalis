/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#090C0F',
        pearl:    '#EDE8DF',
        copper:   '#A86844',
        slate:    '#1D2733',
        dim:      '#4A5260',
        'copper-light': '#C4895A',
        'slate-light':  '#253345',
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
        'copper-glow': '0 0 60px rgba(168,104,68,0.25)',
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
