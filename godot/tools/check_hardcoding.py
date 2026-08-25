#!/usr/bin/env python3
"""Hardcode guard — fails CI if scripts reintroduce inline styling colors,
untranslated user-facing strings, ad-hoc scene navigation or raw sfx keys, so the
data-driven conventions can't silently rot as humans and agents iterate.

Every check here is narrow and reliable by design: a guard that produces one
false positive gets switched off, and then it guards nothing.

WHAT THIS ENFORCES (README.md numbers these 1-6; these are 2, 3, 4 and 6):
  * No inline Color literals: `Color("#..")` / `Color(0.5, ..)`. Use
    ThemeManager.get_color_value(role). (Color.WHITE/BLACK/TRANSPARENT and
    Color(var, ..) from config are fine.)                          [rule 3]
  * No literal UI strings via `.text = "Words"`, `placeholder_text = "Words"`,
    or `_title("Words")`. Use TextManager.t(key).                   [rule 2]
  * No ad-hoc scene navigation: `change_scene_to_file/_packed` outside
    scene_router.gd. Use SceneRouter.goto("name").                  [rule 4]
  * No raw sfx keys: `play_sfx("key")` outside audio_manager.gd. Fire a semantic
    event with AudioManager.play_event("coin"), mapped in
    data/audio/sound_events.json.                                   [rule 6]

WHAT THIS DOES NOT ENFORCE, and why — README.md says so too, because it used to
claim this script "rejects all six" while implementing two of them:
  * rule 1, magic numbers in .gd. Numeric scanning cannot separate a tuning
    constant from an array index or a Tier-1 golden value without a false
    positive rate that would get the guard disabled. Golden-value tests cover the
    Tier-1 constants instead.
  * rule 5, type-to-behaviour switches for content. "Is this match statement
    dispatching on content type or on an enum that belongs in code" is a judgment
    a regex does not have. Code review covers it.

Escape hatch: append `# hardcode-ok` to a line to allow it (brand/diagnostic).
Run: python3 godot/tools/check_hardcoding.py [--selftest]
"""
import json, os, re, sys

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")
ALLOW = "# hardcode-ok"

COLOR_RE = re.compile(r'Color\(\s*["#0-9]')
STR_RE = re.compile(r'(?:\.text\s*=\s*|placeholder_text\s*=\s*|_title\(\s*)"([^"]*)"')
WORD_RE = re.compile(r'[A-Za-z]{2,}')
NAV_RE = re.compile(r'\bchange_scene_to_(?:file|packed)\s*\(')
SFX_RE = re.compile(r'\bplay_sfx\s*\(')

# The one file that is allowed to do each thing, because it is the file the rule
# exists to funnel everything through. Keyed by basename: these are autoloads and
# there is exactly one of each.
NAV_OWNER = "scene_router.gd"
SFX_OWNER = "audio_manager.gd"


def check_text(s: str, basename: str = "") -> str:
	line = s.rstrip("\n")
	if ALLOW in line:
		return ""
	stripped = line.strip()
	if stripped.startswith("#") or stripped.startswith("##"):
		return ""
	if COLOR_RE.search(line):
		return "inline Color literal (use ThemeManager.get_color_value)"
	m = STR_RE.search(line)
	if m and WORD_RE.search(m.group(1)):
		return "literal UI string '%s' (use TextManager.t)" % m.group(1)
	if NAV_RE.search(line) and basename != NAV_OWNER:
		return "ad-hoc scene navigation (use SceneRouter.goto)"
	if SFX_RE.search(line) and basename != SFX_OWNER:
		return "raw sfx key (use AudioManager.play_event, mapped in data/audio/sound_events.json)"
	return ""


def scan() -> list:
	hits = []
	for root, _, files in os.walk(SCRIPTS):
		for fn in files:
			if not fn.endswith(".gd"):
				continue
			path = os.path.join(root, fn)
			with open(path, encoding="utf-8") as f:
				for i, line in enumerate(f, 1):
					why = check_text(line, fn)
					if why:
						rel = os.path.relpath(path, os.path.join(SCRIPTS, ".."))
						hits.append((rel, i, why, line.strip()))
	return hits


AUDIO_EVENTS = os.path.join(os.path.dirname(__file__), "..", "data", "audio", "sound_events.json")
EVENT_CALL_RE = re.compile(r'play_event\(\s*"([a-z_]+)"\s*\)')


