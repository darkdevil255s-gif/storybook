import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_SECONDS, CHALLENGE_SECONDS, cookieName, readCookie } from './security.js';

function sign(value, secret) {
    return createHmac('sha256', Buffer.from(secret, 'base64url')).update(value).digest('base64url');
}

function credentialVersion(configuration) {
    return sign('password-version:' + configuration.passwordHash, configuration.secret);
}

export function createToken(kind, request, configuration, now = Math.floor(Date.now() / 1000)) {
    const lifetime = kind === 'session' ? SESSION_SECONDS : CHALLENGE_SECONDS;
    const payload = Buffer.from(JSON.stringify({
        v: 1, kind, iat: now, exp: now + lifetime,
        origin: new URL(request.url).origin,
        credential: credentialVersion(configuration),
        nonce: randomBytes(16).toString('base64url')
    })).toString('base64url');
    return payload + '.' + sign(payload, configuration.secret);
}

export function validToken(token, kind, request, configuration, now = Math.floor(Date.now() / 1000)) {
    if (typeof token !== 'string' || token.length > 1500) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
    const expected = Buffer.from(sign(parts[0], configuration.secret));
    if (!timingSafeEqual(expected, Buffer.from(parts[1]))) return false;
    try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const lifetime = kind === 'session' ? SESSION_SECONDS : CHALLENGE_SECONDS;
        return payload.v === 1 && payload.kind === kind
            && payload.origin === new URL(request.url).origin
            && payload.credential === credentialVersion(configuration)
            && Number.isInteger(payload.iat) && Number.isInteger(payload.exp)
            && payload.iat <= now + 30 && payload.iat > now - lifetime
            && payload.exp - payload.iat === lifetime && payload.exp > now
            && /^[A-Za-z0-9_-]{22}$/.test(payload.nonce);
    } catch { return false; }
}

export function hasSession(request, configuration, env = process.env) {
    return validToken(readCookie(request, cookieName('session', request, env)), 'session', request, configuration);
}

export function validChallenge(request, token, configuration, env = process.env) {
    const cookie = readCookie(request, cookieName('challenge', request, env));
    return typeof token === 'string' && cookie === token && validToken(token, 'challenge', request, configuration);
}
