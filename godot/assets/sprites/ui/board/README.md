# Maths board art slots

Status: Supportive
Authority: What art files this directory accepts and what each one replaces.
The fallbacks it describes are drawn in `godot/scripts/ui/math_challenge.gd`.
Last verified against code: 2026-08-24

Drop a file here and the game uses it on the next run. No wiring.

| File | Size | Used by | Falls back to |
| --- | --- | --- | --- |
| `count-token-32.png` | 32x32 | the thing a child counts, in counting problems | a themed disc with an ink rim |
| `board-9slice.png` | 96x96 nine-slice | the board's surface | a rounded `boardBg`/`boardBorder` panel |

`count-token-32.png` is drawn at 1:1, so keep it exactly 32x32. It must not read
as a coin - coins mean currency everywhere else, and a row of them here would
look like a reward rather than a question. It appears in ten-frames of up to
nineteen, so it has to stay countable at a glance in a crowd.

`board-9slice.png` stretches, so its border inset matters: set it in
`godot/data/tuning/ui_tuning.json` under `math_challenge.board_texture_inset`
(default 24). The path is configurable there too, as
`math_challenge.board_texture`.

See `brand/ASSET_MANIFEST.md` Priority 4.
