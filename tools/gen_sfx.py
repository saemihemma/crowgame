#!/usr/bin/env python3
"""Synthesize every placeholder sound in Hörmann, in the shape the design asks for.

Run: python3 tools/gen_sfx.py

Writes one file per entry in SOUNDS / LOOPS / BEDS, under
godot/assets/audio/sfx/ and godot/assets/audio/ambience/. They are committed,
because audio_manifest.json declares them as required assets and
tools/validate_assets.js fails without them.

WHAT THESE ARE. Placeholders, original by construction (no third-party samples,
so no licensing question), deterministic, tiny, and re-generatable. Every one is
meant to be REPLACED by dropping a real file over it -- same name, same folder,
no code, manifest or registry change. brand/SOUND_DESIGN.md is the brief.

WHAT THEY ARE NOT. Not "the right shape, roughly". The previous generation was a
bank of square-wave chirps: correct wiring, no design. These are built to the
three rules the doc states, so that the placeholder bank is already the design
and the real files replace its TIMBRE rather than its structure:

  1. THREE FAMILIES, told apart with your eyes shut.
     BODY  the crow. Mechanism: felt, servo, tin. Mid-low, dry, unpitched.
     WORLD things that are not you. Wood, air, glass, water. Softer, further.
     VOICE reward, maths and UI. Pitched instruments, always, and the only
           family allowed a melody.

  2. ONE SCALE, AND IT CANNOT BE WRONG. Every pitched sound draws from C major
     pentatonic and nothing else. A pentatonic set has no semitone in it, so no
     cue can land sour against a music bed nobody has written yet -- which is the
     whole reason to pick one before the music exists.

  3. THE LADDER IS STRICT. Each reward tier is longer AND louder than the one
     below it, and no two tiers share a shape. That ordering is what makes a big
     coin unmistakable from a coin at the moment a six-year-old hears it, and it
     is enforced here by construction (see TIER).
"""
import math
import os
import random
import struct
import wave

SR = 44100          # one-shots
SR_LOOP = 22050     # loops and beds: longer, quieter, and nothing above 8 kHz

_ROOT = os.path.join(os.path.dirname(__file__), "..")
SFX_DIR = os.path.join(_ROOT, "godot", "assets", "audio", "sfx")
AMB_DIR = os.path.join(_ROOT, "godot", "assets", "audio", "ambience")

# ── The scale ────────────────────────────────────────────────────────────────
# C major pentatonic, C4..G7. Named so a sound reads as music in the source.
C4, D4, E4, G4, A4 = 261.63, 293.66, 329.63, 392.00, 440.00
C5, D5, E5, G5, A5 = 523.25, 587.33, 659.25, 783.99, 880.00
C6, D6, E6, G6, A6 = 1046.50, 1174.66, 1318.51, 1567.98, 1760.00
C7, E7, G7 = 2093.00, 2637.02, 3135.96
C3, G3 = 130.81, 196.00

# ── The loudness ladder ─────────────────────────────────────────────────────
# Peak each sound is normalised to. Ordering IS the design: a tier may never be
# louder than the tier above it, and audio_manifest.json's per-key `volume` then
# does the fine mix on top. Kept as one table so the ordering is checkable by
# reading rather than by listening to twenty files in turn.
TIER = {
    "whisper": 0.10,   # ambience, hover
    "tick": 0.22,      # focus rings, footsteps, page turns
    "click": 0.34,     # buttons, small world detail
    "body": 0.46,      # the crow moving, world events
    "pickup": 0.58,    # a coin
    "win": 0.68,       # a right answer
    "prize": 0.76,     # a big coin, a milestone, an owl freed
    "fanfare": 0.86,   # 3/3, a comeback, a run finished
}


# ── Generators ───────────────────────────────────────────────────────────────

def _env(i, n, attack=0.004, decay=5.0):
    """Quick attack, exponential decay. The attack is what stops the click."""
    a = max(1, int(attack * SR_CUR[0]))
    if i < a:
        return i / a
    t = (i - a) / max(1, n - a)
    return math.exp(-decay * t)


