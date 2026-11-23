import {
    authConfiguration, cookieName, readCookie, makeCookie, validPostOrigin, jsonResponse,
    SESSION_SECONDS, CHALLENGE_SECONDS, isLocalDevelopment
} from './security.js';
import { createToken, validToken, hasSession, validChallenge } from './tokens.js';
import { verifyPassword } from './credentials.js';
import { checkLoginRateLimit } from './rate-limit.js';

async function readSmallJson(request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return { error: 'Use a JSON request.', status: 415 };
    }
    const reader = request.body?.getReader();
    if (!reader) return { error: 'Enter a password.', status: 400 };
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 2048) {
                await reader.cancel();
                return { error: 'Request is too large.', status: 413 };
            }
            chunks.push(Buffer.from(value));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON');
        return { body };
    } catch { return { error: 'Request could not be read. Try again.', status: 400 }; }
}

export async function handleAuth(request, { env = process.env, rateLimit = checkLoginRateLimit } = {}) {
    if (!['GET', 'POST'].includes(request.method)) return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
    if (new URL(request.url).protocol !== 'https:' && !isLocalDevelopment(request, env)) {
        return jsonResponse({ error: 'Use a secure connection.' }, 403);
    }
    let configuration;
    try { configuration = authConfiguration(env); }
    catch { return jsonResponse({ error: 'Book access is not configured yet. Contact the owner.' }, 503); }

    if (request.method === 'GET') {
        const site = request.headers.get('sec-fetch-site');
        if (site && site !== 'same-origin' && site !== 'none') return jsonResponse({ error: 'Open the login page directly.' }, 403);
        let csrfToken = readCookie(request, cookieName('challenge', request, env));
        if (!validToken(csrfToken, 'challenge', request, configuration)) csrfToken = createToken('challenge', request, configuration);
        return jsonResponse({ authenticated: hasSession(request, configuration, env), csrfToken }, 200, {
            'Set-Cookie': makeCookie('challenge', csrfToken, CHALLENGE_SECONDS, request, env)
        });
    }
    if (!validPostOrigin(request, env)) return jsonResponse({ error: 'Open the login page and try again.' }, 403);
    const parsed = await readSmallJson(request);
    if (parsed.error) return jsonResponse({ error: parsed.error }, parsed.status);
    const { action, csrfToken, password } = parsed.body;
    if (!validChallenge(request, csrfToken, configuration, env)) {
        return jsonResponse({ error: 'Login form expired. Reload the page and try again.' }, 403);
    }
    if (action === 'logout') {
        const response = jsonResponse({ ok: true }, 200, {
            'Clear-Site-Data': '"cache"',
            'Set-Cookie': makeCookie('session', '', 0, request, env)
        });
        response.headers.append('Set-Cookie', makeCookie('challenge', '', 0, request, env));
        return response;
    }
    if (action !== 'login') return jsonResponse({ error: 'Unknown action.' }, 400);
    if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 256) {
        return jsonResponse({ error: 'Enter your book password.' }, 400);
    }
    let limit;
    try { limit = await rateLimit(request, configuration, env); }
    catch { return jsonResponse({ error: 'Book access is temporarily unavailable. Try again later.' }, 503); }
    if (limit.error === 'not-found' || typeof limit.rateLimited !== 'boolean') {
        return jsonResponse({ error: 'Book access is temporarily unavailable. Try again later.' }, 503);
    }
    if (limit.rateLimited) return jsonResponse({ error: 'Too many attempts. Wait a few minutes and try again.' }, 429, { 'Retry-After': '300' });
    if (!await verifyPassword(password, configuration)) return jsonResponse({ error: 'That password is not correct. Try again.' }, 401);
    return jsonResponse({ ok: true }, 200, {
        'Set-Cookie': makeCookie('session', createToken('session', request, configuration), SESSION_SECONDS, request, env)
    });
}
