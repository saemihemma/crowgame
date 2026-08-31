/**
 * Build the act specs from a hand-written RHYTHM.
 *
 * WHY A BUILDER AND NOT FIFTEEN HAND-WRITTEN FILES. The levels this replaces
 * were hand-authored tile by tile, and the result is the defect it is fixing: a
 * playtester said "are all levels the same? level 1 and 2 feel very similar just
 * different texture", and the data agreed -- every level was 112-156 tiles, every
 * one was tagged `length: long`, and every single one listed `platform_hop` and
 * `staircase_up`. Writing fifteen more by hand would produce fifteen more of the
 * same, because the tile arithmetic is where the attention goes and the rhythm is
 * where it should be.
 *
 * So the ACTS below are the authored thing: an ordered list of motifs per act,
 * short enough to read in one screenful and to argue with. This file turns those
 * into ground runs, ledges, ladders, hazards and spawns, and it is the tile
 * arithmetic that is mechanical -- not the design.
 *
 * WHAT IS GUARANTEED BY CONSTRUCTION, so the guards never have to catch it:
 *   - no gap is wider than the walk envelope (4 tiles) unless the act asks for a
 *     sprint gap, and only zones at or past sprint_gaps_from may ask;
 *   - every owl stands on ground with floor either side (test_entity_placement);
 *   - nothing is placed underground;
 *   - a one-tile hole is a REAL hole now that the crow is 24px wide, so `hole(1)`
 *     means it;
 *   - a ladder always ends BESIDE a ledge, never under one -- a ladder whose top
 *     tile is inside the platform above stops the climb dead, which the climb
 *     probe found the hard way.
 *
 * Run: node tools/author_acts.mjs [--write]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = resolve(ROOT, 'godot/data/levels/specs');
const WRITE = process.argv.includes('--write');

/** The world is 20 tiles tall and the floor is row 16, as every level here is. */
const GROUND_Y = 16;
const HEIGHT = 20;

/**
 * THE ZONES. Five themes, three acts each, in the order a child meets them.
 *
 * One new verb per zone, and the three acts are Sonic's shape: Act 1 introduces
 * the verb somewhere safe, Act 2 complicates it, Act 3 tests it and holds the
 * bonus owl. Acts get longer within a zone and zones get longer overall, so the
 * rhythm is short-short-longer rather than one flat fifteen-level slog.
 */
const ZONES = [
    {
        theme: 'emberwood', music: 'forest_theme', name: 'Emberwood',
        verb: 'walk and hop, and a hole that is really a hole',
        gating: ['counting', 'addition'], band: 2,
        intent: 'First numbers: count what you see, then add small amounts.',
    },
    {
        theme: 'prism_hollow', music: 'cave_theme', name: 'Prism Hollow',
        verb: 'the ladder: going up on purpose, and choosing when to drop',
        gating: ['subtraction', 'addition'], band: 3,
        intent: 'Taking away: what is left when some of it goes.',
    },
    {
        theme: 'sugarstorm', music: 'forest_theme', name: 'Sugarstorm',
        verb: 'the enemy: timing a patrol, or shooting it',
        gating: ['comparison', 'counting', 'addition'], band: 4,
        intent: 'More, fewer, the same: comparing amounts you can see.',
    },
    {
        theme: 'geyserworks', music: 'cave_theme', name: 'Geyserworks',
        verb: 'the hazard: floors that hurt, and something that spits',
        gating: ['addition', 'subtraction', 'number_sequence'], band: 5,
        intent: 'Adding and taking away past ten, and what comes next in a run.',
    },
    {
        theme: 'aurora_spire', music: 'forest_theme', name: 'Aurora Spire',
        verb: 'the climb: height, the run, and everything at once',
        gating: ['multiplication', 'division', 'subtraction'], band: 5,
        intent: 'Groups: many of the same, and sharing them out.',
    },
];

/**
 * The rhythm of each act, as motifs.
 *
 * Read one row aloud and you have described the level. `flat` is ground, `hole`
 * is a gap in it, `ledge` is a floating platform, `ladder` climbs to one, `up`
 * and `down` are staircases, `spikes` hurt, `bug` and `spitter` are enemies, and
 * `owl` is a maths encounter. Coins and big coins are placed by the builder
 * around whatever is there, because a coin's job is to point at the interesting
 * bit and the builder knows where that is.
 */
