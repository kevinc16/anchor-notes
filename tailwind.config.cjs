/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#fbf8f1',
        card: '#fffefa',
        ink: '#24211d',
        muted: '#777066',
        line: '#e6dfd4',
        anchor: '#ffcf4a',
        mint: '#9bddc8',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};