def check_audio_events() -> list:
	"""Every play_event key is registered, and every registered event has a caller.

	Rule 6 above funnels sound through play_event, which is the right shape and
	silent about the thing that actually breaks: `AudioManager.play_event` does
	`SOUND_EVENTS.get(event, "")` and returns on empty, so a typo is a no-op with
	no error, no warning and no failing test. That is not hypothetical — the four
	rule-6 violations this guard was extended to catch were ALL silent no-ops
	naming a key that does not exist, and fixing them left `land` registered
	against a real asset with no caller at all. Rule 6 was gated; its failure mode
	was not.

	So this derives both directions, like the wire-contract check in
	validate_docs.js: an unknown key is a typo, and an uncalled event is either a
	missing call site or a registration to delete. Neither can be decided by the
	tool, so both fail and say which.

	`test_registries.gd` walks event -> manifest key and never sees the call
	sites, which is why it could not catch either.
	"""
	problems = []
	with open(AUDIO_EVENTS, encoding="utf-8") as f:
		registered = {k for k in json.load(f) if not k.startswith("_")}

	called = {}
	for root, _, files in os.walk(SCRIPTS):
		for fn in files:
			if not fn.endswith(".gd"):
				continue
			path = os.path.join(root, fn)
			with open(path, encoding="utf-8") as f:
				for i, line in enumerate(f, 1):
					if ALLOW in line or line.strip().startswith("#"):
						continue
					for key in EVENT_CALL_RE.findall(line):
						called.setdefault(key, []).append(
							(os.path.relpath(path, os.path.join(SCRIPTS, "..")), i))

	if not registered:
		problems.append("sound_events.json registered no events; this check enforced nothing")

	for key in sorted(set(called) - registered):
		for rel, i in called[key]:
			problems.append(
				"%s:%d  play_event(\"%s\") names no event in data/audio/sound_events.json "
				"-- AudioManager.play_event returns silently on an unknown key, so this is "
				"a sound that never plays" % (rel, i, key))

	for key in sorted(registered - set(called)):
		problems.append(
			"data/audio/sound_events.json: event \"%s\" has no play_event caller in "
			"godot/scripts -- either wire it up or remove the registration" % key)

	return problems


def selftest() -> int:
	samples = [
		('x.text = "Hello there"', True),
		('panel.color = Color("#ffd700")', True),
		('label.color = Color(1, 0, 0, 0.5)', True),
		('x.text = "Brand" # hardcode-ok', False),
		('x.text = TextManager.t("menu.play")', False),
		('c = ThemeManager.get_color_value("coin")', False),
		('m = Color(b, b, 1.0)', False),
		('_add_button("interact", "E", pos)', False),
		# Rules 4 and 6: flagged everywhere except in the one file that owns them.
		('\tget_tree().change_scene_to_file(path)', True),
		('\tAudioManager.play_sfx("ui_click")', True),
	]
	owned = [
		('\tget_tree().change_scene_to_file(path)', "scene_router.gd", False),
		('\tget_tree().change_scene_to_file(path)', "game.gd", True),
		('\t\tplay_sfx(key)', "audio_manager.gd", False),
		('\tAudioManager.play_sfx("ui_click")', "pause.gd", True),
	]
	ok = True
	for src, should_flag in samples:
		flagged = bool(check_text(src))
		if flagged != should_flag:
			print("SELFTEST FAIL: %r expected flag=%s got %s" % (src, should_flag, flagged))
			ok = False
	for src, basename, should_flag in owned:
		flagged = bool(check_text(src, basename))
		if flagged != should_flag:
			print("SELFTEST FAIL: %r in %s expected flag=%s got %s"
			      % (src, basename, should_flag, flagged))
			ok = False
	print("selftest: %s" % ("OK" if ok else "FAILED"))
	return 0 if ok else 1


def main() -> int:
	if "--selftest" in sys.argv:
		return selftest()
	hits = scan()
	audio = check_audio_events()
	if not hits and not audio:
		print("hardcode guard: clean")
		return 0
	if hits:
		print("hardcode guard: %d violation(s) — move to data or add '# hardcode-ok':" % len(hits))
		for rel, i, why, src in hits:
			print("  %s:%d  %s\n      %s" % (rel, i, why, src))
	if audio:
		print("audio events: %d unresolved reference(s):" % len(audio))
		for line in audio:
			print("  %s" % line)
	return 1


if __name__ == "__main__":
	raise SystemExit(main())
