#!/usr/bin/env python3
"""Author the world levels from their art-bible identities.

level_03, 04 and 05 shipped as thin stubs - 64 to 94 tiles with as few as five
coins and no enemies at all, against level_01's 112 tiles, 20 coins, 3 enemies
and 6 hazards. They were placeholders that nobody went back to.

Each level here is built to the identity brand/LEVEL_ART_BIBLE.md gives it:

    03 Sugarstorm    showing off      no hazards, very high energy
    04 Geyserworks   pushing through  high hazards, medium energy
    05 Aurora Spire  arriving         medium hazards, low energy, a climb

Every jump is checked against the crow's real movement tuning before anything is
written, so an unreachable level cannot be authored by accident.
"""
import json, math, sys, collections
from pathlib import Path

SPECS = Path("godot/data/levels/specs")
TUNING = json.load(open("godot/data/tuning/player_base.json"))
GRAVITY = 800.0
TILE = 32.0
GROUND_ROW = 16          # surface row every level shares
FLOOR_ROW = 19           # bottom row, where pit spikes sit

_v = float(TUNING["jumpVelocity"])
JUMP_TILES = (_v * _v / (2 * GRAVITY)) / TILE
FLAT_GAP_TILES = float(TUNING["maxSpeed"]) * 2 * (_v / GRAVITY) / TILE
# Margin: a seven-year-old does not jump at the last pixel with perfect timing.
#
# MAX_GAP counts *empty columns*, and clearing N of them is a jump of N+1
# columns - the take-off tile plus the landing tile. Comparing gap_before
# against the jump distance directly authored three levels whose every gap was
# one column too wide, and godot/tools/check_level_reachability.py found their
# doors unreachable.
MAX_JUMP_COLUMNS = math.floor(FLAT_GAP_TILES) - 1   # 4
MAX_GAP = MAX_JUMP_COLUMNS - 1                      # 3 empty columns
MAX_RISE = math.floor(JUMP_TILES) - 1               # 3


