/* Chapter III: the original scroll story. No personal photos or audio before unlock. */
(function () {
    'use strict';
    const tools = window.ChapterTools;
    const UNLOCK_ANSWER = 'sunflower';
    const MUSIC_FILE = 'Husn - Djjohal.fm.mp3';
    const MUSIC_VOLUME = 0.35;
    const COVER_FILE = '641f33208847341.66f551a3ea5f4.png';
    const WRONG_MSGS = [
        "that's not it…", 'think about the flower shop', 'he picked it because he remembered',
        'she liked those', 'you know this one.'
    ];
    const get = id => document.getElementById(id);
    const lockTimers = tools.timers();
    let wrongCount = 0;
    let starting = false;
    let unlocked = false;

    function tryUnlock() {
        if (starting || unlocked) return;
        const value = get('code-input').value.trim().toLowerCase();
        lockTimers.clear();
        if (value === UNLOCK_ANSWER) {
            get('lock-wrong').classList.remove('show');
            startExperience();
            return;
        }
        const input = get('code-input');
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        get('lock-wrong').textContent = WRONG_MSGS[wrongCount++ % WRONG_MSGS.length];
        get('lock-wrong').classList.add('show');
        lockTimers.later(() => input.classList.remove('shake'), 500);
    }

    function startExperience() {
        if (starting || unlocked) return;
        starting = true;
        get('unlock-btn').disabled = true;
        // The cover is cached from the lock; the personal background is requested only now.
        tools.background(get('bg'), 'IMG20260201085825.jpg');
        tools.image(get('title-img'), COVER_FILE);
        tools.playMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
        get('lock-screen').classList.add('fade-out');
        lockTimers.later(() => {
            starting = false;
            unlocked = true;
            get('lock-screen').hidden = true;
            tools.setActive(get('lock-screen'), false);
            tools.setActive(get('experience'), true);
            document.body.classList.add('unlocked');
            get('experience').classList.add('visible');
            get('music-btn').classList.add('on');
            initObserver();
            get('scroll-hint').classList.add('show');
            get('scroll-hint').focus({ preventScroll: true });
        }, 1900);
    }

    function initObserver() {
        const lines = document.querySelectorAll('.line');
        if (tools.reducedMotion() || !('IntersectionObserver' in window)) {
            lines.forEach(line => line.classList.add('visible'));
            return;
        }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.15, rootMargin: '-16% 0px -24% 0px' });
        lines.forEach(line => observer.observe(line));
    }

    function toggleMusic() {
        if (!unlocked && !starting) return;
        return tools.toggleMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
    }

    Object.assign(window, { tryUnlock, toggleMusic });
    document.addEventListener('DOMContentLoaded', () => {
        tools.setActive(get('experience'), false);
        tools.bindMusic(get('bg-music'), get('music-btn'));
        tools.background(document.querySelector('.lock-overlay'), COVER_FILE);
        if (location.protocol === 'content:') get('android-hint').classList.add('show');
        get('code-input').addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            tryUnlock();
        });
    });
})();