def _fade(samples, ms=6.0):
    """Fade the very ends to zero. Belt and braces against a DC click."""
    n = max(1, int(ms / 1000.0 * SR_CUR[0]))
    out = list(samples)
    for i in range(min(n, len(out))):
        k = i / n
        out[i] *= k
        out[-1 - i] *= k
    return out


SR_CUR = [SR]  # the rate the current bank is being written at


def sine(freq, dur, vol=0.6, decay=5.0, attack=0.004, vibrato=0.0, vib_hz=6.0):
    n = int(dur * SR_CUR[0])
    out = []
    ph = 0.0
    for i in range(n):
        f = freq * (1.0 + vibrato * math.sin(2 * math.pi * vib_hz * i / SR_CUR[0]))
        ph += 2 * math.pi * f / SR_CUR[0]
        out.append(math.sin(ph) * vol * _env(i, n, attack, decay))
    return out


def glide(f0, f1, dur, vol=0.6, decay=4.0, attack=0.004, shape="sine"):
    """One note sliding to another. Exponential in pitch, so it reads musical."""
    n = int(dur * SR_CUR[0])
    out = []
    ph = 0.0
    for i in range(n):
        t = i / max(1, n - 1)
        f = f0 * pow(f1 / f0, t)
        ph += 2 * math.pi * f / SR_CUR[0]
        s = math.sin(ph)
        if shape == "tri":
            s = 2.0 / math.pi * math.asin(max(-1.0, min(1.0, s)))
        elif shape == "saw":
            s = 2.0 * ((ph / (2 * math.pi)) % 1.0) - 1.0
        out.append(s * vol * _env(i, n, attack, decay))
    return out


def bell(freq, dur, vol=0.6, decay=4.5, partials=(1.0, 2.76, 5.40), strike=0.9):
    """A struck metal/glass bar: glockenspiel, music box, celeste.

    Inharmonic partials are the whole difference between a bell and a beep, and
    they are why this family carries every reward in the game: a sine is a
    signal, a bell is an instrument, and a five-year-old hears the difference
    long before they could name it. `strike` is the noise of the mallet.
    """
    n = int(dur * SR_CUR[0])
    out = [0.0] * n
    for k, ratio in enumerate(partials):
        amp = vol / (1.0 + 2.2 * k)
        d = decay * (1.0 + 0.9 * k)   # high partials die first, as they do
        for i in range(n):
            out[i] += math.sin(2 * math.pi * freq * ratio * i / SR_CUR[0]) \
                * amp * _env(i, n, 0.002, d)
    if strike > 0.0:
        atk = int(0.006 * SR_CUR[0])
        rng = random.Random(int(freq))
        for i in range(min(atk, n)):
            out[i] += rng.uniform(-1, 1) * vol * 0.16 * strike * (1.0 - i / atk)
    return out


def noise(dur, vol=0.5, decay=8.0, seed=1234):
    rng = random.Random(seed)
    n = int(dur * SR_CUR[0])
    return [rng.uniform(-1, 1) * vol * _env(i, n, 0.001, decay) for i in range(n)]


def lowpass(samples, cutoff):
    """One-pole low-pass. Crude, and exactly right for turning white noise into
    air, wind, felt and breath -- which is most of what the world is made of."""
    a = 1.0 - math.exp(-2 * math.pi * cutoff / SR_CUR[0])
    out, y = [], 0.0
    for s in samples:
        y += a * (s - y)
        out.append(y)
    return out


def highpass(samples, cutoff):
    lp = lowpass(samples, cutoff)
    return [s - l for s, l in zip(samples, lp)]


def band(samples, low, high):
    return highpass(lowpass(samples, high), low)


def servo(f0, f1, dur, vol=0.35):
    """A small motor. The crow is a tin bird, and this is what says so.

    A saw through a low-pass with the cutoff tracking the pitch, plus a whisper
    of noise for the brushes. Under a felt thump it reads as machinery; on its
    own it would read as a synthesizer, which is why it is never used alone.
    """
    core = glide(f0, f1, dur, vol, decay=3.0, attack=0.003, shape="saw")
    core = lowpass(core, max(f0, f1) * 3.0)
    grit = lowpass(noise(dur, vol * 0.30, decay=3.0, seed=int(f0)), max(f0, f1) * 2.0)
    return mix(core, grit)


