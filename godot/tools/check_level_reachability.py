#!/usr/bin/env python3
"""Prove every level can be finished, by search rather than by simulation.

A level that cannot be walked from its spawn to its door is unfinishable, and
nothing checked that. The obvious approach - drive the real player with a bot -
was tried and abandoned: it is slow (real-time physics, minutes per level) and
it only proves what the *bot* can do. It failed on level_01's first pit, which a
platform overhangs, so the crossing is over the platform rather than across the
gap. That is real design, not a defect, and no simple bot solves it.

This searches the tile grid instead, using the crow's measured movement envelope
from player_base.json. Deterministic, exhaustive, and runs in milliseconds.

Run: python3 godot/tools/check_level_reachability.py
"""
import json, math, sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEVELS = ROOT / "data" / "levels" / "compiled"
REGISTRY = ROOT / "data" / "levels" / "level_registry.json"
TUNING = json.loads((ROOT / "data" / "tuning" / "player_base.json").read_text())
GRAVITY = 800.0

# Every ability a level is allowed to declare a goal behind. An unknown name is
# an error rather than an exemption: "requires double_jmup" would otherwise read
# as a deliberately-gated goal and hide an accidentally stranded one forever.
ABILITIES = {
    str(a.get("id", ""))
    for a in json.loads((ROOT / "data" / "tuning" / "abilities.json").read_text()).get("abilities", [])
}
# Which NPC ids are goals. A signpost is not something a child has to reach; an
# owl in chains is the entire point of the level.
CHALLENGERS = {
    str(n.get("id", ""))
    for n in json.loads((ROOT / "data" / "npcs" / "npc_registry.json").read_text()).get("npcs", [])
    if str(n.get("behavior", "")) == "math_challenger"
}


FLAGS = json.loads((ROOT / "data" / "tuning" / "feature_flags.json").read_text())
# The first level allowed to need a wound-up run. Everything below it must be
# finishable at a walk -- see feature_flags.json levels.sprint_gaps_from.
SPRINT_FROM = int(FLAGS.get("levels", {}).get("sprint_gaps_from", 99))

# Set for the second pass in main(), which asks a different question: what can a
# child who never presses Space do? See main().
WALK_ONLY = False


# How wide the crow actually is, from the sprite contract rather than from a
# number typed here. See the `why_width` note beside it: the collider was 1.25
# tiles for a long time, which is wider than a one-tile hole, so seven authored
# holes across five levels were solid ground -- a playtester photographed the
# crow standing in mid-air over one. `gaps_the_body_bridges` below is what stops
# that coming back the next time either number moves.
PLAYER_BODY_W = int(
    json.loads((ROOT / "data" / "registries" / "sprite_spec.json").read_text())
    ["classes"]["character"]["body"]["width"]
)


def gaps_the_body_bridges(level, tile):
    """Holes narrower than the crow, which are therefore not holes.

    A gap in a row of solid tiles is a level-design statement: jump, or fall. It
    stops being either the moment the player's collision box is wide enough to
    rest on both lips at once -- and nothing about the level SAYS so, so the
    designer authors a hop, the child walks over it, and the level is quietly a
    tile flatter than it reads.

    Row by row rather than platform by platform, because the compiled level has
    no platforms left in it -- only tiles -- and a hole is a hole however the two
    sides of it were authored.
    """
    grid = solid_grid(level)
    w, h = level["width"], level["height"]
    found = []
    for row in range(h):
        col = 0
        while col < w:
            if grid[row][col]:
                col += 1
                continue
            start = col
            while col < w and not grid[row][col]:
                col += 1
            # Open ends are the edge of the map, not a hole between two ledges.
            if start == 0 or col >= w:
                continue
            # A hole needs a floor missing under it too: the empty air above a
            # platform is not a gap a child can fall through.
            if grid[row + 1][start] if row + 1 < h else False:
                continue
            width_px = (col - start) * tile
            if width_px < PLAYER_BODY_W:
                found.append((row, start, col - start, width_px))
    return found


