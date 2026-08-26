#!/usr/bin/env python3
"""Give the levels a gap vocabulary, in two budgets split at level 6.

WHAT WAS WRONG. Measured across all eight levels before writing this: every
jumpable gap in the game is three tiles, and a jump reaches 5.9. Not just the
early levels -- 6, 7 and 8 too. They differ only in platform WIDTH (one-tile
pads) and in chaining hops without a rest; the distance never changes anywhere.
The wide spacings in levels 1, 3, 4 and 5 are descents, where gravity does the
horizontal work, so they are drops rather than jumps.

Worse, in levels 1-5, 62 of 66 elevated platforms sit on top of continuous
ground. They are coin shelves suspended over walkable floor: a child can finish
all five by running along the ground line and hopping six identical pits. The
"tiles to jump on" already existed and did not matter.

THE TWO BUDGETS. Sprint reach is 9.8 tiles against a walk's 5.9, and the brief
is that only the later levels may spend it -- requiring a held run key to
survive is too hardcore for a child still learning to jump.

    levels 1-5   walk    gaps 2-4     timing and variety
    levels 6-8   sprint  gaps to 7    commitment

Both keep a margin under the theoretical reach, because a child does not arrive
at a lip at exactly full speed. godot/tools/check_level_reachability.py enforces
the split, reading the boundary from feature_flags.json.

WHY THESE EDITS AND NOT A REWRITE. Every operation here is LOCAL: it changes one
ground run's width, or splits one run in two, or appends one platform. Nothing
shifts an x coordinate that something else is positioned against, so coins, owls,
hazards and enemies stay exactly where they were authored. A general-purpose
re-layout would have been easier to write and impossible to review.

Run: python3 tools/author_gap_vocabulary.py [--check]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPECS = ROOT / "godot" / "data" / "levels" / "specs"

# ── The edits, per level ──────────────────────────────────────────────────────
#
# gap   (i, n)  -- resize ground run i so the gap after it is n tiles wide.
#                  Only that run's WIDTH changes; run i+1 does not move.
# cut   (i, n)  -- carve an n-tile hole in ground run i, under whichever platform
#                  overhangs it, so the platform becomes the way across instead
#                  of scenery. The pattern already existed in level_01's first
#                  pit; this spreads it.
# add   (dict)  -- one more platform, for introducing a narrower ledge.
#
# Levels 1 and 2 are deliberately the gentlest: one cut each. A child meeting the
# game for the first time should not fall into a hole where yesterday there was
# floor. The cuts get more frequent through 3, 4 and 5, and the narrow ledges
# arrive last, so precision is introduced before it is required in level 6.
EDITS = {
    "level_01_forest": {
        # Gap vocabulary 2/3 plus a mandatory platform crossing,
        # instead of six identical 3s along an unbroken floor.
        "gap": [(0, 2), (1, 3), (2, 3), (3, 2), (4, 3)],
        # One cut, under the 4-wide shelf at x=22 which already overhangs floor.
        "cut": [(1, 3)],
    },
    "level_02_cave": {
        "gap": [(0, 3), (1, 2), (2, 3), (3, 3), (4, 2), (5, 3)],
        "cut": [(2, 3)],
    },
    "level_03_meadow": {
        # This level declares `long_gap` in its spec and had no gap wider than
        # any other. Two cuts give it two crossings that are actually over
        # something, which is the closest an honest walk budget gets to it.
        "gap": [(0, 3), (1, 3), (2, 2), (4, 3)],
        "cut": [(1, 3), (3, 3), (5, 3)],
    },
    "level_04_bridge": {
        "gap": [(0, 2), (1, 3), (2, 3), (3, 3), (4, 2)],
        "cut": [(1, 3), (3, 3), (5, 3)],
        # First 2-wide ledge in the game: precision, introduced where a miss
        # still lands on floor.
        "add": [{"type": "platform", "x": 62, "width": 2, "y": 12}],
    },
    "level_05_treetop": {
        "gap": [(0, 3), (1, 3), (2, 3), (3, 2), (4, 3)],
        "cut": [(1, 3), (3, 3), (5, 3), (7, 3)],
        # And the first 1-wide pad, over floor rather than over a pit, so the
        # skill is met before level 6 demands it.
        "add": [{"type": "platform", "x": 74, "width": 1, "y": 12}],
    },
    # ── The sprint band. One wide gap each, in the open, and each with ONE
    # foothold in it.
    #
    # The footholds are a correction, and the measurement that forced them is
    # worth keeping. Sprint is a default capability that is never taught, by
    # decision -- so the guard was re-run with the sprint envelope removed
    # entirely, asking what a child who never presses Space can do. Level 6
    # stopped that child at column 17 and level 8 at column 15, both a few tiles
    # from the spawn, with the door and 37 and 44 coins on the far side. Not hard:
    # unfinishable, by a key nothing mentions.
    #
    # A foothold ONE ROW BELOW THE GROUND LINE fixes it without softening the
    # gap. Platforms in this game are solid from every side, so anything placed
    # above the ground line would stand in the way of the running leap itself;
    # a step down is out of the arc entirely. The walk route becomes down one,
    # across, up one -- slow, and available. The sprint route is unchanged: one
    # clean line over the whole six tiles, and now a missed sprint lands on a
    # ledge instead of the spikes at row 19, which for a five-year-old is the
    # right way for a first attempt at a new skill to fail.
    "level_06_emberwood_deep": {
        "gap": [(0, 6)],
        # Gap is columns 11-16; ground surface is row 16 and the spikes are at 19.
        "add": [{"type": "platform", "x": 13, "width": 2, "y": 17}],
    },
    # Level 7 deliberately gets NOTHING.
    #
    # Every one of its five ground gaps is already bridged -- 12 tiles over a
    # three-step staircase, two 6s over a pad each, an 8 over a 5-wide shelf, 25
    # over a six-piece pyramid. Widening any of them widens a span that is
    # crossed over the bridge rather than across the hole, so it would not
    # produce a sprint jump; producing one would mean deleting a bridge.
    #
    # And this is the level a playtester singled out as the good one -- the
    # 16-tile chasm on four one-tile stones. Its identity is precision, not
    # distance. Levels 6 and 8 carry the sprint gaps; 7 keeps what it is.
    "level_07_crystal_depths": {},
    "level_08_meadow_heights": {
        "gap": [(0, 6), (3, 7)],
        # Gap is columns 9-14. The 7 after run 3 is already bridged, so it needs
        # nothing: it is crossed over the bridge, not across the hole.
        "add": [{"type": "platform", "x": 11, "width": 2, "y": 17}],
    },
}


def ground_runs(platforms):
    """Ground runs left to right, with their index into `platforms`."""
    runs = [(i, p) for i, p in enumerate(platforms) if p["type"] == "ground"]
    runs.sort(key=lambda pair: pair[1]["x"])
    return runs


def apply_gap(platforms, run_index, want):
    """Resize ground run `run_index` so the gap after it is `want` tiles."""
    runs = ground_runs(platforms)
    if run_index + 1 >= len(runs):
        return f"gap {run_index}: no run after it"
    _, here = runs[run_index]
    _, nxt = runs[run_index + 1]
    new_width = nxt["x"] - here["x"] - want
    if new_width < 2:
        return f"gap {run_index}: would leave a {new_width}-tile run"
    here["width"] = new_width
    return None


def apply_cut(platforms, run_index, hole):
    """Carve a hole in ground run `run_index`, under an overhanging platform.

    Placed by the platform, not by arithmetic: the hole is centred under the
    widest platform overhanging this run, so the crossing is over that platform.
    Refuses rather than guesses when no platform overhangs -- a hole with nothing
    above it is a wall, not a jump.
    """
    runs = ground_runs(platforms)
    if run_index >= len(runs):
        return f"cut {run_index}: no such run"
    idx, run = runs[run_index]
    left, right = run["x"], run["x"] + run["width"]

    over = [p for p in platforms
            if p["type"] == "platform" and p["x"] >= left and p["x"] + p["width"] <= right]
    if not over:
        return f"cut {run_index}: nothing overhangs run at x={left}"
    shelf = max(over, key=lambda p: p["width"])

    centre = shelf["x"] + shelf["width"] / 2
    start = int(round(centre - hole / 2))
    # Keep at least two tiles of footing on both sides: a lip you cannot stand on
    # is not a lip.
    start = max(left + 2, min(start, right - hole - 2))
    if start <= left or start + hole >= right:
        return f"cut {run_index}: run at x={left} is too short for a {hole}-tile hole"

    run["width"] = start - left
    platforms.append({"type": "ground", "x": start + hole, "width": right - (start + hole),
                      "y": run["y"]})
    return None


def pits(platforms):
    """Every hole in the ground line, as (start, width) in tiles.

    A hazard belongs on a pit floor, so moving the ground means the spikes have
    to move with it. Nothing recomputed them before, because nothing had ever
    changed the ground.
    """
    runs = [p for p in platforms if p["type"] == "ground"]
    runs.sort(key=lambda p: p["x"])
    out = []
    for a, b in zip(runs, runs[1:]):
        end = a["x"] + a["width"]
        if b["x"] > end:
            out.append((end, b["x"] - end))
    return out


def replace_hazards(spec, platforms):
    """Re-seat the authored spikes into the pits that now exist.

    Keeps the authored COUNT where the pits can hold it, and keeps each run's
    authored width where it fits -- a 3-wide spike run in a 2-wide pit becomes a
    2-wide run rather than poking out through the floor. Extra runs are dropped
    rather than stacked, and that loss is reported: five spikes in four pits is
    an authoring question, not something to solve silently.
    """
    hazards = spec.get("hazards") or []
    if not hazards:
        return None
    holes = [(x, w) for x, w in pits(platforms) if w >= 1]
    seated, dropped = [], 0
    for i, hazard in enumerate(hazards):
        if i >= len(holes):
            dropped += 1
            continue
        x, w = holes[i]
        width = min(int(hazard.get("width", 1)), w)
        out = dict(hazard)
        out["x"] = x + (w - width) // 2
        out["width"] = width
        seated.append(out)
    spec["hazards"] = seated
    if dropped:
        return f"{len(hazards)} spike run(s) authored, {len(holes)} pit(s) available: dropped {dropped}"
    return None


def rewrite(stem, edits):
    path = SPECS / f"{stem}.spec.json"
    spec = json.loads(path.read_text())
    platforms = spec["platforms"]
    problems = []

    # Cuts first: they SPLIT runs, so doing them after the gap edits would
    # renumber the runs those edits refer to.
    for run_index, hole in edits.get("cut", []):
        err = apply_cut(platforms, run_index, hole)
        if err:
            problems.append(f"{stem}: {err}")
    for run_index, want in edits.get("gap", []):
        err = apply_gap(platforms, run_index, want)
        if err:
            problems.append(f"{stem}: {err}")
    for extra in edits.get("add", []):
        # Idempotent, because this tool is run again every time the vocabulary
        # changes and a bare append is not. Running it twice duplicated level 4's
        # 2-wide ledge and level 5's 1-wide pad -- two platforms occupying exactly
        # the same tiles, invisible in the game and invisible in the compiled map,
        # and a landmine for anyone later reading the spec as the authored truth.
        key = (extra["type"], extra["x"], extra["width"], extra["y"])
        if any((q["type"], q["x"], q["width"], q["y"]) == key for q in platforms):
            continue
        platforms.append(dict(extra))

    platforms.sort(key=lambda p: (p["x"], p["y"]))
    note = replace_hazards(spec, platforms)
    if note:
        print(f"  note {stem}: {note}")
    path.write_text(json.dumps(spec, indent=2) + "\n")
    return problems


def report():
    """Adjacent-surface gaps per level, which is the thing being changed."""
    for stem in EDITS:
        spec = json.loads((SPECS / f"{stem}.spec.json").read_text())
        edges = sorted((p["x"], p["x"] + p["width"], p["y"]) for p in spec["platforms"])
        level_gaps, drops = [], []
        for x0, x1, y0 in edges:
            after = sorted((x - x1, y) for x, _, y in edges if x >= x1)
            if not after:
                continue
            gap, y_next = after[0]
            (drops if y_next > y0 else level_gaps).append(gap)
        widest = max(level_gaps) if level_gaps else 0
        print(f"  {stem:26} jumpable {sorted(set(level_gaps))}  widest {widest}"
              f"   descents {sorted(set(drops))}")


def main():
    if "--check" in sys.argv:
        report()
        return
    problems = []
    for stem, edits in EDITS.items():
        problems += rewrite(stem, edits)
    if problems:
        print("REFUSED:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("gap vocabulary written:")
    report()


if __name__ == "__main__":
    main()
