# Hörmann — Sound Design

Status: Supportive
Authority: What each sound is FOR, and how to replace one. Runtime truth is
`godot/data/audio/sound_events.json`, `godot/data/audio/audio_manifest.json` and
`godot/scripts/autoload/audio_manager.gd` — if this file and those disagree,
they win and this file is the bug.

Every sound in the game is a **moment**, not a file. The code names the moment;
two JSON files decide which file that moment plays. Nothing in `.gd` has ever
heard of a `.wav`.

---

## 1. The three families

**A child must be able to tell these apart with their eyes shut.** That is the
whole readability law, and everything below is downstream of it.

| Family | What it is | Made of | Pitched? | Where it sits |
| --- | --- | --- | --- | --- |
| **BODY** | the crow | felt, servo, tin | **never** | 80–500 Hz, plus one tick at 3–6 kHz |
| **WORLD** | things that are not you | wood, air, glass, water | rarely | below 700 Hz and above 5 kHz |
| **VOICE** | reward, maths, interface | struck bells | **always** | 700 Hz – 5 kHz |

The band split is not decoration. VOICE owns 700 Hz – 5 kHz because that is
where a child's hearing is sharpest and because it is the family that must
always cut through; BODY and WORLD stay out of it, so a coin is audible over a
landing, a bed and a music track at once without anything needing to duck.

**The crow is a wind-up tin bird.** Look at the sprite: metal plating, a red lens
for an eye, visible hydraulics. Every sound it makes has a mechanism in it — a
small servo under the jump, a metal tick inside the landing, a clink in the
footstep. It is a machine, and a friendly one a five-year-old would want to
hold. It is never a real bird and never a weapon.

## 2. One scale, and it cannot be wrong

Every pitched sound in the game draws from **C major pentatonic** and nothing
else:

```
C4 D4 E4 G4 A4 · C5 D5 E5 G5 A5 · C6 D6 E6 G6 A6 · C7 E7 G7
```

A pentatonic set contains no semitone and no tritone, so **no two cues can clash
and no cue can land sour against a music bed nobody has written yet.** That is
the reason to pick the scale before the music exists rather than after. It is
also what lets sounds be pitch-shifted at runtime (the coin run, the answer
streak) without any of them going out of tune.

Anything that is not in that list is not pitched — it is BODY or WORLD, and it
belongs to the noise, wood and air vocabulary instead.

## 3. The reward ladder

**Each tier is longer AND louder than the one below it, and no two tiers share a
shape.** That ordering is what makes a big coin unmistakable from a coin at the
moment a six-year-old hears it — not the timbre, the *rank*.

| Tier | Moment | Shape | Length | Peak |
| --- | --- | --- | --- | --- |
| 0 | `ui_hover` | one bell, whispered | 25 ms | 0.10 |
| 1 | `button_focus`, `step`, `lesson_card` | one tick | 30–110 ms | 0.22 |
| 2 | `button`, `ui_back`, `wrong` | one or two taps | 50–210 ms | 0.34 |
| 3 | `coin` | two bells rising | 200 ms | 0.58 |
| 4 | `answer_correct`, `golden`, `streak` | two or three bells, warm | 260–390 ms | 0.68 |
| 5 | `big_coin`, `milestone`, `ability`, `owl_saved` | 3–4 bells + a tail | 500–800 ms | 0.76 |
| 6 | `big_coin_all`, `comeback`, `level_complete` | a phrase | 0.8–1.7 s | 0.86 |

The peaks are the `TIER` table in `tools/gen_sfx.py`, which asserts its own
ordering on every run. `volume` in `audio_manifest.json` does the fine mix on top
of them; the ladder is the coarse one, and it is the one that must never invert.

## 4. The house rules

**A miss is never punished.** `answer_wrong` is two soft taps on the *same*
note — flat, with no descent to read as disappointment — and it is deliberately
**quieter than the coin**. A seven-year-old will hear it often and it has to stay
survivable the hundredth time. `door_locked` follows the same rail: arriving
before the owls are free is arriving early, not doing something wrong, so it is
two knocks on warm wood and nothing like a buzzer.

**The teaching beat is a reward, not a consolation.** `answer_reveal` is at the
same tier as a right answer. PRODUCT.md commits to converting the worst moment
available into the best one; that conversion used to be silent.

**Nothing is startling.** This is played in cars, waiting rooms and beds. No
sound peaks above `level_complete`, and nothing runs longer than about a third of
a second except the six celebrations.

**Nothing except `hurt` and `level_complete` puts energy below 80 Hz.** A tablet
speaker cannot reproduce it; it only eats headroom.

