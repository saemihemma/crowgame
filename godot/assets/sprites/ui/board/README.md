# Maths board art slots

Status: Supportive
Authority: What art files this directory accepts and what each one replaces.
The fallbacks it describes are drawn in `godot/scripts/ui/math_challenge.gd`.

Drop a file here and the game uses it on the next run. No wiring.

| File | Size | Used by | Falls back to |
| --- | --- | --- | --- |
| `count-token-<shape>-32.png` | 32x32 each | the thing a child counts, in counting problems | drawn shapes with an ink rim |
| `board-9slice.png` | 96x96 nine-slice | the board's surface | a rounded `boardBg`/`boardBorder` panel |

Counting tokens come in SIX shapes -- `disc`, `ring`, `square`, `diamond`,
`leaf`, `flower` -- and which one a problem draws follows the symbol its prompt
repeats, so two counting questions in a row do not look like the same question
asked twice. Art is optional and arrives one shape at a time: register
`board_count_token_leaf` at `count-token-leaf-32.png` and leaves use it while the
other five stay drawn.

There was a single `count-token-32.png` here and it is deliberately gone. Every
counting problem rendered it, which threw away the twelve-way symbol variety the
curriculum had already encoded, and the art itself was a plus sign inside a
circle -- the worst available choice for a countable object in a game where a
child has just been taught that "+" means put together.

Each shape is drawn at 1:1, so keep any replacement exactly 32x32. None may read
as a coin - coins mean currency everywhere else, and a row of them here would
look like a reward rather than a question. They appear in ten-frames of up to
nineteen, so they have to stay countable at a glance in a crowd.

`board-9slice.png` stretches, so its border inset matters: set it in
`godot/data/tuning/ui_tuning.json` under `math_challenge.board_texture_inset`
(default 24). The path is configurable there too, as
`math_challenge.board_texture`.

See `brand/ASSET_MANIFEST.md` Priority 4.
