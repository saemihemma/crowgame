#!/usr/bin/env python3
"""Hardcode guard — fails CI if scripts reintroduce inline styling colors or
untranslated user-facing strings, so the data-driven conventions can't silently
rot as humans and agents iterate.

Rules (intentionally narrow + reliable — no flaky numeric scanning):
  1. No inline Color literals: `Color("#..")` / `Color(0.5, ..)`. Use
     ThemeManager.get_color_value(role). (Color.WHITE/BLACK/TRANSPARENT and
     Color(var, ..) from config are fine.)
  2. No literal UI strings via `.text = "Words"`, `placeholder_text = "Words"`,
     or `_title("Words")`. Use TextManager.t(key).

Escape hatch: append `# hardcode-ok` to a line to allow it (brand/diagnostic).
Run: python3 godot/tools/check_hardcoding.py [--selftest]
"""
import os, re, sys

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")
ALLOW = "# hardcode-ok"

COLOR_RE = re.compile(r'Color\(\s*["#0-9]')
STR_RE = re.compile(r'(?:\.text\s*=\s*|placeholder_text\s*=\s*|_title\(\s*)"([^"]*)"')
WORD_RE = re.compile(r'[A-Za-z]{2,}')


def check_text(s: str) -> str:
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
					why = check_text(line)
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
	]
	ok = True
	for src, should_flag in samples:
		flagged = bool(check_text(src))
		if flagged != should_flag:
			print("SELFTEST FAIL: %r expected flag=%s got %s" % (src, should_flag, flagged))
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
