// Configuración común de las pruebas de pantalla
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, 'resultados') + path.sep // capturas y resultados (no se suben al repositorio)
fs.mkdirSync(OUT, { recursive: true })
const BASE = process.env.VINKA_URL || 'http://localhost:4173' // app compilada servida con «npx vite preview --port 4173»
module.exports = { OUT, BASE }
