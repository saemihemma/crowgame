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

# The event is always the FIRST argument, on every entry point AudioManager has.
#
# That is a deliberate shape rather than a coincidence: the guard has to be able
# to read the moment out of a call site without parsing GDScript, so the API is
# arranged so one regex can. It also cannot end at the closing paren any more --
# `play_event("streak", {"pitch_step": n})` is a legitimate call, and matching
# `"x")` reported it as an event nobody fires.
EVENT_CALL_RE = re.compile(
	r'\b(?:play_event|play_event_at|attach_loop)\(\s*"([a-z_]+)"')


def check_audio_events() -> list:
	"""Every event key a script fires is registered, and every registered event has a caller.

	"Fires" means any of AudioManager's three moment entry points --
	play_event (a sound with no place), play_event_at (a sound somewhere in the
	world) and attach_loop (a proximity loop that lives as long as its node).
	All three take the event first so this can read them without parsing.

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

	return audio_problems(registered, called)


def audio_problems(registered: set, called: dict) -> list:
	# The decision, split out from the file walking so --selftest can feed it.
	#
	# It was not split, and --selftest printed OK while covering check_text alone
	# -- so the audio check, which is what closes rule 6's actual failure mode, had
	# no negative test, in a repo that owns a whole harness for exactly that
	# question. A gate whose selftest does not reach it is a gate nobody has tried
	# to break.
	problems = []
	if not registered:
		problems.append("sound_events.json registered no events; this check enforced nothing")

	for key in sorted(set(called) - registered):
		for rel, i in called[key]:
			problems.append(
				"%s:%d  names no event in data/audio/sound_events.json: \"%s\" "
				"-- AudioManager.play_event returns silently on an unknown key, so this is "
				"a sound that never plays" % (rel, i, key))

	for key in sorted(registered - set(called)):
		problems.append(
			"data/audio/sound_events.json: event \"%s\" is fired by nothing in "
			"godot/scripts -- either wire it up or remove the registration" % key)

	return problems


SOUND_DOC = os.path.join(os.path.dirname(__file__), "..", "..", "brand", "SOUND_DESIGN.md")
DOC_EVENT_RE = re.compile(r'^\|[^|]*\|\s*`([a-z_]+)`\s*\|')


def check_sound_doc() -> list:
	"""Every sound event has a row in brand/SOUND_DESIGN.md, and vice versa.

	The doc exists because the owner is going to replace every one of these files
	and needs to know, per moment, what the file is FOR -- "how it should sound" is
	the only column in it that a generator cannot produce. A row missing for a new
	event is therefore not a documentation nit: it is a file somebody has to guess
	at. And a row for a deleted event sends them to swap an asset nothing plays.

	Both directions, for the reason audio_problems gives: the tool cannot know
	which side is wrong, so it says which and fails.
	"""
	with open(AUDIO_EVENTS, encoding="utf-8") as f:
		registered = {k for k in json.load(f) if not k.startswith("_")}
	documented = set()
	with open(SOUND_DOC, encoding="utf-8") as f:
		for line in f:
			m = DOC_EVENT_RE.match(line)
			if m:
				documented.add(m.group(1))
	return doc_problems(registered, documented)


def doc_problems(registered: set, documented: set) -> list:
	# Split from the file reading so --selftest can feed it, same as
	# audio_problems -- an ungated decision is the thing this repo keeps finding.
	problems = []
	if not documented:
		problems.append(
			"brand/SOUND_DESIGN.md has no event rows; this check enforced nothing "
			"(the table format changed, or the file moved)")
		return problems
	for key in sorted(registered - documented):
		problems.append(
			"brand/SOUND_DESIGN.md has no row for event \"%s\" -- whoever replaces "
			"that file has nothing telling them what it is for" % key)
	for key in sorted(documented - registered):
		problems.append(
			"brand/SOUND_DESIGN.md documents event \"%s\", which is not in "
			"data/audio/sound_events.json -- it sends someone to swap an asset "
			"nothing plays" % key)
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
	# The audio decision, fed synthetic inputs. Each case names the defect it
	# stands for, so a case that stops discriminating is legible rather than a
	# silent OK.
	audio_cases = [
		("clean: every event called, every call registered",
		 {"coin", "jump"}, {"coin": [("a.gd", 1)], "jump": [("b.gd", 2)]}, 0),
		("a typo'd key is a silent no-op at runtime",
		 {"coin"}, {"coin": [("a.gd", 1)], "coinz": [("a.gd", 9)]}, 1),
		("a registered event with no caller is a sound that never plays",
		 {"coin", "land"}, {"coin": [("a.gd", 1)]}, 1),
		("both directions at once are both reported",
		 {"coin", "land"}, {"coinz": [("a.gd", 9)]}, 3),
		("an empty registry must fail rather than pass vacuously",
		 set(), {}, 1),
	]
	for desc, registered, called, expected in audio_cases:
		got = len(audio_problems(registered, called))
		if got != expected:
			print("SELFTEST FAIL: audio %r expected %d problem(s), got %d"
			      % (desc, expected, got))
			ok = False

	doc_cases = [
		("clean: every event has a row and every row an event",
		 {"coin", "jump"}, {"coin", "jump"}, 0),
		("a new event with no row leaves its file undocumented",
		 {"coin", "door_locked"}, {"coin"}, 1),
		("a row for a deleted event sends someone to swap nothing",
		 {"coin"}, {"coin", "gone"}, 1),
		("a table that stopped parsing must fail rather than pass vacuously",
		 {"coin"}, set(), 1),
	]
	for desc, registered, documented, expected in doc_cases:
		got = len(doc_problems(registered, documented))
		if got != expected:
			print("SELFTEST FAIL: sound doc %r expected %d problem(s), got %d"
			      % (desc, expected, got))
			ok = False

	# And the live tree, so --selftest cannot pass while the repo itself is broken.
	if check_sound_doc():
		print("SELFTEST FAIL: brand/SOUND_DESIGN.md and sound_events.json disagree")
		ok = False
	if check_audio_events():
		print("SELFTEST FAIL: the live audio registry does not resolve both ways")
		ok = False
	print("selftest: %s" % ("OK" if ok else "FAILED"))
	return 0 if ok else 1


def main() -> int:
	if "--selftest" in sys.argv:
		return selftest()
	hits = scan()
	audio = check_audio_events() + check_sound_doc()
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
