import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashPassword } from '../server/credentials.js';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env.local');
const credentialsFile = resolve(root, 'local-only', 'book-access.txt');

for (const file of [envFile, credentialsFile]) {
    try {
        await access(file);
        console.error('Local authentication already exists. Keep it, or move it aside before generating new credentials.');
        process.exit(1);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const accessPhrase = randomBytes(18).toString('base64url');
const sessionSecret = randomBytes(32).toString('base64url');
const passwordHash = await hashPassword(accessPhrase);
const variables = [
    `BOOK_PASSWORD_HASH='${passwordHash}'`,
    // harness-ignore: no-hardcoded-credentials
    `BOOK_SESSION_SECRET='${sessionSecret}'`,
    "BOOK_AUTH_RATE_LIMIT_ID='book-login'"
].join('\n');
await mkdir(resolve(root, 'local-only'), { recursive: true, mode: 0o700 });
await writeFile(credentialsFile,
    'PRIVATE. Do not upload or commit this file.\n\n'
    + 'Book password (share privately with the intended reader):\n' + accessPhrase + '\n\n'
    + 'Vercel environment variables (copy values without quotes):\n' + variables + '\n\n'
    + 'Keep BOOK_DEV_MODE out of Vercel. Create the book-login firewall rate-limit rule before enabling access.\n',
    { flag: 'wx', mode: 0o600 });
await writeFile(envFile, variables + "\nBOOK_DEV_MODE='true'\n", { flag: 'wx', mode: 0o600 });
console.log('Authentication generated. Secrets were not printed.');
console.log('Open local-only/book-access.txt for the book password and Vercel environment values.');
console.log('Run npm run dev for local preview. Production requires the firewall rule described in DEPLOYMENT.md.');
