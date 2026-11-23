/* Chapter IV's key recalls what the reader's heart wanted when he was leaving.
   These client-side gates are a reading experience, not server-side authentication. */
(function () {
    'use strict';
    const tools = window.ChapterTools;
    const UNLOCK_ANSWER = 'stay';
    const MUSIC_FILE = 'kalle-kalle.mp3';
    const MUSIC_VOLUME = 0.3;
    const get = id => document.getElementById(id);
    const gateTimers = tools.timers();
    let opening = false;
    let unlocked = false;

    function openLetter() {
        opening = true;
        get('unlock-btn').disabled = true;
        get('unlock-btn').textContent = 'Opening…';
        // Start within the unlock gesture, not the fade timeout, so mobile browsers allow audio.
        tools.playMusic(get('bg-music'), get('music-toggle'), MUSIC_FILE, MUSIC_VOLUME).then(() => {
            if (get('bg-music').paused && !get('bg-music').error) {
                get('music-status').textContent = 'Press Play Song to start the song.';
            }
        });
        get('lock-screen').classList.add('fade-out');
        gateTimers.later(() => {
            opening = false;
            unlocked = true;
            tools.setActive(get('lock-screen'), false);
            get('lock-screen').hidden = true;
            get('letter-screen').hidden = false;
            tools.setActive(get('letter-screen'), true);
            document.body.classList.add('unlocked');
            get('music-toggle').hidden = false;
            get('letter-title').focus({ preventScroll: true });
            revealSections();
            window.ChapterAutumn.start();
        }, 700);
    }

    function revealSections() {
        if (tools.reducedMotion() || !('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('arriving');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.05, rootMargin: '0px 0px -5% 0px' });
        document.querySelectorAll('[data-reveal]').forEach(section => observer.observe(section));
    }

    document.addEventListener('DOMContentLoaded', () => {
        tools.bindMusic(get('bg-music'), get('music-toggle'));
        window.ChapterAutumn.preview();
        get('unlock-form').addEventListener('submit', event => {
            event.preventDefault();
            if (opening || unlocked) return;
            const input = get('chapter-password');
            const answer = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
            if (answer === UNLOCK_ANSWER) {
                input.removeAttribute('aria-invalid');
                get('lock-wrong').textContent = '';
                openLetter();
            } else {
                input.setAttribute('aria-invalid', 'true');
                get('lock-wrong').textContent = answer
                    ? 'Not quite. Think of what your heart wanted when I was leaving.'
                    : 'Enter your answer to open the letter.';
                input.focus();
            }
        });
        get('music-toggle').addEventListener('click', () => {
            if (!unlocked) return;
            tools.toggleMusic(get('bg-music'), get('music-toggle'), MUSIC_FILE, MUSIC_VOLUME);
        });
        get('atmosphere-toggle').addEventListener('click', () => {
            if (unlocked) window.ChapterAutumn.togglePause();
        });
        const audio = get('bg-music');
        audio.addEventListener('play', () => { get('music-status').textContent = 'Song is playing. Pause whenever you like.'; });
        audio.addEventListener('pause', () => { get('music-status').textContent = 'Music paused. Keep reading at your own pace.'; });
        audio.addEventListener('error', () => { get('music-status').textContent = 'Song could not load. Press retry, or keep reading without music.'; });
        get('read-again').addEventListener('click', () => {
            tools.pauseMedia();
            window.ChapterAutumn.stop();
            location.reload();
        });
    });
})();
