const UID = '11111111-1111-1111-1111-111111111111', CO = '22222222-2222-2222-2222-222222222222', JOB = '33333333-3333-3333-3333-333333333333'
const now = Date.now(), iso = (d) => new Date(now + d * 86400000).toISOString()
const products = [
  { id: 'job_7', target: 'job', name: 'Oferta destacada 7 días', days: 7, price_clp: 4990, price_mode: 'neto', active: true, sort: 1 },
  { id: 'job_15', target: 'job', name: 'Oferta destacada 15 días', days: 15, price_clp: 8990, price_mode: 'neto', active: true, sort: 2 },
  { id: 'job_30', target: 'job', name: 'Oferta destacada 30 días', days: 30, price_clp: 14990, price_mode: 'neto', active: true, sort: 3 },
  { id: 'profile_7', target: 'profile', name: 'Perfil destacado 7 días', days: 7, price_clp: 1990, price_mode: 'iva_incluido', active: true, sort: 4 },
  { id: 'profile_15', target: 'profile', name: 'Perfil destacado 15 días', days: 15, price_clp: 3490, price_mode: 'iva_incluido', active: true, sort: 5 },
  { id: 'profile_30', target: 'profile', name: 'Perfil destacado 30 días', days: 30, price_clp: 5990, price_mode: 'iva_incluido', active: true, sort: 6 },
]
const plans = [
  { id: 'gratis', name: 'Gratis', price_clp: 0, max_active_jobs: 1, max_members: 1, ai_monthly: 20, sort: 1, promo_credits: 0, promo_days: 7 },
  { id: 'pyme', name: 'Pyme', price_clp: 29990, max_active_jobs: 5, max_members: 3, ai_monthly: 200, sort: 2, promo_credits: 1, promo_days: 7 },
  { id: 'equipo', name: 'Equipo', price_clp: 69990, max_active_jobs: 20, max_members: 10, ai_monthly: 1000, sort: 3, promo_credits: 3, promo_days: 15 },
  { id: 'empresa', name: 'Empresa', price_clp: null, max_active_jobs: null, max_members: null, ai_monthly: 5000, sort: 4, promo_credits: 5, promo_days: 30 },
]
const res = (r) => ({ impressions: 1240, clicks: 96, actions: 14, ...r })
const company = { id: CO, display_name: 'Nova Retail', verification_status: 'verified', slug: 'nova-retail', require_approval: false }
const scen = {
  company: {
    profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Test' }, admins: null,
    company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: company }],
    jobs: [{ id: JOB, company_id: CO, title: 'Ejecutivo/a de ventas', comuna: 'Talca', modality: 'Presencial', status: 'published', created_at: iso(-20) },
           { id: '44444444-4444-4444-4444-444444444444', company_id: CO, title: 'Bodeguero/a', comuna: 'Talca', modality: 'Presencial', status: 'published', created_at: iso(-10) }],
    promotions: [{ job_id: JOB, status: 'activa', ends_at: iso(5) }],
    rpc: {
      company_stats: [], job_promotions: { job: { id: JOB, title: 'Ejecutivo/a de ventas', status: 'published' }, plan: { name: 'Pyme', credits: 1, days: 7, used: 1 }, products: products.slice(0, 3), baseline: { actions_per_day: 0.6 },
        items: [{ id: 'p1', status: 'activa', source: 'plan', days: 7, net: 0, iva: 0, total: 0, starts_at: iso(-2), ends_at: iso(5), created_at: iso(-2), results: res({ impressions: 312, clicks: 41, actions: 6 }) },
                { id: 'p0', status: 'finalizada', source: 'compra', days: 15, net: 8990, iva: 1708, total: 10698, starts_at: iso(-40), ends_at: iso(-25), created_at: iso(-41), results: res() }] } },
    paths: ['/', '/vacantes/' + JOB + '/destacar'],
  },
  companyNew: {
    profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Test' }, admins: null,
    company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: company }],
    rpc: { job_promotions: { job: { id: JOB, title: 'Bodeguero/a', status: 'published' }, plan: { name: 'Pyme', credits: 1, days: 7, used: 0 }, products: products.slice(0, 3), baseline: { actions_per_day: 0.4 }, items: [] } },
    paths: ['/vacantes/' + JOB + '/destacar'],
  },
  candidate: {
    profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'Test' }, admins: null,
    candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora', comuna: 'Talca', region: 'Maule', experiences: [], skills: [] },
    rpc: { my_profile_promotion: { is_public: true, products: products.slice(3), items: [] } },
    paths: ['/visibilidad'],
  },
  admin: {
    profiles: { id: UID, role: 'candidate', first_name: 'Admin', last_name: 'VINKA' }, admins: { user_id: UID },
    rpc: { admin_promotions: { active: 12, requested: 2, month_net: 62930, month_sold: 6, month_plan: 9, impressions_30d: 18400, clicks_30d: 1210,
      settings: { slots_per_ten: 2, home_slots: 6, max_jobs: 40, max_profiles: 100 }, products: products.slice(0, 3),
      items: [{ id: 'a', status: 'solicitada', source: 'compra', days: 15, net: 8990, iva: 1708, total: 10698, created_at: iso(-0.2), who: 'Agrícola Copihue', what: 'Temporero/a de cosecha', results: res({ impressions: 0, clicks: 0, actions: 0 }) },
              { id: 'b', status: 'activa', source: 'plan', days: 15, net: 0, iva: 0, total: 0, starts_at: iso(-3), ends_at: iso(12), created_at: iso(-3), who: 'Nova Retail', what: 'Ejecutivo/a de ventas', demo: true, results: res() },
              { id: 'c', status: 'pausada', paused_by: 'job', source: 'compra', days: 30, net: 14990, iva: 2848, total: 17838, starts_at: iso(-8), ends_at: iso(22), created_at: iso(-8), who: 'Agroexport Maule', what: 'Operario/a de packing', results: res({ impressions: 520, clicks: 33, actions: 5 }) }] } },
    paths: ['/promociones'],
  },
  landing: { session: false, rpc: { public_featured_jobs: [
    { promotion_id: 'x1', id: JOB, title: 'Ejecutivo/a de ventas', comuna: 'Talca', region: 'Maule', modality: 'Presencial', salary_min: 650000, salary_max: 800000, salary_type: 'liquido', company: 'Nova Retail' },
    { promotion_id: 'x2', id: JOB, title: 'Operario/a de packing', comuna: 'Curicó', region: 'Maule', modality: 'Presencial', salary_min: 550000, salary_max: 600000, salary_type: 'liquido', company: 'Agroexport Maule' },
    { promotion_id: 'x3', id: JOB, title: 'Analista contable', comuna: '', region: '', modality: 'Remota', salary_min: 900000, salary_max: 1100000, salary_type: 'liquido', company: 'Agrícola Copihue' }] }, paths: ['/'] },
}