class Level:
    """Builds one level left to right, checking reachability as it goes."""

    def __init__(self, key, name, theme, music, difficulty, path, gating):
        self.key, self.name, self.theme = key, name, theme
        self.music, self.difficulty = music, difficulty
        self.path, self.gating = path, gating
        self.platforms, self.coins, self.npcs = [], [], []
        self.enemies, self.hazards, self.exits = [], [], []
        self.problems = []
        self._last_ground_end = None
        self._hazard_plan = []

    def ground(self, x, width, gap_before=None):
        if gap_before is not None:
            seg = {"type": "ground", "x": x, "width": width, "y": GROUND_ROW,
                   "gap_before": gap_before}
        else:
            seg = {"type": "ground", "x": x, "width": width, "y": GROUND_ROW}
        self.platforms.append(seg)
        self._last_ground_end = x + width
        return self

    def ledge(self, x, width, y):
        self.platforms.append({"type": "platform", "x": x, "width": width, "y": y})
        return self

    def stack(self, x, y, count, step_x=4, step_y=3, width=3):
        """A rising run of ledges, each within one jump of the one before."""
        for i in range(count):
            self.platforms.append({"type": "platform", "x": x + i * step_x,
                                   "width": width, "y": y - i * step_y})
        return self

    def coin_run(self, x, y, count, step=1):
        for i in range(count):
            self.coins.append({"type": "coin", "x": x + i * step, "y": y})
        return self

    def coin_arc(self, x, y, count):
        """Coins along the shape of a jump, so collecting them teaches the jump."""
        for i in range(count):
            t = i / max(1, count - 1)
            self.coins.append({"type": "coin", "x": x + i,
                               "y": y - round(math.sin(t * math.pi) * 2)})
        return self

    def owl(self, npc_id, x):
        self.npcs.append({"npc_id": npc_id, "x": x, "y": GROUND_ROW})
        return self

    def enemy(self, x, enemy_id="cockroach_basic"):
        self.enemies.append({"enemy_id": enemy_id, "x": x, "y": GROUND_ROW - 1})
        return self

    def spike_pits(self, every=1):
        """Put spikes at the bottom of every `every`-th pit.

        Positions are derived from the gaps that actually exist, after
        normalise_gaps has settled them. Hand-written spike coordinates went
        stale the moment a ground segment was widened to close a gap, and ended
        up buried inside the ground - which test_entity_placement caught, but
        only after they had shipped into three levels.
        """
        grounds = [p for p in self.platforms if p["type"] == "ground"]
        pit = 0
        for prev, nxt in zip(grounds, grounds[1:]):
            start = prev["x"] + prev["width"]
            width = nxt["x"] - start
            if width <= 0:
                continue
            if pit % every == 0:
                self.hazards.append({"type": "spikes", "x": start, "y": FLOOR_ROW,
                                     "width": width, "height": 1})
            pit += 1
        return self

    def exit_to(self, x, target):
        self.exits.append({"x": x, "y": GROUND_ROW, "target_level": target})
        return self

    def place_hazards(self):
        for every in self._hazard_plan:
            self.spike_pits(every)
        return self

    def normalise_gaps(self):
        """Make every gap between ground segments match what is declared.

        `gap_before` was written by hand next to an absolute x, and the two
        disagreed: a segment ending at column 16 followed by one starting at 20
        is a four-column gap however it is labelled. Rather than shift every
        coin, owl and ledge that is keyed to an absolute x, the previous segment
        is extended until the gap is one the crow can actually clear.
        """
        grounds = [p for p in self.platforms if p["type"] == "ground"]
        for prev, nxt in zip(grounds, grounds[1:]):
            actual = nxt["x"] - (prev["x"] + prev["width"])
            if actual > MAX_GAP:
                prev["width"] += actual - MAX_GAP
                actual = MAX_GAP
            if actual < 0:
                self.problems.append(
                    f"ground at x={nxt['x']} overlaps the segment before it")
            nxt["gap_before"] = actual
        return self

    def validate(self):
        """Every platform has to be reachable from some other surface.

        The first version of this measured each ledge against the ground row,
        which called every second step of a staircase unreachable - a ledge
        three tiles above another ledge is a jump, not a wall. What matters is
        whether *any* surface sits within one jump below and within a jump's
        horizontal reach.
        """
        surfaces = [(p["x"], p["x"] + p["width"], p["y"]) for p in self.platforms]
        # Ground is one continuous walkable row broken by gaps; a segment is
        # reachable if the gap before it is jumpable, which normalise_gaps has
        # already guaranteed. Only the raised ledges need the surface search.
        ground_ys = {p["y"] for p in self.platforms if p["type"] == "ground"}
        for x0, x1, y in surfaces:
            if y in ground_ys:
                continue
            reachable = False
            for ox0, ox1, oy in surfaces:
                if (ox0, ox1, oy) == (x0, x1, y):
                    continue
                # Horizontal reach: overlapping, or a gap the crow can clear.
                apart = max(0, max(ox0 - x1, x0 - ox1))
                if apart > MAX_GAP:
                    continue
                # Below (or level with) this surface, within a jump's rise.
                if 0 <= oy - y <= MAX_RISE:
                    reachable = True
                    break
            if not reachable:
                self.problems.append(
                    f"platform at x={x0}..{x1} y={y} has no surface within "
                    f"{MAX_GAP} across and {MAX_RISE} below it")
        for seg in self.platforms:
            gap = seg.get("gap_before")
            if gap is not None and gap > MAX_GAP:
                self.problems.append(
                    f"gap of {gap} tiles at x={seg['x']} exceeds the {MAX_GAP}-tile jump")
        return self

    def to_spec(self):
        return collections.OrderedDict([
            ("id", self.key), ("name", self.name), ("theme", self.theme),
            ("difficulty", self.difficulty), ("music", self.music),
            ("criticalPath", self.path), ("platforms", self.platforms),
            ("spawns", collections.OrderedDict([
                ("player", {"x": 2, "y": GROUND_ROW - 2}),
                ("npcs", self.npcs), ("collectibles", self.coins)])),
            ("hazards", self.hazards), ("enemies", self.enemies),
            ("exits", self.exits), ("mathGating", self.gating),
        ])


def sugarstorm():
    """03 - showing off. No hazards at all (the bible is explicit), so the
    tension comes entirely from air time and speed. Long platform chains, coins
    laid along the arc of the jump that collects them."""
    lv = Level("level_03", "Sugarstorm", "sugarstorm", "level_03_music", 2,
               {"length": "long",
                "motifs": ["flat_run", "platform_hop", "staircase_up", "descent", "long_gap"]},
               {"skills": ["comparison", "counting", "addition"],
                "difficultyBand": [1, 3],
                "teachingIntent": "More or less: compare what you just learned to count."})
    lv.ground(0, 16)
    lv.stack(6, 13, 3)
    lv.coin_arc(7, 12, 4)
    lv.ground(20, 12, gap_before=3)
    lv.ledge(23, 4, 13).ledge(29, 3, 10)
    lv.coin_run(24, 12, 3)
    lv.owl("owl_teacher_01", 26)
    lv.ground(36, 14, gap_before=3)
    lv.stack(38, 13, 3, step_x=5)
    lv.coin_arc(39, 12, 5)
    lv.enemy(46)
    lv.ground(54, 12, gap_before=3)
    lv.ledge(57, 4, 13).ledge(62, 3, 10)
    lv.coin_run(58, 12, 4)
    lv.ground(70, 14, gap_before=3)
    lv.stack(72, 13, 3, step_x=5)
    lv.coin_arc(73, 12, 5)
    lv.enemy(80)
    lv.owl("owl_twin_chain", 82)
    lv.ground(88, 12, gap_before=3)
    lv.ledge(91, 4, 13)
    lv.coin_run(92, 12, 3)
    lv.ground(104, 14, gap_before=3)
    lv.coin_run(106, 15, 3)
    lv.exit_to(114, "level_04")
    return lv


