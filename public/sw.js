// Service worker de VINKA: recibe notificaciones push y abre el chat al tocarlas.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'VINKA'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Tienes novedades en VINKA',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'vinka',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate(url) }
    }
    return self.clients.openWindow(url)
  })())
})