const cand = { candidate_id: 'c1', display_name: 'Hernán O.', initials: 'HO', headline: 'Ejecutivo comercial', role_label: 'Ejecutivo/a de ventas · Senior', region: 'Maule', comuna: 'Talca', availability: 'En 2 semanas', modalities: ['Presencial', 'Híbrida'], schedules: ['Completa'],
  has_experience: true, experiences: [{ role: 'Ejecutivo comercial', company: 'Retail Sur', from: '2021-03', current: true }, { role: 'Vendedor', company: 'Tienda Centro', from: '2018-01', to: '2021-02' }, { role: 'Promotor', company: 'Eventos Maule', from: '2016-05', to: '2017-12' }, { role: 'Cajero', company: 'Super Ahorro', from: '2015-01', to: '2016-04' }],
  education: [{ level: 'Técnico', title: 'Técnico en Ventas', institution: 'INACAP', status: 'Titulado/a' }], skills: ['Ventas B2B', 'CRM', 'Negociación', 'Excel', 'Atención al cliente', 'Metas', 'Licencia B', 'Inglés básico', 'Cobranza'],
  bio: 'Me gusta trabajar con metas claras y construir relaciones de largo plazo con clientes.', has_video: false, already_interested: true, score: 24, reasons: ['Mismo tipo de cargo', 'Comuna', 'Renta en rango'], out_of_profile: false, featured: true, promotion_id: 'pp',
  areas: ['Ventas', 'Comercial'], locations: ['Curicó'], relocate: 'Depende de la oferta', salary_expectation: 750000, updated_at: iso(-3) }
