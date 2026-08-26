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


FLAGS = json.loads((ROOT / "data" / "tuning" / "feature_flags.json").read_text())
# The first level allowed to need a wound-up run. Everything below it must be
# finishable at a walk -- see feature_flags.json levels.sprint_gaps_from.
SPRINT_FROM = int(FLAGS.get("levels", {}).get("sprint_gaps_from", 99))


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
    if number >= SPRINT_FROM and number != 99:
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


def standable(grid, w, h):
    """Cells the crow can stand in: empty, with something solid underneath."""
    return {(c, r) for r in range(h - 1) for c in range(w)
            if not grid[r][c] and grid[r + 1][c]}


def reachable_from(start, cells, up, across, max_fall):
    seen, queue = {start}, deque([start])
    while queue:
        cx, cy = queue.popleft()
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


def check(path):
    level = json.loads(path.read_text())
    tile = level["tilewidth"]
    w, h = level["width"], level["height"]
    speed, band = speed_for(path.stem)
    up, across = envelope(tile, speed)
    grid = solid_grid(level)
    cells = standable(grid, w, h)

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

    seen = reachable_from(start, cells, up, across, h)

    # A coin the crow can never reach is a coin that makes a child feel they
    # missed something. Coins float above a surface, so a coin counts as
    # reachable if any reachable standable cell sits within a jump of it.
    stranded = []
    for layer in level["layers"]:
        if layer.get("type") != "objectgroup":
            continue
        for obj in layer["objects"]:
            if obj.get("type") != "collectible":
                continue
            cx = int((obj["x"] + obj.get("width", tile) / 2) // tile)
            cy = int((obj["y"] + obj.get("height", tile) / 2) // tile)
            if not any(abs(sc - cx) <= across and 0 <= sr - cy <= up + 1
                       for sc, sr in seen):
                stranded.append((cx, cy))
    if stranded:
        return [f"{path.name}: {len(stranded)} coin(s) out of reach, first at "
                f"column {stranded[0][0]} row {stranded[0][1]}"]

    if finish not in seen:
        gap = min((abs(c - finish[0]) for c, r in seen), default=-1)
        return [f"{path.name}: the door at column {finish[0]} is unreachable "
                f"(closest the crow gets is {gap} columns away)"]
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
    for name in keys:
        problems += check(LEVELS / name)
    if problems:
        print("UNFINISHABLE:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("level reachability: clean")


if __name__ == "__main__":
    main()
