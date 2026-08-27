#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Author the second lap: three levels that revisit the first three worlds at a
band with no easy content in it.

Coordinates are computed rather than typed. Twenty platforms hand-entered per
level is twenty chances to put a ledge four tiles up, and the reachability
checker would find it but only after the fact. Here the motif sequence is the
design and the geometry follows from the crow's measured envelope (4 tiles
across, 3 up, from check_level_reachability.py), so a level cannot be authored
unreachable in the first place.
"""
import json, io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GROUND_Y = 16
# Both numbers are the checker's envelope, and both are a CELL-TO-CELL
# displacement: the crow can land on a cell 4 columns and 3 rows from the one it
# left. A gap of n empty columns is a displacement of n+1, so the widest
# jumpable gap is one narrower than the envelope. Getting that wrong is how the
# first draft of these three levels shipped a 4-column gap the crow could not
# cross -- and the checker reported it as stranded coins, because the coins over
# the far side were the first thing it looked at.
MAX_RISE = 3      # rows the crow can gain in one jump
MAX_REACH = 4     # columns it can cross in one jump
MAX_GAP = MAX_REACH - 1   # empty columns that leaves crossable


def build(motifs):
    """Walk a motif sequence left to right, emitting platforms as we go.

    Every motif is responsible for leaving the walker standing somewhere the
    next one can start from, which is what keeps the whole level connected.
    """
    plats, holes, x = [], [], 0
    for kind, n in motifs:
        if kind == 'ground':
            plats.append({"type": "ground", "x": x, "width": n, "y": GROUND_Y})
            x += n
        elif kind == 'gap':
            # A gap is crossable on its own, so nothing has to be built over it.
            assert n <= MAX_GAP, f"gap of {n} is wider than the crow can jump"
            holes.append((x, n))
            x += n
        elif kind == 'stair_up':
            # n steps rising MAX_RISE each, three wide so a landing is forgiving.
            for i in range(n):
                plats.append({"type": "platform", "x": x, "width": 3,
                              "y": GROUND_Y - MAX_RISE * (i + 1)})
                x += 4
        elif kind == 'summit':
            # Climb n steps, a landing at the top, then n steps back down. A
            # descent is only ever the back half of a climb: on its own it emits
            # its highest step first, and the crow meets that from the ground
            # needing to gain n*MAX_RISE rows in one jump. The first draft of
            # these levels had exactly that, and every coin above the top step
            # was stranded because the step itself was.
            for i in range(n):
                plats.append({"type": "platform", "x": x, "width": 3,
                              "y": GROUND_Y - MAX_RISE * (i + 1)})
                x += 4
            plats.append({"type": "platform", "x": x, "width": 5,
                          "y": GROUND_Y - MAX_RISE * n})
            x += 5
            for i in range(n - 1, 0, -1):
                plats.append({"type": "platform", "x": x, "width": 3,
                              "y": GROUND_Y - MAX_RISE * i})
                x += 4
        elif kind == 'hops':
            # A run of single-tile ledges at one height, a full reach apart.
            for _ in range(n):
                plats.append({"type": "platform", "x": x, "width": 1, "y": GROUND_Y - MAX_RISE})
                x += MAX_REACH
        elif kind == 'chasm':
            # Wider than one jump, so it gets a stepping stone. Two hops of at
            # most a full reach each, which is what makes a real drop legible
            # instead of every gap in the level being the same three tiles.
            assert n >= MAX_GAP + 1, f"a chasm of {n} is just a gap"
            stone = x + (n - 2) // 2
            assert stone - (x - 1) <= MAX_REACH, f"chasm of {n}: first hop too long"
            assert (x + n) - (stone + 1) <= MAX_REACH, f"chasm of {n}: second hop too long"
            plats.append({"type": "platform", "x": stone, "width": 2, "y": GROUND_Y - 2})
            holes.append((x, n))
            x += n
        elif kind == 'ledge':
            plats.append({"type": "platform", "x": x, "width": n, "y": GROUND_Y - MAX_RISE})
            x += n
        else:
            raise AssertionError(f"unknown motif {kind}")
    return plats, holes, x


def ground_columns(plats, margin=2):
    """Columns with ground under them, in order, `margin` clear of each edge.

    An owl on the last column before a gap is an owl a child has to stand on the
    lip of a drop to talk to. Nothing that holds still belongs within a couple of
    tiles of an edge.
    """
    out = []
    for p in plats:
        if p["type"] != "ground":
            continue
        w = int(p["width"])
        lo, hi = p["x"] + margin, p["x"] + w - margin
        if lo >= hi:                      # too narrow to have an interior
            continue
        out.extend(range(lo, hi))
    return sorted(out)


def spread(columns, fractions, keep_clear=(), gap=4):
    """Place things at fractions along the floor, snapped to a real ground column.

    Hand-typed x positions do not survive a change to the motif sequence: the
    first draft of these levels had an owl and three cockroaches standing over
    open air, because the geometry moved underneath the numbers. Deriving the
    positions from the floor means they cannot drift again.
    """
    out = []
    for f in fractions:
        i = min(len(columns) - 1, max(0, int(len(columns) * f)))
        # Walk forward to the first column that is not crowded, so an owl and a
        # cockroach never share a spot.
        for c in columns[i:] + columns[:i]:
            if all(abs(c - k) >= gap for k in tuple(keep_clear) + tuple(out)):
                out.append(c)
                break
    return sorted(out)


def coins_over(plats, every=3):
    """A coin above every few cells of standable ground, so the reward is on the
    path rather than scattered where a child has to hunt."""
    out = []
    for p in plats:
        for dx in range(0, int(p["width"]), every):
            out.append({"type": "coin", "x": p["x"] + dx, "y": p["y"] - 2})
    return out


def level(spec_id, name, theme, difficulty, music, motifs, owl_ids, skills, band,
          intent, target, length, motif_names):
    plats, holes, width = build(motifs)
    ground = [p for p in plats if p["type"] == "ground"]
    last_ground = ground[-1]
    door_x = last_ground["x"] + last_ground["width"] - 2
    columns = ground_columns(plats)
    # The door and the spawn are the two places a child stands still, so nothing
    # else is allowed near either.
    reserved = [2, door_x]
    owl_x = spread(columns, [0.16, 0.62][:len(owl_ids)], keep_clear=reserved)
    enemy_x = spread(columns, [0.34, 0.5, 0.82], keep_clear=reserved + owl_x)
    return {
        "id": spec_id,
        "name": name,
        "theme": theme,
        "difficulty": difficulty,
        "music": music,
        "criticalPath": {"length": length, "motifs": motif_names},
        "platforms": plats,
        "spawns": {
            # Two rows clear of the floor, like every shipped level: the spawn
            # object is anchored by its top, so GROUND_Y - 1 buries the crow's
            # feet in the tile it is standing on.
            "player": {"x": 2, "y": GROUND_Y - 2},
            "npcs": [{"npc_id": npc, "x": gx, "y": GROUND_Y}
                     for npc, gx in zip(owl_ids, owl_x)],
            "collectibles": coins_over(plats),
        },
        # Spikes line the floor of the holes, which is what makes a gap a
        # decision rather than a formality -- the same placement the shipped
        # levels use.
        "hazards": [{"type": "spikes", "x": hx, "y": GROUND_Y + 3, "width": w, "height": 1}
                    for hx, w in holes],
        "enemies": [{"enemy_id": "cockroach_basic", "x": ex, "y": GROUND_Y - 1}
                    for ex in enemy_x],
        "exits": [{"x": door_x, "y": GROUND_Y, "target_level": target}],
        "mathGating": {"skills": skills, "difficultyBand": band, "teachingIntent": intent},
    }


LEVELS = [
    # A return to where it started, with the comfort content taken away: band 3
    # up means nothing on the easy end of the ladder is eligible any more.
    (level(
        "level_06", "Emberwood Deep", "emberwood", 3, "level_01_music",
        [('ground', 14), ('gap', 3), ('ground', 10), ('stair_up', 2), ('ground', 12),
         ('chasm', 6), ('ground', 8), ('hops', 3), ('ground', 14), ('gap', 3),
         ('ground', 16), ('summit', 2), ('ground', 12)],
        ["owl_teacher_01", "owl_tough_01"],
        ["addition", "subtraction"], [3, 5],
        "Back to the first wood, with the easy sums gone: addition and subtraction with no comfort rung to fall back on.",
        "level_07",
        "long", ["descent", "gap_jump", "staircase_up", "platform_hop", "narrow_ledge"],
    ), "level_06_emberwood_deep"),

    (level(
        "level_07", "Crystal Depths", "prism_hollow", 4, "level_02_music",
        [('ground', 12), ('stair_up', 3), ('ground', 10), ('chasm', 6), ('ground', 10),
         ('hops', 4), ('ground', 12), ('gap', 3), ('ledge', 5), ('ground', 14),
         ('summit', 3), ('ground', 12)],
        ["owl_teacher_01", "owl_tough_01"],
        ["multiplication", "addition"], [2, 5],
        "Equal groups underground: multiplication carried on the addition a child already trusts.",
        "level_08",
        "long", ["staircase_up", "gap_jump", "platform_hop", "narrow_ledge", "descent"],
    ), "level_07_crystal_depths"),

    (level(
        "level_08", "Meadow Heights", "sugarstorm", 5, "level_03_music",
        [('ground', 12), ('gap', 3), ('ground', 10), ('stair_up', 3), ('ground', 14),
         ('hops', 4), ('ground', 10), ('chasm', 6), ('ground', 12), ('ledge', 4),
         ('ground', 16), ('summit', 3), ('ground', 12)],
        ["owl_teacher_01", "owl_tough_01"],
        ["division", "multiplication", "subtraction"], [3, 5],
        "Sharing out, up high: division against the multiplication it undoes, with subtraction underneath.",
        "level_01",
        "long", ["gap_jump", "staircase_up", "platform_hop", "narrow_ledge", "descent"],
    ), "level_08_meadow_heights"),
]

if __name__ == '__main__':
    for spec, filename in LEVELS:
        path = ROOT / 'godot' / 'data' / 'levels' / 'specs' / f'{filename}.spec.json'
        io.open(path, 'w', encoding='utf-8').write(json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
        ground = sum(p["width"] for p in spec["platforms"] if p["type"] == "ground")
        print(f"wrote {filename}.spec.json  {len(spec['platforms'])} platforms, "
              f"{ground} ground tiles, door at x={spec['exits'][0]['x']}")
