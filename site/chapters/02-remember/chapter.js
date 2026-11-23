/* Chapter II: the original thirteen memories. Photos load one at a time. */
(function () {
    'use strict';
    const tools = window.ChapterTools;
    const MEMORIES = window.CHAPTER_MEMORIES;
    const UNLOCK_ANSWER = 'happy kiss day';
    const MUSIC_FILE = 'Alag Aasmaan [320] Kbps-(SongsPk.com.se).mp3';
    const MUSIC_VOLUME = 0.3;
    const WRONG_MSGS = [
        "that's not it...", 'think harder', 'the exact words she said',
        'three words. one moment.', 'you remember. try again.'
    ];
    const ROTATIONS = [-6, 4, -3, 7, -5, 3, -8, 5, -2, 6, -4, 8, -7, 3];
    const get = id => document.getElementById(id);
    const revealTimers = tools.timers();
    const lockTimers = tools.timers();
    let revealIdx = -1;
    let starting = false;
    let unlocked = false;
    let ended = false;
    let wrongCount = 0;
    let previousFocus = null;

    function buildWall() {
        get('wall').replaceChildren();
        MEMORIES.forEach((memory, index) => {
            const polaroid = document.createElement('button');
            polaroid.type = 'button';
            polaroid.className = 'polaroid';
            polaroid.dataset.idx = index;
            polaroid.disabled = true;
            polaroid.tabIndex = -1;
            polaroid.setAttribute('aria-label', 'Read memory: ' + memory.caption);
            polaroid.style.setProperty('--rot', ROTATIONS[index % ROTATIONS.length] + 'deg');
            const photo = document.createElement('div');
            photo.className = 'pol-photo';
            if (memory.photo) {
                const image = document.createElement('div');
                image.className = 'pol-img';
                image.dataset.bg = memory.photo;
                photo.appendChild(image);
            } else {
                const blank = document.createElement('div');
                blank.className = 'pol-blank';
                const label = document.createElement('div');
                label.className = 'pol-blank-label';
                label.textContent = memory.caption;
                blank.appendChild(label);
                photo.appendChild(blank);
            }
            const veil = document.createElement('div');
            veil.className = 'pol-veil';
            photo.appendChild(veil);
            const caption = document.createElement('div');
            caption.className = 'pol-caption';
            caption.textContent = memory.caption;
            polaroid.append(photo, caption);
            polaroid.addEventListener('click', () => openOverlay(index));
            get('wall').appendChild(polaroid);
        });
    }

    function tryUnlock() {
        if (starting || unlocked) return;
        lockTimers.clear();
        if (get('code-input').value.trim().toLowerCase() === UNLOCK_ANSWER) {
            get('lock-wrong').classList.remove('show');
            startWall();
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

    function startWall() {
        if (starting || unlocked) return;
        starting = true;
        get('unlock-btn').disabled = true;
        buildWall();
        tools.playMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
        get('lock-screen').classList.add('fade-out');
        lockTimers.later(() => {
            starting = false;
            unlocked = true;
            ended = false;
            get('lock-screen').hidden = true;
            tools.setActive(get('lock-screen'), false);
            tools.setActive(get('wall-screen'), true);
            get('wall-screen').classList.add('active');
            get('music-btn').classList.add('on');
            get('reveal-btn').focus({ preventScroll: true });
            revealTimers.later(() => { if (revealIdx < 0) revealNext(); }, 500);
        }, 1900);
    }

    function revealNext() {
        if (!unlocked || ended || revealIdx >= MEMORIES.length - 1) return;
        revealIdx++;
        const polaroid = get('wall').children[revealIdx];
        const image = polaroid.querySelector('.pol-img');
        if (image) tools.background(image, image.dataset.bg);
        polaroid.disabled = false;
        polaroid.tabIndex = 0;
        polaroid.classList.add('dropped');
        revealTimers.later(() => polaroid.classList.add('developed'), 600);
        revealTimers.later(() => polaroid.scrollIntoView({
            behavior: tools.reducedMotion() ? 'auto' : 'smooth', block: 'nearest'
        }), 300);
        get('wall-counter').textContent = (revealIdx + 1) + ' / ' + MEMORIES.length;
        if (revealIdx === 0) {
            revealTimers.later(() => {
                const hint = document.createElement('p');
                hint.id = 'tap-hint';
                hint.textContent = 'tap any photo to read the memory';
                polaroid.appendChild(hint);
                revealTimers.later(() => hint.classList.add('show'), 100);
                revealTimers.later(() => hint.remove(), 6000);
            }, 2800);
        }
        if (revealIdx === MEMORIES.length - 1) {
            get('reveal-btn').textContent = "that's all";
            get('reveal-btn').onclick = showEnd;
        }
    }

    function openOverlay(index) {
        if (!unlocked || ended || index > revealIdx || index < 0) return;
        const memory = MEMORIES[index];
        const polaroid = get('wall').children[index];
        previousFocus = document.activeElement;
        get('overlay-photo-wrap').style.transform = 'rotate(' + polaroid.style.getPropertyValue('--rot') + ')';
        const photo = get('overlay-photo');
        if (memory.photo) tools.background(photo, memory.photo);
        else { photo.style.backgroundImage = ''; delete photo.dataset.loadedBg; }
        get('overlay-caption').textContent = memory.caption;
        get('overlay-text').textContent = memory.story;
        get('story-overlay').scrollTop = 0;
        tools.setActive(get('wall-screen'), false);
        tools.setActive(get('story-overlay'), true);
        document.querySelector('.book-back').inert = true;
        get('music-btn').disabled = true;
        get('story-overlay').classList.add('open');
        get('overlay-close').focus({ preventScroll: true });
    }

    function closeOverlay() {
        if (!get('story-overlay').classList.contains('open')) return;
        get('story-overlay').classList.remove('open');
        tools.setActive(get('story-overlay'), false);
        tools.setActive(get('wall-screen'), unlocked && !ended);
        document.querySelector('.book-back').inert = false;
        get('music-btn').disabled = false;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        previousFocus = null;
    }

    function handleOverlayBg(event) { if (event.target === get('story-overlay')) closeOverlay(); }

    function showEnd() {
        if (!unlocked || ended) return;
        closeOverlay();
        ended = true;
        revealTimers.clear();
        tools.setActive(get('wall-screen'), false);
        tools.setActive(get('end-screen'), true);
        get('end-screen').classList.add('active');
        get('end-screen').querySelector('h2').focus({ preventScroll: true });
    }

    function doRestart() {
        closeOverlay();
        revealTimers.clear();
        lockTimers.clear();
        unlocked = false;
        starting = false;
        ended = false;
        wrongCount = 0;
        revealIdx = -1;
        tools.resetMedia();
        ['end-screen', 'wall-screen', 'story-overlay'].forEach(id => tools.setActive(get(id), false));
        get('end-screen').classList.remove('active');
        get('wall-screen').classList.remove('active');
        get('music-btn').classList.remove('on');
        get('wall').replaceChildren();
        get('wall-counter').textContent = '';
        get('reveal-btn').textContent = 'next memory →';
        get('reveal-btn').onclick = revealNext;
        get('lock-screen').hidden = false;
        get('lock-screen').classList.remove('fade-out');
        tools.setActive(get('lock-screen'), true);
        get('code-input').value = '';
        get('lock-wrong').textContent = '';
        get('lock-wrong').classList.remove('show');
        get('unlock-btn').disabled = false;
        get('code-input').focus({ preventScroll: true });
    }

    function toggleMusic() {
        if (!unlocked && !starting) return;
        return tools.toggleMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
    }

    Object.assign(window, { tryUnlock, revealNext, openOverlay, closeOverlay, handleOverlayBg, showEnd, doRestart, toggleMusic });
    document.addEventListener('DOMContentLoaded', () => {
        ['wall-screen', 'story-overlay', 'end-screen'].forEach(id => tools.setActive(get(id), false));
        tools.bindMusic(get('bg-music'), get('music-btn'));
        tools.background(document.querySelector('.lock-bg'), 'r_lock.jpg');
        if (location.protocol === 'content:') get('android-hint').classList.add('show');
        get('code-input').addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            tryUnlock();
        });
        document.addEventListener('keydown', event => {
            if (!get('story-overlay').classList.contains('open')) return;
            if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
            if (event.key === 'Tab') { event.preventDefault(); get('overlay-close').focus({ preventScroll: true }); }
        });
    });
})();
