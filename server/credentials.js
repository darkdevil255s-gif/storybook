import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);
export const PASSWORD_ITERATIONS = 600000;

export async function hashPassword(password) {
    const bytes = Buffer.byteLength(password, 'utf8');
    if (password.length < 16 || bytes > 256) throw new Error('Use a password of at least 16 characters and at most 256 UTF-8 bytes');
    const salt = randomBytes(16);
    const digest = await derive(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
    return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export async function verifyPassword(password, configuration) {
    if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 256) return false;
    const digest = await derive(password, Buffer.from(configuration.salt, 'base64url'), PASSWORD_ITERATIONS, 32, 'sha256');
    return timingSafeEqual(digest, Buffer.from(configuration.digest, 'base64url'));
}
