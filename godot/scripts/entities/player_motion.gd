extends RefCounted
class_name PlayerMotion
## Tier-1 movement-feel model — pure, deterministic, unit-testable.
##
## Replicates the Phaser Arcade integration used by src/entities/Player.ts so
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
## input: { left, right, jump_just_pressed, jump_held }
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
	# Manual maxSpeed clamp (Player.ts clamps |vx| > maxSpeed).
	if absf(vx) > max_speed:
		vx = signf(vx) * max_speed
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