def envelope(tile, speed):
    """How far the crow can move in one jump at `speed`, in tiles."""
    v = float(TUNING["jumpVelocity"])
    rise_px = v * v / (2 * GRAVITY)
    airtime = 2 * v / GRAVITY
    # One tile of margin in each direction: a child does not jump frame-perfect,
    # and a path that only exists at the limit is not a path they will find.
    up = int(rise_px // tile) - 1
    across = int((speed * airtime) // tile) - 1
    return up, across


def speed_for(name):
    """Which speed a level is allowed to be solved at.

    TWO BUDGETS, not one. Levels below sprint_gaps_from must be finishable at a
    WALK: requiring a held run key to survive is too much for a child still
    learning to jump, and a guard that measured everything at sprint speed would
    let an unwalkable early level through silently. From sprint_gaps_from up, a
    gap may want the run -- and a guard still measuring at walking speed would
    report that deliberate design as unfinishable.

    The practice arena has no number and no platforming; it takes the walk
    budget, which it trivially satisfies.
    """
    digits = "".join(ch for ch in name.split("_")[1] if ch.isdigit())
    number = int(digits) if digits else 0
    if not WALK_ONLY and number >= SPRINT_FROM and number != 99:
        return float(TUNING.get("sprintMaxSpeed", TUNING["maxSpeed"])), "sprint"
    return float(TUNING["maxSpeed"]), "walk"


def solid_grid(level):
    """Merged solidity from every tile layer that collides."""
    w, h = level["width"], level["height"]
    grid = [[False] * w for _ in range(h)]
    for layer in level["layers"]:
        if layer.get("type") != "tilelayer":
            continue
        if layer.get("name") not in ("ground",):
            continue
        data = layer["data"]
        for r in range(h):
            for c in range(w):
                if data[r * w + c]:
                    grid[r][c] = True
    return grid


def standable(grid, w, h, ladders=()):
    """Cells the crow can stand in: empty, with something solid underneath.

    A LADDER CELL COUNTS TOO. A ladder has no collision -- it is scenery the crow
    chooses to grab -- so nothing under a rung is solid and none of its cells
    would otherwise be standable. Without this, a level whose only way up is a
    ladder reads to this checker as unfinishable, and the checker would be
    telling the truth about a crow that cannot climb rather than about ours.
    """
    cells = {(c, r) for r in range(h - 1) for c in range(w)
             if not grid[r][c] and grid[r + 1][c]}
    for (c, top, tiles) in ladders:
        for r in range(top, min(h, top + tiles)):
            if 0 <= c < w and not grid[r][c]:
                cells.add((c, r))
    return cells


def ladder_cells(level, tile):
    """Every ladder as (column, top row, height in tiles)."""
    out = []
    for layer in level["layers"]:
        if layer.get("type") != "objectgroup":
            continue
        for obj in layer.get("objects", []):
            if obj.get("type") != "ladder":
                continue
            out.append((int(obj["x"] // tile),
                        int(obj["y"] // tile),
                        max(1, int(obj.get("height", tile) // tile))))
    return out


def climb_links(ladders, cells):
    """Cells a ladder joins to each other, regardless of the jump envelope.

    Climbing is not jumping: a ladder is a vertical corridor the crow moves
    freely along, so its cells reach each other at any distance. Modelling it as
    a very tall jump would also let the crow LEAP that high anywhere, which is
    the kind of shortcut that makes a reachability guard lie.
    """
    links = {}
    for (c, top, tiles) in ladders:
        column = [(c, r) for r in range(top, top + tiles) if (c, r) in cells]
        for cell in column:
            links.setdefault(cell, set()).update(x for x in column if x != cell)
    return links


def reachable_from(start, cells, up, across, max_fall, climbs=None):
    climbs = climbs or {}
    seen, queue = {start}, deque([start])
    while queue:
        cx, cy = queue.popleft()
        for nx, ny in climbs.get((cx, cy), ()):      # a ladder, climbed
            if (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny))
        for nx, ny in cells:
            if (nx, ny) in seen:
                continue
            dx, dy = abs(nx - cx), cy - ny        # dy > 0 means going up
            if dx > across:
                continue
            if dy > up or -dy > max_fall:
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return seen


def object_cell(level, kind, tile):
    for layer in level["layers"]:
        if layer.get("type") != "objectgroup":
            continue
        for obj in layer["objects"]:
            if obj.get("type") == kind:
                # Objects are anchored bottom-ish; the cell the crow occupies is
                # the one its feet rest in.
                return (int((obj["x"] + obj["width"] / 2) // tile),
                        int((obj["y"] + obj["height"]) // tile) - 1)
    return None


def prop(obj, name):
    for p in obj.get("properties", []) or []:
        if p.get("name") == name:
            return str(p.get("value") or "")
    return ""


def goals_in(level, tile):
    """Everything a child is meant to be able to get to, as (kind, col, row, requires).

    A signpost NPC is not a goal and an ordinary coin cannot be ability-gated, so
    the three kinds are not interchangeable and each says which it is in the
    failure message -- "3 coins out of reach" and "an owl out of reach" want very
    different reactions from whoever reads it.
    """
    out = []
    for layer in level["layers"]:
        if layer.get("type") != "objectgroup":
            continue
        for obj in layer["objects"]:
            kind = obj.get("type")
            cx = int((obj["x"] + obj.get("width", tile) / 2) // tile)
            if kind in ("collectible", "big_coin"):
                # A pickup is CENTRED on its point and floats, so its own cell is
                # the one to reach.
                cy = int((obj["y"] + obj.get("height", tile) / 2) // tile)
                if kind == "collectible":
                    out.append(("coin", cx, cy, ""))
                else:
                    out.append(("big coin", cx, cy, prop(obj, "requires_ability")))
            elif kind == "npc" and prop(obj, "npc_id") in CHALLENGERS:
                # An owl is FEET-ANCHORED: the compiled y is where its feet land,
                # which is the surface it stands on -- so the cell that matters is
                # the one above, where the crow stands beside it. Reading it as a
                # centre put every owl in the game two rows inside the floor and
                # reported all nineteen as unreachable, which is how this comment
                # came to exist.
                out.append(("owl", cx, int(obj["y"] // tile) - 1,
                            prop(obj, "requires_ability")))
    return out


def check(path, quiet=False):
    level = json.loads(path.read_text())
    tile = level["tilewidth"]
    w, h = level["width"], level["height"]
    speed, band = speed_for(path.stem)
    up, across = envelope(tile, speed)
    grid = solid_grid(level)
    ladders = ladder_cells(level, tile)
    cells = standable(grid, w, h, ladders)
    climbs = climb_links(ladders, cells)

    spawn = object_cell(level, "player_spawn", tile)
    door = object_cell(level, "door", tile)
    if spawn is None:
        return [f"{path.name}: no player spawn"]
    if door is None:
        return [f"{path.name}: no exit door"]

    # Snap both to the nearest standable cell in their own column.
    def snap(cell):
        c, r = cell
        best = None
        for (sc, sr) in cells:
            if sc != c:
                continue
            if best is None or abs(sr - r) < abs(best[1] - r):
                best = (sc, sr)
        return best

    start, finish = snap(spawn), snap(door)
    if start is None:
        return [f"{path.name}: spawn column {spawn[0]} has nowhere to stand"]
    if finish is None:
        return [f"{path.name}: door column {door[0]} has nowhere to stand"]

    seen = reachable_from(start, cells, up, across, h, climbs)

    # THREE KINDS OF GOAL, not one.
    #
    # Coins were the only thing checked here, which left the two that matter more
    # unguarded: an owl is the point of a level, and a big coin is a third of its
    # completion. Either one stranded by an edit was silent -- a child simply
    # never found it and had no way to know it existed.
    #
    # They float above a surface, so a goal counts as reachable when any reachable
    # standable cell sits within one jump of it.
    #
    # A goal may declare `requires_ability`, which INVERTS the rule for it: the
    # bonus owl at the end of a map is meant to be out of reach until the child
    # earns a better crow, so being reachable makes the declaration a lie and the
    # climb not a climb. That case fails too.
    stranded = []
    for kind, cx, cy, requires in goals_in(level, tile):
        can_reach = any(abs(sc - cx) <= across and 0 <= sr - cy <= up + 1
                        for sc, sr in seen)
        if requires:
            if requires not in ABILITIES:
                return [f"{path.name}: a {kind} at column {cx} row {cy} requires "
                        f"'{requires}', which is not in abilities.json -- a typo here "
                        f"reads as a deliberate gate and hides a stranded goal"]
            # Only judged on the generous pass. The walk-only pass exists to ask
            # what a child who never sprints can do, and everything is harder
            # there, so "still out of reach" carries no information.
            if can_reach and not WALK_ONLY:
                return [f"{path.name}: the {kind} at column {cx} row {cy} says it needs "
                        f"'{requires}', but the crow can already reach it -- either the "
                        f"climb is not a climb, or the declaration should go"]
            continue
        if not can_reach:
            stranded.append((kind, cx, cy))
    if stranded:
        kinds = ", ".join(sorted({k for k, _, _ in stranded}))
        return [f"{path.name}: {len(stranded)} goal(s) out of reach ({kinds}), first "
                f"at column {stranded[0][1]} row {stranded[0][2]}"]

    if finish not in seen:
        gap = min((abs(c - finish[0]) for c, r in seen), default=-1)
        return [f"{path.name}: the door at column {finish[0]} is unreachable "
                f"(closest the crow gets is {gap} columns away)"]
    if not quiet:
        print(f"  {path.name:26} [{band:6}] spawn {start} -> door {finish}  "
              f"({len(seen)}/{len(cells)} standable cells reachable)")
    return []


def main():
    keys = [l["mapFile"].split("/")[-1] for l in json.loads(REGISTRY.read_text())["levels"]]
    wu, wa = envelope(32, float(TUNING["maxSpeed"]))
    su, sa = envelope(32, float(TUNING.get("sprintMaxSpeed", TUNING["maxSpeed"])))
    print(f"level reachability (walk {wa} across / {wu} up; "
          f"sprint {sa} across / {su} up from level {SPRINT_FROM})")
    problems = []
    bridged = []
    for name in keys:
        problems += check(LEVELS / name)
        level = json.loads((LEVELS / name).read_text())
        for row, col, tiles, px in gaps_the_body_bridges(level, level["tilewidth"]):
            bridged.append(f"{name}: row {row}, column {col} -- a {tiles}-tile "
                           f"({px}px) hole, and the crow's box is {PLAYER_BODY_W}px, "
                           f"so it stands on the hole instead of falling through it")

    # SECOND PASS: every level, at a walk, with the sprint budget taken away.
    #
    # The pass above allows levels from sprint_gaps_from up to need the run key.
    # This one asks the question that decision does not answer: sprint is a
    # default capability and nothing in the game teaches it, so what happens to a
    # child who never presses Space? When it was first run, level 6 stopped that
    # child at column 17 and level 8 at column 15 -- both a few tiles past the
    # spawn, with the door and dozens of coins on the far side. The first pass was
    # clean throughout, because it was measuring a crow that sprints.
    #
    # So a sprint gap is allowed to be the FAST way across and never the only way.
    # Both passes gate. If sprint is ever taught, this pass is the thing to relax,
    # deliberately, in one place.
    global WALK_ONLY
    WALK_ONLY = True
    walk_problems = []
    for name in keys:
        walk_problems += check(LEVELS / name, quiet=True)
    WALK_ONLY = False

    if problems:
        print("UNFINISHABLE:")
        for p in problems:
            print("  " + p)
    if walk_problems:
        print("UNFINISHABLE AT A WALK (sprint is never taught, so this is a wall):")
        for p in walk_problems:
            print("  " + p)
    if bridged:
        print("HOLES THAT ARE NOT HOLES (the collider bridges them):")
        for b in bridged:
            print("  " + b)
    if problems or walk_problems or bridged:
        sys.exit(1)
    print(f"level reachability: clean, and clean again at a walk with no sprint "
          f"({len(keys)} levels)")


if __name__ == "__main__":
    main()
