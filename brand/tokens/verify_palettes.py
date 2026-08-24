#!/usr/bin/env python3
"""Check the five world token files against the colour law in ../BRAND_SYSTEM.md.

Run from brand/tokens/:  python3 verify_palettes.py
Exits non-zero if any rule in section 6 is violated.
"""
import json, glob, sys

FIXED_NINE = ["ink", "paper", "coin", "owl", "yes", "notyet", "hurt", "hero", "focus"]
fails, notes = [], []

def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def lum(h):
    h = h.lstrip("#")[:6]
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def check(cond, msg):
    (notes if cond else fails).append(("PASS " if cond else "FAIL ") + msg)

themes = {}
for path in sorted(glob.glob("theme_*.json")):
    t = json.load(open(path))
    themes[t["name"]] = t["palette"]

check(len(themes) == 5, f"five world token files present (found {len(themes)})")

# 6.1 - the Fixed Nine are byte-identical everywhere
for key in FIXED_NINE:
    values = {p[key] for p in themes.values()}
    check(len(values) == 1, f"Fixed Nine '{key}' identical across all worlds -> {values}")

# 6.5 - text contrast floor 4.5:1
for name, p in themes.items():
    for surface in ("boardBg", "buttonBg"):
        r = ratio(p["paper"], p[surface])
        check(r >= 4.5, f"{name}: paper on {surface} = {r:.2f} (need 4.5)")
    r = ratio(p["accent"], p["boardBg"])
    check(r >= 4.5, f"{name}: accent on boardBg = {r:.2f} (need 4.5)")

# 6.5 - yes / notyet must separate on luminance, not only hue
for name, p in themes.items():
    r = ratio(p["yes"], p["notyet"])
    check(r >= 1.5, f"{name}: yes vs notyet luminance = {r:.2f} (need 1.5)")

# 6.5 - two-tone hazard clears both ground values
for name, p in themes.items():
    for ground in ("ground_lit", "ground_shadow"):
        best = max(ratio(p["hazard"], p[ground]), ratio(p["hazard_base"], p[ground]))
        check(best >= 3.0, f"{name}: hazard pair vs {ground} = {best:.2f} (need 3.0)")

# 6.5 - amber must never sit directly on gold
for name, p in themes.items():
    r = ratio(p["notyet"], p["coin"])
    check(r >= 1.5, f"{name}: notyet vs coin = {r:.2f} (need 1.5)")

# hazard must not be confusable with a coin
for name, p in themes.items():
    r = ratio(p["hazard"], p["coin"])
    check(r >= 1.5, f"{name}: hazard vs coin = {r:.2f} (need 1.5)")

# 6.2 - the red rule
for name, p in themes.items():
    check(p["text_error"] == p["notyet"], f"{name}: text_error uses notyet amber, not red")
    check(p["hurt"] == "#FF4D4D", f"{name}: hurt is the reserved damage red")

# 8.7 - warm scrim, never pure black
for name, p in themes.items():
    check(p["scrim"].lower().startswith("#1a1420"), f"{name}: scrim is warm ink, not pure black")

for line in notes:
    print(line)
if fails:
    print()
    for line in fails:
        print(line)
    print(f"\n{len(fails)} violation(s).")
    sys.exit(1)
print(f"\nAll {len(notes)} colour-law checks passed.")