const offer = { id: 'o1', match_id: 'm1', company_id: CO, job_id: JOB, candidate_id: 'c1', position: 'Ejecutivo/a de ventas', salary: 800000, salary_type: 'liquido', start_date: '2026-12-01', contract: 'Indefinido', schedule: 'Completa', location: 'Talca, Maule',
  benefits: 'Seguro complementario de salud\nBono trimestral por metas', message: '', expires_on: '2026-11-16', status: 'enviada', created_at: iso(-1), emailed_at: iso(-1), letter: { signer_name: 'Nova Test', signer_title: 'Gerenta de Personas', city: 'Talca' } }
const companyFull = { ...company, legal_name: 'Nova Retail SpA', rut: '76.123.456-7', comuna: 'Talca', logo_path: null }
scen.search = { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Test' }, admins: null, company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: companyFull }],
  jobs: [{ id: JOB, company_id: CO, title: 'Ejecutivo/a de ventas', status: 'published', salary_min: 650000, salary_max: 800000, salary_type: 'liquido' }], rpc: { candidates_for_job: [cand] }, paths: ['/vacantes/' + JOB + '/candidatos'], full: true }
scen.offerCo = { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Test' }, admins: null, company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: companyFull }],
  rpc: { offer_letter: { offer, company: companyFull, candidate: { name: 'Hernán Ortiz Silva', email: null }, job_title: 'Ejecutivo/a de ventas', sender: 'Nova Test', can_manage: true } }, paths: ['/ofertas/o1'] }
scen.detail = { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Test' }, admins: null, company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: companyFull }],
  jobs: [{ id: JOB, company_id: CO, title: 'Ejecutivo/a de ventas', status: 'published' }],
  rpc: { subject_detail: { kind: 'match', can_manage: true, candidate: { name: 'Hernán Ortiz Silva', headline: 'Ejecutivo comercial', experiences: [], education: [], skills: [] }, match: { id: 'm1', stage: 'oferta', closed: false }, offer, job: { title: 'Ejecutivo/a de ventas', company_id: CO }, notes: [], evaluations: [], tags: [], answers: [], events: [], interviews: [] } },
  paths: ['/vacantes/' + JOB + '/candidato/c1'], clickOffer: true }


const M1 = '55555555-5555-5555-5555-555555555555'
const candP = { profiles: { id: UID, role: 'candidate', first_name: 'Camila', last_name: 'Rojas' }, admins: null,
  candidate_profiles: { user_id: UID, onboarding_done: true, is_public: true, headline: 'Vendedora', comuna: 'Talca', region: 'Maule', experiences: [{ role: 'Vendedora', company: 'Tienda Centro', from: '2022-03', current: true }], skills: ['Atención al cliente', 'Caja', 'Ventas'], education: [{ level: 'Técnico', title: 'Técnico en Ventas', institution: 'INACAP', status: 'Titulado/a' }], salary_expectation: 650000, modalities: ['Presencial'], schedules: ['Completa'], availability: 'Inmediata', has_experience: true, bio: 'Me encanta atender clientes y cumplir metas en equipo.' } }
