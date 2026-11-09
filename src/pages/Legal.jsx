import { useParams } from 'react-router-dom'
import { Screen, TopBar } from '../components/ui'

// BORRADOR: textos provisionales para el piloto. Deben ser revisados por un abogado antes del lanzamiento
// (Ley 19.628 y Ley 21.719, vigente desde el 1 de diciembre de 2026).
const DOCS = {
  terminos: {
    title: 'Términos de uso (borrador)',
    body: [
      'VINKA es una plataforma que conecta personas que buscan trabajo con empresas que ofrecen vacantes en Chile.',
      'Las empresas deben ser verificadas antes de publicar. Está prohibido publicar ofertas falsas o engañosas, cobrar a postulantes por postular o ser contratados, y excluir candidatos por motivos ilegales.',
      'El match indica interés mutuo en una vacante; no es una oferta de trabajo ni una decisión de contratación.',
      'Usar la plataforma para acosar, suplantar identidad o enviar spam puede terminar en la suspensión de la cuenta.',
      'VINKA no garantiza contratación ni resultados.',
      'Asesoría con reclutador: VINKA ofrece a quienes buscan empleo servicios opcionales y pagados de revisión de CV y asesoría de búsqueda, a los precios publicados en la app. Postular y usar VINKA es siempre gratis; contratar una asesoría no influye en las postulaciones, los matches ni en cómo te ven las empresas, y no garantiza un empleo. El pago se coordina después de que un reclutador confirma el servicio contigo, y puedes cancelar la solicitud antes de pagar.',
    ],
  },
  privacidad: {
    title: 'Política de privacidad (borrador)',
    body: [
      'Recopilamos los datos que entregas al registrarte y completar tu perfil, y los usamos solo para mostrarte vacantes o candidatos compatibles y operar el chat.',
      'Tu teléfono y correo son privados: una empresa solo los ve si tú decides compartirlos tras un match.',
      'Las empresas ven tu nombre con la inicial del apellido, tu perfil laboral y tu presentación según la visibilidad que elijas. No ven tu renta esperada exacta.',
      'Los videos se guardan en almacenamiento privado y solo se reproducen mediante enlaces temporales para empresas autorizadas.',
      'Si una vacante tiene preguntas de filtro, la empresa ve tus respuestas. El equipo de la empresa puede dejar notas y evaluaciones internas sobre tu postulación; se usan solo para ese proceso de selección.',
      'Estado en línea: mostramos si estás conectado/a o hace cuánto solo a quienes tienen relación contigo en un proceso (matches, postulaciones y tu equipo). Las empresas que revisan perfiles públicos solo ven "activo/a hoy" o "esta semana". Puedes ocultarlo en Perfil; mientras esté oculto, tampoco verás el estado de otros. Si te marcas como "No disponible", quienes tienen relación contigo verán ese aviso y tu mensaje, y no te llegarán notificaciones al teléfono hasta que vuelvas.',
      'Si subes tu CV, un asistente de inteligencia artificial lo lee solo para proponerte datos laborales (cargos, estudios, habilidades). No guardamos el archivo y no tomamos RUT, edad, foto ni otros datos personales; solo se guarda lo que tú confirmas.',
      'Las empresas pueden usar un asistente de inteligencia artificial para resumir tu perfil laboral frente a una vacante. El asistente no recibe tu nombre, contacto ni datos personales, y nunca decide por sí solo: toda decisión de selección la toma una persona. Cada uso del asistente queda registrado (quién lo usó, cuándo y para qué vacante) y la empresa puede revisarlo.',
      'Si postulas sin cuenta desde la página de empleos de una empresa, guardamos solo los datos que escribes (nombre, correo, teléfono, cargo y mensaje) para ese proceso. Los ve únicamente esa empresa y se eliminan a los 12 meses si no sigues en el proceso ni creas una cuenta.',
      'Conservación: las notas, evaluaciones y resultados de IA de procesos cerrados se eliminan automáticamente 12 meses después del cierre. Los postulantes importados desde otros portales que no aceptaron la invitación se eliminan a los 12 meses.',
      'Puedes editar tus datos, descargar una copia de ellos, ocultar tu perfil o eliminar tu cuenta en cualquier momento desde Perfil. Al eliminarla, borramos tu perfil, intereses, matches, mensajes y video.',
      'Si pides una asesoría con reclutador, autorizas que el equipo de VINKA vea tu perfil laboral y te contacte para coordinar el servicio y su pago. El asesor o asesora que VINKA te asigne ve tu perfil laboral, tu nombre con la inicial del apellido y lo que compartas en el chat de la asesoría, pero no tu teléfono ni tu correo. Toda la asesoría (mensajes y archivos) ocurre dentro de VINKA; VINKA puede revisar esas conversaciones para resguardar la calidad y tu seguridad. Las empresas no ven si contrataste una asesoría.',
      'Contacto para solicitudes de datos: [CORREO DE CONTACTO].',
    ],
  },
}

export default function Legal() {
  const { doc } = useParams()
  const d = DOCS[doc] || DOCS.terminos
  return (
    <Screen>
      <TopBar back title={d.title} />
      <div className="flex flex-col gap-3.5 px-6 pb-10 text-[15px] leading-relaxed text-tinta-2">
        {d.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </Screen>
  )
}
