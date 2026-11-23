import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import proxy from '../proxy.js';
import { handleAuth } from '../server/auth-handler.js';
import { hashPassword } from '../server/credentials.js';
import { authConfiguration, makeCookie, SESSION_SECONDS } from '../server/security.js';
import { createToken, validToken } from '../server/tokens.js';
import { checkLoginRateLimit } from '../server/rate-limit.js';

const phrase = randomBytes(18).toString('base64url');
const env = {
    BOOK_PASSWORD_HASH: await hashPassword(phrase),
    BOOK_SESSION_SECRET: randomBytes(32).toString('base64url'),
    BOOK_AUTH_RATE_LIMIT_ID: 'book-login',
    NODE_ENV: 'production'
};
Object.assign(process.env, env);
const configuration = authConfiguration(env);
const origin = 'https://example.test';
const loginUrl = origin + '/api/auth';
const request = (path = '/index.html', headers = {}) => new Request(origin + path, { headers });
const passRateLimit = async () => ({ rateLimited: false });

async function challenge() {
    const response = await handleAuth(new Request(loginUrl, { headers: { 'sec-fetch-site': 'same-origin' } }), { env });
    assert.equal(response.status, 200);
    const body = await response.json();
    return { csrfToken: body.csrfToken, cookie: response.headers.get('set-cookie').split(';')[0] };
}
function loginRequest({ csrfToken, cookie }, password = phrase, extras = {}) {
    return new Request(loginUrl, {
        method: 'POST', headers: {
            'Content-Type': 'application/json', Origin: origin, Cookie: cookie,
            'sec-fetch-site': 'same-origin', ...(extras.headers || {})
        }, body: JSON.stringify({ action: 'login', password, csrfToken, ...(extras.body || {}) })
    });
}

const protectedPaths = [
    '/', '/index.html', '/chapters/01-kiddo/index.html', '/chapters/01-kiddo/',
    '/chapters/02-remember/memories.js', '/chapters/01-kiddo/chapter.js',
    '/chapters/01-kiddo/assets/IMG_1811.jpg', '/chapters/01-kiddo/assets/VID20240609015515.mp4',
    '/chapters/01-kiddo/assets/Cry.mp3', '/chapters/04-one-last-time-perhaps/assets/photos/IMG-20260531-WA0046.jpg',
    '/chapters/04-one-last-time-perhaps/assets/caveat-regular.ttf', '/assets/chapter-tools.js',
    '/assets/book-session.js', '/site/index.html', '/source-material/shared/actual-write-ups.txt',
    '/login.html/../index.html', '/%69ndex.html', '/LOGIN.HTML', '/login.html%2f..%2findex.html'
];

test('anonymous users cannot pass the middleware for any protected resource', () => {
    for (const path of protectedPaths) {
        const response = proxy(request(path));
        assert.notEqual(response.headers.get('x-middleware-next'), '1', path);
        assert.ok([401, 303].includes(response.status), path);
        assert.match(response.headers.get('cache-control'), /no-store/);
    }
});

test('HEAD and Range requests cannot bypass the gate', () => {
    for (const method of ['GET', 'HEAD']) {
        const response = proxy(new Request(origin + '/chapters/01-kiddo/assets/VID20240609015515.mp4', {
            method, headers: { range: 'bytes=0-1023' }
        }));
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('x-middleware-next'), null);
    }
});

test('only the exact public login/API allowlist is passed through', () => {
    for (const path of ['/login.html', '/login.css', '/login.js', '/api/auth']) {
        assert.equal(proxy(request(path)).headers.get('x-middleware-next'), '1');
    }
    for (const path of ['/login.css/private.jpg', '/api/auth/private.jpg', '/login.html/anything', '/assets/anything']) {
        assert.notEqual(proxy(request(path)).headers.get('x-middleware-next'), '1');
    }
});

test('missing auth configuration fails closed', () => {
    const previous = process.env.BOOK_SESSION_SECRET;
    delete process.env.BOOK_SESSION_SECRET;
    try {
        assert.equal(proxy(request('/chapters/04-one-last-time-perhaps/index.html')).status, 503);
        assert.equal(proxy(request('/chapters/04-one-last-time-perhaps/assets/kalle-kalle.mp3')).status, 503);
    } finally { process.env.BOOK_SESSION_SECRET = previous; }
});

test('valid signed session allows pages and media with no-store headers', () => {
    const token = createToken('session', request(), configuration);
    for (const path of protectedPaths.slice(0, 12)) {
        const response = proxy(request(path, { Cookie: '__Host-book-session=' + token }));
        assert.equal(response.headers.get('x-middleware-next'), '1');
        assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    }
});

test('tampered, expired, future, wrong-origin and challenge tokens are not sessions', () => {
    const now = Math.floor(Date.now() / 1000);
    const valid = createToken('session', request(), configuration, now);
    const cases = [
        valid.slice(0, -1) + (valid.endsWith('a') ? 'b' : 'a'),
        createToken('session', request(), configuration, now - SESSION_SECONDS - 1),
        createToken('session', request(), configuration, now + 60),
        createToken('session', new Request('https://other.test/'), configuration, now),
        createToken('challenge', request(), configuration, now),
        'malformed', 'a.b', ''
    ];
    for (const token of cases) {
        assert.equal(validToken(token, 'session', request(), configuration, now), false);
        assert.notEqual(proxy(request('/index.html', { Cookie: '__Host-book-session=' + token })).headers.get('x-middleware-next'), '1');
    }
});

