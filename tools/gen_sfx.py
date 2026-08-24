#!/usr/bin/env python3
"""Procedurally synthesize Crow's UI/gameplay SFX as small 16-bit mono WAVs.

Original by construction (no third-party samples → no licensing concerns),
deterministic, tiny, and re-generatable. Kid-first sound design: bright and
friendly; the "wrong" cue is gentle and low (never a harsh buzzer — pedagogy
rail: mistakes are not punished).

Run: python3 tools/gen_sfx.py
Writes the same 15 WAVs to both runtimes: godot/assets/audio/sfx/ and
public/assets/audio/sfx/. Both are committed, because public/data/audio/
audio_manifest.json declares them as required assets and tools/validate_assets.js
fails without them -- the web build was silently shipping with no SFX at all
because the generator only ever targeted the Godot side.
"""
import math, os, struct, wave

SR = 44100
_ROOT = os.path.join(os.path.dirname(__file__), "..")
# Both runtimes read the same synthesized set; keep them byte-identical.
OUTS = [
    os.path.join(_ROOT, "godot", "assets", "audio", "sfx"),
    os.path.join(_ROOT, "public", "assets", "audio", "sfx"),
]


def _env(i, n, attack=0.01, decay=None):
    # Quick linear attack + exponential decay; avoids click at start/end.
    a = max(1, int(attack * SR))
    if i < a:
        return i / a
    t = (i - a) / max(1, n - a)
    d = 5.0 if decay is None else decay
    return math.exp(-d * t)


def tone(freq, dur, vol=0.6, wave_kind="sine", decay=None):
    n = int(dur * SR)
    out = []
    for i in range(n):
        ph = 2 * math.pi * freq * (i / SR)
        if wave_kind == "square":
            s = 1.0 if math.sin(ph) >= 0 else -1.0
        elif wave_kind == "saw":
            s = 2.0 * ((freq * i / SR) % 1.0) - 1.0
        else:
            s = math.sin(ph)
        out.append(s * vol * _env(i, n, decay=decay))
    return out


def chirp(f0, f1, dur, vol=0.6, wave_kind="sine"):
    n = int(dur * SR)
    out = []
    for i in range(n):
        t = i / n
        f = f0 + (f1 - f0) * t
        ph = 2 * math.pi * f * (i / SR)
        s = (1.0 if math.sin(ph) >= 0 else -1.0) if wave_kind == "square" else math.sin(ph)
        out.append(s * vol * _env(i, n))
    return out


def noise(dur, vol=0.5, decay=8.0):
    import random
    rng = random.Random(1234)
    n = int(dur * SR)
    return [(rng.uniform(-1, 1)) * vol * _env(i, n, decay=decay) for i in range(n)]


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def mix(a, b):
    n = max(len(a), len(b))
    return [(a[i] if i < len(a) else 0) + (b[i] if i < len(b) else 0) for i in range(n)]


def arp(freqs, step=0.09, vol=0.6, wave_kind="sine"):
    return seq(*[tone(f, step, vol, wave_kind, decay=4.0) for f in freqs])


def write(name, samples):
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s)) * 32767)
        frames += struct.pack("<h", v)

    paths = []
    for out_dir in OUTS:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, name + ".wav")
        with wave.open(path, "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(frames)
        paths.append(os.path.relpath(path))
    return " + ".join(paths)


SOUNDS = {
    "player_jump": chirp(320, 760, 0.16, 0.5, "square"),
    "land": mix(tone(150, 0.12, 0.5, "sine", decay=9.0), noise(0.07, 0.18)),
    "coin_collect": seq(tone(880, 0.05, 0.5), tone(1320, 0.10, 0.55)),
    "hurt": chirp(420, 170, 0.22, 0.45, "saw"),
    "enemy_death": noise(0.18, 0.5, decay=10.0),
    "laser_shoot": chirp(1300, 380, 0.12, 0.4, "square"),
    "owl_greet": seq(tone(540, 0.14, 0.4), tone(450, 0.16, 0.4)),
    "owl_saved": arp([523, 659, 784, 1047], 0.10, 0.55),
    "door": mix(tone(190, 0.22, 0.4, "sine", decay=6.0), noise(0.10, 0.14)),
    "button": tone(1000, 0.05, 0.4),
    "correct": seq(tone(659, 0.09, 0.5), tone(988, 0.16, 0.55)),
    "wrong": chirp(300, 240, 0.24, 0.4, "sine"),  # gentle, low — not punitive
    "level_complete": arp([523, 659, 784, 1047, 1319], 0.11, 0.6),
    "ability": chirp(760, 1640, 0.18, 0.5, "sine"),
    "milestone": arp([784, 988, 1175], 0.10, 0.6),
    # Golden problem arrival: a fast, high shimmer distinct from the win
    # sounds — it announces the problem, it is not the reward itself.
    "golden": arp([1319, 1568, 1976, 2637], 0.06, 0.5),
}

if __name__ == "__main__":
    for name, samples in SOUNDS.items():
        print("wrote", write(name, samples), "(%.2fs)" % (len(samples) / SR))
    print("Done: %d sfx" % len(SOUNDS))