**The proximity layer is fairness, not atmosphere.** A cockroach coming the other
way round a ledge, a beetle winding up to spit, a spike strip under a jump — a
child who cannot see it yet must be able to hear it. Every one of those is a
positional loop or a telegraph, and they are the reason this game has spatial
audio at all.

## 5. The mix

`audio_manifest.json` → `mix` holds all of it, so it is tuned by ear rather than
by recompiling.

| Field | Now | What it does |
| --- | --- | --- |
| `max_voices` | 12 | total concurrent one-shots; past it the busiest key loses its oldest voice |
| `default_pool` | 4 | per-key overlap when the key does not say |
| `duck_db` | −6.0 | how far the music drops under a board, a lesson or the pause card |
| `duck_in_ms` / `duck_out_ms` | 120 / 400 | fast down, slow back — a duck should be felt, a return should not |
| `music_volume` / `sfx_volume` / `ambience_volume` | 1.0 | category trims, under the player's master volume |
| `default_max_distance` | 420 | how far a positional sound carries, in pixels |

Per key: `pool`, `min_interval_ms` (the anti-machine-gun floor between two of the
same sound), `pitch_jitter` (semitones either way, so a sound that fires
constantly never repeats exactly), `pitch_ladder` + `ladder_window_ms` (a run),
and `max_distance` / `attenuation` for anything positional.

### Two runs, and they are the best cheap thing in here

**The coin run.** `coin_collect` carries a pentatonic `pitch_ladder`. Pick coins
up inside `ladder_window_ms` of each other and each one climbs a step, so five
coins in a row is a rising phrase rather than five identical dings. Stop for a
second and it resets to the bottom.

**The answer streak.** `math_challenge.gd` reads the run's streak off the Game
and passes it as `pitch_step`, so a right answer climbs with the count the HUD is
already showing. A wrong answer **pauses** the streak without resetting it
(BRAND_SYSTEM §10.2), which means the pitch *holds* rather than falling — the
sound tells exactly the story the flame does.

## 6. Every moment in the game

The **Fires from** column is the code that plays it; that is the authority on
*when*. `at` marks a sound emitted from a place in the world (distance and pan
against the level camera); `loop` marks a proximity loop that lives as long as
its node does.

### BODY — the crow

| Moment | Event | Fires from | Should sound like |
| --- | --- | --- | --- |
| Crow jumps | `jump` | `entities/player.gd` | A soft airy thump with a 40 ms servo whirring up under it. Short — it fires constantly. |
| Crow lands hard | `land` | `entities/player.gd` | Felt on wood, then one small piece of metal settling. Only above the fall speed in `fx_tuning.json`, so a hop is silent and a drop is not. |
| Crow takes a step | `step` | `entities/player.gd` | The quietest thing in the game and the most frequent: a felt tap with a tin clink in it. Fired every `player/step_distance_px` of ground travel, so sprinting speeds it up for free. |
| Crow fires | `shoot` | `entities/player.gd` | A toy ray-gun. Falling, hollow, over before it lands. No crack, no impact — this is not a weapon. |
| Crow hurt | `hurt` | `scenes/game.gd` | A soft whoomph with one part coming loose over the top. Alarming enough to notice, gentle enough not to frighten. |
| Crow dies | `player_die` | `scenes/game.gd` | A fall that *resolves*: down a perfect fifth, with the servo winding down under it. This says **again**, not *you failed* — the only cost is the coins from this level. |

### WORLD — everything that is not you

