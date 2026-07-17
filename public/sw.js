// Service worker mínimo: solo push notifications, sin caching/offline.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* payload no era JSON */ }
  const title = data.title || 'Notificación'
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    data: { url: data.url || '/#/taller' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/#/taller'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