const coP = { profiles: { id: UID, role: 'company', first_name: 'Nova', last_name: 'Retail' }, admins: null, company_members: [{ company_id: CO, role: 'owner', created_at: iso(-100), companies: companyFull }] }
const match = { match_id: M1, job_id: JOB, job_title: 'Ejecutivo/a de ventas', company_id: CO, company_name: 'Nova Retail', candidate_id: UID, candidate_name: 'Camila R.', candidate_headline: 'Vendedora', stage: 'entrevista', contact_shared: false, contact_requested: false, closed: false, created_at: iso(-3), last_message: '¡Perfecto, nos vemos el jueves!', last_at: iso(-0.1) }
const at = (d, h) => { const x = new Date(Date.now() + d * 864e5); x.setUTCHours(h + 3, 0, 0, 0); return x.toISOString() }
const iv = { interview_id: 'iv1', match_id: M1, starts_at: at(2, 10), ends_at: at(2, 10).replace('T13:00', 'T13:45'), mode: 'online', meeting_url: 'https://meet.google.com/abc-defg-hij', address: '', comuna: '', notes: '', status: 'confirmada', job_title: 'Ejecutivo/a de ventas', company_name: 'Nova Retail', candidate_name: 'Camila R.' }
const msgs = [
  { id: 'm1', match_id: M1, sender_id: 'co', body: 'Hola Camila, gracias por tu interés. Nos gustó tu experiencia en ventas. ¿Te acomoda una entrevista esta semana?', created_at: iso(-1.2) },
  { id: 'm2', match_id: M1, sender_id: UID, body: '¡Hola! Sí, me encantaría. Gracias por escribirme.', created_at: iso(-1.1) },
  { id: 'm3', match_id: M1, sender_id: null, body: 'Agendé una entrevista para el jueves a las 10:00 (videollamada).', created_at: iso(-0.2) },
  { id: 'm4', match_id: M1, sender_id: 'co', body: '¡Perfecto, nos vemos el jueves!', created_at: iso(-0.1) },
]
const feed = [{ id: JOB, title: 'Ejecutivo/a de ventas', area: 'Ventas', level: 'Semi senior', description: 'Buscamos una persona con experiencia en ventas para atender clientes y cumplir metas en nuestra tienda de Talca.', requirements: [{ text: 'Experiencia en ventas', essential: true }, { text: 'Licencia B', essential: false }], modality: 'Presencial', schedule: 'Completa', contract: 'Indefinido', region: 'Maule', comuna: 'Talca', salary_min: 650000, salary_max: 800000, salary_type: 'liquido', company_id: CO, company_name: 'Nova Retail', company_sector: 'Retail', company_size: '51-200', company_description: 'Tiendas de vestuario en la zona centro sur.', company_benefits: 'Seguro complementario, bono por metas', invited: false, score: 24, reasons: ['Mismo tipo de cargo', 'Comuna', 'Renta en rango'], out_of_profile: false, featured: false, promotion_id: null }]
const slots = [10, 11, 15].map((h, i) => ({ slot_id: 's' + i, starts_at: at(2, h), ends_at: at(2, h), mode: 'online', address: '', comuna: '', notes: '' })).concat([10, 12].map((h, i) => ({ slot_id: 't' + i, starts_at: at(3, h), ends_at: at(3, h), mode: 'online', address: '', comuna: '', notes: '' })))
const pc = (n, h, stage, extra = {}) => ({ kind: 'match', id: 'p' + n, candidate_id: 'c' + n, name: n, headline: h, stage, since: iso(-Math.random() * 6), source: 'VINKA', tags: [], eval_avg: null, eval_n: 0, fit: null, knocked_out: false, next_interview: null, comuna: 'Talca', ...extra })
const pipe = { job: { id: JOB, title: 'Ejecutivo/a de ventas', status: 'published', company_id: CO }, can_manage: true, cards: [
  pc('Camila R.', 'Vendedora', 'entrevista', { next_interview: at(2, 10), eval_avg: 4.3, eval_n: 2 }), pc('Hernán O.', 'Ejecutivo comercial', 'entrevista', { eval_avg: 3.8, eval_n: 1 }),
  pc('Paula M.', 'Ejecutiva de ventas', 'contacto'), pc('Diego S.', 'Vendedor', 'match'), pc('Valentina T.', 'Asistente comercial', 'oferta', { eval_avg: 4.6, eval_n: 3 }),
  pc('Matías F.', 'Cajero', 'postulante'), pc('Josefa L.', 'Vendedora', 'postulante', { source: 'Página de empleos' }), pc('Tomás V.', 'Promotor', 'contratado')] }
