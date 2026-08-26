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

	# --- Horizontal: acceleration while pressing, else linear drag toward 0 ---
	var vx := float(state["vx"])
	if input.get("left", false):
		vx += -accel * dt
	elif input.get("right", false):
		vx += accel * dt
	else:
		var d := (drag if on_floor else drag * 0.4) * dt
		if vx - d > 0.0:
			vx -= d
		elif vx + d < 0.0:
			vx += d
		else:
			vx = 0.0
	# SPRINT: hold to raise the ceiling, not the acceleration.
	#
	# A gap-width dial rather than a speed toy, and that is the whole reason it
	# exists. Jump reach is airtime x horizontal speed, and airtime is fixed by
	# jumpVelocity and gravity -- so at 160px/s a jump crosses 5.9 tiles and every
	# jumpable gap in the shipped game is three. Raising the ceiling is the only
	# lever that makes a genuinely wide gap crossable, which is what a playtester
	# asked for: "hold down a button ... that is making me accelerate".
	#
	# The CEILING, not `accel`: raising acceleration would make the crow twitchier
	# to place on a one-tile pad, which is the other half of the platforming this
	# is meant to serve. Reaching the higher ceiling still takes the same 600/s^2,
	# so a tap does nothing and a hold pays off -- the feel is "winding up".
	#
	# Absent `sprint` means no sprint, which keeps this invisible to the golden
	# motion fixtures: they pass an input dict without the key, take this branch's
	# false path, and compute exactly what they computed before.
	var ceiling := max_speed
	if input.get("sprint", false):
		ceiling = float(tuning.get("sprintMaxSpeed", max_speed))

	# Manual maxSpeed clamp (Player.ts clamps |vx| > maxSpeed).
	#
	# Clamping DOWN toward the walking ceiling when sprint is released, rather
	# than snapping, is what stops a released sprint reading as hitting a wall in
	# mid-air. sprintDecayPerSec is px/s of ceiling given back per second.
	if absf(vx) > ceiling:
		var decay := float(tuning.get("sprintDecayPerSec", 0.0)) * dt
		if decay > 0.0 and not on_floor:
			vx = signf(vx) * maxf(ceiling, absf(vx) - decay)
		else:
			vx = signf(vx) * ceiling
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
	return {"vx": 0.0, "vy": 0.0, "coyote_ms": 0.0, "jump_buffer_ms": 0.0, "is_jumping": false}
