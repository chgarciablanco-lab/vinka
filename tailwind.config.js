/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rosa: { DEFAULT: '#E83E83', accion: '#D02E72', texto: '#B0245F', oscuro: '#8A1B4A', palido: '#FFF0F6', fondo: '#FFF9FB', borde: '#F3DCE7' },
        naranja: { DEFAULT: '#FF941E', palido: '#FFF4E8', texto: '#7A4100' },
        tinta: { DEFAULT: '#17131A', 2: '#2E2532', 3: '#4A3F4E', suave: '#6B5F6E' },
        morado: '#302538',
        linea: '#D6CBD3',
      },
      fontFamily: { display: ['Poppins', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