const ACTS = [
    // ── Emberwood: hop, and meet a hole ──────────────────────────────────
    [   // Act 1 -- flat, safe, one hole to notice
        ['flat', 10], ['owl', 'owl_gentle_01'], ['flat', 4], ['hole', 1], ['flat', 6],
        ['ledge', 3, 3], ['flat', 5], ['hole', 2], ['flat', 8], ['owl', 'owl_teacher_01'],
        ['flat', 6], ['ledge', 3, 4], ['flat', 8],
    ],
    [   // Act 2 -- holes in a row, and the first thing worth climbing to
        ['flat', 8], ['hole', 1], ['flat', 3], ['hole', 1], ['flat', 3], ['hole', 1],
        ['flat', 8], ['owl', 'owl_gentle_01'], ['flat', 5], ['ledge', 3, 3], ['gapledge', 3, 3],
        ['flat', 7], ['hole', 2], ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 6],
        ['up', 3], ['flat', 6],
    ],
    [   // Act 3 -- the test, and the bonus owl above it
        ['flat', 7], ['hole', 1], ['flat', 4], ['ledge', 3, 3], ['gapledge', 3, 2],
        ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 5], ['hole', 2], ['flat', 4],
        ['hole', 1], ['flat', 7], ['owl', 'owl_tough_01'], ['flat', 6], ['up', 3],
        ['flat', 4], ['down', 3], ['flat', 6], ['owl', 'owl_gentle_01'], ['flat', 8],
            ],

    // ── Prism Hollow: the ladder ─────────────────────────────────────────
    [   // Act 1 -- a ladder is introduced with nothing else going on
        ['flat', 9], ['owl', 'owl_gentle_01'], ['flat', 6], ['ladder', 3, 4], ['flat', 7],
        ['hole', 1], ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 5], ['ladder', 3, 3],
        ['flat', 8],
    ],
    [   // Act 2 -- climb, then drop off the end of what you climbed
        ['flat', 7], ['ladder', 4, 4], ['flat', 5], ['hole', 2], ['flat', 6],
        ['owl', 'owl_teacher_01'], ['flat', 5], ['ladder', 3, 3], ['gapledge', 3, 3],
        ['flat', 7], ['hole', 1], ['flat', 5], ['owl', 'owl_tough_01'], ['flat', 6],
        ['ladder', 4, 3], ['flat', 7],
    ],
    [   // Act 3 -- ladders and holes together, and the bonus owl up top
        ['flat', 6], ['ladder', 3, 3], ['gapledge', 3, 3], ['flat', 6], ['hole', 2],
        ['flat', 5], ['owl', 'owl_teacher_01'], ['flat', 6], ['ladder', 5, 4],
        ['flat', 6], ['hole', 1], ['flat', 4], ['hole', 1], ['flat', 6],
        ['owl', 'owl_tough_01'], ['flat', 5], ['ladder', 4, 3], ['flat', 6],
        ['owl', 'owl_gentle_01'], ['flat', 7],     ],

    // ── Sugarstorm: the enemy ────────────────────────────────────────────
    [   // Act 1 -- one bug, on open flat ground, nowhere to fall
        ['flat', 10], ['owl', 'owl_gentle_01'], ['flat', 6], ['bug'], ['flat', 8],
        ['ledge', 3, 3], ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 6], ['bug'],
        ['flat', 8],
    ],
    [   // Act 2 -- bugs beside holes, so timing costs something
        ['flat', 8], ['bug'], ['flat', 4], ['hole', 1], ['flat', 6],
        ['owl', 'owl_teacher_01'], ['flat', 5], ['bug'], ['flat', 4], ['hole', 2],
        ['flat', 6], ['ladder', 3, 3], ['flat', 6], ['owl', 'owl_tough_01'],
        ['flat', 5], ['bug'], ['flat', 7],
    ],
    [   // Act 3 -- a corridor of them
        ['flat', 7], ['bug'], ['flat', 4], ['bug'], ['flat', 5], ['hole', 1],
        ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 5], ['ledge', 3, 3],
        ['gapledge', 3, 3], ['flat', 6], ['bug'], ['flat', 5], ['hole', 2],
        ['flat', 6], ['owl', 'owl_tough_01'], ['flat', 6], ['bug'], ['flat', 5],
        ['owl', 'owl_gentle_01'], ['flat', 7],     ],

    // ── Geyserworks: the hazard ──────────────────────────────────────────
    [   // Act 1 -- spikes you step over, with room to see them coming
        ['flat', 10], ['owl', 'owl_gentle_01'], ['flat', 6], ['spikes', 2], ['flat', 7],
        ['ledge', 3, 3], ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 5],
        ['spikes', 2], ['flat', 8],
    ],
    [   // Act 2 -- spikes under the ledges you land on
        ['flat', 8], ['spikes', 2], ['flat', 5], ['ledge', 3, 3], ['gapledge', 3, 3],
        ['flat', 6], ['owl', 'owl_teacher_01'], ['flat', 5], ['spikes', 3], ['flat', 6],
        ['ladder', 3, 3], ['flat', 6], ['owl', 'owl_tough_01'], ['flat', 5],
        ['spikes', 2], ['flat', 7],
    ],
    [   // Act 3 -- the thing that shoots back
        ['flat', 7], ['spikes', 2], ['flat', 5], ['spitter'], ['flat', 6],
        ['owl', 'owl_teacher_01'], ['flat', 5], ['spikes', 3], ['flat', 5],
        ['ledge', 3, 3], ['gapledge', 3, 3], ['flat', 6], ['spitter'], ['flat', 5],
        ['owl', 'owl_tough_01'], ['flat', 6], ['bug'], ['flat', 5],
        ['owl', 'owl_gentle_01'], ['flat', 7],     ],

    // ── Aurora Spire: the climb ──────────────────────────────────────────
    [   // Act 1 -- height, with a ladder up every time
        ['flat', 9], ['owl', 'owl_gentle_01'], ['flat', 5], ['ladder', 4, 4],
        ['flat', 6], ['up', 3], ['flat', 5], ['owl', 'owl_teacher_01'], ['flat', 5],
        ['ladder', 4, 3], ['flat', 8],
    ],
    [   // Act 2 -- climb, cross, drop, repeat
        ['flat', 7], ['ladder', 4, 3], ['gapledge', 4, 3], ['flat', 6], ['hole', 2],
        ['flat', 5], ['owl', 'owl_teacher_01'], ['flat', 5], ['up', 3], ['flat', 4],
        ['down', 3], ['flat', 5], ['bug'], ['flat', 5], ['owl', 'owl_tough_01'],
        ['flat', 5], ['ladder', 5, 3], ['flat', 7],
    ],
    [   // Act 3 -- everything, and the longest run in the game
        ['flat', 7], ['ladder', 4, 3], ['gapledge', 4, 3], ['flat', 5], ['spikes', 2],
        ['flat', 5], ['owl', 'owl_teacher_01'], ['flat', 5], ['hole', 2], ['flat', 4],
        ['bug'], ['flat', 5], ['ladder', 5, 4], ['flat', 6], ['spitter'], ['flat', 5],
        ['owl', 'owl_tough_01'], ['flat', 5], ['up', 3], ['flat', 4], ['down', 3],
        ['flat', 5], ['hole', 1], ['flat', 5], ['owl', 'owl_gentle_01'], ['flat', 7],
            ],
];

