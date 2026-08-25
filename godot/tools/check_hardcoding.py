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
import os, re, sys

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
	if not hits:
		print("hardcode guard: clean")
		return 0
	print("hardcode guard: %d violation(s) — move to data or add '# hardcode-ok':" % len(hits))
	for rel, i, why, src in hits:
		print("  %s:%d  %s\n      %s" % (rel, i, why, src))
	return 1


if __name__ == "__main__":
	raise SystemExit(main())