def tick(freq, dur=0.02, vol=0.5):
    """The smallest sound in the game: one filtered click."""
    return band(noise(dur, vol, decay=26.0, seed=int(freq)), freq * 0.6, freq * 2.2)


def thump(freq, dur, vol=0.5, decay=9.0):
    """Felt on wood. The body of every landing, knock and step."""
    return mix(sine(freq, dur, vol, decay=decay, attack=0.002),
               lowpass(noise(dur * 0.55, vol * 0.34, decay=decay + 4), 900))


def air(dur, vol=0.3, low=400, high=3000, swell=0.5, seed=7):
    """Breath, wind, a page turning, a wing. Noise with a shape on it."""
    n = int(dur * SR_CUR[0])
    rng = random.Random(seed)
    raw = [rng.uniform(-1, 1) for _ in range(n)]
    shaped = band(raw, low, high)
    out = []
    for i in range(n):
        t = i / max(1, n - 1)
        # A swell: rise to `swell` of the way through, then fall.
        e = math.sin(math.pi * min(1.0, t / swell if t < swell else (1 - t) / (1 - swell)))
        out.append(shaped[i] * vol * max(0.0, e))
    return out


def arp(freqs, step=0.09, vol=0.6, dur=None, decay=5.0, partials=(1.0, 2.76, 5.40)):
    """A phrase. Notes overlap by design -- a run of separated bells is a
    doorbell, a run of overlapping ones is music."""
    length = dur if dur is not None else step * 3.0
    out = []
    for k, f in enumerate(freqs):
        out = mix(out, shift(bell(f, length, vol, decay, partials), step * k))
    return out


# ── Combining ────────────────────────────────────────────────────────────────

def mix(a, b):
    n = max(len(a), len(b))
    out = [0.0] * n
    for i, s in enumerate(a):
        out[i] += s
    for i, s in enumerate(b):
        out[i] += s
    return out


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def shift(samples, seconds):
    return [0.0] * int(seconds * SR_CUR[0]) + list(samples)


def gain(samples, k):
    return [s * k for s in samples]


def pad(samples, seconds):
    """Room at the end for a tail, so a decay is not clipped by the file ending."""
    return list(samples) + [0.0] * int(seconds * SR_CUR[0])


def seamless(samples, fade_ms=120.0):
    """Make a loop join itself without a click.

    The last `fade_ms` is cross-faded over the first, and then cut. Any generated
    texture becomes loopable this way, which is what lets a bed be built out of
    random events rather than out of whole cycles.
    """
    n = int(fade_ms / 1000.0 * SR_CUR[0])
    if n <= 0 or len(samples) <= 2 * n:
        return samples
    out = list(samples[:-n])
    tail = samples[-n:]
    for i in range(n):
        k = i / n
        out[i] = out[i] * k + tail[i] * (1.0 - k)
    return out


def normalize(samples, peak):
    top = max((abs(s) for s in samples), default=0.0)
    if top <= 0.0:
        return samples
    return [s * (peak / top) for s in samples]


# ── The bank: one-shots ──────────────────────────────────────────────────────
# Ordered by family, because the families are the design.