/** Lay one act out, left to right. */
function build(act, zone, actIndex, key) {
    const platforms = [];
    const npcs = [];
    const collectibles = [];
    const hazards = [];
    const enemies = [];
    const ladders = [];
    let x = 0;
    let run = null;               // the ground run being extended
    let bigCoins = 0;

    const ground = (width) => {
        if (run && run.x + run.width === x) { run.width += width; }
        else { run = { type: 'ground', x, width, y: GROUND_Y }; platforms.push(run); }
        x += width;
    };
    const gap = (width) => { x += width; run = null; };

    for (const motif of act) {
        const [kind, a, b] = motif;
        switch (kind) {
            case 'flat':
                ground(a);
                break;
            case 'hole':
                // A real hole, now that the crow is narrower than a tile.
                gap(a);
                break;
            case 'ledge':
                // A platform above the ground you are already standing on.
                platforms.push({ type: 'platform', x: x - 1, width: b, y: GROUND_Y - a });
                collectibles.push({ type: 'coin', x: x, y: GROUND_Y - a - 1 });
                break;
            case 'gapledge': {
                // A second ledge one jump on from the last, with air beneath: the
                // hop that means something.
                platforms.push({ type: 'platform', x: x + 3, width: b, y: GROUND_Y - a });
                collectibles.push({ type: 'coin', x: x + 4, y: GROUND_Y - a - 1 });
                break;
            }
            case 'ladder': {
                // Rungs from the ground up to a ledge that sits BESIDE the top of
                // them, never over them. A ladder capped by a platform stops the
                // climb dead against the platform's underside.
                const top = GROUND_Y - a;
                ladders.push({ x, y: top, tiles: a });
                platforms.push({ type: 'platform', x: x + 1, width: b, y: top });
                collectibles.push({ type: 'coin', x: x + 2, y: top - 1 });
                ground(1);
                break;
            }
            case 'up':
                for (let i = 0; i < a; i += 1) {
                    platforms.push({ type: 'platform', x: x + i * 2, width: 2, y: GROUND_Y - 1 - i * 2 });
                }
                break;
            case 'down':
                for (let i = 0; i < a; i += 1) {
                    platforms.push({ type: 'platform', x: x + i * 2, width: 2, y: GROUND_Y - (a - i) * 2 });
                }
                break;
            case 'spikes':
                hazards.push({ type: 'spikes', x, y: GROUND_Y - 1, width: a, height: 1 });
                ground(a);
                break;
            case 'bug':
                enemies.push({ enemy_id: 'cockroach_basic', x, y: GROUND_Y - 1 });
                ground(2);
                break;
            case 'spitter':
                enemies.push({ enemy_id: 'spitter_beetle', x, y: GROUND_Y - 1 });
                ground(2);
                break;
            case 'owl':
                // TWO tiles of floor either side, which is what
                // test_entity_placement asks for: an owl on the lip of a drop is
                // an owl a child knocks themselves off reaching.
                ground(2);
                npcs.push({ npc_id: a, x, y: GROUND_Y });
                ground(3);
                if (bigCoins < 3) {
                    bigCoins += 1;
                    collectibles.push({ type: 'big_coin', x: x + 1, y: GROUND_Y - 2, id: `c${bigCoins}` });
                }
                break;
            default:
                throw new Error(`unknown motif ${kind} in ${key}`);
        }
    }

    // EVERY ACT ENDS WITH A PERCH, and it is appended here rather than written
    // into each row above. test_owl_gate requires every story level to hold an
    // owl that cannot be reached without a better crow, and a rule that has to be
    // remembered fifteen times is a rule that will be forgotten once.
    // SIX wide, not four. An owl wants floor two tiles either side of it
    // (test_entity_placement), so a four-wide perch cannot hold one anywhere:
    // stand it in the middle and the right-hand side is one tile short.
    platforms.push({ type: 'platform', x: x + 1, width: 6, y: GROUND_Y - 12 });
    ground(8);

    // The bonus owl goes on the tower, gated on an ability, and never counts
    // toward the door.
    const tower = platforms.filter(p => p.y <= GROUND_Y - 12).pop();
    if (tower) {
        // Two tiles in from the left edge: the perch is 4 wide, and
        // test_entity_placement wants floor two tiles either side of an owl --
        // an owl on the lip of a drop is one a child knocks off.
        npcs.push({ npc_id: 'owl_gauntlet', x: tower.x + 2, y: tower.y, bonus: true, requiresAbility: 'double_jump' });
    }
    // A scatter of ordinary coins along the run, so the floor is not empty --
    // but never INSIDE anything. Placed blind, some of these landed in the middle
    // of a staircase step, and test_entity_placement caught every one: "has solid
    // ground above its feet - it is inside the level".
    const occupied = new Set();
    for (const p of platforms) {
        for (let px = p.x; px < p.x + p.width; px += 1) occupied.add(`${px},${p.y}`);
    }
    // The row ABOVE counts too. A coin is anchored at its centre, so one placed
    // at row 14 spans rows 13 and 14 -- and test_entity_placement probes 6px
    // above the origin, which lands in row 13. Checking only the coin's own row
    // let a coin sit half inside the step above it.
    const clear = (cx, cy) => !occupied.has(`${cx},${cy - 1}`)
        && !occupied.has(`${cx},${cy}`) && !occupied.has(`${cx},${cy + 1}`);
    // AND NOT ON TOP OF ANOTHER COIN. `clear` only knows about platforms, so a
    // big coin dropped at an even share of the run landed squarely on a scatter
    // coin -- two coins drawn over each other, which a child reads as one coin
    // with a smudge, and which costs them a collectible they can see and cannot
    // take twice. Photographed in act one by the screen tour.
    //
    // Two columns, not one: a big coin is drawn wider than its tile, so two
    // coins in adjacent columns still touch.
    const COIN_GAP = 2;
    const spaced = (cx, cy) => collectibles.every(
        c => Math.abs(c.x - cx) >= COIN_GAP || Math.abs(c.y - cy) >= COIN_GAP);
    const free = (cx, cy) => clear(cx, cy) && spaced(cx, cy);
    for (let cx = 6; cx < x - 8; cx += 9) {
        if (free(cx, GROUND_Y - 2)) collectibles.push({ type: 'coin', x: cx, y: GROUND_Y - 2 });
    }
    // Any big coins the owls did not place (a short act) go on the ground, in
    // the first clear column at or after an even share of the run.
    while (bigCoins < 3) {
        bigCoins += 1;
        let bx = Math.floor(x * bigCoins / 4);
        while (bx < x - 8 && !free(bx, GROUND_Y - 2)) bx += 1;
        collectibles.push({ type: 'big_coin', x: bx, y: GROUND_Y - 2, id: `c${bigCoins}` });
    }
    // And every coin the motifs placed, re-checked the same way -- including
    // against each other, since two motifs in a row can each place one at their
    // own edge. The big coins are the three a level is SCORED on, so where a
    // pair has to go, the ordinary coin is the one that goes.
    for (let i = collectibles.length - 1; i >= 0; i -= 1) {
        const c = collectibles[i];
        const others = collectibles.filter((_, j) => j !== i);
        const collides = others.some(o => Math.abs(o.x - c.x) < COIN_GAP
            && Math.abs(o.y - c.y) < COIN_GAP
            && (o.type === 'big_coin' || c.type !== 'big_coin'));
        if (!clear(c.x, c.y) || collides) collectibles.splice(i, 1);
    }

    ground(4);                                     // landing ground for the door
    const width = x + 4;
    return {
        id: key,
        name: `${zone.name} ${['I', 'II', 'III'][actIndex]}`,
        theme: zone.theme,
        difficulty: 1,
        music: zone.music,
        criticalPath: {
            length: ['short', 'short', 'medium'][actIndex],
            motifs: [...new Set(act.map(m => m[0]))],
        },
        platforms,
        spawns: {
            player: { x: 2, y: GROUND_Y - 2 },
            npcs,
            collectibles,
        },
        hazards,
        enemies,
        ladders,
        exits: [{ x: width - 6, y: GROUND_Y, target_level: null }],
        // teachingIntent is required by the spec schema, and it belongs here rather
        // than only in the registry: it is what this zone is FOR, in a sentence,
        // and a level whose gating nobody can explain is a level nobody tuned.
        mathGating: {
            skills: zone.gating,
            difficultyBand: [1, zone.band],
            teachingIntent: zone.intent,
        },
        width,
    };
}

