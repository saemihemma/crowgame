extends TestCase
## Slice 7c: abilities framework — defs load, grant/revoke toggles state and
## emits EventBus signals.


func test_defs_loaded() -> void:
	var am := AbilityManager.new()
	var known := am.known_ids()
	assert_true(known.has("double_jump"), "double_jump defined")
	assert_true(known.has("wall_slide"), "wall_slide defined")
	assert_true(known.has("dash"), "dash defined")

func test_grant_and_revoke() -> void:
	var am := AbilityManager.new()
	var granted := [""]
	var revoked := [""]
	var gcb := func(p): granted[0] = String(p.get("abilityId", ""))
	var rcb := func(p): revoked[0] = String(p.get("abilityId", ""))
	EventBus.ability_granted.connect(gcb)
	EventBus.ability_revoked.connect(rcb)
	am.grant("dash")
	assert_true(am.has_ability("dash"), "dash granted")
	assert_eq(granted[0], "dash", "ability_granted emitted")
	am.grant("dash")  # idempotent
	assert_eq(am.active_ids().size(), 1, "no duplicate grant")
	am.revoke("dash")
	assert_true(not am.has_ability("dash"), "dash revoked")
	assert_eq(revoked[0], "dash", "ability_revoked emitted")
	am.grant("unknown_ability")
	assert_true(not am.has_ability("unknown_ability"), "unknown ability not granted")
	EventBus.ability_granted.disconnect(gcb)
	EventBus.ability_revoked.disconnect(rcb)
