extends Node
## EventBus — the one signal hub every subsystem publishes through.
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
signal curriculum_step_up(payload: Dictionary)
signal math_comeback(payload: Dictionary)

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
## Big coins found in THIS RUN, and how many the level holds. Separate from what
## is banked on purpose: the run's count is what the HUD shows while the child is
## playing, and it only becomes a record if they reach the door.
signal big_coins_changed(found: int, total: int)

## The player reached the door with owls still in chains. Carries how many are
## still needed so the HUD's owl ring can draw attention to itself: the card the
## door puts up says WHAT to do, and the ring is WHERE the count lives, so the
## two have to move together or the child learns neither.
signal door_refused(still_needed: int)

## Consecutive correct answers within the current level.
## `paused` carries the wrong-answer state: brand/BRAND_SYSTEM.md §10.2 says a
## wrong answer dims the flame rather than resetting the count, so the two facts
## have to travel together.
signal streak_changed(streak: int, paused: bool)
signal level_complete(payload: Dictionary)
signal save_game()

# XP / Leveling
signal xp_changed(payload: Dictionary)
signal level_up(payload: Dictionary)

# NPC
signal npc_interact(payload: Dictionary)
signal dialog_advance(payload: Dictionary)

## Emitted when a save from the cloud replaced local state, so UI showing coins,
## levels or progress can refresh instead of displaying stale numbers.
signal save_adopted()
