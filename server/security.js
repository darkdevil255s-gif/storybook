export const SESSION_SECONDS = 8 * 60 * 60;
export const CHALLENGE_SECONDS = 15 * 60;

export function isLocalDevelopment(request, env = process.env) {
    const url = new URL(request.url);
    return env.BOOK_DEV_MODE === 'true' && env.VERCEL !== '1'
        && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
}

export function securityHeaders() {
    return new Headers({
        'Cache-Control': 'private, no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'Vary': 'Cookie',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'"
    });
}

export function jsonResponse(body, status = 200, additional = {}) {
    const headers = securityHeaders();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    for (const [name, value] of Object.entries(additional)) headers.set(name, value);
    return new Response(JSON.stringify(body), { status, headers });
}

export function cookieName(kind, request, env = process.env) {
    const base = kind === 'session' ? 'book-session' : 'book-challenge';
    return isLocalDevelopment(request, env) ? base + '-dev' : '__Host-' + base;
}

export function readCookie(request, name) {
    const values = (request.headers.get('cookie') || '').split(';').map(part => part.trim())
        .filter(part => part.startsWith(name + '=')).map(part => part.slice(name.length + 1));
    // Reject ambiguous duplicates rather than trusting attacker-controlled ordering.
    return values.length === 1 && values[0].length <= 2048 ? values[0] : null;
}

export function makeCookie(kind, value, seconds, request, env = process.env) {
    const secure = isLocalDevelopment(request, env) ? '' : '; Secure';
    return `${cookieName(kind, request, env)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure}`;
}

export function validPostOrigin(request, env = process.env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !isLocalDevelopment(request, env)) return false;
    const origin = request.headers.get('origin');
    if (!origin || origin !== url.origin) return false;
    const site = request.headers.get('sec-fetch-site');
    return !site || site === 'same-origin';
}

export function authConfiguration(env = process.env) {
    const hash = env.BOOK_PASSWORD_HASH || '';
    const match = hash.match(/^pbkdf2-sha256\$600000\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/);
    const secret = env.BOOK_SESSION_SECRET || '';
    const rateLimitId = env.BOOK_AUTH_RATE_LIMIT_ID || '';
    if (!match || !/^[A-Za-z0-9_-]{43}$/.test(secret) || !/^[a-z0-9-]{1,64}$/.test(rateLimitId)) {
        throw new Error('Book authentication is not configured');
    }
    return { passwordHash: hash, salt: match[1], digest: match[2], secret, rateLimitId };
}
