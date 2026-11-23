/* Server access checks remain authoritative. This script supplies the Lock control. */
(function () {
    'use strict';
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const button = document.createElement('button');
    button.id = 'book-lock';
    button.type = 'button';
    button.textContent = 'Lock';
    button.setAttribute('aria-label', 'Lock book and sign out');
    document.body.appendChild(button);
    const notice = document.createElement('p');
    notice.id = 'book-access-notice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    document.body.appendChild(notice);
    let pending = false;

    function login() {
        const destination = new URL('/login.html', location.origin);
        destination.searchParams.set('next', location.pathname);
        location.replace(destination.href);
    }

    async function status() {
        const response = await fetch('/api/auth', {
            credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('Access unavailable');
        return response.json();
    }

    button.addEventListener('click', async () => {
        if (pending) return;
        pending = true;
        button.disabled = true;
        notice.hidden = true;
        try {
            const state = await status();
            const response = await fetch('/api/auth', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
                signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout', csrfToken: state.csrfToken })
            });
            if (!response.ok) throw new Error('Could not lock');
            document.querySelectorAll('audio, video').forEach(media => media.pause());
            location.replace('/login.html');
        } catch {
            notice.textContent = 'Could not lock the book. Check your connection and try again.';
            notice.hidden = false;
        } finally { pending = false; button.disabled = false; }
    });
    window.addEventListener('pageshow', () => {
        status().then(state => { if (!state.authenticated) login(); }).catch(() => {
            notice.textContent = 'Access could not be checked. Reload when your connection returns.';
            notice.hidden = false;
        });
    });
})();
