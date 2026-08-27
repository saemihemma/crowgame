/**
 * Golden-value generator for player movement-feel parity.
 *
 * Implements the Arcade-style integration model mirrored by player_motion.gd
 * (gravity -> accel/drag -> maxSpeed clamp -> jump override -> variable-jump cut
 * -> terminal clamp) as a standalone reference, runs scripted input sequences,
 * and emits godot/tests/fixtures/motion_fixtures.json. player_motion.gd must
 * reproduce vx/vy and timers tick-for-tick (the in-engine collision feel is
 * validated visually via the Web build).
 *
 * Run: npx tsx tools/golden/gen_motion_fixtures.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const tuning = JSON.parse(readFileSync(resolve(__dirname, '../../godot/data/tuning/player_base.json'), 'utf8'));
const WORLD_GRAVITY = 800;
const DT = 1 / 60;

type State = { vx: number; vy: number; coyote_ms: number; jump_buffer_ms: number; is_jumping: boolean; x: number; y: number; speed_cap: number };
type Input = { left?: boolean; right?: boolean; jump_just_pressed?: boolean; jump_held?: boolean; on_floor?: boolean; sprint?: boolean };

function step(s: State, input: Input, dt: number): void {
  const dtMs = dt * 1000;
  const onFloor = !!input.on_floor;

  if (onFloor) s.coyote_ms = tuning.coyoteMs;
  s.coyote_ms -= dtMs;

  if (input.jump_just_pressed) s.jump_buffer_ms = tuning.jumpBufferMs;
  s.jump_buffer_ms -= dtMs;

  // Sprint: wind up above the walking cap, coast when released, skid on
  // reversal. Mirrors player_motion.gd's horizontal block tick for tick --
  // including the cap living in state, which is what keeps a plain walk
  // bit-identical to the pre-sprint model (see the comment there).
  const walkCap: number = tuning.maxSpeed;
  const runCap: number = tuning.sprintMaxSpeed ?? walkCap;
  const sprintAccel: number = tuning.sprintAccel ?? tuning.accel;
  const sprintDecel: number = tuning.sprintDecelPerSec ?? 0;
  const skidDecel: number = tuning.skidDecel ?? tuning.accel;

  let cap = s.speed_cap;
  if (cap < 0) cap = walkCap;
  if (input.sprint) cap = runCap;
  else if (sprintDecel > 0) cap = Math.max(walkCap, cap - sprintDecel * dt);
  else cap = walkCap;
  s.speed_cap = cap;

  // Continuous ramp, not a threshold at the walking cap -- see the long comment
  // in player_motion.gd. lerpf(a, b, t) is a + (b - a) * t; spelled out here so
  // the two ports are the same arithmetic in the same order.
  const blendPx: number = tuning.sprintBlendPx ?? 1;
  const over = Math.min(1, Math.max(0, (Math.abs(s.vx) - walkCap) / Math.max(1, blendPx)));
  const a: number = tuning.accel + (sprintAccel - tuning.accel) * over;

  const dir = input.left ? -1 : input.right ? 1 : 0;
  if (dir !== 0) {
    if (s.vx !== 0 && Math.sign(s.vx) !== dir) s.vx += dir * skidDecel * dt;
    else s.vx += dir * a * dt;
  } else {
    const d = (onFloor ? tuning.drag : tuning.drag * 0.4) * dt;
    if (s.vx - d > 0) s.vx -= d;
    else if (s.vx + d < 0) s.vx += d;
    else s.vx = 0;
  }
  if (Math.abs(s.vx) > cap) s.vx = Math.sign(s.vx) * cap;

  s.vy += WORLD_GRAVITY * tuning.gravityScale * dt;

  if (s.jump_buffer_ms > 0 && s.coyote_ms > 0) {
    s.vy = -tuning.jumpVelocity;
    s.jump_buffer_ms = 0;
    s.coyote_ms = 0;
    s.is_jumping = true;
  }
  if (s.is_jumping && !input.jump_held && s.vy < -100) {
    s.vy *= 0.5;
    s.is_jumping = false;
  }
  if (onFloor) s.is_jumping = false;

  s.vy = Math.max(-tuning.terminalVelocity, Math.min(tuning.terminalVelocity, s.vy));

  // Free-flight position integration (no collisions) for trajectory checks.
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

type Scenario = { name: string; ticks: Input[] };

// Helper to build repeated input runs.
const rep = (n: number, v: Input): Input[] => Array.from({ length: n }, () => ({ ...v }));

const scenarios: Scenario[] = [
  { name: 'run_right_to_max', ticks: rep(60, { right: true, on_floor: true }) },
  { name: 'accel_then_drag', ticks: [...rep(20, { right: true, on_floor: true }), ...rep(40, { on_floor: true })] },
  { name: 'full_jump_arc', ticks: [
    { jump_just_pressed: true, jump_held: true, on_floor: true },
    ...rep(45, { jump_held: true }),
    ...rep(20, { on_floor: true }),
  ]},
  { name: 'variable_short_hop', ticks: [
    { jump_just_pressed: true, jump_held: true, on_floor: true },
    ...rep(5, { jump_held: true }),
    ...rep(40, {}),       // release jump early -> ascent cut
    ...rep(10, { on_floor: true }),
  ]},
  { name: 'coyote_jump', ticks: [
    { on_floor: true },
    {},                              // just left ground (within coyote window)
    {},
    { jump_just_pressed: true, jump_held: true },  // jump in mid-air via coyote
    ...rep(30, { jump_held: true }),
  ]},
  { name: 'jump_buffer_then_land', ticks: [
    { jump_just_pressed: true, jump_held: true },   // pressed in air (buffered)
    {},
    { on_floor: true, jump_held: true },            // lands within buffer -> jumps
    ...rep(20, { jump_held: true }),
  ]},
  { name: 'run_left_air_drag', ticks: [
    ...rep(15, { left: true, on_floor: true }),
    ...rep(30, {}),    // airborne, reduced drag
  ]},

  // ── Sprint. Three behaviours, one scenario each, plus the skid that nothing
  // in this file covered even before sprint existed.
  { name: 'sprint_wind_up_to_run_cap', ticks: rep(90, { right: true, sprint: true, on_floor: true }) },
  { name: 'sprint_release_coasts_down', ticks: [
    ...rep(75, { right: true, sprint: true, on_floor: true }),  // reach the run cap
    ...rep(45, { right: true, on_floor: true }),                // still running, cap decays
  ]},
  { name: 'sprint_tap_fades', ticks: [
    ...rep(20, { right: true, on_floor: true }),
    ...rep(3, { right: true, sprint: true, on_floor: true }),   // a tap: a burst the decaying cap reclaims
    ...rep(25, { right: true, on_floor: true }),
  ]},
  { name: 'skid_turnaround_at_speed', ticks: [
    ...rep(75, { right: true, sprint: true, on_floor: true }),
    ...rep(30, { left: true, on_floor: true }),                 // press against motion
  ]},
  { name: 'sprint_jump_keeps_speed', ticks: [
    ...rep(75, { right: true, sprint: true, on_floor: true }),
    { right: true, sprint: true, jump_just_pressed: true, jump_held: true, on_floor: true },
    ...rep(50, { right: true, sprint: true, jump_held: true }), // airborne at run speed
  ]},
];

function run() {
  return scenarios.map(sc => {
    const s: State = { vx: 0, vy: 0, coyote_ms: 0, jump_buffer_ms: 0, is_jumping: false, x: 100, y: 100, speed_cap: -1 };
    const frames = sc.ticks.map(input => {
      step(s, input, DT);
      return { vx: s.vx, vy: s.vy, coyote_ms: s.coyote_ms, jump_buffer_ms: s.jump_buffer_ms, is_jumping: s.is_jumping, x: s.x, y: s.y };
    });
    return { name: sc.name, ticks: sc.ticks, frames };
  });
}

const out = { _comment: 'Generated by tools/golden/gen_motion_fixtures.ts. Do not edit.', dt: DT, scenarios: run() };
const outPath = resolve(__dirname, '../../godot/tests/fixtures/motion_fixtures.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath} (${out.scenarios.length} scenarios)`);
