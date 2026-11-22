export function retryAfterSeconds(value, now = Date.now()) {
    if (value == null || value === '') return 0
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
    const date = Date.parse(value)
    return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : 0
}

export function createMailPolling(getInterval, random = Math.random) {
    let failures = 0
    let paused = false
    const interval = () => Math.max(1, Number(getInterval()) || 60)
    return {
        get paused() { return paused },
        get failures() { return failures },
        reset() {
            failures = 0
            paused = false
            return interval()
        },
        fail(error) {
            failures++
            paused = error.status === 401 || error.status === 403
            const base = interval()
            const cap = Math.max(base, 300)
            const delay = Math.min(cap, Math.round(base * 2 ** Math.min(failures, 20) * (0.8 + random() * 0.4)))
            return {
                notify: failures === 1 && !error.authRequired,
                delay: Math.max(delay, retryAfterSeconds(error.retryAfter)),
            }
        },
    }
}
