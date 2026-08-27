extends RefCounted
class_name OwlSelection
## Godot port of math-kernel/math/owlSelection.ts. Picks the owl's next problem:
## prefers unlocked domains, avoids repeating the previous problem's domain when
## possible (mixed-domain), then falls back to step-capped random per domain.

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
	var alt_primary = alternates[0]
	return [
		{"domains": alternates, "primaryDomain": alt_primary},
		{"domains": allowed_domains, "primaryDomain": alt_primary},
	]

static func select_owl_problem(manager: Node, config: Dictionary, previous_domain: Variant) -> Variant:
	var allowed := get_allowed_owl_domains(config)
	var primary = allowed[0] if allowed.size() > 0 else config.get("primaryDomain", "addition")
	var plans := build_owl_domain_plans(allowed, previous_domain, primary)

	# The operand rail applies only when the caller's config carries one — a
	# default here would silently cap every player (the maxOperand:20 fossil).
	for plan in plans:
		var options := {
			"difficultyRange": config.get("difficultyRange", [1, 2]),
			"maxCurriculumStep": config.get("maxCurriculumStep", 20),
			"primaryDomain": plan["primaryDomain"],
		}
		if config.has("maxOperand"):
			options["maxOperand"] = config["maxOperand"]
		var problem = manager.get_next_problem_elo_aware(plan["domains"], options)
		if problem != null:
			return problem

	for plan in plans:
		for domain in _order_fallback_domains(plan["domains"], plan["primaryDomain"]):
			var filter := {
				"domains": [domain],
				"difficultyRange": config.get("difficultyRange", [1, 2]),
				"maxCurriculumStep": mini(int(config.get("maxCurriculumStep", 20)), LearnerStateManager.get_current_step(String(domain))),
			}
			if config.has("maxOperand"):
				filter["maxOperand"] = config["maxOperand"]
			var problem = manager.get_next_problem(filter)
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
