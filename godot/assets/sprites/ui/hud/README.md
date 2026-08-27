# HUD art slots

Status: Supportive
Authority: What art files this directory accepts and what each one replaces.
The fallbacks it describes are drawn in `godot/scripts/ui/hud.gd`.

Drop a file here and the game uses it on the next run. No wiring.

| File | Size | Used by | Falls back to |
| --- | --- | --- | --- |
| `owl-icon-32.png` | 32x32 | the HUD owl ring and the maths board header | a head crop of the 64px world owl |

Drawn at 1:1, so keep it exactly 32x32 or it will be resampled.
See `brand/ASSET_MANIFEST.md` Priority 4.
