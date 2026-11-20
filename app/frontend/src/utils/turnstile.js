let pending;

export function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (pending) return pending;

    pending = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        const finish = (error) => {
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
                script.remove();
                reject(error);
            } else {
                resolve(window.turnstile);
            }
        };
        const timer = setTimeout(() => finish(new Error('Turnstile load timed out')), 15000);
        script.onload = () => finish(window.turnstile ? null : new Error('Turnstile unavailable'));
        script.onerror = () => finish(new Error('Turnstile failed to load'));
        document.head.append(script);
    }).catch(error => {
        pending = undefined;
        throw error;
    });
    return pending;
}
