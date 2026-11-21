// Existing pages also reference this URL. Never install another offline worker.
;(async () => {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const worker = registration?.active || registration?.waiting || registration?.installing
    if (worker && new URL(worker.scriptURL).pathname === '/sw.js') {
      await registration.update()
    }
  } catch {
    // A disconnected browser retries on its next normal visit.
  }
})()
