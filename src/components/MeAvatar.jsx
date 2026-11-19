import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { colorFor, initials } from '../lib/catalog'
import { Avatar } from './ui'

// Círculo con las iniciales: abre «Mi cuenta» (mismo lugar para todos los roles)
export function MeAvatar() {
  const { profile } = useAuth()
  if (!profile) return null
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  return <Link to="/cuenta" aria-label="Mi cuenta" className="shrink-0 rounded-full"><Avatar text={initials(name) || '?'} color={colorFor(name)} size={40} round /></Link>
}
