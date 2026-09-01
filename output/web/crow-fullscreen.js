/**
 * A way out of the browser chrome.
 *
 * THE PROBLEM, from a photograph of the game running on an iPad: a tab strip, a
 * URL bar and a toolbar eating the top and bottom of the screen, and the game
 * squeezed into what is left. On a phone, a rotate prompt filling a portrait
 * screen with the browser's furniture still around it.
 *
 * There are exactly three levers on iOS and they do different things. Worth
 * writing down, because two of them get confused for each other:
 *
 *   1. ADD TO HOME SCREEN is the only thing that removes Safari's chrome
 *      completely, on iPhone and iPad both. The page already declares
 *      apple-mobile-web-app-capable, so launching from the Home Screen has always
 *      opened without a URL bar -- nobody was ever told. It also survives
 *      Safari's eviction of script-writable storage, which this project already
 *      cares about elsewhere. This file does not do that; it is a manifest and a
 *      sentence of copy, and the manifest now exists.
 *
 *   2. THE FULLSCREEN API removes the chrome for the current visit. Supported on
 *      iPadOS Safari and on Android and desktop; NOT supported for arbitrary
 *      elements on iPhone Safari, where only <video> can go fullscreen. So the
 *      button below is feature-detected and simply absent where it would not
 *      work, rather than present and dead.
 *
 *   3. SCREEN ORIENTATION LOCK does not exist on iOS at all. There is no way for
 *      a web page to rotate a device, and no way to defeat the rotation lock.
 *
 * WHICH MATTERS FOR THE ROTATE PROMPT. Fullscreen does NOT rotate a device whose
 * orientation is locked -- it makes the portrait window bigger, still portrait.
 * YouTube appears to do otherwise because a <video> in native fullscreen gets
 * orientation handling a <canvas> does not. So the prompt now says what the
 * player can actually do about it: turn the tablet, or turn the rotation lock
 * off. The button is offered there too, because a bigger portrait screen is
 * still better than a portrait screen with a tab strip on it.
 *
 * Loaded from <head> via html/head_include, and copied by build_web.sh.
 */
(function () {
    'use strict';

    var root = document.documentElement;

    function request() {
        return root.requestFullscreen || root.webkitRequestFullscreen || null;
    }

    function supported() {
        // Feature detection, not user-agent sniffing: the same Safari version
        // answers differently on an iPad and an iPhone, and a browser that gains
        // support later should get the button without a code change.
        if (!request()) return false;
        if (document.fullscreenEnabled === false) return false;
        return true;
    }

    function isFull() {
        return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    /**
     * Must be called from inside a real user gesture, or Safari refuses. That is
     * why this is a DOM button and not a control drawn inside the canvas: a press
     * Godot handles in its own loop is no longer the gesture as far as the
     * browser is concerned by the time it could call out to JavaScript.
     */
    function enter() {
        try {
            var fn = request();
            if (fn) fn.call(root, { navigationUI: 'hide' });
        } catch (ignored) {
            try { var f = request(); if (f) f.call(root); } catch (alsoIgnored) { /* nothing to do */ }
        }
    }

    function styleButton(el, big) {
        el.type = 'button';
        el.style.cssText = [
            'position:fixed',
            'z-index:2147483646',
            'border:2px solid rgba(253,246,227,0.75)',
            'background:rgba(18,58,46,0.72)',
            'color:#FDF6E3',
            'border-radius:14px',
            'font:600 ' + (big ? '20px' : '15px') + '/1 system-ui,-apple-system,sans-serif',
            'padding:' + (big ? '14px 22px' : '9px 13px'),
            'cursor:pointer',
            '-webkit-user-select:none',
            'user-select:none',
            '-webkit-tap-highlight-color:transparent',
        ].join(';');
        return el;
    }

    // ── The button on the rotate screen, where a player is already stuck.
    function fitRotateOverlay() {
        var overlay = document.getElementById('crow-rotate');
        if (!overlay || overlay.querySelector('.crow-go-full')) return;
        if (!supported()) return;
        var b = styleButton(document.createElement('button'), true);
        b.className = 'crow-go-full';
        b.style.position = 'static';
        // Two lines, not "Fylla skjáinn / Fill the screen". The screen above says
        // each language as its own block; a slash-joined label would put the two
        // back into the one string the blocks exist to avoid.
        b.innerHTML = '';
        var is = document.createElement('span');
        is.textContent = 'Fylla skjáinn';
        var en = document.createElement('span');
        en.className = 'en';
        en.textContent = 'Fill the screen';
        b.appendChild(is);
        b.appendChild(en);
        b.addEventListener('click', enter);
        overlay.appendChild(b);
    }

    // ── The small one, for when the game is playable but boxed in.
    var corner = null;
    function ensureCorner() {
        if (!supported()) return;
        if (!corner) {
            corner = styleButton(document.createElement('button'), false);
            corner.textContent = '⤢';
            corner.setAttribute('aria-label', 'Fill the screen');
            corner.title = 'Fill the screen';
            // RIGHT EDGE, HALFWAY DOWN.
            //
            // It used to sit at bottom centre, on the reasoning that the thumb
            // clusters own the bottom corners and the HUD the top ones, so the
            // bottom middle is never a control. That is true of a level and
            // false of every menu in the game: each one is a centred column, so
            // the bottom middle is precisely where its LAST BUTTON is. The
            // screen tour caught this chip sitting on top of Quit in the pause
            // card, on Back in the login form, and on "How is my child doing?"
            // on the main menu -- a dead 34px hole in the middle of the one row
            // a grown-up is reaching for.
            //
            // The right edge at half height is the region that is free in both
            // layouts: the owl counter and the coin pips are pinned to the top
            // right, the jump and sprint pads to the bottom right, and no
            // centred card is ever wide enough to reach the edge.
            corner.style.right = '6px';
            corner.style.top = '50%';
            corner.style.transform = 'translateY(-50%)';
            corner.style.opacity = '0.55';
            corner.addEventListener('click', enter);
            document.body.appendChild(corner);
        }
        corner.style.display = isFull() ? 'none' : 'block';
    }

    function sync() {
        ensureCorner();
        fitRotateOverlay();
    }

    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sync);
    } else {
        sync();
    }
    // The rotate overlay is injected into <body> after export, so it may not be
    // there on the first pass.
    window.setTimeout(sync, 1200);
})();
