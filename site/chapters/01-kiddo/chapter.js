/* Chapter I: the original scene-and-quiz story, with media loaded on demand. */
(function () {
    'use strict';
    const tools = window.ChapterTools;
    const UNLOCK = { day: 19, month: 2, year: 2022 };
    const MUSIC_FILE = 'Cry.mp3';
    const MUSIC_VOLUME = 0.32;
    const SECTIONS = [
        's-ch1', 's-ch2', 's-q1', 's-ch3', 's-v1',
        's-ch4', 's-ch5', 's-ch6', 's-q2', 's-v2',
        's-ch7', 's-ch8', 's-v3', 's-ch9', 's-q3', 's-ch10'
    ];
    const QUIZ_REPLIES = {
        1: [
            "Some things are felt before they're understood.",
            "She did. And maybe that's what made it harder.",
            'Silence has its own language. She was fluent in it.',
            'She did. And he will hold that forever.'
        ],
        2: [
            "Even the silly ones hold more than they're meant to.",
            'Yes. And both of them knew it.',
            'She gave herself away in those small moments.',
            "That's the kind of truth that doesn't need permission."
        ],
        3: ['He knows that too.', 'The feeling is the part that matters anyway.', 'He already has.', 'She does.']
    };
    const WRONG_MSGS = [
        "that's not it...", 'think harder, kiddo', 'the day you said it',
        'three words. one date.', 'you remember. try again.'
    ];
    const sceneTimers = tools.timers();
    const transitionTimers = tools.timers();
    const lockTimers = tools.timers();
    const get = id => document.getElementById(id);
    let storyOn = false;
    let starting = false;
    let ended = false;
    let curIdx = 0;
    let wrongCount = 0;

    function addOpt(select, value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        if (value === '') { option.disabled = true; option.selected = true; }
        select.appendChild(option);
    }

    function buildDatePicker() {
        addOpt(get('pick-day'), '', 'day');
        for (let day = 1; day <= 31; day++) addOpt(get('pick-day'), day, day);
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        addOpt(get('pick-month'), '', 'month');
        months.forEach((month, i) => addOpt(get('pick-month'), i + 1, month));
        addOpt(get('pick-year'), '', 'year');
        for (let year = 2019; year <= Math.max(2026, new Date().getFullYear()); year++) {
            addOpt(get('pick-year'), year, year);
        }
    }

    function tryUnlock() {
        if (starting || storyOn) return;
        const day = Number(get('pick-day').value);
        const month = Number(get('pick-month').value);
        const year = Number(get('pick-year').value);
        const error = get('lock-wrong');
        lockTimers.clear();
        if (day === UNLOCK.day && month === UNLOCK.month && year === UNLOCK.year) {
            error.classList.remove('show');
            startStory();
            return;
        }
        const row = get('date-row');
        row.classList.remove('shake');
        void row.offsetWidth;
        row.classList.add('shake');
        error.textContent = WRONG_MSGS[wrongCount++ % WRONG_MSGS.length];
        error.classList.add('show');
        lockTimers.later(() => row.classList.remove('shake'), 500);
    }

    function startStory() {
        if (starting || storyOn) return;
        starting = true;
        get('unlock-btn').disabled = true;
        tools.playMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
        get('lock-screen').classList.add('fade-out');
        lockTimers.later(() => {
            tools.setActive(get('lock-screen'), false);
            get('lock-screen').hidden = true;
            tools.setActive(get('story-screen'), true);
            get('story-screen').classList.add('active');
            tools.setActive(get('nav'), true);
            get('nav').classList.add('on');
            get('music-btn').classList.add('on');
            starting = false;
            storyOn = true;
            ended = false;
            curIdx = 0;
            showScene(0);
            get('nav-next').focus({ preventScroll: true });
        }, 1900);
    }

    function showScene(index) {
        if (!storyOn || ended || index < 0 || index >= SECTIONS.length) return;
        curIdx = index;
        sceneTimers.clear();
        transitionTimers.clear();
        SECTIONS.forEach((id, i) => {
            const scene = get(id);
            if (i === index) {
                tools.setActive(scene, true);
                scene.classList.add('active');
                scene.querySelectorAll('[data-bg]').forEach(el => tools.background(el, el.dataset.bg));
                scene.querySelectorAll('video[data-src]').forEach(tools.video);
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (storyOn && !ended && curIdx === i) scene.classList.add('visible');
                }));
                revealScene(scene);
            } else {
                tools.setActive(scene, false);
                scene.classList.remove('visible');
                scene.querySelectorAll('video').forEach(video => video.pause());
                // A stale transition must never hide a scene selected again by rapid navigation.
                transitionTimers.later(() => {
                    if (curIdx !== i || !storyOn) scene.classList.remove('active');
                }, 900);
            }
        });
        get('nav-prev').disabled = index === 0;
        get('nav-next').hidden = index === SECTIONS.length - 1;
    }

    function revealScene(scene) {
        scene.querySelectorAll('.in, .in-view').forEach(el => el.classList.remove('in', 'in-view'));
        scene.querySelectorAll('.chapter').forEach(el => {
            sceneTimers.later(() => el.classList.add('in-view'), 100);
        });
        const text = scene.querySelector('.ch-text');
        if (text) {
            text.scrollTop = 0;
            text.querySelectorAll('p, .stagger, .pull, .big-quote, .whisper, .end-cta').forEach((el, i) => {
                sceneTimers.later(() => el.classList.add('in'), 300 + i * 230);
            });
        }
        const card = scene.querySelector('.quiz-card');
        if (card) {
            sceneTimers.later(() => card.classList.add('in'), 300);
            const answered = Boolean(card.querySelector('.quiz-opt.picked'));
            const reply = card.querySelector('.quiz-reply');
            reply.classList.toggle('in', answered);
            card.querySelector('.quiz-next').style.display = answered ? 'inline-block' : 'none';
        }
        scene.querySelectorAll('video').forEach(video => {
            video.classList.add('in');
            video.play().catch(() => { /* Muted inline playback may be blocked by device policy. */ });
        });
        scene.querySelectorAll('.vid-caption').forEach(el => {
            sceneTimers.later(() => el.classList.add('in'), 500);
        });
    }

    function advanceScene() { showScene(curIdx + 1); }
    function navPrev() { showScene(curIdx - 1); }
    function navNext() { showScene(curIdx + 1); }

    function pick(number, button, index) {
        if (!storyOn || ended || button.disabled) return;
        get('qopts' + number).querySelectorAll('.quiz-opt').forEach(option => { option.disabled = true; });
        button.classList.add('picked');
        const reply = get('qreply' + number);
        reply.textContent = QUIZ_REPLIES[number][index];
        sceneTimers.later(() => reply.classList.add('in'), 100);
        sceneTimers.later(() => { get('qnext' + number).style.display = 'inline-block'; }, 1400);
    }

    function showEnd() {
        if (!storyOn || ended) return;
        ended = true;
        sceneTimers.clear();
        tools.setActive(get('story-screen'), false);
        tools.setActive(get('nav'), false);
        get('nav').classList.remove('on');
        document.querySelectorAll('video').forEach(video => video.pause());
        tools.setActive(get('end-screen'), true);
        get('end-screen').classList.add('active');
        get('end-screen').querySelector('h2').focus({ preventScroll: true });
    }

    function doRestart() {
        sceneTimers.clear();
        transitionTimers.clear();
        lockTimers.clear();
        storyOn = false;
        starting = false;
        ended = false;
        curIdx = 0;
        wrongCount = 0;
        tools.resetMedia();
        ['end-screen', 'story-screen', 'nav'].forEach(id => {
            tools.setActive(get(id), false);
            get(id).classList.remove('active', 'on');
        });
        get('music-btn').classList.remove('on');
        SECTIONS.forEach(id => {
            const scene = get(id);
            tools.setActive(scene, false);
            scene.classList.remove('active', 'visible');
        });
        document.querySelectorAll('.in, .in-view').forEach(el => el.classList.remove('in', 'in-view'));
        for (let number = 1; number <= 3; number++) {
            get('qopts' + number).querySelectorAll('.quiz-opt').forEach(option => {
                option.disabled = false;
                option.classList.remove('picked');
            });
            get('qreply' + number).textContent = '';
            get('qnext' + number).style.display = 'none';
        }
        ['pick-day', 'pick-month', 'pick-year'].forEach(id => { get(id).value = ''; });
        get('lock-wrong').textContent = '';
        get('lock-wrong').classList.remove('show');
        get('lock-screen').hidden = false;
        get('lock-screen').classList.remove('fade-out');
        tools.setActive(get('lock-screen'), true);
        get('unlock-btn').disabled = false;
        get('pick-day').focus({ preventScroll: true });
    }

    function toggleMusic() {
        return tools.toggleMusic(get('bg-music'), get('music-btn'), MUSIC_FILE, MUSIC_VOLUME);
    }

    Object.assign(window, { tryUnlock, toggleMusic, advanceScene, navPrev, navNext, pick, showEnd, doRestart });
    document.addEventListener('DOMContentLoaded', () => {
        buildDatePicker();
        ['story-screen', 'end-screen', 'nav', ...SECTIONS].forEach(id => tools.setActive(get(id), false));
        tools.bindMusic(get('bg-music'), get('music-btn'));
        tools.background(document.querySelector('.lock-bg'), 'wp5199906.jpg');
        if (location.protocol === 'content:') get('android-hint').classList.add('show');
        document.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !storyOn && !starting && get('lock-screen').contains(event.target)) {
                event.preventDefault();
                tryUnlock();
            }
        });
    });
})();
