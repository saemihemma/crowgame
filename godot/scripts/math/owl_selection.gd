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

	for plan in plans:
		var problem = manager.get_next_problem_elo_aware(plan["domains"], {
			"difficultyRange": config.get("difficultyRange", [1, 2]),
			"maxCurriculumStep": config.get("maxCurriculumStep", 20),
			"maxOperand": config.get("maxOperand", 20),
			"primaryDomain": plan["primaryDomain"],
		})
		if problem != null:
			return problem

	for plan in plans:
		for domain in _order_fallback_domains(plan["domains"], plan["primaryDomain"]):
			var problem = manager.get_next_problem({
				"domains": [domain],
				"difficultyRange": config.get("difficultyRange", [1, 2]),
				"maxCurriculumStep": mini(int(config.get("maxCurriculumStep", 20)), LearnerStateManager.get_current_step(String(domain))),
				"maxOperand": config.get("maxOperand", 20),
			})
			if problem != null:
				return problem
	return null

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