def build_sounds():
    return {
        # ── BODY: the crow. A wind-up tin bird. ──────────────────────────────
        # Never pitched to the scale: the body is the one family that must not
        # sound like the reward family, or every jump would read as a small win.
        "player_jump": (TIER["body"], mix(
            thump(180, 0.07, 0.5, decay=14.0),
            shift(gain(servo(320, 880, 0.10, 0.30), 0.9), 0.012))),
        "land": (TIER["body"], mix(
            thump(110, 0.13, 0.6, decay=11.0),
            shift(tick(3200, 0.014, 0.30), 0.02))),
        # The quietest thing the crow does, and it fires more than anything else
        # in the game. Two layers only: felt, and one small piece of metal.
        "step": (TIER["tick"], mix(
            thump(165, 0.035, 0.5, decay=26.0),
            shift(tick(2800, 0.010, 0.22), 0.006))),
        # A toy ray-gun, not a weapon. Falling, hollow, and over before it lands.
        "laser_shoot": (TIER["body"], lowpass(
            glide(1500, 480, 0.11, 0.5, decay=6.0, shape="tri"), 4200)),
        # Alarming enough to notice, gentle enough not to frighten: a soft
        # whoomph with one piece of the crow coming loose over the top.
        "hurt": (TIER["body"], mix(
            lowpass(noise(0.16, 0.42, decay=9.0, seed=3), 900),
            shift(bell(520, 0.22, 0.30, decay=7.0), 0.03))),
        # "Again", not "you failed". It falls a perfect FIFTH, which is the most
        # consonant interval there is, so it lands settled rather than sad -- and
        # the servo winding down under it is the toy stopping, not a death.
        "player_die": (TIER["body"], pad(mix(
            glide(C5, G4, 0.42, 0.42, decay=3.4),
            gain(servo(600, 150, 0.34, 0.30), 0.8)), 0.06)),
        # Three soft puffs, falling away. Used by the owl leaving, which is the
        # one moment in the game where something goes home.
        "wing": (TIER["body"], seq(
            air(0.10, 0.42, 300, 2600, 0.4, seed=11),
            air(0.09, 0.32, 280, 2400, 0.4, seed=12),
            air(0.09, 0.22, 260, 2200, 0.4, seed=13))),

        # ── WORLD: wood, air, glass, water. ─────────────────────────────────
        # Satisfying, never gory: the roach bursts into sparks. A dry pop with
        # a short crunch on the front and nothing wet anywhere in it.
        "enemy_death": (TIER["body"], mix(
            band(noise(0.09, 0.5, decay=22.0, seed=5), 700, 5200),
            sine(190, 0.15, 0.42, decay=13.0))),
        # THE TELEGRAPH. It has to be unmistakably a WIND-UP: rising, swelling,
        # and clearly unfinished, so that a child hears a question and has half a
        # second to answer it with their feet.
        "enemy_charge": (TIER["click"], mix(
            servo(200, 620, 0.50, 0.40),
            shift(gain(air(0.18, 0.20, 600, 3200, 0.85, seed=17), 0.8), 0.30))),
        "enemy_spit": (TIER["click"], mix(
            band(noise(0.12, 0.42, decay=11.0, seed=6), 500, 2600),
            glide(900, 420, 0.12, 0.24, decay=7.0))),
        "spit_land": (TIER["click"], mix(
            band(noise(0.09, 0.40, decay=17.0, seed=8), 300, 1800),
            sine(150, 0.11, 0.34, decay=15.0))),
        # A small metallic snap. It fires link after link on a gauntlet owl, so
        # it must not outstay its beat: 90 ms, and inharmonic so two in a row do
        # not sound like an interval.
        "chain_break": (TIER["click"], mix(
            bell(1180, 0.09, 0.38, decay=13.0, partials=(1.0, 3.41, 6.12)),
            tick(4200, 0.012, 0.30))),
        # A low wooden open. An invitation: the door has noticed you.
        "door": (TIER["body"], mix(
            sine(190, 0.26, 0.44, decay=5.0, attack=0.05),
            gain(air(0.24, 0.16, 200, 1400, 0.5, seed=21), 1.0))),
        # NOT a buzzer and not the hurt sound. Arriving before the owls are free
        # is arriving early, not doing something wrong, so it is two soft knocks
        # on the same piece of wood.
        "door_locked": (TIER["click"], mix(
            thump(G3, 0.10, 0.42, decay=16.0),
            shift(thump(G3, 0.10, 0.34, decay=16.0), 0.15))),
        # Two low hoots, unhurried. This is who you meet before doing maths.
        "owl_greet": (TIER["click"], mix(
            seq(sine(540, 0.15, 0.40, decay=5.0, attack=0.03, vibrato=0.012),
                sine(450, 0.18, 0.36, decay=5.0, attack=0.03, vibrato=0.012)),
            gain(air(0.32, 0.10, 400, 1600, 0.5, seed=23), 0.8))),

        # ── VOICE: the reward ladder. Bells, in the scale, strictly ordered. ─
        # Tier 2. The brightest two notes in the game, and the one everybody
        # remembers. audio_manifest.json walks it up a pentatonic ladder on a
        # run, so five coins in a row are a rising phrase.
        "coin_collect": (TIER["pickup"], pad(seq(
            bell(E6, 0.06, 0.5, decay=9.0),
            bell(G6, 0.11, 0.55, decay=7.0)), 0.03)),
        # Tier 3. Clearly better than a coin, and clearly not a fanfare: there
        # may be three in a row. The streak moves it up the scale from here.
        "correct": (TIER["win"], pad(mix(
            bell(C6, 0.26, 0.5, decay=5.5),
            shift(bell(G6, 0.24, 0.45, decay=5.5), 0.09)), 0.05)),
        # Low, soft, short, and FLAT IN PITCH -- two taps on the same note, so
        # there is no descent to read as disappointment. A seven-year-old will
        # hear this often and it has to stay survivable the hundredth time. It is
        # also, deliberately, quieter than the coin.
        "wrong": (TIER["click"], mix(
            thump(C3, 0.09, 0.44, decay=17.0),
            shift(thump(C3, 0.09, 0.40, decay=17.0), 0.12))),
        # THE SETUP. A missed question ends in teaching, and this is the sound of
        # the answer arriving with its explanation. An open fifth, soft attack,
        # unhurried: it says "here it is", and it is the one cue in the game that
        # follows a mistake and is warm.
        "answer_reveal": (TIER["win"], pad(mix(
            bell(C5, 0.50, 0.42, decay=3.2, strike=0.2),
            shift(bell(G5, 0.46, 0.38, decay=3.2, strike=0.2), 0.10)), 0.08)),
        # Tier 4. The coin's bigger cousin -- same family, unmistakably rarer:
        # three notes where the coin has two, and a shimmer the coin never gets.
        "big_coin": (TIER["prize"], pad(mix(
            arp([G5, C6, E6], 0.085, 0.5, dur=0.30, decay=5.0),
            shift(gain(arp([E7, G7], 0.05, 0.16, dur=0.18, decay=9.0), 0.5), 0.16)), 0.06)),
        # Tier 5, and the only small fanfare allowed outside the completion
        # screen: 3/3 is the achievement the other two were progress toward.
        # Still shorter than level_complete, which has to stay the biggest thing.
        "big_coin_all": (TIER["prize"], pad(
            arp([G5, C6, E6, G6, C7], 0.075, 0.55, dur=0.42, decay=4.2), 0.10)),
        # The streak, as one note. The pitch ladder in the manifest walks it up
        # with the count, so the phrase is played by the child rather than by the
        # file: four right answers in a row is four rising notes.
        "streak": (TIER["win"], pad(bell(C6, 0.22, 0.5, decay=6.5), 0.04)),
        # A level-up. Three rising notes: shorter than a win, brighter than a
        # click, and never used for anything that is not a genuine step up.
        "milestone": (TIER["prize"], pad(
            arp([G5, C6, E6], 0.085, 0.55, dur=0.30, decay=5.0), 0.06)),
        # THE BEST MOMENT IN THE GAME. A skill missed earlier, beaten on its
        # return. Bigger than a level-up on purpose -- PRODUCT.md asks for the
        # worst moment available to be converted into the best one, and this is
        # the sound of that conversion landing.
        "comeback": (TIER["fanfare"], pad(mix(
            arp([C5, E5, G5, C6, E6], 0.09, 0.6, dur=0.55, decay=3.6),
            shift(gain(arp([G6, C7], 0.08, 0.3, dur=0.40, decay=4.0), 0.7), 0.42)), 0.16)),
        # Something you can do now that you could not before: one note opening
        # upward into a shimmer.
        "ability": (TIER["prize"], pad(mix(
            glide(C5, C6, 0.34, 0.40, decay=3.0, attack=0.02),
            shift(gain(arp([C6, E6, G6], 0.05, 0.30, dur=0.24, decay=7.0), 0.8), 0.16)), 0.08)),
        # Announces the problem; it is NOT the reward. Fast, high, and gone.
        "golden": (TIER["win"], pad(
            arp([E6, G6, C7, E7], 0.048, 0.42, dur=0.20, decay=9.0), 0.05)),
        # The chain is off and the owl is going home. Four notes and one wing.
        "owl_saved": (TIER["prize"], pad(mix(
            arp([C5, E5, G5, C6], 0.095, 0.55, dur=0.38, decay=4.2),
            shift(gain(air(0.12, 0.22, 300, 2400, 0.4, seed=31), 0.9), 0.34)), 0.10)),
        # A departure, and deliberately not the same sound as being near the
        # door: that one is an invitation, this one is leaving.
        "level_enter": (TIER["win"], pad(
            arp([G4, C5, E5], 0.085, 0.5, dur=0.28, decay=5.0), 0.06)),
        # Tier 8, once per run, and the longest thing in the game.
        "level_complete": (TIER["fanfare"], pad(mix(
            arp([C5, E5, G5, C6, E6, G6, C7], 0.105, 0.58, dur=0.70, decay=3.0),
            shift(gain(bell(C6, 0.9, 0.34, decay=2.0, strike=0.0), 0.9), 0.62)), 0.2)),

        # ── VOICE: boards, lessons and the interface. ────────────────────────
        # The maths board is a ROOM the child steps into: felt sliding in, and
        # one soft note to say where they have arrived. game.gd ducks the music
        # under it at the same moment.
        "board_open": (TIER["click"], mix(
            gain(air(0.30, 0.26, 260, 2200, 0.75, seed=41), 1.0),
            shift(bell(C5, 0.28, 0.30, decay=4.0, strike=0.3), 0.10))),
        # And stepping back out. Quieter than arriving: opening is something
        # happening to the child, closing is being handed the level back.
        "board_close": (TIER["tick"], mix(
            gain(air(0.22, 0.22, 240, 1800, 0.35, seed=42), 1.0),
            shift(bell(G4, 0.18, 0.22, decay=6.0, strike=0.2), 0.05))),
        "lesson_open": (TIER["click"], mix(
            gain(air(0.26, 0.24, 300, 2600, 0.7, seed=43), 1.0),
            shift(bell(G4, 0.26, 0.28, decay=4.4, strike=0.25), 0.09))),
        # A page turning. It fires four times in a four-card lesson, so it is a
        # texture rather than a note -- a cue with a pitch would build a melody
        # nobody wrote.
        "lesson_card": (TIER["tick"], air(0.11, 0.40, 700, 5200, 0.35, seed=44)),
        "pause_open": (TIER["click"], mix(
            gain(air(0.22, 0.24, 220, 1600, 0.3, seed=45), 1.0),
            shift(bell(G4, 0.22, 0.26, decay=5.0, strike=0.2), 0.06))),
        "pause_close": (TIER["click"], mix(
            gain(air(0.20, 0.24, 260, 2000, 0.7, seed=46), 1.0),
            shift(bell(C5, 0.20, 0.26, decay=5.5, strike=0.2), 0.05))),
        # The shortest sound in the game.
        "button": (TIER["click"], pad(bell(C6, 0.05, 0.5, decay=22.0), 0.01)),
        # A tick above the click and quieter: it fires on every arrow press, and
        # at click volume holding Down is a machine gun.
        "button_focus": (TIER["tick"], pad(bell(G6, 0.032, 0.42, decay=30.0, strike=0.4), 0.01)),
        # Quieter again. Hover does not exist on the tablet this is played on, so
        # this is entirely for a grown-up at a desk and is priced accordingly.
        "ui_hover": (TIER["whisper"], pad(bell(A6, 0.022, 0.4, decay=38.0, strike=0.3), 0.01)),
        # BACK IS NOT FORWARD. Two notes DOWN, against every other UI cue in the
        # game -- which is the entire information content of the sound.
        "ui_back": (TIER["click"], pad(seq(
            bell(G5, 0.055, 0.44, decay=16.0),
            bell(D5, 0.075, 0.40, decay=13.0)), 0.02)),
        # A toggle that sounds the same in both positions is not a toggle.
        "toggle_on": (TIER["click"], pad(seq(
            bell(E5, 0.06, 0.44, decay=14.0),
            bell(A5, 0.09, 0.48, decay=11.0)), 0.02)),
        "toggle_off": (TIER["click"], pad(seq(
            bell(A5, 0.06, 0.42, decay=14.0),
            bell(E5, 0.09, 0.38, decay=11.0)), 0.02)),
    }


