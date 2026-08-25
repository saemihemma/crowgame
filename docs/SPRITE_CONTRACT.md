# The sprite contract

Status: Current
Authority: How runtime sprites are declared and reached. The pixel law itself is
`brand/ASSET_MANIFEST.md` (from BRAND_SYSTEM §5.1) — this describes the machinery
that holds the code to it. Where the two disagree, the manifest wins.
Last verified against code: 2026-08-25

## Why this exists

`brand/ASSET_MANIFEST.md` already states what a sprite must be: 64×64 for
characters, enemies, NPCs and props, 88×96 for doors, 32×32 for coins and HUD
icons, no anti-aliasing, authored at 1x. It is a good spec. Nothing enforced it,
and nothing connected it to the code.

Instead, every sprite path and frame grid lived as a literal wherever it happened
to be drawn — twelve `res://assets/sprites/**.png` strings across eight `.gd`
files, plus six duplicated `spritesheet` + `frameWidth` + `frameHeight` blocks in
`npc_registry.json`, plus a hardcoded `offset` in four `.tscn` files. Replacing
one sprite meant finding all of its copies. Nobody could answer "what size should
a new enemy be?" from the code, and nothing noticed when a path stopped resolving.

## The two files

| File | Says |
| --- | --- |
| `godot/data/registries/sprite_spec.json` | what each **kind** of sprite must be — frame size, anchor, art notes. Transcribed from the manifest's pixel-law table. |
| `godot/data/registries/sprite_registry.json` | what each **asset** is — its class, path, frame count, fps. Size and anchor are inherited and must not be restated. |

Tilesets are deliberately absent: `data/tilesets/tileset_manifest.json` already
owns their contract, and it is the better model for them.

Two properties follow, and both are tested:

- **One edit retargets a whole kind.** Change `character.frameHeight` in the spec
  and every character sprite moves with it. No code, no scenes.
- **One asset can still deviate**, by putting the field on that sprite with a
  `why`. The build rejects an override without one. `board_panel` is the live
  example: a 96×96 nine-slice source in a 32×32 UI class, because that is what
  ASSET_MANIFEST Priority 4 specifies.

## Reaching a sprite

```gdscript
_sprite.texture      = SpriteSheet.texture("owl")
_anim.sprite_frames  = SpriteSheet.frames("coin")
_sprite.offset       = SpriteSheet.anchor_offset("crow_walk", SpriteSheet.grounding_sink())
```

Never a path. `check_assets.py` fails the build on a `res://assets/**.png` literal
in `.gd`, and on an `offset` or `scale` written onto a sprite node in a `.tscn`.

### Anchors are derived, not written down

A literal `offset = Vector2(0, -28)` encodes **two** things at once: half the
*current* 64px frame, plus the 4px grounding sink. Swap in a 96px-tall crow and
the same `-28` silently means half of 96 minus 20 — the sink jumps to 20px and the
new sprite renders buried, with nothing erroring and the new art taking the blame.

So the anchor comes from the class (`feet` = the frame's bottom edge lands on the
node origin; `center` = centred on it) and the sink is one named value,
`fx_tuning.grounding_sink_px`, which compensates the **tileset's** grass lip and
not any one character's art.

The derived values reproduce what the `.tscn` literals held exactly — `-28` for
player and enemy, `-48` for the door, `0` for the coin — so this moved nothing on
screen. `test_sprite_anchoring.gd` asserts both halves: that the rule holds at
frame heights the project does not ship (16 to 250 px), and that today's sprites
still land on the old numbers.

### Slots for art that has not been drawn

ASSET_MANIFEST Priority 4 commissions themed HUD and board icons that do not exist
yet. Those are registered with `"optional": true` and, where it makes sense, a
`fallback` key. A missing optional file is a warning, not a build failure, and
`SpriteSheet.texture()` resolves the fallback so the game keeps rendering. Drop the
real file in and it is picked up with no code change — which is what
`owl_ring.gd` and `count_row.gd` already promised in their comments.

## The tools

```bash
python3 godot/tools/check_assets.py          # the contract; runs in run_tests.sh
python3 godot/tools/check_assets.py --spec   # the delivery brief, printed from the data
python3 godot/tools/audit_pixel_art.py       # is the art actually pixel art?
python3 godot/tools/audit_pixel_art.py --crops DIR   # 1x/2x/4x Nearest, to judge by eye
```

`audit_pixel_art.py` measures the two manifest rules that can be measured:
`soft%` is "no anti-aliasing", and `native` is "author at 1x, never downscale".

**It currently reports that four of the six shipped sprites break the first one.**
`crow_walk` is 34.5% soft-alpha, `cockroach` 41.1%, `crow_idle` 29.8%. All six are
`native 1x`, so nothing was upscaled — the softness is anti-aliasing in the source
art, exactly what the manifest says makes an asset unusable. That is a finding
about the art, not about this machinery, and it is why the tool prints rather than
fails.

## Adding a sprite

1. `python3 godot/tools/check_assets.py --spec` — it prints the required size,
   anchor and art notes per class.
2. Generate to that. Do not scale in engine.
3. Drop the PNG under `godot/assets/sprites/<role>/`.
4. Add an entry to `sprite_registry.json` naming its `class`. Do not restate the
   frame size or anchor.
5. `godot --headless --path godot --import` — the `[importer_defaults]` preset in
   `project.godot` gives it the pixel-art import settings automatically.
6. `bash godot/tools/run_tests.sh`.
