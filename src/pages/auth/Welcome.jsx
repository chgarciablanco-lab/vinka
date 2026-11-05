import { Link } from 'react-router-dom'
import { Logo, Svg } from '../../components/ui'

export default function Welcome() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-rosa-fondo px-6 pb-8 pt-16">
      <Logo />
      <h1 className="mb-2 mt-10 text-[26px] font-bold leading-tight">¿Cómo quieres usar VINKA?</h1>
      <p className="mb-6 text-[15px] leading-relaxed text-tinta-3">Elige tu camino. Puedes crear la otra cuenta más adelante.</p>
      <div className="flex flex-col gap-3.5">
        <Link to="/registro/candidato" className="flex items-center gap-4 rounded-[18px] border-2 border-rosa-accion bg-white p-[18px] shadow-[0_6px_18px_rgba(208,46,114,0.12)]">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-rosa-palido text-rosa-accion"><Svg name="user" size={26} /></span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="font-display text-[17px] font-semibold">Soy candidato/a</span>
            <span className="text-sm leading-snug text-tinta-3">Busco trabajo en Chile, con o sin experiencia</span>
          </span>
          <Svg name="chevron" size={20} className="text-rosa-accion" />
        </Link>
        <Link to="/registro/empresa" className="flex items-center gap-4 rounded-[18px] border border-[#E6DCE3] bg-white p-[18px]">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-naranja-palido text-[#B85F00]"><Svg name="building" size={26} /></span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="font-display text-[17px] font-semibold">Soy empresa</span>
            <span className="text-sm leading-snug text-tinta-3">Publico vacantes y busco talento</span>
          </span>
          <Svg name="chevron" size={20} className="text-tinta-suave" />
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap gap-2.5">
        {['Gratis para candidatos', 'Empresas verificadas', 'Todo Chile'].map((t) => (
          <span key={t} className="rounded-full border border-[#E6DCE3] bg-white px-3 py-1.5 text-[13px] text-tinta-3">{t}</span>
        ))}
      </div>
      <div className="flex-1" />
      <p className="mb-3 mt-10 text-center text-[15px]">¿Ya tienes cuenta? <Link to="/ingresar" className="font-semibold text-rosa-texto">Inicia sesión</Link></p>
      <p className="text-center text-xs leading-relaxed text-tinta-suave">
        Al registrarte revisarás los <Link to="/legal/terminos" className="text-rosa-texto underline">Términos</Link> y la <Link to="/legal/privacidad" className="text-rosa-texto underline">Política de privacidad</Link>.
      </p>
    </div>
  )
}