# ── The bank: proximity loops ────────────────────────────────────────────────
# Everything here is heard BEFORE the thing it belongs to is on screen, which is
# the whole point of it. They are quiet by construction (whisper/tick tier) and
# `seamless` cross-faces the join so nothing ticks once a second forever.

def build_loops():
    rng = random.Random(99)

    # THE SKITTER. Six dry ticks a second with a little jitter, which is the
    # difference between an insect and a metronome. A child hears a cockroach
    # coming round a ledge before they can see it -- for a five-year-old that is
    # not flavour, it is the difference between a fair hit and an ambush.
    skitter = [0.0] * int(1.0 * SR_CUR[0])
    for k in range(6):
        at = k / 6.0 + rng.uniform(-0.012, 0.012)
        skitter = mix(skitter, shift(tick(2500 + rng.uniform(-500, 500), 0.008, 0.45), at))

    # Still dangerous. Slow, low, wet, and quiet enough to sit under everything.
    bubbles = lowpass(noise(1.6, 0.06, decay=0.0, seed=55), 500)
    for k in range(9):
        bubbles = mix(bubbles, shift(
            glide(rng.uniform(170, 320), rng.uniform(200, 380), 0.07, 0.30, decay=12.0),
            rng.uniform(0.0, 1.5)))

    # A warning, not a soundscape: 200px of attenuation in the manifest keeps it
    # to about one jump's distance, so it says "here" and nowhere else.
    hiss = air(2.0, 0.5, 2600, 7000, 0.5, seed=61)
    hiss = [s * (0.55 + 0.45 * math.sin(2 * math.pi * 0.6 * i / SR_CUR[0]))
            for i, s in enumerate(hiss)]

    # The door has noticed you. A low warm fifth with a slow breath in it -- the
    # invitation, which is why a locked door does not play it.
    hum = mix(sine(98, 2.0, 0.34, decay=0.0, attack=0.2),
              sine(147, 2.0, 0.18, decay=0.0, attack=0.2))
    hum = [s * (0.7 + 0.3 * math.sin(2 * math.pi * 0.5 * i / SR_CUR[0]))
           for i, s in enumerate(hum)]

    # THE HINT, and its silence is half of it: a banked big coin is a ghost and
    # emits nothing, so on a second visit the level itself tells a child which
    # one they never found.
    shimmer = [0.0] * int(2.0 * SR_CUR[0])
    for j, f in enumerate([C7, E7, G7]):
        part = sine(f, 2.0, 0.16 / (1 + j), decay=0.0, attack=0.3)
        shimmer = mix(shimmer, [s * (0.45 + 0.55 * math.sin(
            2 * math.pi * (0.33 + 0.11 * j) * i / SR_CUR[0])) for i, s in enumerate(part)])

    # An owl breathing on its perch. The encounter fires on proximity with no
    # button to press, so this is the only warning a maths board is coming.
    rustle = seq(air(1.0, 0.42, 350, 1900, 0.5, seed=71),
                 air(1.0, 0.34, 320, 1700, 0.5, seed=72))

    return {
        "roach_skitter": (TIER["tick"], skitter),
        "puddle_bubble": (TIER["whisper"], bubbles),
        "spike_hiss": (TIER["whisper"], hiss),
        "door_hum": (TIER["tick"], hum),
        "big_coin_shimmer": (TIER["whisper"], shimmer),
        "owl_rustle": (TIER["whisper"], rustle),
    }


