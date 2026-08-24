extends Node
## EventBus — Godot port of src/utils/EventBus.ts.
##
## The TS game uses one Phaser EventEmitter with string-named GameEvents for all
## cross-scene comms. Here that becomes a single autoload exposing Godot signals
## named after those events, so call sites translate mechanically:
##   EventBus.emit(GameEvents.COINS_CHANGED, n)  ->  EventBus.coins_changed.emit(n)
##   EventBus.on(GameEvents.COINS_CHANGED, cb)    ->  EventBus.coins_changed.connect(cb)

# Math system
signal math_challenge_start(payload: Dictionary)
signal math_problem_presented(problem: Dictionary)
signal math_answer_submitted(payload: Dictionary)
signal math_challenge_complete(payload: Dictionary)

# Player
signal player_died()
signal player_hurt()
signal lives_changed(lives: int)
signal ability_granted(payload: Dictionary)
signal ability_revoked(payload: Dictionary)

# Game state
signal coins_changed(coins: int)
signal stars_changed(stars: int)
signal owl_saved()
## How many owls this level holds, emitted on load so the HUD can segment the
## owl ring before the first rescue.
signal level_owls(count: int)
## Consecutive correct answers within the current level.
signal streak_changed(streak: int)
signal level_complete(payload: Dictionary)
signal save_game()

# XP / Leveling
signal xp_changed(payload: Dictionary)
signal level_up(payload: Dictionary)

# NPC
signal npc_interact(payload: Dictionary)
signal dialog_start(payload: Dictionary)
signal dialog_end(payload: Dictionary)
signal dialog_advance(payload: Dictionary)