const rjobs = [['Ejecutivo/a de ventas', 412, 58, 21, 14, 8, 3, 2, 2], ['Bodeguero/a', 260, 41, 15, 9, 5, 2, 1, 1], ['Cajero/a', 198, 36, 12, 7, 4, 1, 1, 1]].map(([t, v, a, m, c, i, o, oa, h], k) => ({ id: 'j' + k, title: t, status: 'published', views: v, applied: a, matches: m, contacted: c, interviewed: i, offered: o, offers_accepted: oa, hired: h, rejected: 6, externals: 4, offers_sent: o, days_to_hire: 18 + k * 3 }))
const V = {
  c_perfil: { ...candP, paths: ['/perfil/laboral'] },
  c_explorar: { ...candP, rpc: { job_feed: feed, my_matches: [] }, paths: ['/'] },
  c_chat: { ...candP, rpc: { my_matches: [match], my_interviews: [iv] }, messages: msgs, paths: ['/chats/' + M1] },
  c_agendar: { ...candP, rpc: { my_matches: [{ ...match, stage: 'contacto' }], available_slots: slots, my_interviews: [] }, paths: ['/chats/' + M1 + '/agendar'] },
  c_oferta: { ...candP, rpc: { offer_letter: { offer: { ...offer, candidate_id: UID }, company: companyFull, candidate: { name: 'Camila Rojas', email: 'camila@example.com' }, job_title: 'Ejecutivo/a de ventas', sender: 'Nova Test', can_manage: false } }, paths: ['/ofertas/o1'] },
  c_intereses: { ...candP, rpc: { my_matches: [match, { ...match, match_id: 'x2', job_title: 'Cajera', company_name: 'Super Ahorro', stage: 'oferta' }, { ...match, match_id: 'x3', job_title: 'Promotora', company_name: 'Agro Maule', stage: 'contacto' }], my_interests: [] }, paths: ['/intereses'] },
  e_vacante: { ...coP, jobs: [], paths: ['/vacantes/nueva'], fill: true },
  e_candidatos: { ...scen.search, rpc: { ...scen.search.rpc, candidates_for_job: scen.search.rpc.candidates_for_job.map((c) => ({ ...c, salary_min: 700000, salary_max: 800000, salary_in_range: true })) }, paths: ['/vacantes/' + JOB + '/candidatos'] },
  e_proceso: { ...coP, jobs: [{ id: JOB, company_id: CO, title: 'Ejecutivo/a de ventas', status: 'published' }], rpc: { job_pipeline: pipe }, paths: ['/vacantes/' + JOB + '/proceso'] },
  e_agenda: { ...coP, jobs: [{ id: JOB, title: 'Ejecutivo/a de ventas' }], rpc: { company_agenda: [
    { slot_id: 'a1', starts_at: at(0, 10), ends_at: at(0, 10), mode: 'online', meeting_url: '', address: '', comuna: '', notes: '', slot_status: 'booked', job_title: 'Ejecutivo/a de ventas', interview_id: 'i1', interview_status: 'confirmada', match_id: M1, candidate_name: 'Camila R.', booked_job_title: 'Ejecutivo/a de ventas' },
    { slot_id: 'a2', starts_at: at(0, 11), ends_at: at(0, 11), mode: 'online', meeting_url: '', address: '', comuna: '', notes: '', slot_status: 'open', job_title: 'Ejecutivo/a de ventas', interview_id: null },
    { slot_id: 'a3', starts_at: at(0, 15), ends_at: at(0, 15), mode: 'presencial', meeting_url: '', address: '1 Sur 1234', comuna: 'Talca', notes: '', slot_status: 'open', job_title: null, interview_id: null }] }, paths: ['/agenda'] },
  e_oferta: { ...scen.offerCo, paths: ['/ofertas/o1'] },
  e_reportes: { ...coP, jobs: [], rpc: { company_report: { jobs: rjobs, sources: [{ source: 'VINKA', total: 135, hired: 3 }, { source: 'Página de empleos', total: 22, hired: 1 }, { source: 'Importados', total: 12, hired: 0 }], days_to_hire: 21, days_to_first_step: 2 }, stage_times: [{ stage: 'match', avg_days: 1.2, n: 40 }, { stage: 'contacto', avg_days: 2.5, n: 30 }, { stage: 'entrevista', avg_days: 5.1, n: 20 }, { stage: 'oferta', avg_days: 3.0, n: 8 }] }, paths: ['/reportes'] },
}


module.exports = { V, scen, products, plans, UID, CO, JOB, M1, iso, at, companyFull, candP, coP, match, msgs, offer }