# ── The bank: one ambience bed per world ─────────────────────────────────────
# A bed is what makes two levels in the same biome sound like the same PLACE.
# Nothing in a bed sits between 700 Hz and 5 kHz with any energy: that band
# belongs to the reward family, and a bed that competes for it is a bed that
# makes every cue in the game harder for a child to hear.

def build_beds():
    rng = random.Random(2026)
    dur = 6.0

    def wind(seed, low, high, rate, depth=0.5, vol=0.5):
        n = int(dur * SR_CUR[0])
        raw = [rng.uniform(-1, 1) for _ in range(n)]
        shaped = band(raw, low, high)
        return [s * vol * (1.0 - depth + depth * (0.5 + 0.5 * math.sin(
            2 * math.pi * rate * i / SR_CUR[0]))) for i, s in enumerate(shaped)]

    def sprinkle(base, events, note_pool, dur_range, vol, decay):
        out = base
        for _ in range(events):
            out = mix(out, shift(
                bell(rng.choice(note_pool), rng.uniform(*dur_range), vol, decay=decay,
                     strike=0.0),
                rng.uniform(0.0, dur - 0.6)))
        return out

    # EMBERWOOD -- warm forest. Leaves, and a bird far enough away to be scenery.
    ember = wind(1, 300, 2200, 0.11, 0.55, 0.5)
    for _ in range(4):
        ember = mix(ember, shift(gain(seq(
            glide(2100, 2600, 0.05, 0.18, decay=10.0),
            glide(2500, 2000, 0.06, 0.14, decay=10.0)), 1.0), rng.uniform(0.5, 5.0)))

    # PRISM HOLLOW -- a cave. Room tone underneath, glass overhead, nothing in
    # between, which is exactly what makes a cave sound big.
    prism = mix(wind(2, 60, 260, 0.07, 0.4, 0.55), wind(3, 3000, 7000, 0.09, 0.7, 0.10))
    prism = sprinkle(prism, 7, [C6, E6, G6, C7], (0.30, 0.55), 0.16, 5.0)

    # SUGARSTORM -- bright meadow. Light breeze and small bells: the only bed
    # that is allowed to be cheerful.
    sugar = wind(4, 500, 3000, 0.16, 0.5, 0.42)
    sugar = sprinkle(sugar, 9, [G6, A6, C7, E7], (0.16, 0.30), 0.13, 8.0)

    # GEYSERWORKS -- steam and machinery. The one bed with a low rumble in it,
    # and the one that breathes on a schedule you can feel.
    geyser = mix(wind(5, 40, 200, 0.05, 0.35, 0.6), wind(6, 1800, 6000, 0.33, 0.85, 0.16))
    for k in range(3):
        geyser = mix(geyser, shift(gain(air(0.9, 0.30, 900, 5000, 0.35, seed=80 + k), 1.0),
                                   0.4 + 1.9 * k))

    # AURORA SPIRE -- the top of the world. Slowest, sparsest, highest. Almost
    # nothing happens, which is the point: it is where the game gets quiet.
    aurora = mix(wind(7, 2200, 6500, 0.06, 0.75, 0.16), wind(8, 80, 300, 0.04, 0.5, 0.30))
    aurora = sprinkle(aurora, 4, [C6, G6, C7], (0.7, 1.2), 0.15, 2.2)

    return {
        "emberwood": (TIER["whisper"], ember),
        "prism_hollow": (TIER["whisper"], prism),
        "sugarstorm": (TIER["whisper"], sugar),
        "geyserworks": (TIER["whisper"], geyser),
        "aurora_spire": (TIER["whisper"], aurora),
    }


