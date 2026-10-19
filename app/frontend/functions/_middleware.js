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
// Uses service binding if configured (BACKEND), otherwise fetches via HTTPS.
const BACKEND_URL = "https://m.ciaooo55.us.ci";

export async function onRequest(context) {
    const reqPath = new URL(context.request.url).pathname;
    if (API_PATHS.map(path => reqPath.startsWith(path)).some(Boolean)) {
        // Prefer service binding (no network hop, no auth needed)
        if (context.env.BACKEND) {
            return context.env.BACKEND.fetch(context.request);
        }
        // Fallback: proxy via HTTPS to the backend worker
        const url = new URL(context.request.url);
        url.host = new URL(BACKEND_URL).host;
        url.protocol = "https:";
        url.port = "";
        const req = new Request(url.toString(), context.request);
        return fetch(req);
    }
    return await context.next();
}
