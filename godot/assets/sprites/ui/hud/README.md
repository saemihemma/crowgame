# HUD art slots

Status: Supportive
Authority: Drop-in art slot map for the HUD; the fallback drawing lives in code.
Last verified against code: 2026-08-24

Drop a file here and the game uses it on the next run. No wiring.

| File | Size | Used by | Falls back to |
| --- | --- | --- | --- |
| `owl-icon-32.png` | 32x32 | the HUD owl ring and the maths board header | a head crop of the 64px world owl |

Drawn at 1:1, so keep it exactly 32x32 or it will be resampled.
See `brand/ASSET_MANIFEST.md` Priority 4.