test('duplicate session cookies are rejected', () => {
    const token = createToken('session', request(), configuration);
    assert.notEqual(proxy(request('/index.html', { Cookie: `__Host-book-session=${token}; __Host-book-session=${token}` })).headers.get('x-middleware-next'), '1');
});

test('rotating password hash or signing secret invalidates sessions', async () => {
    const token = createToken('session', request(), configuration);
    const changed = authConfiguration({ ...env, BOOK_PASSWORD_HASH: await hashPassword(randomBytes(18).toString('base64url')) });
    assert.equal(validToken(token, 'session', request(), changed), false);
    assert.equal(validToken(token, 'session', request(), { ...configuration, secret: randomBytes(32).toString('base64url') }), false);
});

test('production cookies are host-only Secure HttpOnly SameSite=Strict', () => {
    const cookie = makeCookie('session', 'example', SESSION_SECONDS, request(), env);
    assert.ok(cookie.startsWith('__Host-book-session='));
    for (const text of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=28800']) assert.ok(cookie.includes(text));
    assert.ok(!cookie.includes('Domain='));
});

test('plain HTTP and internet-facing development flags do not disable protection', () => {
    const old = process.env.BOOK_DEV_MODE;
    process.env.BOOK_DEV_MODE = 'true';
    try {
        assert.equal(proxy(new Request('http://example.test/index.html')).status, 403);
        assert.equal(proxy(new Request('http://localhost:8766/index.html')).status, 303);
        process.env.VERCEL = '1';
        assert.equal(proxy(new Request('http://localhost:8766/index.html')).status, 403);
    } finally {
        if (old === undefined) delete process.env.BOOK_DEV_MODE; else process.env.BOOK_DEV_MODE = old;
        delete process.env.VERCEL;
    }
});

test('GET issues a signed challenge and never reveals the password/hash/secret', async () => {
    const response = await handleAuth(new Request(loginUrl), { env });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!text.includes(phrase) && !text.includes(env.BOOK_PASSWORD_HASH) && !text.includes(env.BOOK_SESSION_SECRET));
    assert.match(response.headers.get('set-cookie'), /__Host-book-challenge=.*HttpOnly.*Secure/);
});

test('correct password obtains a valid session; wrong password does not', async () => {
    const state = await challenge();
    const wrong = await handleAuth(loginRequest(state, 'incorrect'), { env, rateLimit: passRateLimit });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('set-cookie'), null);
    const correct = await handleAuth(loginRequest(state), { env, rateLimit: passRateLimit });
    assert.equal(correct.status, 200);
    const cookie = correct.headers.get('set-cookie').split(';')[0];
    assert.equal(proxy(request('/chapters/04-one-last-time-perhaps/index.html', { Cookie: cookie })).headers.get('x-middleware-next'), '1');
});

test('cross-origin, missing-origin and missing/forged challenges fail login', async () => {
    const state = await challenge();
    for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'sec-fetch-site': 'cross-site' }]) {
        const response = await handleAuth(loginRequest(state, phrase, { headers }), { env, rateLimit: passRateLimit });
        assert.equal(response.status, 403);
    }
    for (const forged of ['', 'invalid', state.csrfToken + 'x']) {
        assert.equal((await handleAuth(loginRequest({ ...state, csrfToken: forged }), { env, rateLimit: passRateLimit })).status, 403);
    }
});

test('rate-limited login denies correct passwords', async () => {
    const response = await handleAuth(loginRequest(await challenge()), { env, rateLimit: async () => ({ rateLimited: true }) });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '300');
    assert.equal(response.headers.get('set-cookie'), null);
});

test('missing firewall rule and rate-limit service failures fail closed', async () => {
    const state = await challenge();
    for (const limiter of [async () => ({ rateLimited: false, error: 'not-found' }), async () => { throw new Error('Service unavailable'); }]) {
        const response = await handleAuth(loginRequest(state), { env, rateLimit: limiter });
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('set-cookie'), null);
    }
});

test('production limiter rejects non-production runtime rather than inheriting SDK bypass', async () => {
    await assert.rejects(checkLoginRateLimit(request(), configuration, { ...env, NODE_ENV: 'development' }));
});

test('bad methods, content types and oversized payloads are rejected', async () => {
    assert.equal((await handleAuth(new Request(loginUrl, { method: 'PUT' }), { env })).status, 405);
    const state = await challenge();
    assert.equal((await handleAuth(loginRequest(state, phrase, { headers: { 'Content-Type': 'text/plain' } }), { env })).status, 415);
    const oversized = loginRequest(state, phrase, { body: { ignored: 'x'.repeat(3000) } });
    assert.equal((await handleAuth(oversized, { env })).status, 413);
});

test('logout clears both cookies and requires same-origin CSRF', async () => {
    const state = await challenge();
    const response = await handleAuth(loginRequest(state, undefined, { body: { action: 'logout' } }), { env });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every(cookie => cookie.includes('Max-Age=0')));
    const attack = loginRequest(state, undefined, { headers: { Origin: 'https://attacker.test' }, body: { action: 'logout' } });
    assert.equal((await handleAuth(attack, { env })).status, 403);
});

test('deployment output excludes server secrets and never narrows middleware matching', async () => {
    const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.equal(vercel.outputDirectory, 'site');
    assert.equal(vercel.proxy.entrypoint, 'proxy.js');
    assert.equal(vercel.proxy.matcher, undefined);
    const ignores = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
    assert.ok(ignores.includes('/local-only/') && ignores.includes('/source-material/') && ignores.includes('.env'));
});