const specs = [];
let n = 0;
for (let z = 0; z < ZONES.length; z += 1) {
    for (let a = 0; a < 3; a += 1) {
        n += 1;
        const key = `level_${String(n).padStart(2, '0')}`;
        const spec = build(ACTS[z * 3 + a], ZONES[z], a, key);
        spec.difficulty = Math.min(5, z + 1);
        specs.push({ key, zone: ZONES[z], act: a, spec, file: `${key}_${ZONES[z].theme}_act${a + 1}.spec.json` });
    }
}
// Each act's door points at the next; the last one finishes the game.
for (let i = 0; i < specs.length; i += 1) {
    specs[i].spec.exits[0].target_level = i + 1 < specs.length ? specs[i + 1].key : '__complete__';
}

for (const s of specs) {
    const { width, ...spec } = s.spec;
    const line = `${s.key} ${s.spec.name.padEnd(18)} ${String(width).padStart(4)} tiles  `
        + `${s.spec.spawns.npcs.length} owls  ${s.spec.enemies.length} enemies  ${s.spec.ladders.length} ladders`;
    console.log(line);
    if (WRITE) {
        mkdirSync(SPECS, { recursive: true });
        writeFileSync(resolve(SPECS, s.file), `${JSON.stringify(spec, null, 2)}\n`);
    }
}
if (WRITE) console.log(`\nWrote ${specs.length} act specs to ${SPECS}`);
else console.log('\n(dry run -- pass --write to emit the spec files)');
