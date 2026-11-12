import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { colorFor, initials } from '../lib/catalog'
import { MatchModal } from './MatchModal'

/**
 * Avisa de matches que completó la OTRA persona:
 * - al abrir la app (matches aún no vistos por mi lado)
 * - en vivo, si la app está abierta cuando ocurre
 * Informa la cantidad pendiente para mostrar un punto en "Chats".
 */
export function MatchWatcher({ onCount }) {
  const { user, profile, company, actsAs } = useAuth()
  const [queue, setQueue] = useState([])
  const isCompany = actsAs === 'company'
  const mySeen = isCompany ? 'company_seen' : 'candidate_seen'

  const refresh = useCallback(async () => {
    if (!user) return
    const { data: unseen } = await supabase.from('matches').select('id').eq(mySeen, false)
    const ids = (unseen || []).map((x) => x.id)
    onCount?.(ids.length)
    if (!ids.length) return setQueue([])
    const { data: all } = await supabase.rpc('my_matches')
    const meInit = isCompany ? initials(company?.display_name) : `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    const meColor = isCompany ? colorFor(company?.display_name || '') : '#D02E72'
    setQueue((all || []).filter((m) => ids.includes(m.match_id)).map((m) => ({
      matchId: m.match_id, jobTitle: m.job_title,
      otherName: isCompany ? m.candidate_name.split(' ')[0] + ' ' + (m.candidate_name.split(' ')[1]?.[0] || '') + '.' : m.company_name,
      leftInitials: meInit, leftColor: meColor,
      rightInitials: initials(isCompany ? m.candidate_name : m.company_name), rightColor: isCompany ? '#D02E72' : colorFor(m.company_name),
      continueLabel: 'Ver después',
      note: isCompany ? 'Esta persona aceptó tu interés. Su teléfono y correo se muestran solo si decide compartirlos.' : 'La empresa también se interesó en ti. Ya pueden conversar.',
    })))
  }, [user, profile, company, isCompany, mySeen, onCount])

  useEffect(() => {
    refresh()
    const ch = supabase.channel(`matches-${user?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (p) => { if (p.new && p.new[mySeen] === false) refresh() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => refresh())
      .subscribe()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus) }
  }, [refresh, user, mySeen])

  const close = async () => {
    const cur = queue[0]
    setQueue((q) => q.slice(1))
    if (cur) await supabase.rpc('mark_match_seen', { p_match: cur.matchId })
    onCount?.(Math.max(0, queue.length - 1))
  }

  return <MatchModal match={queue[0] || null} onClose={close} />
}
