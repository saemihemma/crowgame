/**
 * Keep the keyboard alive after a child clicks out of the game.
 *
 * THE BUG THIS FIXES. Godot 4.3's web export binds `keydown` and `keyup` to the
 * CANVAS element, not to the window:
 *
 *     GodotEventListeners.add(GodotConfig.canvas, "keydown", ...)
 *
 * and it only ever hands focus back to the canvas from a pointer or touch event
 * that landed ON the canvas. So the moment focus goes anywhere else -- the URL
 * bar, a bookmark, the page margin beside a letterboxed canvas, another tab --
 * every key press after that goes to whatever took the focus, and the game hears
 * nothing. The engine's own blur handler releases the keys that were held, so
 * nothing sticks; what breaks is everything afterwards.
 *
 * A playtester met this as: "when i click out of it, (the browser), it leaves the
 * math problem or does something wierd." The maths board is still drawn, the
 * question is still there, and the answer keys are dead. Arrow keys are dead too,
 * so the crow will not walk. Tapping the canvas fixes it, which is exactly why
 * this is easy to miss on a touch device and brutal on a keyboard.
 *
 * THE FIX. Give focus back to the canvas whenever the page plausibly has it: on
 * window focus, on becoming visible again, and after a pointer press anywhere in
 * the document. The last one covers the case the engine misses -- a press on the
 * page but outside the canvas -- and is harmless when the press was on the canvas
 * because the engine has already focused it.
 *
 * WHAT IT MUST NOT DO. The login screen's name and PIN are Godot LineEdits, and
 * with the experimental virtual keyboard on (needed for iPad) Godot serves them
 * through a real <input> it injects beside the canvas. Pulling focus back to the
 * canvas while a child is typing into that would dismiss the on-screen keyboard
 * mid-word. So: if a text field holds focus, leave it alone.
 *
 * Loaded from <head> via html/head_include in godot/export_presets.cfg, before
 * the engine script, and copied into the export by godot/tools/build_web.sh.
 */
(function () {
    'use strict';

    var TEXT_FIELDS = { INPUT: true, TEXTAREA: true };

    function typing() {
        var active = document.activeElement;
        if (!active) return false;
        if (TEXT_FIELDS[active.tagName]) return true;
        return active.isContentEditable === true;
    }

    function canvas() {
        // The shell names it #canvas; querySelector is the fallback for a custom
        // shell, and both can be absent while the engine is still booting.
        return document.getElementById('canvas') || document.querySelector('canvas');
    }

    function refocus() {
        try {
            if (typing()) return;
            var element = canvas();
            if (!element || document.activeElement === element) return;
            // Godot's shell already sets tabIndex, but a canvas without one
            // cannot hold focus at all, so do not depend on it having run yet.
            if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
            element.focus({ preventScroll: true });
        } catch (ignored) { /* focus is a nicety in the worst case, never a crash */ }
    }

    window.addEventListener('focus', refocus);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refocus();
    });

    /**
     * Focus leaving something and landing NOWHERE. This is the case that does not
     * heal on its own, and the one the playtest report is about.
     *
     * A tab switch recovers by itself: the browser hands focus back to the element
     * that had it, which was the canvas. Measured, not assumed -- the harness
     * blurs for 2.5s and 8s and the keys still arrive. What does not recover is
     * focus ending up on the body with nothing holding it, because nothing ever
     * takes it back. Two ways in, both ordinary:
     *
     *  - Godot's virtual-keyboard <input>, which serves every LineEdit in the game
     *    once html/experimental_virtual_keyboard is on (it has to be, or an iPad
     *    cannot type at all). GodotDisplayVK.hide() calls elem.blur() and does NOT
     *    hand focus back to the canvas, so the login screen's name and PIN fields
     *    leave the keyboard dead behind them.
     *  - The canvas being blurred by browser UI that then closes.
     *
     * Only when focus has landed nowhere. If it moved to another field, that field
     * is being used and taking focus off it would be the bug.
     */
    document.addEventListener('focusout', function () {
        // Deferred: during focusout, document.activeElement is still the old
        // element in some browsers and body in others, and relatedTarget is null
        // for a plain blur() either way. A tick later it is simply the truth.
        window.setTimeout(function () {
            var active = document.activeElement;
            if (active && active !== document.body && active !== document.documentElement) return;
            refocus();
        }, 0);
    }, true);

    // Pointer, not click: a `click` only fires when press and release land on the
    // same element, and a child dragging off a button would get no click at all.
    // Capture phase so this runs before anything can swallow the event, and
    // deferred by a frame so it does not fight the engine's own canvas.focus()
    // or a browser about to move focus into a field.
    document.addEventListener('pointerdown', function () {
        window.setTimeout(refocus, 0);
    }, true);

    // Touch devices that predate pointer events.
    document.addEventListener('touchstart', function () {
        window.setTimeout(refocus, 0);
    }, true);

    /**
     * ENTER, WHICH THE SAME <input> WAS EATING.
     *
     * Godot's virtual-keyboard shim copies the injected <input>'s value into the
     * focused LineEdit on every `input` event, so typing works. It does nothing
     * at all with Enter. The key goes to the DOM input, the input has no form to
     * submit, and the event dies there -- the engine never sees it, so
     * LineEdit.text_submitted never fires and `ui_text_submit` never happens.
     *
     * What that looks like: the login form's Enter-to-move-on does nothing, and
     * the next thing typed lands in the field you were already in. The PIN ends
     * up appended to the child's name. Photographed at
     * output/playwright/screens as "Hormann12341" in the name box.
     *
     * It is not a desktop-only nicety either -- it is worse on the device this
     * game is actually played on. The injected input serves every LineEdit once
     * html/experimental_virtual_keyboard is on (it has to be, or an iPad cannot
     * type at all), and the big blue key an iPad offers at the end of a field IS
     * Enter. So on the owner's iPad the obvious way to finish a field did
     * nothing at all.
     *
     * The fix is to put the key where the engine listens. Blur first, which is
     * what commits the value and dismisses the on-screen keyboard -- Godot keeps
     * the LineEdit focused on its own side, so the Enter still arrives at the
     * right control -- then dispatch a real keydown/keyup pair at the canvas,
     * where Godot bound its handler.
     */
    function forwardEnterToCanvas() {
        var element = canvas();
        if (!element) return;
        ['keydown', 'keyup'].forEach(function (type) {
            element.dispatchEvent(new KeyboardEvent(type, {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true,
            }));
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.isComposing) return;
        // Only the engine's own injected field. A future shell with a real form
        // on the page must keep its own Enter.
        var target = event.target;
        if (!target || !TEXT_FIELDS[target.tagName]) return;
        event.preventDefault();
        try { target.blur(); } catch (ignored) { /* nothing to commit */ }
        // After the blur has settled and focusout has handed the canvas back,
        // so the engine is in the state it would be in for a real key press.
        window.setTimeout(forwardEnterToCanvas, 0);
    }, true);

    // The first press of all: the shell boots with focusCanvas, but a page that
    // loads in a background tab never gets it.
    if (document.readyState === 'complete') refocus();
    else window.addEventListener('load', refocus);
})();
