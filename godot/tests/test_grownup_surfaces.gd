extends TestCase
## The two grown-up surfaces must actually build.
##
## Both are constructed entirely in code from Config.ui(), TextManager.t() and
## ThemeManager.get_color_value() — which means a missing tuning path, a missing
## translation key or a missing palette role does not fail at build time, it fails
## the first time a parent opens the panel. Instantiating them here is what turns
## that into a test failure instead of a bad afternoon.

const CLOUD_PANEL := preload("res://scenes/CloudPanel.tscn")
const PARENT_REPORT := preload("res://scenes/ParentReport.tscn")

func _instantiate(scene: PackedScene) -> Node:
	var node := scene.instantiate()
	Engine.get_main_loop().root.add_child(node)
	return node

func test_cloud_panel_builds() -> void:
	var panel := _instantiate(CLOUD_PANEL)
	assert_true(panel != null, "cloud panel instantiates")
	assert_true(panel.get_child_count() > 0, "cloud panel built its contents")
	panel.queue_free()

func test_parent_report_builds() -> void:
	var report := _instantiate(PARENT_REPORT)
	assert_true(report != null, "parent report instantiates")
	assert_true(report.get_child_count() > 0, "parent report built its contents")
	report.queue_free()

func test_report_strings_exist_in_both_locales() -> void:
	# t() falls back to the raw key when a string is missing, so a missing key
	# renders as "report_domain_line" on screen. Compare against the key itself.
	var keys := [
		"report_title", "report_what_this_is", "report_no_children",
		"report_not_played_yet", "report_domain_line", "report_confidence_low",
		"report_open", "cloud_title", "cloud_off", "cloud_on", "cloud_email_prompt",
		"cloud_pair_code", "menu.back",
	]
	for locale in ["en", "is"]:
		TextManager.set_locale(locale)
		for key in keys:
			assert_true(TextManager.t(key) != key,
				"%s is missing from the %s locale" % [key, locale])
	TextManager.set_locale("en")

func test_every_math_domain_has_a_parent_facing_name() -> void:
	# The report prints a friendly domain name; an unnamed domain would show a
	# raw identifier to a parent.
	for domain in MathDomains.ALL:
		var key := "domain_" + String(domain)
		assert_true(TextManager.t(key) != key, "%s has no parent-facing name" % key)
