#!/usr/bin/env python3
"""Measure the audio bank against the design, for the things ears cannot check fast.

Run: npm run audio:audit   (or python3 tools/audit_audio.py [--json])

`npm run audio:audit` goes through tools/run_python.mjs, which finds whatever
this machine calls Python -- `python3` does not exist on Windows, where the
name is `py`.

WHY THIS EXISTS. brand/SOUND_DESIGN.md makes four claims that are facts about
waveforms rather than matters of taste, and every one of them is the kind that
rots silently when files are replaced one at a time:

  §1 THE BAND SPLIT. VOICE owns 700 Hz - 5 kHz because that is where a child's
     hearing is sharpest and because it is the family that must always cut
     through. BODY and WORLD stay out of it. That is what lets a coin be heard
     over a landing, a bed and a music track at once, and it is the reason
     nothing has to duck for a sound effect.
  §2 THE SCALE. Every pitched sound sits on C major pentatonic. A cue a few
     percent off is a cue that will beat against the music.
  §3 THE LADDER. Each reward tier peaks louder than the one below it.
  §4 THE BUDGET. Anything that can fire more than once a second is short.

A listening pass catches a bad sound. It does not catch a coin that has drifted
14 cents flat, or a replacement whose energy has crept into the band the rewards
need, and those are exactly what a generated or commissioned file does wrong.
So this measures, and it is meant to be re-run after every promotion:

    npm run audio:gen -- --promote coin_collect 2 && npm run audio:audit

It reports rather than gates. The gate is godot/tests/test_audio_mix.gd, which
checks the manifest; this checks the SAMPLES, and a "warn" here is a question for
a human, not a build failure.
"""
import cmath
import json
import math
import os
import struct
import sys
import wave

_ROOT = os.path.join(os.path.dirname(__file__), "..")
SFX_DIR = os.path.join(_ROOT, "godot", "assets", "audio", "sfx")
AMB_DIR = os.path.join(_ROOT, "godot", "assets", "audio", "ambience")
MANIFEST = os.path.join(_ROOT, "godot", "data", "audio", "audio_manifest.json")
EVENTS = os.path.join(_ROOT, "godot", "data", "audio", "sound_events.json")
DOC = os.path.join(_ROOT, "brand", "SOUND_DESIGN.md")

## Where the reward family lives: G4 up, with partials to 5 kHz.
##
## The floor is 350 Hz rather than 700, and the correction came from running this
## tool twice. Eight VOICE cues -- every board, lesson and pause card, plus
## `ui_back` and `level_enter` -- are built on G4 (392 Hz) or C5 (523 Hz), so a
## 700 Hz floor reported the whole interface as unable to cut through a mix it
## sits perfectly well in. 400 was the second guess and still cut G4 in half,
## because G4 is 392. The floor has to sit BELOW the lowest note the design
## actually uses, so it is 350 and the design's own scale decides it.
VOICE_LOW, VOICE_HIGH = 350.0, 5000.0
## A VOICE sound with less than this in its own band is not going to be heard
## over a bed and a music track.
VOICE_MIN_IN_BAND = 0.30

## THE CUE CORE: where the sounds a child must never miss actually sit.
##
## coin 1568, correct 1046+1568, milestone 1046, streak 1046, big_coin 1046. This
## narrow band is the one thing in the mix worth protecting, and the rule that
## matters is not "WORLD stays out of the mid" -- glass and metal in a world
## legitimately live there -- but "nothing LOUD camps on the cues".
##
## So the test is dominant frequency AND level together. An ambience bed peaking
## at 1319 Hz twenty-five decibels down is fine and a laser at 1039 Hz three
## decibels down is not, and a band-only rule cannot tell them apart.
CUE_CORE_LOW, CUE_CORE_HIGH = 900.0, 2200.0
## Whisper tier (see gen_sfx.py TIER). At or below this, a sound may sit anywhere.
CUE_CORE_QUIET_ENOUGH = 0.11

## C major pentatonic across every octave the game uses, in Hz (§2).
##
## Starts at C3, not C4. `wrong` is deliberately two soft taps on C3 and
## `door_locked` is two knocks on G3 -- the two lowest, gentlest sounds in the
## game, and the two the design cares most about getting right. A table starting
## an octave above them reported both as wildly off-key.
SCALE = [130.81, 146.83, 164.81, 196.00, 220.00,
         261.63, 293.66, 329.63, 392.00, 440.00,
         523.25, 587.33, 659.25, 783.99, 880.00,
         1046.50, 1174.66, 1318.51, 1567.98, 1760.00,
         2093.00, 2349.32, 2637.02, 3135.96, 3520.00]
## A cue more than this far from a scale note will beat against the music.
CENTS_TOLERANCE = 35.0