| Moment | Event | Fires from | Should sound like |
| --- | --- | --- | --- |
| A cockroach is near | `amb_roach` | `entities/enemy.gd` *(loop)* | Six dry ticks a second, jittered so it is an insect and not a metronome. Heard from about a screen away and growing. **This is the single most important sound added to the game**: a patrol coming round a ledge used to be a hit nothing warned about. |
| Cockroach killed | `enemy_defeat` | `entities/enemy.gd`, `entities/spitter_enemy.gd` *(at)* | A short dry crunch-pop. Satisfying, never gory — the enemy bursts into sparks, not blood. |
| Beetle winds up to spit | `enemy_charge` | `entities/spitter_enemy.gd` *(at)* | Rising, swelling, and clearly unfinished. Carries further than the spit itself on purpose: the warning has to reach the child before the thing it warns about. |
| Beetle spits | `enemy_spit` | `entities/spitter_enemy.gd` *(at)* | A short wet air puff, falling. It used to borrow the crow's jump sound. |
| Poison lands | `spit_land` | `entities/poison_projectile.gd` *(at)* | A small splat. The event: something has arrived here. |
| A puddle is still there | `amb_puddle` | `entities/poison_projectile.gd` *(loop)* | Slow low bubbling that fades out with the sprite. The **state**, not the event: it says "still dangerous", then stops. |
| Spikes are near | `amb_hazard` | `entities/hazard.gd` *(loop)* | A faint high airy hiss, about one jump's distance and no further. A warning, not a soundscape. |
| Owl noticed | `owl_greet` | `entities/npc.gd` *(at)* | Two low hoots, breathy and unhurried. This is who you meet before doing maths. |
| An owl is near | `amb_owl` | `entities/npc.gd` *(loop)* | Soft breathing on a perch, about two body-lengths out. The encounter fires on proximity with no button to press, so this is the only warning a maths board is coming. |
| Chain link breaks | `chain_break` | `entities/npc.gd` *(at)* | A small metallic snap, inharmonic so two in a row do not sound like an interval. |
| Owl flies home | `wing` | `entities/npc.gd` *(at)* | Three soft puffs falling away. `owl_saved` is about the achievement; this is about the bird. |
| Near the door | `door` | `entities/door.gd` *(at)* | A low wooden open. An invitation — the door has noticed you. |
| The door is ahead | `amb_door` | `entities/door.gd` *(loop)* | A low warm fifth with a slow breath in it. **A locked door does not hum**: the invitation and the permission are the same fact. |
| Door still locked | `door_locked` | `scenes/game.gd` | Two soft knocks on the same piece of wood. Deliberately not a buzzer and not the hurt sound. |
| An unfound big coin is near | `amb_big_coin` | `entities/big_coin.gd` *(loop)* | A very quiet high shimmer. **Its silence is half of it** — a coin you already banked comes back as a ghost and emits nothing, so on a second visit the level itself tells a child which one is still out there. |

### VOICE — reward, maths and progress

| Moment | Event | Fires from | Should sound like |
| --- | --- | --- | --- |
| Coin picked up | `coin` | `scenes/game.gd` | The brightest two notes in the game, rising. The one everybody remembers, and the one that climbs on a run. |
| Big coin found | `big_coin` | `scenes/game.gd` | The coin's bigger cousin: same family, three notes where the coin has two, and a shimmer the coin never gets. One goes into a lifetime purse; this is a third of a level. |
| All three big coins | `big_coin_all` | `scenes/game.gd` | A small fanfare, and the only one allowed outside the completion screen. Still shorter than `level_complete`. |
| Answer correct | `answer_correct` | `ui/math_challenge.gd`, `ui/math_tutorial.gd` | Two warm bells. Clearly better than a coin, clearly not a fanfare — there may be three in a row. Climbs with the streak. |
| Answer wrong | `answer_wrong` | `ui/math_challenge.gd`, `ui/math_tutorial.gd` | Low, soft, short, **flat in pitch**. See the house rule above. |
| The answer is revealed | `answer_reveal` | `ui/math_challenge.gd` | A warm open fifth, soft attack, unhurried. "Here it is." The moment the whole design turns on, and it used to make no sound at all. |
| A miss beaten on its return | `comeback` | `ui/hud.gd` | The best moment in the game, and bigger than a level-up. It used to share `milestone`, so the one moment PRODUCT.md singles out sounded like every other. |
| Golden problem appears | `golden` | `ui/math_challenge.gd` | A fast high shimmer. This announces the problem; it is not the reward. |
| The streak climbs | `streak` | `scenes/game.gd` | One bell, walked up the scale by the count itself. Four right answers in a row is four rising notes. |
| Level-up / coin milestone | `milestone` | `ui/hud.gd`, `scenes/main_menu.gd` | Three rising notes. Shorter than a win, brighter than a click, and never used for anything that is not a genuine step up. |
| Ability unlocked | `ability` | `ui/hud.gd` | One note opening upward into a shimmer. Something you can do now that you could not before. |
| Owl freed | `owl_saved` | `scenes/game.gd` | A four-note rise with a wing in the tail. The chain is off. |
| Through the door | `level_enter` | `scenes/game.gd` | A short rise. A departure, deliberately not the same sound as being near the door. |
| Run complete | `level_complete` | `scenes/game.gd` | The seven-note fanfare with a bell held under it. Once per run; the longest thing here. |

### VOICE — boards, lessons and the interface

