const API_PATHS = [
    "/api/",
    "/open_api/",
    "/user_api/",
    "/admin/",
    "/telegram/",
    "/external/",
    "/redeem_api/",
];

// Backend worker URL - proxies API requests to the production worker.
// Configurable via Pages env var BACKEND_URL; defaults to the canonical domain.
const DEFAULT_BACKEND_URL = "https://api.ciaooo55.de5.net";

export async function onRequest(context) {
    const reqPath = new URL(context.request.url).pathname;
    if (API_PATHS.map(path => reqPath.startsWith(path)).some(Boolean)) {
        // Prefer service binding (no network hop, no auth needed)
        if (context.env.BACKEND) {
            return context.env.BACKEND.fetch(context.request);
        }
        const backendUrl = context.env.BACKEND_URL || DEFAULT_BACKEND_URL;
        // Fallback: proxy via HTTPS to the backend worker
        const url = new URL(context.request.url);
        url.host = new URL(backendUrl).host;
        url.protocol = "https:";
        url.port = "";
        const req = new Request(url.toString(), context.request);
        return fetch(req);
    }
    return await context.next();
}