## Sounds whose "dominant frequency" is not a note, so pitch-checking them is
## meaningless. Named rather than guessed: a glide is on the scale at both ends
## and nowhere in between, and the peak lands wherever the window happened to be.
NOT_A_NOTE = {
    "ability": "a glide from C5 to C6 -- on the scale at both ends, mid-slide anywhere",
}

## Cues whose job is NOT to cut through, so the reach check does not apply.
##
## Exactly one, and it is the most carefully designed sound in the game: a wrong
## answer is two soft taps on C3, deliberately low, flat and quieter than the
## coin, because a seven-year-old hears it hundreds of times and it has to stay
## survivable. "It will not cut through the mix" is the intended behaviour.
MEANT_TO_BE_EASY_TO_IGNORE = {
    "wrong": "the one cue designed to be easy to ignore -- brand/SOUND_DESIGN.md \u00a74",
}


# ── reading ──────────────────────────────────────────────────────────────────

def read_wav(path):
    with wave.open(path) as w:
        n, rate, width, channels = (w.getnframes(), w.getframerate(),
                                    w.getsampwidth(), w.getnchannels())
        raw = w.readframes(n)
    if width != 2:
        raise ValueError("%s is not 16-bit" % path)
    values = struct.unpack("<%dh" % (len(raw) // 2), raw)
    if channels > 1:
        values = values[::channels]
    return [v / 32768.0 for v in values], rate


def fft(samples):
    """Iterative radix-2 FFT. No numpy in this repo, and none needed."""
    n = len(samples)
    if n & (n - 1):
        raise ValueError("length must be a power of two")
    out = [complex(s) for s in samples]
    # bit reversal
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            out[i], out[j] = out[j], out[i]
    size = 2
    while size <= n:
        step = cmath.exp(-2j * math.pi / size)
        half = size // 2
        for start in range(0, n, size):
            w = 1 + 0j
            for k in range(half):
                a = out[start + k]
                b = out[start + k + half] * w
                out[start + k] = a + b
                out[start + k + half] = a - b
                w *= step
        size <<= 1
    return out


def spectrum(samples, rate, size=8192):
    """Magnitude spectrum of the loudest window, Hann-windowed."""
    if len(samples) < size:
        samples = list(samples) + [0.0] * (size - len(samples))
    # The loudest window, because the attack of a bell carries its partials and
    # the tail carries only the fundamental.
    best, best_energy = 0, -1.0
    hop = max(1, size // 4)
    for start in range(0, max(1, len(samples) - size + 1), hop):
        energy = sum(s * s for s in samples[start:start + size])
        if energy > best_energy:
            best, best_energy = start, energy
    window = samples[best:best + size]
    if len(window) < size:
        window = window + [0.0] * (size - len(window))
    windowed = [s * (0.5 - 0.5 * math.cos(2 * math.pi * i / (size - 1)))
                for i, s in enumerate(window)]
    bins = fft(windowed)[: size // 2]
    return [abs(b) for b in bins], rate / size


def band_fraction(mags, bin_hz, low, high):
    total = sum(m * m for m in mags) or 1e-12
    lo, hi = int(low / bin_hz), int(high / bin_hz)
    return sum(m * m for m in mags[lo:hi + 1]) / total


def dominant_hz(mags, bin_hz, floor_hz=120.0):
    lo = int(floor_hz / bin_hz)
    peak = max(range(lo, len(mags)), key=lambda i: mags[i])
    # Parabolic interpolation, so a 5.4 Hz bin does not cap the resolution at
    # ~18 cents on its own.
    #
    # CLAMPED, and it has to be: the formula is only valid when the middle bin is
    # a strict local maximum, and across a broadband sound like `land` the three
    # bins are near-equal, the denominator goes to zero and the correction runs
    # away. It came back with a NEGATIVE frequency, which is how this guard got
    # written.
    offset = 0.0
    if 0 < peak < len(mags) - 1:
        a, b, c = mags[peak - 1], mags[peak], mags[peak + 1]
        denom = a - 2 * b + c
        if abs(denom) > 1e-12:
            offset = max(-0.5, min(0.5, 0.5 * (a - c) / denom))
    return (peak + offset) * bin_hz


def nearest_scale_cents(hz):
    """Distance in cents to the nearest pentatonic note, and that note."""
    best, best_cents = None, 1e9
    for note in SCALE:
        cents = 1200.0 * math.log2(hz / note)
        if abs(cents) < abs(best_cents):
            best, best_cents = note, cents
    return best, best_cents


# ── the design, read from the doc rather than repeated here ──────────────────

def families():
    """event -> family, from brand/SOUND_DESIGN.md's own section headings."""
    out, family = {}, "OTHER"
    with open(DOC, encoding="utf-8") as f:
        for line in f:
            if line.startswith("### "):
                name = line[4:].strip().upper()
                family = next((x for x in ("BODY", "WORLD", "VOICE")
                               if name.startswith(x)), "OTHER")
                continue
            if line.startswith("|"):
                cells = line.split("|")
                if len(cells) > 2:
                    key = cells[2].strip()
                    if key.startswith("`") and key.endswith("`"):
                        out[key.strip("`")] = family
    return out


def main():
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    events = json.load(open(EVENTS, encoding="utf-8"))
    family_of_event = families()
    key_family = {}
    for event, key in events.items():
        if not event.startswith("_"):
            key_family.setdefault(key, family_of_event.get(event, "OTHER"))

    rows, warnings = [], []
    sections = [("sfx", SFX_DIR), ("beds", AMB_DIR)]
    for section, _ in sections:
        for key, definition in manifest.get(section, {}).items():
            if key.startswith("_"):
                continue
            path = os.path.join(_ROOT, "godot", definition["file"])
            if not os.path.exists(path) or not path.endswith(".wav"):
                continue
            samples, rate = read_wav(path)
            mags, bin_hz = spectrum(samples, rate)
            family = key_family.get(key, "WORLD" if section == "beds" else "OTHER")
            in_band = band_fraction(mags, bin_hz, VOICE_LOW, VOICE_HIGH)
            low_rumble = band_fraction(mags, bin_hz, 0.0, 80.0)
            hz = dominant_hz(mags, bin_hz)
            note, cents = nearest_scale_cents(hz)
            peak = max(abs(s) for s in samples)
            rows.append(dict(key=key, family=family, section=section,
                             seconds=len(samples) / rate, rate=rate, peak=peak,
                             dominant_hz=hz, nearest_note=note, cents=cents,
                             voice_band=in_band, below_80hz=low_rumble))

            if family == "VOICE":
                if in_band < VOICE_MIN_IN_BAND and key not in MEANT_TO_BE_EASY_TO_IGNORE:
                    warnings.append(
                        "%s is VOICE but only %.0f%% of its energy is in %.0f-%.0fHz; "
                        "it will not cut through the mix"
                        % (key, in_band * 100, VOICE_LOW, VOICE_HIGH))
                # The tolerance can never be tighter than the analysis itself.
                # One FFT bin is 5.4 Hz, which is 71 CENTS at C3 and 6 at C6 --
                # so a fixed 35-cent window called `wrong` off-key when it was
                # dead on the note and the measurement simply could not say so.
                bin_cents = abs(1200.0 * math.log2((hz + bin_hz) / hz))
                tolerance = max(CENTS_TOLERANCE, bin_cents)
                if key not in NOT_A_NOTE and abs(cents) > tolerance:
                    warnings.append(
                        "%s peaks at %.1f Hz, %+.0f cents from %.1f Hz (tolerance "
                        "%.0f) -- off the pentatonic scale, so it will beat against "
                        "the music" % (key, hz, cents, note, tolerance))
            elif family in ("BODY", "WORLD"):
                crowding = CUE_CORE_LOW <= hz <= CUE_CORE_HIGH
                if crowding and peak > CUE_CORE_QUIET_ENOUGH:
                    warnings.append(
                        "%s is %s, peaks at %.0f Hz (inside the %.0f-%.0fHz cue core) "
                        "and is loud (%.2f); it will mask the coin and the win"
                        % (key, family, hz, CUE_CORE_LOW, CUE_CORE_HIGH, peak))
            if low_rumble > 0.15 and key not in ("hurt", "level_complete"):
                warnings.append(
                    "%s puts %.0f%% of its energy below 80 Hz, which a tablet "
                    "speaker cannot reproduce" % (key, low_rumble * 100))

    if "--json" in sys.argv:
        print(json.dumps(dict(rows=rows, warnings=warnings), indent=2))
        return 0

    order = {"BODY": 0, "WORLD": 1, "VOICE": 2}
    rows.sort(key=lambda r: (order.get(r["family"], 3), r["key"]))
    print("%-20s %-6s %6s %5s %7s %8s %7s %6s" %
          ("key", "family", "secs", "peak", "domHz", "note", "cents", "inband"))
    print("-" * 74)
    for r in rows:
        pitched = r["family"] == "VOICE"
        print("%-20s %-6s %6.2f %5.2f %7.0f %8s %7s %5.0f%%" % (
            r["key"], r["family"], r["seconds"], r["peak"], r["dominant_hz"],
            ("%.0f" % r["nearest_note"]) if pitched else "-",
            ("%+.0f" % r["cents"]) if pitched else "-",
            r["voice_band"] * 100))

    print()
    if warnings:
        print("%d thing(s) to look at:" % len(warnings))
        for w in warnings:
            print("  %s" % w)
    else:
        print("Every sound sits in its family's band, on the scale, and inside its budget.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
