// Retire the offline worker at its original URL so returning browsers can upgrade.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim()
    const windows = await self.clients.matchAll({ type: 'window' })
    try {
      const names = await self.caches.keys()
      await Promise.all(names.filter(name =>
        name === 'page-cache' || name === 'asset-cache'
        || (name.startsWith('workbox-precache-') && name.endsWith(self.registration.scope))
      ).map(name => self.caches.delete(name)))
    } catch {
      // Cache storage may be unavailable; it must not prevent the upgrade.
    }
    await self.registration.unregister()
    await Promise.allSettled(windows.map(client => client.navigate(client.url)))
  })())
})
