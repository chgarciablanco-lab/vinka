import { Link, useParams } from 'react-router-dom'
import { Screen, TopBar } from '../components/ui'

// Textos legales de VINKA. Marco: Ley 19.628 y Ley 21.719 (protección de datos personales), Ley 19.496 (consumidor)
// y Código del Trabajo (no discriminación). Antes de lanzar conviene una revisión final de un abogado.
// Identificación del responsable: completar razón social, RUT y domicilio cuando estén definidos (se muestran solo si tienen valor).
// DATOS FICTICIOS SOLO PARA EL PILOTO: reemplazar por la razón social, RUT y domicilio reales antes del lanzamiento.
// El dígito verificador del RUT es inválido a propósito, para que no coincida con ninguna empresa o persona real.
const OPERADOR = { nombre: 'VINKA', razon: 'VINKA Plataforma Laboral SpA', rut: '77.854.185-8', domicilio: '2 Norte 1150, oficina 402, Talca, Región del Maule' }
const CONTACTO = 'contacto@vinka.cl'
const ACTUALIZADO = '10 de noviembre de 2026'

const mail = <a href={`mailto:${CONTACTO}`} className="font-semibold text-rosa-texto underline">{CONTACTO}</a>
const quien = [OPERADOR.razon, OPERADOR.rut && `RUT ${OPERADOR.rut}`, OPERADOR.domicilio && `con domicilio en ${OPERADOR.domicilio}`].filter(Boolean).join(', ')

