(function () {
    'use strict';
    const get = id => document.getElementById(id);
    const candidate = new URLSearchParams(location.search).get('next') || '/index.html';
    const returnPath = candidate === '/' || candidate === '/index.html'
        || /^\/chapters\/[a-z0-9-]+\/(?:index\.html)?$/.test(candidate) ? candidate : '/index.html';
    let csrfToken = '';
    let submitting = false;
    let preparing = false;

    function setReady(ready) {
        get('book-password').disabled = !ready;
        get('show-password').disabled = !ready;
        get('open-book').disabled = !ready || submitting;
    }

    async function authRequest(options = {}) {
        const response = await fetch('/api/auth', {
            credentials: 'same-origin', cache: 'no-store', redirect: 'error',
            signal: AbortSignal.timeout(15000), ...options
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error('Login service is unavailable. Try again later.'); }
        if (!result || typeof result !== 'object') throw new Error('Login service is unavailable. Try again later.');
        return { response, result };
    }

    async function prepare() {
        if (preparing) return;
        preparing = true;
        csrfToken = '';
        setReady(false);
        get('retry-login').hidden = true;
        get('login-status').textContent = 'Preparing secure login…';
        try {
            const { response, result } = await authRequest();
            if (!response.ok) {
                get('login-status').textContent = result.error || 'Login is unavailable. Try again later.';
                get('retry-login').hidden = false;
                return;
            }
            if (result.authenticated) { location.replace(returnPath); return; }
            if (typeof result.csrfToken !== 'string' || !result.csrfToken) {
                throw new Error('Login service is unavailable. Try again later.');
            }
            csrfToken = result.csrfToken;
            get('book-password').removeAttribute('aria-invalid');
            setReady(true);
            get('login-status').textContent = '';
        } catch (error) {
            get('login-status').textContent = error.name === 'TimeoutError'
                ? 'Connection timed out. Try again.'
                : 'Could not prepare login. Check your connection and try again.';
            get('retry-login').hidden = false;
        } finally { preparing = false; }
    }

    get('show-password').addEventListener('click', () => {
        const show = get('book-password').type === 'password';
        get('book-password').type = show ? 'text' : 'password';
        get('show-password').textContent = show ? 'Hide' : 'Show';
        get('show-password').setAttribute('aria-pressed', String(show));
    });
    get('book-password').addEventListener('input', () => get('book-password').removeAttribute('aria-invalid'));
    get('retry-login').addEventListener('click', prepare);
    get('login-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting || preparing || !csrfToken) return;
        submitting = true;
        get('open-book').disabled = true;
        get('open-book').textContent = 'Opening…';
        get('login-status').textContent = '';
        try {
            const { response, result } = await authRequest({
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', password: get('book-password').value, csrfToken })
            });
            if (!response.ok || result.ok !== true) {
                get('book-password').setAttribute('aria-invalid', 'true');
                get('login-status').textContent = result.error || 'Could not sign in. Try again.';
                if (response.status === 403) await prepare();
                return;
            }
            get('book-password').value = '';
            location.replace(returnPath);
        } catch {
            get('login-status').textContent = 'Could not connect. Check your connection and try again.';
        } finally {
            submitting = false;
            setReady(Boolean(csrfToken));
            get('open-book').textContent = 'Open book';
        }
    });
    if (!['http:', 'https:'].includes(location.protocol)) {
        setReady(false);
        get('login-status').textContent = 'Server login needs a website URL. Run npm run dev, then open http://127.0.0.1:8766.';
        return;
    }
    prepare();
})();