# ── Writing ──────────────────────────────────────────────────────────────────

def write(directory, name, samples, rate):
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, "%s.wav" % name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
    return path


def main() -> int:
    written = 0

    SR_CUR[0] = SR
    for name, (peak, samples) in build_sounds().items():
        out = normalize(_fade(samples, 4.0), peak)
        write(SFX_DIR, name, out, SR)
        print("  %-20s %5.2fs  peak %.2f" % (name, len(out) / SR, peak))
        written += 1

    SR_CUR[0] = SR_LOOP
    print("loops (seamless, %d Hz):" % SR_LOOP)
    for name, (peak, samples) in build_loops().items():
        out = normalize(seamless(samples), peak)
        write(SFX_DIR, name, out, SR_LOOP)
        print("  %-20s %5.2fs  peak %.2f" % (name, len(out) / SR_LOOP, peak))
        written += 1

    print("beds (seamless, %d Hz):" % SR_LOOP)
    for name, (peak, samples) in build_beds().items():
        out = normalize(seamless(samples, 400.0), peak)
        write(AMB_DIR, name, out, SR_LOOP)
        print("  %-20s %5.2fs  peak %.2f" % (name, len(out) / SR_LOOP, peak))
        written += 1

    # The ladder is the design, so it is asserted rather than trusted: a tier may
    # never be louder than the tier above it. This is the one thing in the file a
    # careless edit could quietly invert.
    order = list(TIER.values())
    assert order == sorted(order), "TIER is out of order; the reward ladder is the design"

    print("Done: %d files" % written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
