// Captura de la app que cambia según el ancho de pantalla (mismo corte que los videos de las portadas: 768 px).
// El navegador descarga solo la imagen que corresponde: horizontal en computador, vertical en celular.
export default function AppShot({ desk, mob, alt, caption }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="mx-auto w-[260px] overflow-hidden rounded-[32px] border-[6px] border-white bg-[#F4EEF2] shadow-[0_20px_50px_rgba(48,37,56,.18)] md:w-full md:max-w-5xl md:rounded-[22px]">
        <picture>
          <source media="(min-width: 768px)" srcSet={desk} width="1600" height="900" />
          <img src={mob} width="780" height="1688" alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" />
        </picture>
      </div>
      <figcaption className="text-center text-[12px] text-tinta-suave">{caption}</figcaption>
    </figure>
  )
}