const DOCS = {
  terminos: {
    title: 'Términos y condiciones de uso',
    intro: <>Estos términos regulan el uso de {OPERADOR.nombre}{quien ? ` (${quien})` : ''}, en la app y en el sitio web. Al crear una cuenta o usar la plataforma aceptas estos términos y la <Link to="/legal/privacidad" className="underline">política de privacidad</Link>.</>,
    sections: [
      ['1. Qué es VINKA', [
        'VINKA es una plataforma chilena que conecta a personas que buscan trabajo con empresas que ofrecen vacantes, y entrega a las empresas herramientas para gestionar sus procesos de selección.',
        'VINKA no es empleador, no es agencia de empleo de quienes postulan ni parte del contrato de trabajo que se pueda celebrar. La decisión de contratar y las condiciones laborales son siempre responsabilidad de la empresa y de la persona contratada.',
      ]],
      ['2. Cuentas', [
        'Para usar VINKA debes tener 18 años o más y entregar datos verdaderos. La cuenta es personal: no la compartas ni la cedas, y cuida tu contraseña.',
        'Cada cuenta pertenece a una sola empresa. Las consultoras pueden administrar empresas clientes desde su cuenta matriz.',
        'Puedes eliminar tu cuenta cuando quieras desde Perfil o Empresa.',
      ]],
      ['3. Postulantes', [
        'Usar VINKA para buscar trabajo, postular, hacer match y conversar con empresas es gratis. Ninguna empresa puede cobrarte por postular, ser entrevistado/a o contratado/a; si alguien lo intenta, avísanos.',
        'Un match indica interés mutuo en una vacante. No es una oferta de trabajo ni una promesa de contratación.',
        'Eres responsable de que tu perfil, CV, video y respuestas sean verdaderos.',
      ]],
      ['4. Empresas y consultoras', [
        'Las empresas deben ser verificadas por VINKA antes de publicar. Podemos pedir antecedentes de la empresa y de quien la representa, y rechazar o suspender una verificación.',
        'Está prohibido publicar ofertas falsas, engañosas o que no correspondan a un empleo real; pedir pagos o depósitos a postulantes; solicitar datos que no sean necesarios para el proceso; y excluir o preferir a personas por motivos discriminatorios según el artículo 2° del Código del Trabajo y la Ley 20.609 (raza, sexo, edad, estado civil, religión, opinión política, nacionalidad, discapacidad, orientación sexual, identidad de género, entre otros).',
        'La empresa es responsable de sus vacantes, de las decisiones de selección, de las ofertas que envía y del uso que su equipo dé a los datos de postulantes, que solo puede ser para sus procesos de selección. Los datos de contacto de un postulante solo se usan si él o ella los comparte.',
        'Una consultora que administra empresas clientes declara contar con el mandato de cada cliente. Puede publicar vacantes a nombre del cliente o como «Empresa confidencial»; en ambos casos los postulantes ven que el proceso es gestionado por la consultora.',
        'Las herramientas de inteligencia artificial (resúmenes, sugerencias de texto, revisión de lenguaje) son una ayuda: no deciden por la empresa, y toda decisión de selección debe tomarla una persona.',
      ]],
      ['5. Planes y pagos de empresas', [
        'Los planes, sus límites y precios son los publicados en la app al momento de contratar. Los precios se expresan en pesos chilenos más IVA y se cobran por período mensual.',
        'Las cuentas nuevas pueden partir con un período de prueba. Al terminar, si no se registra el pago, la cuenta pasa al plan gratuito con sus límites; no se borran las vacantes ni los procesos.',
        'En una consultora, el plan de la matriz cubre a todas sus empresas clientes y los límites se cuentan para el grupo completo.',
        'Los destacados de vacantes duran el plazo indicado al activarlos.',
      ]],
      ['6. Asesorías para postulantes', [
        'VINKA ofrece servicios opcionales y pagados de revisión de CV y asesoría de búsqueda, con el contenido, plazo y precio publicados en la app.',
        'Contratar una asesoría no influye en tus postulaciones, matches ni en cómo te ven las empresas, y no garantiza un empleo. Las empresas no saben si contrataste una.',
        'El pago se coordina después de que VINKA confirma el servicio contigo, y puedes cancelar la solicitud antes de pagar. Una vez confirmado el pago, VINKA te escribe en el chat de la asesoría con el plazo y te asigna un asesor o asesora. Toda la asesoría ocurre dentro de VINKA.',
        'Si el servicio no se entrega como fue descrito, escríbenos y lo revisaremos según la Ley 19.496 sobre protección de los derechos de los consumidores.',
      ]],
      ['7. Uso correcto', [
        'No puedes usar VINKA para acosar, amenazar o discriminar; suplantar a otra persona o empresa; enviar spam o publicidad; compartir contenido ilegal u ofensivo; extraer datos de forma masiva; ni intentar vulnerar la seguridad de la plataforma.',
        'Por seguridad, no compartas datos de pago ni pidas dinero dentro de VINKA.',
        'Podemos ocultar contenido, pausar vacantes o suspender cuentas que no cumplan estos términos. Si crees que fue un error, escríbenos.',
      ]],
      ['8. Contenido y propiedad', [
        'Lo que subes (perfil, CV, video, vacantes, logos) sigue siendo tuyo. Nos das permiso para guardarlo y mostrarlo dentro de VINKA solo para operar el servicio y según tu configuración de visibilidad.',
        'La marca, el diseño y el software de VINKA son de sus titulares y no pueden copiarse ni usarse sin autorización.',
      ]],
      ['9. Responsabilidad', [
        'Trabajamos para que VINKA esté disponible y sea segura, pero puede haber interrupciones o errores. VINKA no garantiza que encuentres empleo o candidatos, ni responde por la veracidad de la información que publican usuarios y empresas, sin perjuicio de los derechos que te reconoce la ley.',
        'Si ves una vacante sospechosa o un comportamiento indebido, repórtalo desde la app o a nuestro correo.',
      ]],
      ['10. Cambios y ley aplicable', [
        'Podemos actualizar estos términos. Si el cambio es importante, te avisaremos en la app antes de que rija.',
        'Estos términos se rigen por las leyes de Chile.',
      ]],
      ['11. Contacto', [<>Para consultas, reclamos o reportes: {mail}. También puedes escribirnos desde Ayuda en la app.</>]],
    ],
  },
  privacidad: {
    title: 'Política de privacidad',
    intro: <>En {OPERADOR.nombre}{quien ? ` (${quien})` : ''} tratamos tus datos personales según la Ley 19.628 y la Ley 21.719 sobre protección de datos personales. Aquí explicamos qué datos usamos, para qué, con quién los compartimos y cómo ejercer tus derechos. {OPERADOR.nombre} es responsable del tratamiento; contacto: {mail}.</>,
    sections: [
      ['1. Qué datos recopilamos', [
        'Cuenta: nombre, apellido, correo, teléfono y contraseña (cifrada).',
        'Perfil laboral: cargo buscado, comuna y región, experiencia, estudios, habilidades, disponibilidad, presentación, renta esperada, video de presentación, CV si decides guardarlo y respuestas a preguntas de filtro.',
        'Empresas: razón social, RUT, rubro, ubicación, logo, datos de quienes integran el equipo y antecedentes de verificación.',
        'Uso de la app: postulaciones, intereses, matches, mensajes, entrevistas, ofertas, notificaciones, estado en línea y reportes que nos envías.',
        'Datos técnicos: dispositivo, navegador y registros de errores para mantener la app funcionando y segura.',
        'No pedimos ni guardamos tu RUT de persona, edad, foto, estado civil, religión ni otros datos sensibles. Si los incluyes por tu cuenta (por ejemplo, en tu CV), no los usamos para mostrarte a empresas.',
      ]],
      ['2. Para qué los usamos', [
        'Mostrarte vacantes o candidatos compatibles, operar postulaciones, matches, chat, agenda, entrevistas y ofertas.',
        'Verificar empresas y prevenir fraudes, ofertas falsas y abusos.',
        'Prestar las asesorías pagadas que contrates y gestionar los planes de las empresas.',
        'Enviarte avisos dentro de la app, al teléfono o por correo sobre tus procesos (puedes desactivarlos en tu cuenta).',
        'Responder tus consultas y reportes, y mejorar VINKA con estadísticas agregadas.',
        'La base para tratarlos es tu consentimiento al registrarte y la ejecución del servicio que pediste; en algunos casos, cumplir obligaciones legales. No vendemos tus datos ni los usamos para publicidad de terceros.',
      ]],
      ['3. Qué ven las empresas', [
        'Ven tu nombre con la inicial del apellido, tu perfil laboral y tu presentación, según la visibilidad que elijas. Puedes ocultar tu perfil cuando quieras.',
        'Tu teléfono y correo son privados: una empresa solo los ve si tú decides compartirlos después de un match.',
        'No ven tu renta esperada exacta: solo un rango aproximado (por ejemplo, entre $500.000 y $600.000) y si calza con la renta de la vacante.',
        'Tu video se guarda en almacenamiento privado y solo se reproduce mediante enlaces temporales para empresas con las que tienes un proceso.',
        'Si una vacante tiene preguntas de filtro, la empresa ve tus respuestas. Su equipo puede dejar notas y evaluaciones internas sobre tu postulación, que se usan solo para ese proceso.',
        'Si la vacante es de una consultora que recluta para un cliente, ven tus datos la consultora y las personas del cliente autorizadas para ese proceso.',
      ]],
      ['4. Estado en línea', [
        'Mostramos si estás conectado/a, o hace cuánto, solo a quienes tienen relación contigo en un proceso (matches, postulaciones y tu equipo). Las empresas que revisan perfiles públicos solo ven «activo/a hoy» o «esta semana».',
        'Puedes ocultarlo en Perfil; mientras esté oculto, tampoco verás el estado de otros. Si te marcas como «No disponible», quienes tienen relación contigo verán ese aviso y tu mensaje, y no te llegarán notificaciones al teléfono hasta que vuelvas.',
      ]],
      ['5. Inteligencia artificial', [
        'Si subes tu CV, un asistente de inteligencia artificial lo lee solo para proponerte datos laborales (cargos, estudios, habilidades). Solo se guarda en tu perfil lo que tú confirmas.',
        'Las empresas pueden usar un asistente para resumir tu perfil laboral frente a una vacante. El asistente no recibe tu nombre ni tus datos de contacto, y nunca decide por sí solo: toda decisión de selección la toma una persona. Cada uso queda registrado (quién, cuándo y para qué vacante).',
        'El asistente de ayuda responde consultas sobre la app y puede crear un reporte cuando se lo pides.',
        'El proveedor de inteligencia artificial procesa estos textos solo para entregarnos la respuesta y no los usa para entrenar sus modelos.',
      ]],
      ['6. Asesorías', [
        'Si pides una asesoría, autorizas que el equipo de VINKA vea tu perfil laboral y te escriba por el chat de la asesoría para coordinar el servicio y su pago. Las asesorías no usan WhatsApp, llamadas ni correos: todo ocurre dentro de VINKA.',
        'El asesor o asesora asignado ve tu perfil laboral, tu nombre con la inicial del apellido, tu CV guardado y lo que compartas en el chat de la asesoría, pero no tu teléfono ni tu correo. Toda la asesoría ocurre dentro de VINKA, y VINKA puede revisar esas conversaciones para resguardar la calidad y tu seguridad.',
        'Las empresas no ven si contrataste una asesoría.',
      ]],
      ['7. Postulación sin cuenta', [
        'Si postulas sin cuenta desde la página de empleos de una empresa, guardamos solo lo que escribes (nombre, correo, teléfono, cargo y mensaje) para ese proceso. Lo ve únicamente esa empresa, y se elimina a los 12 meses si no sigues en el proceso ni creas una cuenta.',
      ]],
      ['8. Con quién compartimos datos', [
        'Con las empresas, consultoras y asesores, en los casos y con los límites explicados arriba.',
        'Con proveedores que nos prestan servicios y solo pueden usar los datos para eso: alojamiento de la base de datos y archivos (Supabase, en servidores de São Paulo, Brasil), hosting de la app (Vercel), envío de correos (Resend), inteligencia artificial (Anthropic) y notificaciones al teléfono (servicios de Apple y Google según tu dispositivo). Si suscribes tu calendario (Google, Apple u otro), ese servicio lee tus entrevistas desde un enlace privado que puedes desactivar.',
        'Algunos de estos proveedores están fuera de Chile. Exigimos que protejan tus datos con un nivel de seguridad adecuado y solo para prestarnos el servicio.',
        'Con autoridades, solo cuando la ley lo exija.',
      ]],
      ['9. Cuánto tiempo los guardamos', [
        'Mientras tengas tu cuenta. Al eliminarla borramos tu perfil, intereses, matches, mensajes, video y CV.',
        'Las notas, evaluaciones y resultados de IA de procesos cerrados se eliminan 12 meses después del cierre.',
        'Los postulantes importados desde otros portales que no aceptaron la invitación se eliminan a los 12 meses.',
        'Podemos conservar por más tiempo lo que la ley nos obligue a guardar (por ejemplo, registros de pagos), solo para ese fin.',
      ]],
      ['10. Seguridad', [
        'Usamos conexiones cifradas, contraseñas cifradas, almacenamiento privado para archivos y videos, enlaces temporales y permisos por rol dentro de cada empresa. Ningún sistema es infalible: si detectamos un incidente que afecte tus datos, te avisaremos y lo informaremos según la ley.',
      ]],
      ['11. Tus derechos', [
        'Tienes derecho a acceder a tus datos, rectificarlos, pedir su supresión, oponerte a ciertos tratamientos, solicitar su portabilidad y pedir el bloqueo temporal mientras se resuelve una solicitud. También puedes retirar tu consentimiento cuando quieras, sin efecto retroactivo.',
        'Desde Perfil puedes editar tus datos, descargar una copia, ocultar tu perfil o eliminar tu cuenta. Para cualquier otra solicitud, escríbenos.',
        <>Responderemos dentro de 30 días corridos. Escribe a {mail} desde el correo de tu cuenta, indicando qué necesitas. Si no quedas conforme con nuestra respuesta, puedes recurrir a la autoridad de protección de datos personales que corresponda según la ley.</>,
      ]],
      ['12. Menores de edad', ['VINKA es solo para mayores de 18 años. Si detectamos una cuenta de un menor, la eliminaremos.']],
      ['13. Cambios', ['Podemos actualizar esta política. Si el cambio es importante, te avisaremos en la app antes de que rija.']],
      ['14. Contacto', [<>Para consultas o solicitudes sobre tus datos personales: {mail}.</>]],
    ],
  },
}

export default function Legal() {
  const { doc } = useParams()
  const d = DOCS[doc] || DOCS.terminos
  return (
    <Screen>
      <TopBar back title={d.title} />
      <article className="flex flex-col gap-5 px-6 pb-12 text-[15px] leading-relaxed text-tinta-2 lg:max-w-3xl">
        <p className="text-[13px] text-tinta-suave">Última actualización: {ACTUALIZADO}</p>
        <p>{d.intro}</p>
        {d.sections.map(([h, ps]) => (
          <section key={h} className="flex flex-col gap-2">
            <h2 className="text-[17px] font-bold text-tinta">{h}</h2>
            {ps.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
        <p className="text-[13px] text-tinta-suave">Ver también: {doc === 'privacidad' ? <Link to="/legal/terminos" className="underline">Términos y condiciones de uso</Link> : <Link to="/legal/privacidad" className="underline">Política de privacidad</Link>}</p>
      </article>
    </Screen>
  )
}