| Moment | Event | Fires from | Should sound like |
| --- | --- | --- | --- |
| Maths board opens | `board_open` | `scenes/game.gd` | Felt sliding in, and one soft note saying where you have arrived. The music ducks on the same beat: the board is a **room** the child steps into. |
| Maths board closes | `board_close` | `ui/math_challenge.gd` | The same felt, quieter and downward. Opening is something happening to the child; closing is being handed the level back. |
| Lesson opens | `lesson_open` | `scenes/game.gd` | A page being opened rather than a board arriving — lower, softer, slower than `board_open`. |
| Lesson card turns | `lesson_card` | `ui/math_tutorial.gd` | A page turn. Deliberately **unpitched**: it fires four times in a four-card lesson, and a pitched cue would build a melody nobody wrote. |
| Pause card opens | `pause_open` | `scenes/game.gd` | Soft felt down, one low note. The music ducks. |
| Pause card closes | `pause_close` | `scenes/game.gd` | Soft felt up, one note higher. The duck lifts. |
| Sound turned on | `toggle_on` | `scenes/pause.gd` | Two notes **up**. Played after the mute lifts, or it is swallowed by it. |
| Sound turned off | `toggle_off` | `scenes/pause.gd` | Two notes **down**. Played before the mute lands, for the same reason. This is the only setting whose confirmation is silence, so the last thing heard has to say which way the switch went. |
| Any forward button | `button` | `ui/components/brand_button.gd` and others | A single dry tick, the shortest sound in the game. |
| Any back button | `ui_back` | `ui/components/brand_button.gd` | Two notes **down**. Fired by the GHOST role, which is the role the design already reserves for leaving — so no new field was needed to ask "is this back". |
| Focus moves between buttons | `button_focus` | `ui/components/brand_button.gd` | A tick above the click and quieter. It fires on every arrow press, so at click volume holding Down is a machine gun. |
| Pointer over a button | `ui_hover` | `ui/components/brand_button.gd` | Quieter again — the quietest sound in the game. Hover does not exist on a tablet, so this is entirely for a grown-up at a desk. |

## 7. Music and ambience

Two independent layers, and they do different jobs. **Music is the mood; the bed
is the place.** A level has one of each, and they are named from different files
on purpose.

### Music

| Key | File | Plays |
| --- | --- | --- |
| `title_music` | `assets/audio/music/title.mp3` | the title screen, and it keeps playing through login, the menu and level select |
| `level_01_music` … `level_05_music` | `assets/audio/music/level_0N.mp3` | a level, named by that level's registry entry |

Two things about the title track are load-bearing:

- **It starts on the press, not on load.** Browsers refuse to start audio before
  a real user gesture, so the press on the title screen is the only unlock the
  game gets. A title screen that advanced on a timer would hand the player a
  permanently silent game, and nothing would error.
- **Nothing between the title screen and a level touches it.** `AudioManager` is
  an autoload, so the track survives every scene change for free — continuity is
  the default, and the way to break it is for a menu to call `play_music` or
  `stop_music`. `godot/tests/test_title_music.gd` fails if one does.

`loop` is honoured for MP3 (`AudioStreamMP3.loop`), so a track that should not
repeat sets `"loop": false`.

### Ambience beds

One bed per **world**, named in `godot/data/themes/theme_<world>.json` beside
that world's palette — not per level. Levels 1 and 6 are both Emberwood and
already share a track; without a bed keyed on the theme they would still have
sounded like two different forests, because the track was the only thing they
shared.

| World | Levels | Bed | What it is |
| --- | --- | --- | --- |
| `emberwood` | 01, 06, arena | `amb_emberwood` | wind in leaves, a bird far enough away to be scenery |
| `prism_hollow` | 02, 07 | `amb_prism_hollow` | low room tone and glass overhead, **nothing in between** — which is what makes a cave sound big |
| `sugarstorm` | 03, 08 | `amb_sugarstorm` | light breeze and small bells; the only bed allowed to be cheerful |
| `geyserworks` | 04 | `amb_geyserworks` | a low rumble and a steam hiss that breathes on a schedule you can feel |
| `aurora_spire` | 05 | `amb_aurora_spire` | high shimmer, very sparse. Almost nothing happens — it is where the game gets quiet |

The bed stops on the completion screen, which is not a place in the world.

### What the music still needs

Three facts about the tracks that ship today, so nobody rediscovers them:

1. **`title.mp3` is a byte-identical copy of `level_01.mp3`.** It has its own key
   so it can be replaced on its own, and it has not been. The title track should
   be the Emberwood theme slowed down to a solo music box: *the game is about to
   start*.
2. **There are five tracks for eight levels**, so levels 6–8 replay 1–3. Correct
   for now — a world's identity is its bed and its palette, and a fourth forest
   track would be the least valuable file anyone could commission.
