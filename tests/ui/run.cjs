// Ejecuta todas las pruebas de pantalla y resume el resultado.
// Una línea con «false», «FALLÓ» o «errores» cuenta como falla.
const { execFileSync } = require('child_process')
const path = require('path')
const tests = ['elegir_asesor', 'asignacion_consentimiento', 'valoraciones_y_contratacion', 'pago_demo', 'corregir_nombre', 'mi_cuenta', 'asesor_inicio_y_busqueda', 'pantallas_y_accesibilidad', 'carga_conexion_lenta', 'colaboracion_asesores', 'informes_ia']
let fails = 0
for (const t of tests) {
  let out = ''
  try { out = execFileSync(process.execPath, [path.join(__dirname, t + '.cjs')], { encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = (e.stdout || '') + '\nFALLÓ: ' + (e.message || '').split('\n')[0] }
  const bad = out.split('\n').filter((l) => /: false|FALLÓ|errores: (?!none|0)|con desborde horizontal: [1-9]|con errores JS: [1-9]/.test(l))
  fails += bad.length
  console.log(`${bad.length ? '✗' : '✓'} ${t}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`)
}
console.log(fails ? `\n${fails} línea(s) con falla` : '\nTodo correcto')
process.exit(fails ? 1 : 0)
