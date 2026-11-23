/* Shared chapter helpers. This file contains no story media or passwords. */
(function () {
    'use strict';

    function getMediaBase() {
        const href = window.location.href;
        if (href.startsWith('content://')) {
            try {
                const match = href.match(/^content:\/\/([^/]+)\/([^/]+)\/(.+)$/);
                if (match) {
                    const decoded = decodeURIComponent(match[3]);
                    const directory = new URL('assets/', decoded).href;
                    return 'content://' + match[1] + '/' + match[2] + '/' + encodeURIComponent(directory);
                }
            } catch (_) { /* Android file providers differ; use the normal URL fallback. */ }
        }
        return new URL('assets/', document.baseURI).href;
    }

    const mediaBase = getMediaBase();
    const mediaUrl = filename => mediaBase + encodeURIComponent(filename);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function background(element, filename) {
        if (!element || !filename || element.dataset.loadedBg === filename) return;
        // Direct URLs let browsers cache images and stream media without full-file blobs.
        element.style.backgroundImage = 'url("' + mediaUrl(filename) + '")';
        element.dataset.loadedBg = filename;
    }

    function image(element, filename) {
        if (!element || !filename || element.dataset.loadedImage === filename) return;
        element.onload = () => element.classList.add('loaded');
        element.onerror = () => {
            element.classList.add('loaded');
            element.dataset.mediaError = 'true';
        };
        element.src = mediaUrl(filename);
        element.dataset.loadedImage = filename;
    }

    function video(element) {
        if (!element || !element.dataset.src) return;
        const source = mediaUrl(element.dataset.src);
        if (element.getAttribute('src') !== source) {
            element.preload = 'none';
            element.src = source;
        }
    }

    const musicBindings = new WeakSet();
    function bindMusic(audio, button) {
        if (musicBindings.has(audio)) return;
        musicBindings.add(audio);
        const sync = () => {
            const playing = !audio.paused;
            button.textContent = playing
                ? (button.dataset.playingLabel || 'pause music')
                : (button.dataset.pausedLabel || 'play music');
            button.setAttribute('aria-pressed', String(playing));
            button.title = playing ? 'Pause soundtrack' : 'Play soundtrack';
        };
        audio.addEventListener('play', sync);
        audio.addEventListener('pause', sync);
        audio.addEventListener('error', () => {
            button.textContent = button.dataset.errorLabel || 'retry music';
            button.setAttribute('aria-pressed', 'false');
            button.title = 'Soundtrack could not load. Press to retry.';
        });
        sync();
    }

    function playMusic(audio, button, filename, volume) {
        bindMusic(audio, button);
        const source = mediaUrl(filename);
        if (audio.getAttribute('src') !== source || audio.error) {
            audio.preload = 'none';
            audio.src = source;
        }
        audio.volume = volume;
        // Call synchronously inside the click/submit gesture, including on iOS.
        return audio.play().catch(() => {
            if (!audio.paused) return;
            button.textContent = button.dataset.pausedLabel || 'play music';
            button.setAttribute('aria-pressed', 'false');
            button.title = 'Press to play soundtrack';
        });
    }

    function toggleMusic(audio, button, filename, volume) {
        bindMusic(audio, button);
        if (!audio.paused) audio.pause();
        else return playMusic(audio, button, filename, volume);
    }

    function setActive(element, active) {
        if (!element) return;
        element.inert = !active;
        element.setAttribute('aria-hidden', String(!active));
    }

    function timers() {
        const pending = new Set();
        return {
            later(callback, delay) {
                const id = window.setTimeout(() => {
                    pending.delete(id);
                    callback();
                }, reducedMotion.matches ? 0 : delay);
                pending.add(id);
                return id;
            },
            clear() {
                pending.forEach(id => window.clearTimeout(id));
                pending.clear();
            }
        };
    }

    function pauseMedia() {
        document.querySelectorAll('audio, video').forEach(media => media.pause());
    }

    function resetMedia() {
        document.querySelectorAll('audio, video').forEach(media => {
            media.pause();
            media.removeAttribute('src');
            media.load();
        });
    }

    window.addEventListener('pagehide', pauseMedia);
    window.ChapterTools = Object.freeze({
        mediaBase, mediaUrl, background, image, video, bindMusic,
        playMusic, toggleMusic, setActive, timers, pauseMedia, resetMedia,
        reducedMotion: () => reducedMotion.matches
    });
})();