3. **They are CC-BY 3.0 from CodeManu** (see `LICENSE_ATTRIBUTIONS.md`), which is
   the one licensing obligation in the audio tree. Replacing them removes it.

Tempo and instrument ladder for whoever writes the replacements — same
instruments across all five so it is one game, different top layer so it is five
places:

| World | BPM | Lead | Under it |
| --- | --- | --- | --- |
| emberwood | 96 | marimba | acoustic bass, light shaker |
| prism_hollow | 88 | celeste | glass bowls, long tails |
| sugarstorm | 108 | music box | pizzicato strings |
| geyserworks | 100 | marimba | soft brass pulses on the beat |
| aurora_spire | 76 | celeste + pad | almost nothing |

All in C, all seamless, 60–90 s. Mono is fine and halves the bytes: this is
played on a tablet speaker.

---

## 8. Replacing a sound

Drop a new file over the old one, same name, same folder:

```bash
cp my-new-cockroach-death.wav godot/assets/audio/sfx/enemy_death.wav
bash godot/tools/build_web.sh
```

That is the whole procedure. No code change, no manifest change, no registry
change. If you want to keep both files instead of overwriting, point the key at
the new one in `godot/data/audio/audio_manifest.json`:

```json
"enemy_death": { "file": "assets/audio/sfx/roach_crunch_v3.wav", "volume": 0.55 }
```

To make a moment play a *different* sound entirely — say the door cue should use
the level-up fanfare — re-point the event in
`godot/data/audio/sound_events.json`. That file maps moment → key; the manifest
maps key → file and mix. Two hops, both data:

```
AudioManager.play_event("door")  →  sound_events.json: "door" → "door"
                                 →  audio_manifest.json: "door" → assets/audio/sfx/door.wav @ 0.5
```

**A loop or a bed must be seamless.** Nothing in the engine cross-fades a join:
`AudioManager` sets `loop_mode` on a *copy* of the stream and plays it end to
end, so an unmatched join is an audible tick every couple of seconds, forever.
`tools/gen_sfx.py::seamless()` is the cross-fade the placeholders use, and
`npm run audio:gen -- --promote` applies the same one to anything it lands.

**Or let the tool master it.** `--promote` matches a new take to the file it
replaces — its rate, its peak on the ladder above, and its duration budget — then
trims, cross-faded if it loops, and writes it under the same name:

```bash
npm run audio:gen -- --key coin_collect --takes 4     # into output/audio-takes/
npm run audio:gen -- --promote coin_collect 3         # master take 3 into the game
```

It refuses a take that blows the budget rather than shipping it (`--max-ms` to
hard-cut, `--force` to overrule), because a coin that rings for a second and a
half is not a loud coin, it is a different sound wearing the coin's name.

## 9. What ships today is a placeholder

Every file under `godot/assets/audio/sfx/` and `godot/assets/audio/ambience/` is
generated by `tools/gen_sfx.py` — synthesized, original by construction so there
is no licensing question, deterministic and tiny. They exist so the game is never
silent and so the wiring is provably complete.

**All of them are meant to be replaced.** They are not rough shapes, though: the
generator is built to the design above, so the placeholder bank already has the
right families, the right scale and the right ladder. A real file replaces its
*timbre*, not its structure — which is what makes it safe to review the design
before a single asset has been commissioned.

`/audio` (see `deploy/RAILWAY.md`) plays every one of them in a browser, grouped
by family, at the volume the game will actually use.

## 10. The rules the build enforces

`godot/tools/check_hardcoding.py` checks this map in **both** directions:

- every moment fired from `godot/scripts/**` — through `play_event`,
  `play_event_at` or `attach_loop`, which all take the event first so one regex
  can read them — has an entry in `sound_events.json`
- every event in `sound_events.json` has at least one caller
- every event has a **row in the table above**, and every row is a real event

So a moment cannot be registered and never fire, a moment cannot fire and find
nothing, and a moment cannot exist without a line telling whoever replaces its
file what it is for. Adding a moment means adding all four: the call, the event,
the key, and the row.

`tools/validate_assets.js` then proves every file named by the manifest — sfx,
beds and music — is actually on disk, and `godot/tests/test_audio_mix.gd` proves
the mix itself still holds: the ladder is in order, every world names a bed that
exists, and every positional sound has a distance.

`play_sfx()` may only be called from `audio_manager.gd`, and the same guard
enforces that: a sound played by key from a game script is a sound nobody can
re-assign without touching code.
