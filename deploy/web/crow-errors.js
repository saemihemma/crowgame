/**
 * Crow client error reporter.
 *
 * This exists because the errors most worth knowing about never reach GDScript.
 * "The game didn't load on my iPad" is a wasm compile failure, a pck 404, an
 * out-of-memory kill, or an unsupported browser — all of which happen before, or
 * instead of, the engine starting. Godot 4.3 has no global script-error hook on
 * web either, so this layer is the only thing that can see them.
 *
 * Loaded from <head> (via html/head_include in godot/export_presets.cfg) so it is
 * installed before the engine script runs.
 *
 * Design rules, all deliberate:
 *  - Errors are DROPPABLE. Unlike attempts, they are never retried forever.
 *  - Bounded everything: per-session count, per-fingerprint count, body size.
 *  - Never blocks or slows the game; never throws out of its own handlers.
 *  - Sends no child name, no PIN, no save contents. Coarse device facts only.
 */
(function () {
    'use strict';

    var ENDPOINT = '/api/v1/errors';
    var MAX_PER_SESSION = 10;
    var MAX_PER_FINGERPRINT = 1;
    var MAX_MESSAGE = 2000;
    var MAX_STACK = 8000;
    var FLUSH_DELAY_MS = 2000;

    var sent = 0;
    var seen = Object.create(null);
    var queue = [];
    var flushTimer = null;
    var stoppedUntil = 0;
    var release = 'unknown';

    // The commit is already generated into godot/build_info.json by
    // build_web.sh and read by main_menu.gd for the on-screen build stamp;
    // reuse it so an error can be tied to an exact build.
    try {
        var request = new XMLHttpRequest();
        request.open('GET', 'build_info.json', true);
        request.onload = function () {
            try {
                var info = JSON.parse(request.responseText);
                if (info && typeof info.commit === 'string') release = info.commit;
            } catch (ignored) { /* the stamp is a nicety, not a requirement */ }
        };
        request.send();
    } catch (ignored) { /* no build stamp available */ }

    function coarseContext() {
        var ctx = {};
        try {
            ctx.viewportW = window.innerWidth | 0;
            ctx.viewportH = window.innerHeight | 0;
            ctx.dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
            ctx.lang = (navigator.language || '').slice(0, 16);
            ctx.standalone = Boolean(window.navigator.standalone);
            ctx.wasm = typeof WebAssembly === 'object';
            ctx.webgl2 = false;
            var probe = document.createElement('canvas');
            ctx.webgl2 = Boolean(probe.getContext && probe.getContext('webgl2'));
            if (navigator.deviceMemory) ctx.deviceMemory = navigator.deviceMemory;
            if (performance && performance.memory && performance.memory.jsHeapSizeLimit) {
                ctx.heapLimitMB = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
            }
        } catch (ignored) { /* context is best-effort */ }
        return ctx;
    }

    /** Cheap client-side grouping, only to enforce MAX_PER_FINGERPRINT locally. */
    function localKey(kind, message, source) {
        return (kind || '') + '|' + String(message || '').replace(/\d+/g, '#').slice(0, 200) + '|' + (source || '');
    }

    function report(kind, message, source, stack, level) {
        try {
            if (Date.now() < stoppedUntil) return;
            if (sent >= MAX_PER_SESSION) return;
            if (!message) return;

            var key = localKey(kind, message, source);
            seen[key] = (seen[key] || 0) + 1;
            if (seen[key] > MAX_PER_FINGERPRINT) return;

            sent += 1;
            queue.push({
                kind: String(kind || 'js').slice(0, 80),
                level: level || 'error',
                message: String(message).slice(0, MAX_MESSAGE),
                source: source ? String(source).slice(0, 500) : undefined,
                stack: stack ? String(stack).slice(0, MAX_STACK) : undefined,
                occurredAt: new Date().toISOString(),
                context: coarseContext(),
            });

            // Batch briefly: a failing boot often throws several times in a row,
            // and they belong in one request.
            if (flushTimer === null) flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS);
        } catch (ignored) { /* a reporter that throws is worse than no reporter */ }
    }

    function flush() {
        flushTimer = null;
        if (queue.length === 0) return;
        var batch = queue.splice(0, queue.length);
        var payload = JSON.stringify({ release: release, events: batch });

        try {
            var request = new XMLHttpRequest();
            request.open('POST', ENDPOINT, true);
            request.setRequestHeader('Content-Type', 'application/json');
            request.onload = function () {
                // Honour backpressure. 429 means stop, not retry harder.
                if (request.status === 429) {
                    var retryAfter = parseInt(request.getResponseHeader('Retry-After') || '60', 10);
                    stoppedUntil = Date.now() + (isFinite(retryAfter) ? retryAfter : 60) * 1000;
                }
            };
            request.send(payload);
        } catch (ignored) { /* dropped; that is the contract for errors */ }
    }

    window.addEventListener('error', function (event) {
        if (!event) return;
        var error = event.error;
        report(
            'js',
            (error && error.message) || event.message,
            event.filename ? event.filename + ':' + event.lineno + ':' + event.colno : undefined,
            error && error.stack,
            'error',
        );
    });

    window.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        report(
            'unhandledrejection',
            (reason && (reason.message || String(reason))) || 'unhandled promise rejection',
            undefined,
            reason && reason.stack,
            'error',
        );
    });

    // Flush on the way out. visibilitychange is the reliable signal on iOS
    // Safari, where pagehide/unload are not dependable.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && queue.length > 0) flush();
    });

    /** Public hook, callable from GDScript via JavaScriptBridge. */
    window.crowReportError = function (kind, message, source, stack, level) {
        report(kind, message, source, stack, level);
    };

    /**
     * Boot funnel.
     *
     * Without this, "nobody played" and "everybody's game failed to load" look
     * identical: an empty errors table. Two info-level events on the existing
     * endpoint give a denominator.
     */
    function beacon(kind, extra) {
        try {
            var payload = { release: release, events: [{
                kind: kind,
                level: 'info',
                message: kind,
                occurredAt: new Date().toISOString(),
                context: Object.assign(coarseContext(), extra || {}),
            }] };
            var request = new XMLHttpRequest();
            request.open('POST', ENDPOINT, true);
            request.setRequestHeader('Content-Type', 'application/json');
            request.send(JSON.stringify(payload));
        } catch (ignored) { /* a beacon must never break a boot */ }
    }

    beacon('boot_start');

    /**
     * Catch an engine boot failure.
     *
     * The previous version wrapped window.displayFailureNotice. That was dead
     * code: the shell declares displayFailureNotice inside its own IIFE and never
     * puts it on window, and because the shell passes it directly as the
     * startGame() rejection handler, a boot failure fires neither an `error`
     * event nor an `unhandledrejection`. So a child seeing the dark-red failure
     * box produced no report at all.
     *
     * Patching Engine.prototype.startGame catches it at the only point both the
     * shell and this script can see. Engine is defined by the engine script,
     * which loads after this one, so poll briefly for it.
     */
    var patchAttempts = 0;
    function patchEngine() {
        patchAttempts += 1;
        try {
            if (typeof window.Engine === 'function' && window.Engine.prototype
                && typeof window.Engine.prototype.startGame === 'function'
                && !window.Engine.prototype.startGame.__crowWrapped) {
                var original = window.Engine.prototype.startGame;
                var wrapped = function () {
                    var promise = original.apply(this, arguments);
                    if (promise && typeof promise.then === 'function') {
                        promise.then(function () {
                            beacon('boot_engine_started');
                        }, function (err) {
                            report('engine_boot',
                                (err && (err.message || String(err))) || 'engine failed to start',
                                undefined, err && err.stack, 'fatal');
                            flush();
                        });
                    }
                    return promise;
                };
                wrapped.__crowWrapped = true;
                window.Engine.prototype.startGame = wrapped;
                return;
            }
        } catch (ignored) { /* fall through to retry */ }
        // ~5s of polling at 100ms. If Engine never appears, the wasm/js failed to
        // load at all, which the `error` listener above already reports.
        if (patchAttempts < 50) window.setTimeout(patchEngine, 100);
    }
    patchEngine();

    /**
     * Called from GDScript once the first real scene is up, so `boot_ready`
     * counts a child who can actually play — not just an engine that started.
     */
    window.crowBootReady = function (extra) {
        beacon('boot_ready', extra);
    };

})();
