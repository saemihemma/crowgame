extends RefCounted
class_name PlayerMotion
## Tier-1 movement-feel model — pure, deterministic, unit-testable.
##
## Replicates the Phaser Arcade integration of the retired original, so
## the crow feels identical: per-tick acceleration, linear drag (reduced in air),
## manual maxSpeed clamp, coyote time, jump buffer, variable jump height,
## world gravity + terminal-velocity cap. The CharacterBody2D node (player.gd)
## calls compute_velocity() each physics tick, then move_and_slide().
##
## Order mirrors Phaser's frame order (physics gravity runs before user code, so
## gravity is applied before the jump override): timers -> horizontal accel/drag
## + maxSpeed clamp -> gravity -> jump override -> variable-jump cut -> terminal
## clamp. Constants come from data/tuning/player_base.json (world gravity 800).

const WORLD_GRAVITY := 800.0

## state: { vx, vy, coyote_ms, jump_buffer_ms, is_jumping }  (mutated in place)
## input: { left, right, jump_just_pressed, jump_held, sprint }
## tuning: player_base.json dict (accel, drag, maxSpeed, jumpVelocity, coyoteMs,
##         jumpBufferMs, gravityScale, terminalVelocity)
static func compute_velocity(state: Dictionary, input: Dictionary, on_floor: bool, tuning: Dictionary, dt: float) -> void:
	var dt_ms := dt * 1000.0
	var accel := float(tuning.get("accel", 600.0))
	var drag := float(tuning.get("drag", 800.0))
	var max_speed := float(tuning.get("maxSpeed", 160.0))
	var jump_velocity := float(tuning.get("jumpVelocity", 475.0))
	var coyote_ms := float(tuning.get("coyoteMs", 80.0))
	var jump_buffer_ms := float(tuning.get("jumpBufferMs", 100.0))
	var gravity_scale := float(tuning.get("gravityScale", 1.0))
	var terminal := float(tuning.get("terminalVelocity", 500.0))

	# --- Coyote time ---
	if on_floor:
		state["coyote_ms"] = coyote_ms
	state["coyote_ms"] = float(state["coyote_ms"]) - dt_ms

	# --- Jump buffer ---
	if input.get("jump_just_pressed", false):
		state["jump_buffer_ms"] = jump_buffer_ms
	state["jump_buffer_ms"] = float(state["jump_buffer_ms"]) - dt_ms

	# --- Horizontal ---
	#
	# SPRINT, modelled on a platformer run button rather than a speed multiplier.
	# Three behaviours make it feel like one, and all three are load-bearing:
	#
	#   WINDING UP. Below the walking cap the crow accelerates at the usual
	#   `accel`, so ordinary walking is as responsive as it ever was. ABOVE it,
	#   while sprint is held, the climb switches to the much gentler
	#   `sprintAccel` -- so the top end is something you build toward over about
	#   three quarters of a second rather than something a tap gives you. A tap
	#   is worth nothing; a committed hold is worth a wider gap.
	#
	#   COASTING. Releasing sprint does not restore the walking cap instantly.
	#   The CAP itself decays, at `sprintDecelPerSec`, and the clamp follows it
	#   down -- so speed bleeds off over a few tenths of a second and the crow
	#   coasts. Snapping the cap is what made an earlier version of this read as
	#   flying into a wall the instant a thumb lifted.
	#
	#   SKIDDING. Pressing against your own motion decelerates at `skidDecel`,
	#   which is far harsher than `accel`, instead of merely accelerating the
	#   other way. Turning around at speed therefore costs a moment and reads as
	#   a skid, which is the thing that makes momentum feel like weight rather
	#   than like lag.
	#
	# WHY THE CAP LIVES IN STATE. Deceleration cannot be a rule about vx, because
	# "vx is above the walking cap" is also true for one tick of ordinary walking
	# acceleration, and bleeding that off gradually would change plain walking --
	# which is parity-locked against the golden motion fixtures. Carrying the cap
	# as state makes the two cases distinguishable: a fresh state starts at the
	# walking cap and stays there for any input without `sprint`, so the clamp is
	# bit-for-bit the hard clamp it always was, and test_motion_parity passes
	# untouched.
	var walk_cap := max_speed
	var run_cap := float(tuning.get("sprintMaxSpeed", max_speed))
	var sprint_accel := float(tuning.get("sprintAccel", accel))
	var sprint_decel := float(tuning.get("sprintDecelPerSec", 0.0))
	var skid_decel := float(tuning.get("skidDecel", accel))
	var blend_px := float(tuning.get("sprintBlendPx", 1.0))

	# -1 means "not yet set", which is what new_state() seeds. Reading a literal 0
	# as a cap would clamp the crow to a standstill on its first tick, so the
	# sentinel is checked rather than defaulted around.
	var cap := float(state.get("speed_cap", -1.0))
	if cap < 0.0:
		cap = walk_cap
	if input.get("sprint", false):
		cap = run_cap
	elif sprint_decel > 0.0:
		cap = maxf(walk_cap, cap - sprint_decel * dt)
	else:
		cap = walk_cap
	state["speed_cap"] = cap

	var vx := float(state["vx"])
	var dir := 0.0
	if input.get("left", false):
		dir = -1.0
	elif input.get("right", false):
		dir = 1.0

	# How hard the crow accelerates this tick.
	#
	# While sprinting the acceleration EASES OFF as the run cap approaches: quick
	# out of a standstill, slow over the last stretch, about a second to arrive at
	# top speed. That is the shape of a run button -- the ceiling is something you
	# build toward rather than something you switch on.
	#
	# A CONTINUOUS RAMP, and that part is not cosmetic. This was first written as
	# "accel below the walking cap, sprintAccel above it", which reads fine and is
	# numerically indefensible: walking acceleration lands EXACTLY on the walking
	# cap, so the branch was decided by the last bit of a float. The two ports then
	# disagreed the moment their dt differed by one bit -- and it does differ,
	# because Godot's JSON parser does not round-trip the 1/60 TypeScript wrote
	# (0.01666666666666665950 read back against 0.01666666666666666644 written).
	# test_motion_parity caught it as 170.0 against 162.333. A ramp has no edge for
	# a float to land either side of.
	# Measured from the WALKING cap, and applied whether or not sprint is held.
	#
	# Both halves of that matter. Measuring from the walking cap means `over` is
	# exactly 0 for every speed ordinary walking can reach, so `a` is exactly
	# `accel` and plain walking is bit-identical to the pre-sprint model -- which
	# is what keeps the seven original golden scenarios untouched.
	#
	# Applying it even when sprint is RELEASED is what stops a tap being worth a
	# run. The cap decays over 0.4s, and an earlier version only slowed the climb
	# while the key was down -- so a three-frame tap raised the cap to 265 and then
	# ordinary 600 acceleration chased it, arriving at 234px/s for almost no
	# commitment. Above the walking cap the climb is always slow, so the same tap
	# now ends at exactly 160.
	# The blend is over a NARROW band just above the walking cap
	# (`sprintBlendPx`), not across the whole 160-265 range. Spreading it over the
	# whole range left acceleration near 600 for the first stretch above the cap,
	# which is most of why a tap was worth so much: three frames of held sprint
	# climbed at full walking acceleration before the ramp had any effect.
	var over := clampf((absf(vx) - walk_cap) / maxf(1.0, blend_px), 0.0, 1.0)
	var a := lerpf(accel, sprint_accel, over)

	if dir != 0.0:
		if vx != 0.0 and signf(vx) != dir:
			# Skidding: pressing against your own motion.
			vx += dir * skid_decel * dt
		else:
			vx += dir * a * dt
	else:
		var d := (drag if on_floor else drag * 0.4) * dt
		if vx - d > 0.0:
			vx -= d
		elif vx + d < 0.0:
			vx += d
		else:
			vx = 0.0

	# Manual clamp to the CURRENT cap (Player.ts clamps |vx| > maxSpeed). With no
	# sprint in play `cap` is `maxSpeed` for every tick, so this is the original
	# clamp exactly; with sprint released it is the decaying cap that carries the
	# coast.
	if absf(vx) > cap:
		vx = signf(vx) * cap
	state["vx"] = vx

	# --- Gravity (applied before the jump override, matching Phaser order) ---
	var vy := float(state["vy"]) + (WORLD_GRAVITY * gravity_scale) * dt

	# --- Jump ---
	if float(state["jump_buffer_ms"]) > 0.0 and float(state["coyote_ms"]) > 0.0:
		vy = -jump_velocity
		state["jump_buffer_ms"] = 0.0
		state["coyote_ms"] = 0.0
		state["is_jumping"] = true

	# --- Variable jump height: release early -> cut ascent ---
	if bool(state["is_jumping"]) and not input.get("jump_held", false) and vy < -100.0:
		vy = vy * 0.5
		state["is_jumping"] = false

	if on_floor:
		state["is_jumping"] = false

	# Terminal velocity cap (Phaser maxVelocityY clamps both directions).
	vy = clampf(vy, -terminal, terminal)
	state["vy"] = vy

static func new_state() -> Dictionary:
	return {"vx": 0.0, "vy": 0.0, "coyote_ms": 0.0, "jump_buffer_ms": 0.0, "is_jumping": false,
		# -1 = uninitialised; compute_velocity seeds it to the walking cap.
		"speed_cap": -1.0}
