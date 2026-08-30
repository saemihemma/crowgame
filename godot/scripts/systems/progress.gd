extends RefCounted
class_name Progress
## How much of the game a child has finished, as one number.
##
## Three things count, and they are the three a child can point at: the level is
## cleared, its big coins are found, its owls are free. Everything else the game
## records -- coins in the purse, problems answered, ELO -- is either unbounded or
## invisible, and a percentage built on an unbounded thing is not a percentage.
##
## PER LEVEL, THEN AVERAGED. Not "all owls in the game over all owls in the game":
## the practice arena holds twenty owls and level_01 holds two, so a global ratio
## would make one room worth ten levels. Each level scores itself out of 1.0 and
## the game is the mean of those scores, so every level is worth the same.
##
## A component that does not exist in a level is not counted against it. A level
## with no big coins is scored on cleared and owls alone, rather than being
## permanently capped at two thirds for something it never had.
##
## THE ARITHMETIC IS SEPARATE FROM THE SAVE on purpose. `level_fraction` takes
## plain numbers and can be tested at values the shipped game does not contain --
## zero owls, more found than exist, a level nobody has touched. `of_save` is the
## thin part that gathers them.


## One level's score, 0.0 .. 1.0.
##
## `cleared` is the level's own third: reaching the door at all is a real
## achievement and the one every child gets first. The other two are ratios, each
## clamped, because a record that somehow outran its denominator should read as
## "finished" rather than as more than finished.
static func level_fraction(cleared: bool, coins_found: int, coins_total: int,
		owls_freed: int, owls_total: int) -> float:
	var parts: Array[float] = [1.0 if cleared else 0.0]
	if coins_total > 0:
		parts.append(clampf(float(coins_found) / float(coins_total), 0.0, 1.0))
	if owls_total > 0:
		parts.append(clampf(float(owls_freed) / float(owls_total), 0.0, 1.0))
	var sum := 0.0
	for part in parts:
		sum += part
	return sum / float(parts.size())


## The whole game, 0.0 .. 1.0: the mean of the levels that count.
##
## Returns 0.0 rather than dividing by zero when nothing counts, which is what a
## registry with only practice rooms would produce.
static func overall_fraction(level_fractions: Array) -> float:
	if level_fractions.is_empty():
		return 0.0
	var sum := 0.0
	for f in level_fractions:
		sum += float(f)
	return sum / float(level_fractions.size())


## What a save is worth, gathered from the level registry and read back as
## { overall: float, levels: [ { key, fraction, cleared, coins, coinsTotal,
## owls, owlsTotal } ] }.
##
## The per-level rows are returned alongside the total because the completion
## screen needs exactly them, and computing the same thing twice in two places is
## how a headline number and the rows under it start disagreeing.
static func of_save(save: Dictionary) -> Dictionary:
	var cleared_levels: Array = save.get("completedLevels", []) if save.get("completedLevels", []) is Array else []
	var records: Dictionary = save.get("levelRecords", {}) if save.get("levelRecords", {}) is Dictionary else {}
	var rows: Array = []
	var fractions: Array = []
	for entry in LevelManager.get_levels():
		var key := String(entry.get("key", ""))
		if key == "" or not LevelManager.counts_toward_completion(key):
			continue
		var record: Dictionary = records.get(key, {}) if records.get(key, {}) is Dictionary else {}
		var found: Array = record.get("bigCoins", []) if record.get("bigCoins", []) is Array else []
		var coins_total := LevelManager.big_coin_count(key)
		var owls := int(record.get("owls", 0))
		var owls_total := LevelManager.owl_count(key)
		var is_cleared: bool = cleared_levels.has(key)
		var fraction := level_fraction(is_cleared, found.size(), coins_total, owls, owls_total)
		fractions.append(fraction)
		rows.append({
			"key": key,
			"fraction": fraction,
			"cleared": is_cleared,
			"coins": found.size(),
			"coinsTotal": coins_total,
			"owls": owls,
			"owlsTotal": owls_total,
			# Every big coin in one visit. Deliberately NOT `coins == coinsTotal`:
			# that reads true for a child who collected them one per run, which is
			# the opposite of what the mark is for. See SaveManager.bank_run.
			"perfect": bool(record.get("perfect", false)),
		})
	return {"overall": overall_fraction(fractions), "levels": rows}


## The number a player is shown. Rounded DOWN, and never to 100 unless it really
## is 100: a child who is one owl short must not be told they have finished.
static func percent(fraction: float) -> int:
	var whole := int(floor(clampf(fraction, 0.0, 1.0) * 100.0))
	if whole >= 100 and fraction < 1.0:
		return 99
	return whole
