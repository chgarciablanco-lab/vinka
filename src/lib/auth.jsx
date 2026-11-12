import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
const KEY = 'vinka-company'
const MODE_KEY = 'vinka-modo' // asesores: 'asesorias' o 'reclutamiento'
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'reclutamiento' ? 'reclutamiento' : 'asesorias' } catch { return 'asesorias' } }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [candidate, setCandidate] = useState(null)
  const [company, setCompany] = useState(null)
  const [companies, setCompanies] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [advisor, setAdvisor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [mode, setModeState] = useState(readMode)

  const load = useCallback(async (sess) => {
    if (!sess?.user) {
      setProfile(null); setCandidate(null); setCompany(null); setCompanies([]); setIsAdmin(false); setAdvisor(null)
      return
    }
    const uid = sess.user.id
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    ])
    setProfile(p); setIsAdmin(!!a)
    if (p?.role === 'advisor') {
      // Asesor: sus asesorías y, si VINKA le creó su espacio de reclutamiento, también su consultora
      const [{ data: adv }, { data: ms }] = await Promise.all([
        supabase.from('advisors').select('*').eq('user_id', uid).maybeSingle(),
        supabase.rpc('my_companies'),
      ])
      setAdvisor(adv || null); setCandidate(null)
      const list = (ms || []).filter((m) => m.companies).map((m) => ({ ...m.companies, member_role: m.role, inherited: !!m.inherited }))
      let saved = ''
      try { saved = localStorage.getItem(KEY) || '' } catch { /* sin almacenamiento */ }
      setCompanies(list)
      setCompany(list.find((c) => c.id === saved) || list[0] || null)
      return
    }
    if (p?.role === 'candidate') {
      const { data: c } = await supabase.from('candidate_profiles').select('*').eq('user_id', uid).maybeSingle()
      setCandidate(c); setCompany(null)
    } else if (p?.role === 'company') {
      // Una cuenta está en una sola empresa; si es una consultora (matriz), además maneja a sus clientes. Se recuerda la última elegida.
      const fetchAll = () => supabase.rpc('my_companies')
      let { data: ms } = await fetchAll()
      // Primer ingreso tras confirmar correo: crear la empresa con los datos del registro
      const pending = sess.user.user_metadata?.company
      if (!ms?.length && pending?.legal_name) {
        const { error } = await supabase.from('companies').insert({ ...pending, owner_id: uid })
        if (!error) {
          await supabase.auth.updateUser({ data: { company: null } })
          ;({ data: ms } = await fetchAll())
        }
      }
      const list = (ms || []).filter((m) => m.companies).map((m) => ({ ...m.companies, member_role: m.role, inherited: !!m.inherited }))
      let saved = ''
      try { saved = localStorage.getItem(KEY) || '' } catch { /* sin almacenamiento */ }
      setCompanies(list)
      setCompany(list.find((c) => c.id === saved) || list[0] || null); setCandidate(null)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); await load(data.session); setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(sess)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => load(sess), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const refresh = useCallback(() => load(session), [load, session])
  const switchCompany = useCallback((id) => {
    const c = companies.find((x) => x.id === id)
    if (!c) return
    try { localStorage.setItem(KEY, id) } catch { /* sin almacenamiento */ }
    setCompany(c)
  }, [companies])
  const signOut = async () => { await supabase.auth.signOut(); setRecovery(false) }
  const setMode = useCallback((m) => {
    try { localStorage.setItem(MODE_KEY, m) } catch { /* sin almacenamiento */ }
    setModeState(m)
  }, [])
  // Un asesor con espacio de reclutamiento actúa también como empresa (su consultora), sin cambiar de modo
  const actsAs = profile?.role === 'advisor' ? (company ? 'company' : 'advisor') : profile?.role

  return (
    <Ctx.Provider value={{ session, user: session?.user, profile, candidate, company, companies, switchCompany, isAdmin, advisor, loading, refresh, signOut, recovery, setRecovery, mode, setMode, actsAs }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

/** «Volver a mis vacantes»: la empresa las tiene en el inicio; el asesor, en /vacantes (su inicio junta todo) */
export const useVacanciesHome = () => (useContext(Ctx)?.profile?.role === 'advisor' ? '/vacantes' : '/')
