import { createHmac } from 'node:crypto';
import { checkRateLimit } from '@vercel/firewall';
import { ipAddress } from '@vercel/functions';
import { isLocalDevelopment } from './security.js';

const localBuckets = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const LOCAL_LIMIT = 10;

export async function checkLoginRateLimit(request, configuration, env = process.env) {
    if (isLocalDevelopment(request, env)) {
        // This limiter is exclusively for the loopback-bound development server.
        const key = 'loopback';
        const now = Date.now();
        const bucket = localBuckets.get(key);
        if (!bucket || bucket.expires <= now) {
            localBuckets.set(key, { count: 1, expires: now + WINDOW_MS });
            return { rateLimited: false };
        }
        bucket.count++;
        return { rateLimited: bucket.count > LOCAL_LIMIT };
    }
    // Never inherit the SDK's development-mode bypass on an internet-facing deployment.
    if (env.NODE_ENV !== 'production') throw new Error('Production rate limiting is not available');
    const ip = ipAddress(request);
    if (!ip) throw new Error('Client IP is not available');
    const rateLimitKey = createHmac('sha256', configuration.secret).update(ip).digest('hex');
    // No password, session cookie, challenge token or user-agent is sent to the limiter.
    const headers = new Headers({ host: new URL(request.url).host, 'x-real-ip': ip, 'x-forwarded-for': ip });
    const result = await checkRateLimit(configuration.rateLimitId, { headers, rateLimitKey, timeout: 2000 });
    if (result.error === 'not-found' || typeof result.rateLimited !== 'boolean') {
        throw new Error('Login firewall rule is not configured');
    }
    return result;
}
