import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Las librerías base van en archivos aparte: cambian poco, así que el teléfono las guarda entre publicaciones
// y después de cada actualización solo descarga el código de VINKA que cambió.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'react'
          if (/node_modules\/@supabase\//.test(id)) return 'supabase'
          return undefined
        },
      },
    },
  },
})
