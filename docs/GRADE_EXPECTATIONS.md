# Icelandic grade expectations — research and mapping

Status: Current
Authority: Canonical rationale and provenance for the grade mapping. The
machine-readable truth is `godot/data/curriculum/grade_expectations.json`;
verdict semantics are implemented in `server/src/lib/grade.ts`.
Last verified against code: 2026-08-25

## What this is

What "at grade level" means in the parent report, and where every claim comes
from. The machine-readable version of this document is
`godot/data/curriculum/grade_expectations.json` (its own directory on purpose:
everything in `godot/data/math/` is parsed as a problem pool by the tool
chain); the server consumes a generated copy
(`server/src/generated/gradeExpectations.ts`) and CI fails if the two drift.

## 1. Which grade is my child in?

**Law** (normative): compulsory school starts in the calendar year the child
turns six —

> "Skólaskylda barns hefst að jafnaði við upphaf skólaárs á því almanaksári sem
> barnið verður sex ára." — Lög um grunnskóla nr. 91/2008, 15. gr. 2. mgr.
> (https://www.althingi.is/lagas/nuna/2008091.html)

So grade is a function of **birth year only** — every child born in 2019 enters
1\. bekkur in autumn 2025, regardless of birth month. That is why the account
stores a birth *year*, not a birth date: the date adds zero information for this
purpose and is data we do not want to hold about children.

Derivation (identical in server and client):

```
schoolYearStart = (month >= August) ? year : year - 1
grade           = schoolYearStart - birthYear - 5
grade <= 0  →  leikskóli (pre-school)
```

August is the boundary because the Icelandic school year begins in late August;
during June–July a child is treated as still in the grade just finished, which
keeps expectations honest over the summer. The boundary month is data
(`meta.schoolYearBoundaryMonth`), not code.

Art. 3 of the same law: compulsory school is 10 grades, ages 6–16. The law
allows individual earlier/later starts (same 15. gr.); we deliberately ignore
that — the report says "miðað við fæðingarár" and a parent of an exception-case
child will know.

## 2. What is expected per grade?

**The national curriculum does not define per-grade expectations.**
Aðalnámskrá grunnskóla (25. kafli, Stærðfræði, 2024 —
https://www.adalnamskra.is/grunnskoli/kafli-25-staerdfraedi-2024) defines
hæfniviðmið only at the **end of grades 4, 7 and 10**. The end-of-grade-4
criteria relevant to this game:

- raðað náttúrulegum tölum (og einföldum brotum) eftir stærð
- notað tugakerfisrithátt og sýnt skilning á sætiskerfi
- nýtt sér námundun með heiltölum
- **nýtt sér grunnreikniaðgerðirnar fjórar og reiknað með náttúrulegum tölum**

**Per-grade granularity therefore comes from the state-published teaching
materials** — the MMS (Miðstöð menntunar og skólaþjónustu, formerly
Menntamálastofnun / Námsgagnastofnun) Sproti series, the standard state
sequence for grades 1–4 (mms.is/namsefni/sproti-*):

| Grade | Material | Number/operation scope |
|---|---|---|
| leikskóli | Aðalnámskrá leikskóla 2011 | **No mathematics criteria at all** — play-based learning |
| 1. bekkur | Sproti 1a/1b | tölur 1–10, síðan 10–20; röð talna, talnalína, sætisgildi; samlagning og frádráttur innan 20 |
| 2. bekkur | Sproti 2a/2b | tölur upp í 100; samlagning og frádráttur upp í 100; tvöfalt/helmingur, sléttar/oddatölur — **engin formleg margföldun/deiling** |
| 3. bekkur | Sproti 3a/3b | þriggja stafa tölur; **margföldun kynnt; deiling kynnt** |
| 4. bekkur | Sproti 4a/4b | tölur > 1000 og < 0; margföldun og deiling áfram → curriculum anchor: all four operations by end of grade 4 |

## 3. Mapping onto the game's ladder

Each game domain has a curriculum ladder (steps). Milestones were placed by
measuring the actual number ranges of the problems at each step (from
`problems_curriculum.json`) against the material scope above — e.g. addition
step 15 is where problems reach sums of 20, so "end of grade 1" for addition
is step 15. The full table lives in `grade_expectations.json`; each milestone
carries `basis`:

- `law` / `curriculum` — normative Icelandic source
- `material` — derived from the MMS Sproti scope (descriptive, not statutory)
- `approx` — required judgement (e.g. comparison's ladder tops out at ordering
  numbers ≤ 30 while grade-2 material reaches 100; pattern domains have no
  official number-range anchor)

## 4. Verdict semantics (deliberately bands, not points)

For a child in grade *g* with `highestStep` *h* in a domain:

- **ahead** — *h* ≥ the end-of-grade-*g* milestone: the child has already
  covered what this school year is working toward.
- **on track** — *h* ≥ the end-of-grade-(*g*−1) milestone (or no earlier
  milestone exists): working through this year's material, as expected.
- **practice together** — *h* below the end of the *previous* grade's
  milestone: the one honest "where to nudge" signal. Never worded as failure.
- **not expected yet** — the domain's first milestone is beyond grade *g*
  (multiplication for a grade-1 child): anything played is a head start.
- **leikskóli** — no floor exists by design (Aðalnámskrá leikskóla defines no
  math criteria), so verdicts can only be "exploring" or "ahead".
- Grades past the game's last milestone are clamped: the report then says the
  game only measures up to that grade's material rather than pretending to
  assess a 10-year-old.

Within-year pacing (e.g. "by May of grade 1 you should be at step 12") is
**invented nowhere in Iceland**, so we refuse to invent it: a child is "on
track" for the whole school year they are working through.

## 5. What this is not

An ELO in a game is not a psychometric instrument, and the Sproti scope is a
teaching sequence, not a legal requirement. The report's wording says "miðað
við námsefni N. bekkjar" (relative to grade-N material) — it never claims a
child fails a state standard, because for grades 1–3 no state standard exists.
