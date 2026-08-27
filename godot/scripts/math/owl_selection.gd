extends RefCounted
class_name OwlSelection
## Godot port of math-kernel/math/owlSelection.ts. Picks the owl's next problem:
## prefers unlocked domains, avoids repeating the previous problem's domain when
## possible (mixed-domain), then falls back to step-capped random per domain.

## Which subject the owl leans on next: the one practised least recently,
## weighted so the core subjects come round more often.
##
## This used to be allowed[0] -- the first entry of the owl's problemTypes list,
## which is addition for every owl and every child. Since the attempt order puts
## the preferred domain first 70% of the time, addition took roughly seven of
## every ten problems for a whole journey, and a domain a child had EARNED could
## go unserved indefinitely. Measured over 1200 attempts: 741 additions, and
## division never once offered after unlocking.
##
## Staleness picks the SUBJECT; ELO still picks the RUNG within it. A domain
## never served is maximally stale, so a newly unlocked one is offered at once.
## `domainWeights` in math_tuning.json is the designer's dial for how much of
## each subject a child meets.
static func pick_primary_domain(allowed_domains: Array, recent_domains: Array, weights: Dictionary) -> Variant:
	if allowed_domains.is_empty():
		return null
	var best = allowed_domains[0]
	var best_dueness := -INF
	for domain in allowed_domains:
		var last_index := -1
		for i in range(recent_domains.size() - 1, -1, -1):
			if String(recent_domains[i]) == String(domain):
				last_index = i
				break
		var since := INF if last_index == -1 else float(recent_domains.size() - last_index)
		var dueness: float = since * float(weights.get(String(domain), 1.0))
		# Strictly greater, so a tie falls to the earlier entry and the owl's
		# declared order still breaks it predictably.
		if dueness > best_dueness:
			best_dueness = dueness
			best = domain
	return best

static func get_allowed_owl_domains(config: Dictionary) -> Array:
	var domains: Array = config.get("domains", [])
	var allowed: Array = []
	for d in domains:
		if LearnerStateManager.is_domain_unlocked(String(d)):
			allowed.append(d)
	if allowed.is_empty():
		allowed = ["addition"] if domains.has("addition") else [domains[0]]

	# Drop the subjects the child has finished.
	#
	# pick_primary_domain chooses by staleness, which has no notion of mastery --
	# so a domain sitting at its ceiling is not merely still eligible, it becomes
	# MORE due the longer it goes unserved. Counting is the case that exposed it:
	# its ladder stops at step 6, and a child who topped it out was then handed
	# rows of marks to count for 24% (steady) to 44% (struggling) of every
	# question they answered, out of a pool of 125, while their addition was up at
	# step 19.
	#
	# The `not is_empty()` guard is the whole safety of this. A child who has
	# exhausted EVERYTHING must still be served something -- same reasoning as the
	# addition fallback above -- so a filter that would empty the set is discarded
	# instead. It also means the core subjects cannot vanish while any subject
	# remains unfinished.
	if bool(config.get("retireExhaustedDomains", false)):
		var unfinished: Array = []
		for d in allowed:
			if not LearnerStateManager.is_domain_retirable(String(d)):
				unfinished.append(d)
		if not unfinished.is_empty():
			allowed = unfinished
	return allowed

static func build_owl_domain_plans(allowed_domains: Array, previous_domain: Variant, primary_domain: Variant) -> Array:
	if previous_domain == null:
		return [{"domains": allowed_domains, "primaryDomain": primary_domain}]
	var alternates: Array = []
	for d in allowed_domains:
		if d != previous_domain:
			alternates.append(d)
	if alternates.is_empty():
		return [{"domains": allowed_domains, "primaryDomain": primary_domain}]
	# The caller already chose a primary by staleness; keep it while it is still
	# available and only fall back to list order when it is not.
	var alt_primary = primary_domain if alternates.has(primary_domain) else alternates[0]
	return [
		{"domains": alternates, "primaryDomain": alt_primary},
		{"domains": allowed_domains, "primaryDomain": alt_primary},
	]

static func select_owl_problem(manager: Node, config: Dictionary, previous_domain: Variant) -> Variant:
	var allowed := get_allowed_owl_domains(config)
	var recent_domains: Array = []
	for a in LearnerStateManager.get_snapshot().get("recentAttempts", []):
		recent_domains.append(String(a.get("domain", "")))
	var primary = pick_primary_domain(allowed, recent_domains, config.get("domainWeights", {}))
	if primary == null:
		primary = config.get("primaryDomain", "addition")
	var plans := build_owl_domain_plans(allowed, previous_domain, primary)

	# The operand rail applies only when the caller's config carries one — a
	# default here would silently cap every player (the maxOperand:20 fossil).
	for plan in plans:
		var elo_options := {
			"difficultyRange": config.get("difficultyRange", [1, 2]),
			"maxCurriculumStep": config.get("maxCurriculumStep", 20),
			"primaryDomain": plan["primaryDomain"],
		}
		# ABSENT means no cap, and it has to stay absent. A sentinel here would be
		# actively harmful: the filter rejects a glyph row whose answer exceeds the
		# cap, so a -1 "no cap" would reject EVERY counting row instead of none.
		_apply_ungrouped_cap(elo_options, config)
		# Same rule for the operand rail: applied only when the caller's config
		# carries one. A default here was the maxOperand:20 fossil that silently
		# froze every player at sums of ~20; validate_docs fails any reintroduction.
		if config.has("maxOperand"):
			elo_options["maxOperand"] = config["maxOperand"]
		var problem = manager.get_next_problem_elo_aware(plan["domains"], elo_options)
		if problem != null:
			return problem

	for plan in plans:
		for domain in _order_fallback_domains(plan["domains"], plan["primaryDomain"]):
			var options := {
				"domains": [domain],
				"difficultyRange": config.get("difficultyRange", [1, 2]),
				"maxCurriculumStep": mini(int(config.get("maxCurriculumStep", 20)), LearnerStateManager.get_current_step(String(domain))),
			}
			_apply_ungrouped_cap(options, config)
			if config.has("maxOperand"):
				options["maxOperand"] = config["maxOperand"]
			var problem = manager.get_next_problem(options)
			if problem != null:
				return problem
	return null

## Copy the representation floor across, only when the caller set one.
static func _apply_ungrouped_cap(options: Dictionary, config: Dictionary) -> void:
	if config.has("maxUngroupedCount") and config["maxUngroupedCount"] != null:
		options["maxUngroupedCount"] = config["maxUngroupedCount"]

static func _order_fallback_domains(domains: Array, primary_domain: Variant) -> Array:
	var unique: Array = []
	for d in domains:
		if not unique.has(d):
			unique.append(d)
	if not unique.has(primary_domain):
		return unique
	var out := [primary_domain]
	for d in unique:
		if d != primary_domain:
			out.append(d)
	return out