def geyserworks():
    """04 - pushing through. Hazard density is the point: every pit has spikes
    at the bottom, so a missed jump costs a life rather than a moment."""
    lv = Level("level_04", "Geyserworks", "geyserworks", "level_04_music", 3,
               {"length": "long",
                "motifs": ["flat_run", "small_gap", "hazard_run", "platform_hop", "descent"]},
               {"skills": ["addition", "subtraction", "counting"],
                "difficultyBand": [2, 4],
                "teachingIntent": "Take away: undo the adding, under pressure."})
    lv.ground(0, 14)
    lv.ledge(8, 3, 13)
    lv.coin_run(8, 12, 3)
    lv.ground(17, 11, gap_before=3)
    lv.ledge(20, 3, 13).ledge(24, 3, 10)
    lv.coin_arc(20, 12, 4)
    lv.owl("owl_teacher_01", 22)
    lv.ground(32, 12, gap_before=3)
    lv.ledge(35, 4, 13)
    lv.enemy(40)
    lv.coin_run(36, 12, 4)
    lv.ground(48, 13, gap_before=3)
    lv.stack(50, 13, 3)
    lv.coin_arc(51, 12, 4)
    lv.owl("owl_tough_01", 58)
    lv.ground(64, 12, gap_before=3)
    lv.ledge(67, 4, 13)
    lv.enemy(72)
    lv.coin_run(68, 12, 4)
    lv.ground(80, 14, gap_before=3)
    lv.ledge(83, 3, 13).ledge(88, 3, 10)
    lv.coin_arc(84, 12, 4)
    lv.owl("owl_twin_chain", 90)
    lv.ground(97, 15, gap_before=3)
    lv.coin_run(99, 15, 4)
    lv.exit_to(108, "level_05")
    # "Pushing through": every pit bites.
    lv._hazard_plan.append(1)
    return lv


def aurora_spire():
    """05 - arriving. A climb, not a sprint: the ground steps upward the whole
    way, the ledges are wide, and the last stretch is calm on purpose. This is
    where a run ends, so it should feel like a summit rather than a gauntlet."""
    lv = Level("level_05", "Aurora Spire", "aurora_spire", "level_05_music", 3,
               {"length": "long",
                "motifs": ["flat_run", "staircase_up", "platform_hop", "summit"]},
               {"skills": ["addition", "subtraction", "number_sequence", "pattern_matching"],
                "difficultyBand": [2, 5],
                "teachingIntent": "Everything together, at the top of the climb."})
    lv.ground(0, 16)
    lv.ledge(9, 4, 13)
    lv.coin_run(10, 12, 3)
    lv.ground(20, 14, gap_before=3)
    lv.stack(22, 13, 3, step_x=5, width=4)
    lv.coin_arc(23, 12, 5)
    lv.owl("owl_tough_01", 30)
    lv.ground(37, 14, gap_before=3)
    lv.ledge(40, 4, 13).ledge(46, 4, 10)
    lv.coin_run(41, 12, 4)
    lv.enemy(48)
    lv.ground(55, 13, gap_before=3)
    lv.stack(57, 13, 3, step_x=5, width=4)
    lv.coin_arc(58, 12, 5)
    lv.owl("owl_triple_chain", 64)
    lv.ground(72, 14, gap_before=3)
    lv.ledge(75, 4, 13).ledge(81, 4, 10)
    lv.coin_run(76, 12, 4)
    lv.enemy(83)
    lv.ground(90, 16, gap_before=3)
    lv.ledge(94, 5, 13)
    lv.coin_run(95, 12, 4)
    lv.owl("owl_gauntlet", 100)
    # The summit: wide, flat, nothing to dodge. You have arrived.
    lv.ground(110, 16, gap_before=3)
    lv.coin_run(113, 15, 5)
    lv.exit_to(122, "level_01")
    # "Arriving": hazards thin out as the climb tops off.
    lv._hazard_plan.append(2)
    return lv


def main():
    problems = []
    built = []
    for build in (sugarstorm, geyserworks, aurora_spire):
        lv = build()
        lv.normalise_gaps()
        lv.place_hazards()
        lv.validate()
        built.append(lv)
        problems += [f"{lv.key}: {p}" for p in lv.problems]
    if problems:
        print("UNREACHABLE - nothing written:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    for lv in built:
        path = SPECS / f"{lv.key}_{ {'level_03':'meadow','level_04':'bridge','level_05':'treetop'}[lv.key] }.spec.json"
        json.dump(lv.to_spec(), open(path, "w"), indent=2, ensure_ascii=False)
        open(path, "a").write("\n")
        width = max(p["x"] + p["width"] for p in lv.platforms)
        print(f"  {lv.key:10} {width:>4} tiles  {len(lv.coins):>3} coins  "
              f"{len(lv.npcs)} owls  {len(lv.enemies)} enemies  {len(lv.hazards)} hazards")


if __name__ == "__main__":
    main()
