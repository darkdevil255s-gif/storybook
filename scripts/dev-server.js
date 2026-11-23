/* Loopback preview uses the same middleware and API handler as Vercel. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import proxy from '../proxy.js';
import { handleAuth } from '../server/auth-handler.js';
import { authConfiguration } from '../server/security.js';

if (process.env.BOOK_DEV_MODE !== 'true' || process.env.VERCEL === '1') {
    throw new Error('Use local-only development configuration, never this server for public hosting.');
}
authConfiguration();
const root = await realpath(resolve(import.meta.dirname, '..', 'site'));
const port = Number(process.env.PORT || 8766);
const origin = `http://127.0.0.1:${port}`;
const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.ttf': 'font/ttf'
};
async function sendWebResponse(response, res, method) {
    res.statusCode = response.status;
    for (const [name, value] of response.headers) {
        if (name !== 'set-cookie') res.setHeader(name, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    if (method === 'HEAD' || !response.body) { res.end(); return; }
    Readable.fromWeb(response.body).pipe(res);
}
const server = createServer(async (req, res) => {
    try {
        // Do not trust Host to change the origin or route outside the local preview.
        if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end('Use the loopback preview URL.'); return; }
        const url = new URL(req.url, origin);
        if (url.origin !== origin) { res.writeHead(400); res.end(); return; }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        const options = { method: req.method, headers };
        if (!['GET', 'HEAD'].includes(req.method)) { options.body = Readable.toWeb(req); options.duplex = 'half'; }
        const request = new Request(url, options);
        const gate = proxy(request);
        if (gate.headers.get('x-middleware-next') !== '1') { await sendWebResponse(gate, res, req.method); return; }
        if (url.pathname === '/api/auth') { await sendWebResponse(await handleAuth(request), res, req.method); return; }
        for (const [name, value] of gate.headers) { if (!name.startsWith('x-middleware-')) res.setHeader(name, value); }
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
        let pathname;
        try { pathname = decodeURIComponent(url.pathname); }
        catch { res.writeHead(400); res.end(); return; }
        if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(400); res.end(); return; }
        let file = resolve(root, '.' + pathname);
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
        try {
            let info = await stat(file);
            if (info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file); }
            file = await realpath(file);
            if (!file.startsWith(root + sep) || !info.isFile()) throw new Error('Not a static file');
            const range = req.headers.range;
            let start = 0;
            let end = info.size - 1;
            if (range) {
                const match = /^bytes=(\d+)-(\d*)$/.exec(range);
                if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
                start = Number(match[1]);
                end = match[2] ? Math.min(Number(match[2]), end) : end;
                if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
                res.statusCode = 206;
                res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
            }
            res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', String(Math.max(0, end - start + 1)));
            if (req.method === 'HEAD' || info.size === 0) { res.end(); return; }
            const stream = createReadStream(file, { start, end });
            stream.on('error', () => res.destroy());
            stream.pipe(res);
        } catch { res.writeHead(404); res.end('Page not found.'); }
    } catch { if (!res.headersSent) res.writeHead(500); res.end('Preview could not serve this request.'); }
});
server.listen(port, '127.0.0.1', () => console.log('Protected local preview: ' + origin));
