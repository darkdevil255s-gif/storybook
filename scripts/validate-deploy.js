import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, relative } from 'node:path';
import { authConfiguration } from '../server/security.js';

const root = resolve(import.meta.dirname, '..');
const site = join(root, 'site');
const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
if (config.outputDirectory !== 'site' || config.proxy?.entrypoint !== 'proxy.js' || config.proxy.matcher) {
    throw new Error('Deployment must use site output and the all-route proxy.');
}
const files = [];
async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Do not deploy symlinks: ' + relative(site, file));
        if (entry.isDirectory()) await walk(file);
        else files.push(file);
    }
}
await walk(site);
let bytes = 0;
for (const file of files) {
    const name = relative(site, file).replaceAll('\\', '/');
    if (name.includes('source-material/') || /(^|\/)\.env/.test(name) || ['.txt', '.zip', '.map', '.pem'].includes(extname(file))) {
        throw new Error('Private source or credential file is in the public build output: ' + name);
    }
    const info = await stat(file);
    bytes += info.size;
    if (info.size > 100 * 1024 * 1024) throw new Error('File exceeds 100 MiB: ' + name);
}
for (const file of ['index.html', 'login.html', 'login.css', 'login.js',
    'chapters/01-kiddo/index.html', 'chapters/02-remember/index.html',
    'chapters/03-that-morning/index.html', 'chapters/04-one-last-time-perhaps/index.html']) {
    await accessFile(join(site, file));
}
async function accessFile(file) { await stat(file); }
if (process.env.VERCEL === '1') {
    authConfiguration();
    if (process.env.BOOK_DEV_MODE) throw new Error('Do not set BOOK_DEV_MODE on Vercel.');
}
console.log(`Build validated: ${files.length} files, ${(bytes / 1048576).toFixed(2)} MiB. All-route server protection configured.`);
console.log('Production login remains closed until environment variables and the book-login firewall rule are configured.');
