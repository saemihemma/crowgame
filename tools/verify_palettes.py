#!/usr/bin/env python3
"""Check the world palettes against the colour law in brand/BRAND_SYSTEM.md §6.

Run from the repo root:  python3 tools/verify_palettes.py
Exits non-zero if any rule in section 6 is violated.

WHY THIS READS godot/data/themes AND NOT brand/tokens
-----------------------------------------------------
It used to glob theme_*.json out of brand/tokens/, which held its own copy of
the five palettes. The game loads godot/data/themes/. The two were byte-identical
and NOTHING enforced that, so the gate was decorative for the file that actually
ships: retune a palette where the game reads it and the colour law still passed
against the stale copy next door. brand/tokens/README.md said as much itself --
"nothing enforces it, which is a small drift risk worth knowing about" -- and
told us to wire this into `npm run validate` once the tokens lived under
godot/data. They do, so this now reads the shipped files and there is one copy.

SCOPE
-----
Section 6 is written for the five worlds, so those are what it gates. `forest`
and `scifi` are pre-brand-system skins whose retirement is tracked in roadmap.md;
they are measured and reported below but do not fail the build, because holding
them to a law they predate would only block on a decision nobody has made yet.
Pointing the law at the shipped files is what surfaced their state at all.
"""
import json
import os
import sys

THEMES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'godot', 'data', 'themes')

# The five worlds section 6 is written for, in level order.
WORLDS = ['emberwood', 'prism_hollow', 'sugarstorm', 'geyserworks', 'aurora_spire']
# Pre-brand-system skins: measured, reported, not gated. See roadmap.md.
LEGACY = ['forest', 'scifi']

FIXED_NINE = ["ink", "paper", "coin", "owl", "yes", "notyet", "hurt", "hero", "focus"]


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


def load(theme_id):
    with open(os.path.join(THEMES_DIR, f'theme_{theme_id}.json'), encoding='utf-8') as fh:
        theme = json.load(fh)
    return theme["name"], theme["palette"]


fails, notes = [], []


def check(cond, msg):
    (notes if cond else fails).append(("PASS " if cond else "FAIL ") + msg)


def law(name, p, report):
    """Every rule in section 6.5, plus 6.1 and 6.2. `report` collects, `check` gates."""
    # 6.5 - text contrast floor 4.5:1
    for surface in ("boardBg", "buttonBg"):
        r = ratio(p["paper"], p[surface])
        report(r >= 4.5, f"{name}: paper on {surface} = {r:.2f} (need 4.5)")
    r = ratio(p["accent"], p["boardBg"])
    report(r >= 4.5, f"{name}: accent on boardBg = {r:.2f} (need 4.5)")

    # 6.5 - yes / notyet must separate on luminance, not only hue
    r = ratio(p["yes"], p["notyet"])
    report(r >= 1.5, f"{name}: yes vs notyet luminance = {r:.2f} (need 1.5)")

    # 6.5 - two-tone hazard clears both ground values
    for ground in ("ground_lit", "ground_shadow"):
        best = max(ratio(p["hazard"], p[ground]), ratio(p["hazard_base"], p[ground]))
        report(best >= 3.0, f"{name}: hazard pair vs {ground} = {best:.2f} (need 3.0)")

    # 6.5 - amber must never sit directly on gold, and a hazard is not a coin
    r = ratio(p["notyet"], p["coin"])
    report(r >= 1.5, f"{name}: notyet vs coin = {r:.2f} (need 1.5)")
    r = ratio(p["hazard"], p["coin"])
    report(r >= 1.5, f"{name}: hazard vs coin = {r:.2f} (need 1.5)")

    # 6.2 - the red rule
    report(p["text_error"] == p["notyet"], f"{name}: text_error uses notyet amber, not red")
    report(p["hurt"] == "#FF4D4D", f"{name}: hurt is the reserved damage red")

    # 8.7 - warm scrim, never pure black
    report(p["scrim"].lower().startswith("#1a1420"), f"{name}: scrim is warm ink, not pure black")


worlds = {}
for theme_id in WORLDS:
    name, palette = load(theme_id)
    worlds[name] = palette

check(len(worlds) == 5, f"five world palettes present (found {len(worlds)})")

# 6.1 - the Fixed Nine are byte-identical everywhere
for key in FIXED_NINE:
    values = {p[key] for p in worlds.values()}
    check(len(values) == 1, f"Fixed Nine '{key}' identical across all worlds -> {values}")

for name, palette in worlds.items():
    law(name, palette, check)

for line in notes:
    print(line)

# The legacy pair: measured, not gated.
legacy_findings = []
for theme_id in LEGACY:
    name, palette = load(theme_id)
    law(name, palette, lambda ok, msg: None if ok else legacy_findings.append(msg))

if legacy_findings:
    print(f"\nLegacy skins outside the colour law ({len(legacy_findings)} finding(s), not gated —"
          " their retirement is tracked in roadmap.md):")
    for line in legacy_findings:
        print(f"  {line}")

if fails:
    print()
    for line in fails:
        print(line)
    print(f"\n{len(fails)} violation(s).")
    sys.exit(1)

print(f"\nAll {len(notes)} colour-law checks passed across the five worlds.")
