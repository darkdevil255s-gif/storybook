/* Chapter-local autumn scenery. Canvas costs are capped; photos load sequentially. */
(function () {
    'use strict';
    const scene = document.getElementById('autumn-scene');
    const canvas = document.getElementById('autumn-leaves');
    const context = canvas.getContext('2d');
    const photoLayers = Array.from(document.querySelectorAll('.memory-photo'));
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    const narrowScreen = matchMedia('(max-width: 600px)');
    const config = window.CHAPTER4_BACKGROUNDS || {};
    const seen = new Set();
    const photos = (Array.isArray(config.photos) ? config.photos : []).map(photo => (
        typeof photo === 'string' ? { file: photo } : photo
    )).filter(photo => {
        if (!photo || typeof photo.file !== 'string') return false;
        // Local filenames only: no external requests or parent-directory traversal.
        if (!/^[\w .-]+\.(jpe?g|png|webp|avif)$/i.test(photo.file) || seen.has(photo.file)) return false;
        seen.add(photo.file);
        return true;
    });
    const holdMs = Number.isFinite(config.holdMs) ? Math.max(5000, config.holdMs) : 12000;
    const fadeMs = Number.isFinite(config.fadeMs) ? Math.max(1000, Math.min(8000, config.fadeMs)) : 3500;
    scene.style.setProperty('--photo-fade-duration', fadeMs + 'ms');

    const leafShape = new Path2D();
    leafShape.moveTo(0, 1);
    [
        [-0.18, 0.72], [-0.48, 0.78], [-0.40, 0.52], [-0.79, 0.42],
        [-0.65, 0.18], [-1.0, -0.09], [-0.63, -0.14], [-0.70, -0.53],
        [-0.39, -0.36], [-0.36, -0.83], [-0.15, -0.62], [0, -1.22],
        [0.15, -0.62], [0.36, -0.83], [0.39, -0.36], [0.70, -0.53],
        [0.63, -0.14], [1.0, -0.09], [0.65, 0.18], [0.79, 0.42],
        [0.40, 0.52], [0.48, 0.78], [0.18, 0.72]
    ].forEach(([x, y]) => leafShape.lineTo(x, y));
    leafShape.closePath();

    let width = 0;
    let height = 0;
    let colors = [];
    let veinColor = '';
    let leaves = [];
    let started = false;
    let photosEnabled = false;
    let manuallyPaused = false;
    let disposed = false;
    let frame = 0;
    let lastFrame = 0;
    let driftTime = 0;
    let slideTimer = 0;
    let photoCursor = 0;
    let visibleLayer = -1;
    let busy = false;
    let readyPhoto = null;
    let generation = 0;
    let cancelPendingPhoto = null;

    function motionPaused() {
        return !started || manuallyPaused || motionPreference.matches || document.hidden || disposed;
    }

    function createLeaf(initial) {
        const lane = Math.random();
        const x = lane < 0.43 ? Math.random() * width * 0.2
            : lane > 0.57 ? width * (0.8 + Math.random() * 0.2)
                : width * (0.2 + Math.random() * 0.6);
        return {
            x, y: initial ? Math.random() * height : -50,
            size: (narrowScreen.matches ? 9 : 12) + Math.random() * 10,
            speed: 12 + Math.random() * 15,
            phase: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.25,
            alpha: lane >= 0.43 && lane <= 0.57 ? 0.16 : 0.32 + Math.random() * 0.25,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
    }

    function drawLeaf(x, y, size, rotation, color, alpha, flutter) {
        if (!context) return;
        context.save();
        context.translate(x, y);
        context.rotate(rotation);
        context.scale(size * flutter, size);
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.fill(leafShape);
        context.strokeStyle = veinColor;
        context.lineWidth = 0.035;
        context.beginPath();
        context.moveTo(0, 1.35);
        context.lineTo(0, -0.93);
        context.moveTo(0, 0.35);
        context.lineTo(-0.63, -0.10);
        context.moveTo(0, 0.35);
        context.lineTo(0.63, -0.10);
        context.moveTo(0, -0.16);
        context.lineTo(-0.37, -0.53);
        context.moveTo(0, -0.16);
        context.lineTo(0.37, -0.53);
        context.stroke();
        context.restore();
    }

    function drawCanopy() {
        // Sparse, still corner branches keep the locked page composed without running animation.
        const reach = Math.min(width * 0.22, 260);
        for (const side of [0, 1]) {
            context.save();
            context.translate(side ? width : 0, 0);
            if (side) context.scale(-1, 1);
            context.strokeStyle = colors[3];
            context.globalAlpha = 0.2;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(-20, 15);
            context.bezierCurveTo(30, 75, reach * 0.7, 88, reach, 135);
            context.moveTo(reach * 0.43, 71);
            context.lineTo(reach * 0.62, 27);
            context.moveTo(reach * 0.72, 99);
            context.lineTo(reach * 0.72, 150);
            context.stroke();
            context.restore();
            const direction = side ? -1 : 1;
            const start = side ? width : 0;
            [
                [0.08, 54, 24, 0.5], [0.28, 79, 27, -0.4], [0.46, 49, 23, 0.7],
                [0.66, 96, 22, -0.8], [0.79, 138, 21, 0.2]
            ].forEach(([x, y, size, rotation], index) => {
                drawLeaf(start + direction * reach * x, y, narrowScreen.matches ? size * 0.66 : size,
                    rotation * direction, colors[index % colors.length], 0.24, 1);
            });
        }
    }

    function render() {
        if (!context) return;
        context.clearRect(0, 0, width, height);
        drawCanopy();
        leaves.forEach(leaf => {
            const sway = Math.sin(driftTime * 0.42 + leaf.phase) * 20;
            const flutter = 0.65 + Math.sin(driftTime * 0.55 + leaf.phase) * 0.2;
            drawLeaf(leaf.x + sway, leaf.y, leaf.size, leaf.rotation, leaf.color, leaf.alpha, flutter);
        });
    }

    function resize() {
        width = innerWidth;
        height = innerHeight;
        const ratio = Math.min(devicePixelRatio || 1, narrowScreen.matches ? 1.5 : 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const styles = getComputedStyle(document.documentElement);
        colors = ['--leaf-honey', '--leaf-copper', '--leaf-rust', '--leaf-deep'].map(token => styles.getPropertyValue(token).trim());
        veinColor = styles.getPropertyValue('--leaf-vein').trim();
        leaves = Array.from({ length: narrowScreen.matches ? 8 : 17 }, () => createLeaf(true));
        photoLayers.forEach(layer => {
            const photo = photos[Number(layer.dataset.photoIndex)];
            if (photo) layer.style.objectPosition = photoPosition(photo);
        });
        render();
    }

    function animate(timestamp) {
        frame = 0;
        if (motionPaused()) return;
        if (!lastFrame) lastFrame = timestamp;
        const elapsed = timestamp - lastFrame;
        if (elapsed >= 1000 / 30) {
            const seconds = Math.min(elapsed / 1000, 0.08);
            lastFrame = timestamp;
            driftTime += seconds;
            leaves = leaves.map(leaf => {
                leaf.y += leaf.speed * seconds;
                leaf.rotation += leaf.spin * seconds;
                return leaf.y > height + 60 ? createLeaf(false) : leaf;
            });
            render();
        }
        frame = requestAnimationFrame(animate);
    }

    function photoPosition(photo) {
        return (narrowScreen.matches && photo.mobilePosition) || photo.position || '50% 50%';
    }

    function schedulePhoto() {
        clearTimeout(slideTimer);
        slideTimer = 0;
        if (!photosEnabled || motionPaused() || photos.length < 2 || busy) return;
        slideTimer = setTimeout(() => {
            slideTimer = 0;
            loadNextPhoto();
        }, holdMs + fadeMs);
    }

    function loadImage(layer, photo, index) {
        return new Promise(resolve => {
            let settled = false;
            let timeout = 0;
            const finish = success => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                layer.onload = null;
                layer.onerror = null;
                cancelPendingPhoto = null;
                if (!success) layer.removeAttribute('src');
                resolve(success);
            };
            cancelPendingPhoto = () => finish(false);
            layer.onload = () => finish(layer.naturalWidth > 0);
            layer.onerror = () => finish(false);
            layer.decoding = 'async';
            layer.fetchPriority = 'low';
            layer.dataset.photoIndex = index;
            layer.style.objectPosition = photoPosition(photo);
            timeout = setTimeout(() => finish(false), 20000);
            const directory = new URL('assets/photos/', document.baseURI);
            layer.src = new URL(encodeURIComponent(photo.file), directory).href;
        });
    }

    function showReadyPhoto() {
        if (!readyPhoto) return;
        const { layerIndex, photoIndex } = readyPhoto;
        photoLayers.forEach((layer, index) => layer.classList.toggle('active', index === layerIndex));
        visibleLayer = layerIndex;
        scene.dataset.photoIndex = String(photoIndex);
        scene.classList.add('has-photo');
        readyPhoto = null;
        schedulePhoto();
    }

    async function loadNextPhoto() {
        if (!started || !photosEnabled || disposed || busy || !photos.length) return;
        if (visibleLayer >= 0 && motionPaused()) return;
        busy = true;
        const token = generation;
        const targetIndex = visibleLayer === 0 ? 1 : 0;
        const layer = photoLayers[targetIndex];
        for (let attempt = 0; attempt < photos.length; attempt++) {
            const photoIndex = photoCursor++ % photos.length;
            // Reusing the current image would unnecessarily blank the spare layer.
            if (visibleLayer >= 0 && Number(photoLayers[visibleLayer].dataset.photoIndex) === photoIndex) continue;
            const success = await loadImage(layer, photos[photoIndex], photoIndex);
            if (disposed || token !== generation) { busy = false; return; }
            if (!success) continue;
            readyPhoto = { layerIndex: targetIndex, photoIndex };
            busy = false;
            // Reduced motion gets one static photo; a manual pause freezes an existing photo.
            if (visibleLayer < 0 || !motionPaused()) showReadyPhoto();
            return;
        }
        busy = false;
        // Invalid/missing images leave the existing photo or autumn fallback in place.
    }

    function sync() {
        cancelAnimationFrame(frame);
        frame = 0;
        clearTimeout(slideTimer);
        slideTimer = 0;
        lastFrame = 0;
        const paused = motionPaused();
        scene.dataset.motion = motionPreference.matches ? 'reduced' : paused ? 'paused' : 'running';
        scene.classList.toggle('scenery-paused', paused);
        scene.classList.toggle('reduced-motion', motionPreference.matches);
        if (!paused) {
            if (context) frame = requestAnimationFrame(animate);
            if (readyPhoto) showReadyPhoto();
            else if (visibleLayer >= 0) schedulePhoto();
        } else render();
        const button = document.getElementById('atmosphere-toggle');
        button.hidden = !photosEnabled || motionPreference.matches;
        button.textContent = manuallyPaused ? 'Resume scenery' : 'Pause scenery';
        button.setAttribute('aria-pressed', String(manuallyPaused));
    }

    function preview() {
        if (started && !disposed) return;
        disposed = false;
        started = true;
        sync();
    }

    function start() {
        disposed = false;
        started = true;
        photosEnabled = true;
        sync();
        if (visibleLayer < 0) loadNextPhoto();
    }

    function togglePause() {
        manuallyPaused = !manuallyPaused;
        sync();
    }

    function stop() {
        disposed = true;
        generation++;
        cancelAnimationFrame(frame);
        clearTimeout(slideTimer);
        if (cancelPendingPhoto) cancelPendingPhoto();
        frame = 0;
        slideTimer = 0;
        scene.dataset.motion = 'paused';
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', sync);
    motionPreference.addEventListener('change', sync);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', event => {
        if (event.persisted && started) {
            if (photosEnabled) start();
            else preview();
        }
    });
    resize();
    sync();
    window.ChapterAutumn = Object.freeze({ preview, start, togglePause, stop });
})();
