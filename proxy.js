import { next } from '@vercel/functions';
import { authConfiguration, securityHeaders, isLocalDevelopment } from './server/security.js';
import { hasSession } from './server/tokens.js';

export const config = { runtime: 'nodejs' };
const PUBLIC_PATHS = new Set(['/login.html', '/login.css', '/login.js', '/api/auth']);

export default function proxy(request) {
    const url = new URL(request.url);
    const headers = securityHeaders();
    if (url.protocol !== 'https:' && !isLocalDevelopment(request)) {
        return new Response('A secure connection is required.', { status: 403, headers });
    }
    // Exact allowlist only. No /assets/, file extensions or chapter-directory exclusions.
    if (PUBLIC_PATHS.has(url.pathname)) return next({ headers });
    let configuration;
    try { configuration = authConfiguration(); }
    catch { return new Response('Book access is not configured yet.', { status: 503, headers }); }

    // Vercel's internal firewall endpoint serves no book data and must work before login.
    if (url.pathname === '/.well-known/vercel/rate-limit-api/' + configuration.rateLimitId
        && request.headers.get('x-vercel-rate-limit-api') === configuration.rateLimitId) {
        return next({ headers });
    }
    if (hasSession(request, configuration)) return next({ headers });
    const documentRequest = request.headers.get('sec-fetch-dest') === 'document'
        || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    if (['GET', 'HEAD'].includes(request.method) && documentRequest) {
        const login = new URL('/login.html', url);
        const returnPath = url.pathname === '/index.html' || url.pathname === '/'
            || /^\/chapters\/[a-z0-9-]+\/(?:index\.html)?$/.test(url.pathname) ? url.pathname : '/index.html';
        login.searchParams.set('next', returnPath);
        headers.set('Location', login.href);
        return new Response(null, { status: 303, headers });
    }
    return new Response('Book login required.', { status: 401, headers });
}
