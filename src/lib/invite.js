// Invitación pendiente guardada en el dispositivo (para no cargar la página de invitación al inicio)
export const INVITE_KEY = 'vinka-invite'
export const savePendingInvite = (t) => { try { localStorage.setItem(INVITE_KEY, t) } catch { /* sin almacenamiento */ } }
export const readPendingInvite = () => { try { return localStorage.getItem(INVITE_KEY) } catch { return null } }
