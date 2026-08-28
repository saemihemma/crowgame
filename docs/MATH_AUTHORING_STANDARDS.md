# Math authoring standards — how steps, problems, and grades are designed

Status: Current
Authority: Canonical rules for authoring math content and designing curriculum
ladders. The executable halves are `tools/math_curriculum.ts` (step derivation),
`authoring/math/**` (bands + batches), and the guards in
`tools/validate-content.ts` / `tools/validate_i18n.mjs`. Grade anchors live in
`docs/GRADE_EXPECTATIONS.md`.
Last verified against code: 2026-08-27

## 1. Research foundation (what the ladder design is based on)

**Fact fluency develops in phases, and skipping the middle phase is harmful.**
Children move from counting strategies (count-all, then count-on), through
deliberate reasoning with derived facts (doubles, near-doubles, make-ten,
subtraction-as-addition), to retrieval. Drilling retrieval before the
reasoning phase produces brittle recall (Baroody; Fuson; Bay-Williams). The
ladder therefore orders content by **strategy stage first, magnitude second**:
+1/+2 and doubles before make-ten bridges, bridges before two-digit work.

**One new difficulty factor per step.** A step that raises the number range
AND introduces regrouping at once is unmeasurable — when the child stalls you
cannot tell which factor stalled them, and the ELO sees one blurred jump. Every
step in every ladder introduces exactly one named factor (a range tier, a
carry, a borrow, a new table, a new digit width).

**Multi-digit operations order by regrouping load, not just magnitude.**
The evidence-backed sequence is: no regrouping → one regrouping → multiple
regroupings (subtracting across zeros is the classic hardest case). Digit
width and regrouping count are separate factors and get separate steps.

**Multiplication tables have a measured difficulty order.** Classroom data
(60k answers) puts 1, 10, 2, 5 easiest; then 3, 4; squares as derived-fact
anchors; then 6, 7, 8, 9 — where most errors live (6×8, 7×8, 6×7 are the
hardest single facts). The multiplication ladder is that order, one table per
step, squares as their own anchor step, and ×0 as its own step because n×0=n
is a distinct misconception, not a hard fact.

**Division is taught through multiplication fact families.** A division fact
sits one step after the multiplication fact it inverts. Sharing stories
(partitive) are the natural intro framing.

**Early number sense is presentation-bound, so presentation is content.** At the
bottom of the ladder there is almost nothing to vary: addition step 0 is the four
facts inside 0+0..1+1 and no authoring can add a fifth, and counting step 0 is
the quantities one to four. What CAN vary is how the question looks, and the
evidence says varying it is the work, not decoration. Number conservation — the
same quantity stays the same quantity however it is arranged — is a thing
children have to learn, so the drawn shape must never predict the answer;
arrangement itself changes difficulty (rectangular and dice arrangements are
easier to count than scattered or circular ones); and children need small
quantities both in regular arrangements and in irregular ones. Hence the
twelve-marker alphabet, cycled across every count (§4), and the ten-frame's
gap after five.

**The counting principles are separate skills, and each earns its own hint.**
One-to-one correspondence (one number word per object), cardinality (the last
number said IS the total), and subitising (reading a small set without counting)
are distinct, and a child can have one without the others — which is why a
counting problem's hint names a principle rather than always saying "touch each
one".

**Word problems have a taxonomy (CGI — Carpenter et al.).** Additive
situations: join, separate, part-part-whole, compare — with the unknown's
position driving difficulty (result < change < start unknown). Multiplicative
situations: equal groups, arrays, comparison. Every word-problem shape we ship
maps to one of these, and as of 2026-08 all four additive situations ship:
join-result (find, land), separate-result (eat, fly away), compare with the
quantity unknown (`a bird has 3 more`) and with the difference unknown (`how many
more do you have`), and part-part-whole both ways (`4 red and 5 blue`; `9
berries, 4 are red`). The compare pair is why each shape carries its own parser
pattern AND its own semantic check: both members read the same two numbers and
must run opposite ways, so a shape falling through to a shared default would be
verified against the wrong arithmetic and still pass. Multiplicatively: equal
groups (nests), the array that says the same product differently (rows),
partitive sharing (shared by birds), and quotative measurement (`you put 3 in
each nest — how many nests?`), which is the natural partner of the
missing-divisor relational shape.

Sources: [Baroody — subtraction-as-addition](https://www.sciencedirect.com/science/article/abs/pii/S0885200619301012) ·
[NCETM — cardinality and counting](https://www.ncetm.org.uk/classroom-resources/ey-cardinality-and-counting/) ·
[the five counting principles](https://mathsuccess.dmtinstitute.com/p/the-five-counting-principles) ·
[subitizing](https://thirdspacelearning.com/us/blog/what-is-subitizing/) ·
[structure sense in first graders (eye-tracking)](https://link.springer.com/article/10.1007/s10649-023-10290-5) ·
[groupitizing](https://www.sciencedirect.com/science/article/pii/S0022096514000630) ·
[Bay-Williams — procedural fluency](https://mysavvastraining.com/assets/files/documents/enV%20White%20Papers_Developing%20the%20Full%20Package%20of%20Procedural%20Fluency%20by%20Dr%20Jenny%20Bay-Williams_1725630916.pdf) ·
[times-table difficulty data](https://www.hachettelearning.com/blog/times-tables-matter-working-towards-multiplication-mastery) ·
[teaching order for facts](https://shelleygrayteaching.com/suggested-order-teaching-basic-multiplication-facts/) ·
Icelandic anchors in `docs/GRADE_EXPECTATIONS.md`.

## 2. Step-system design rules (the gold standard)

1. **A step is a pure function of the problem itself** — operands, carries,
   borrows, table membership, digit width — implemented in
   `tools/math_curriculum.ts`. Never a hand-assigned label, never derived from
   ELO. (ELO measures the child; the step describes the content.)
2. **One new factor per step** (see §1).
3. **Never move a served step.** Children's saves store `currentStep` per
   domain and the parity fixtures pin pool data. Extending a ladder may only
   add steps ABOVE the range real problems occupy; changing derivation for an
   already-served range is a breaking change to live learner state.
   (Multiplication and division were redesigned wholesale in 2026-08 — legal
   only because no owl had ever served those domains.)
4. **Steps must be contiguous enough to promote through.** The runtime scans
   at most `promotionStepScanLimit` (20) steps ahead for populated content; a
   gap wider than that strands a child.
5. **ELO bands follow steps, not the reverse.** `band-table.json` assigns each
   step range a target ELO window on the 100–1100 scale (difficulty 1–5 maps
   linearly). Later steps get strictly higher windows; overlap between adjacent
   bands is fine, inversion is not.
6. **Grade anchors are bands, not points**, and every anchor cites a source
   (`grade_expectations.json` provenance rules). No invented within-year pacing.

## 3. The ladders (with grade anchors)

Grade anchors: 1.–2. bekkur from MMS Sproti 1–2 scope, 3. bekkur from Sproti 3
(þriggja stafa tölur, margföldun 1–2, deiling), 4. bekkur from the aðalnámskrá
end-of-grade-4 criterion (all four operations with natural numbers) and Sproti 4
(tölur yfir 1000). Details and quotes: `docs/GRADE_EXPECTATIONS.md`.

### Addition / subtraction
| Steps | Factor introduced | Grade |
|---|---|---|
| 0–20 | operand magnitude within 20; carry/borrow adds +1 | 1 |
| 21–40 | two-digit range in 5-wide operand tiers (21–120) | 2 |
| 41 | three-digit, **no** regrouping | 3 |
| 42 | three-digit, **one** carry/borrow | 3 |
| 43 | three-digit, multiple regroupings (incl. across zeros) | 3 |
| 44 | four-digit / crossing 1000, no regrouping | 4 |
| 45 | four-digit, one regrouping | 4 |
| 46 | four-digit, multiple regroupings | 4 |

### Multiplication (table-order ladder)
| Step | Content | Grade |
|---|---|---|
| 0 | ×1 (identity) | 3 |
| 1 | ×2 (doubles) | 3 |
| 2 | ×10 | 3 |
| 3 | ×5 | 3 |
| 4 | ×3 | 3 |
| 5 | ×4 | 3 |
| 6 | ×0 (zero property — its own misconception) | 3 |
| 7 | squares n×n (3–10) — derived-fact anchors | 3 |
| 8–11 | ×6, ×7, ×8, ×9 (the hard cluster, one table per step) | 4 |
| 12 | multiples of ten × one-digit (30×4) | 4 |
| 13 | two-digit × one-digit, no carry (23×3) | 4 |
| 14 | two-digit × one-digit with carry (47×6) | 4 |

A fact belongs to the EARLIEST table that contains it (6×2 is a doubles fact,
step 1, not a ×6 fact). That rule makes step 11 **structurally empty**: every
×9 fact already belongs to an earlier table or is a square, which is itself
the pedagogical point — by the time a child has ×6–×8, the ×9 table contains
nothing new. Division steps 7 and 12 are empty for the mirrored reason
(nothing inverts ×0, nothing new inverts ×9). Promotion scans past one-step
holes (§2.4), so these are documented, not bugs.

### Division (fact-family ladder)
`step(a÷b) = multiplication step of (b × quotient) + 1`. Sharing stories are
the intro framing. Steps 1–12 are fact families; 13 divides multiples of ten;
14–15 divide two-digit dividends beyond the tables (96÷4). Grade anchors:
step 8 by end of 3. bekkur, step 15 by end of 4. **Format limit: no
remainders** — the answer format is a single MCQ number; "deiling með afgangi"
needs a new answer mode first (documented in roadmap, not faked).

### Number bonds (the same addition rung, asked from the other end)
`a + ? = c`, `? + b = c` and `c = a + ?` are the same bond as `a + b = ?`, and
`deriveCurriculumStep` gives them the same rung by reading the fact underneath
(`parseRelationalPrompt` in `tools/math_verifier.ts`). They are authored with
`relationalShapes` on an addition/subtraction template, which emits them
*instead of* the plain framings so a batch's count stays accountable. Their text
is pure symbols, so nothing new needs translating; the hint and explanation come
from the `math.hint.rel.*` / `math.expl.rel.*` family and are chosen by the
shape, because each shape hands the child a different KNOWN number. The
distractor set leads with the **total** — a child who reads "=" as "work it out"
answers 5 to `2 + ? = 5`, and that is a diagnosis, not noise.

`both_sides` (`8 + 7 = ? + 6`) is the Falkner/Levi/Carpenter form and a harder
idea than a missing part. It is authored from a template too, with the
right-hand addend coming from `bothSidesOffsets` — the fact underneath is still
`a + b`, so every offset asks a different question about the same fact, and a
fixed spread keeps a batch's count accountable. A prompt whose two right-hand
numbers match the left is dropped: `8 + 7 = ? + 7` can be answered by matching
shapes without meeting the idea at all.

**A template must carry the shape's own skill.** The three additive shapes are
three different ideas — `missing_addend`, `relational_equals`,
`subtraction_relational` and the rest — and
`godot/data/curriculum/concept_ladder.json` routes a problem to its lesson by
that skill, not by its step. One template per shape, therefore: a template
emitting all three under one skill hands two of them the wrong lesson.

### Multiplication and division read relationally too
`3 × ? = 12` is the question a times table answers from the other end, and
`? ÷ 4 = 3` is the same fact asked backwards rather than a separate ritual.
The same `relationalShapes` field authors them (`both_sides` stays additive —
the multiplicative two-sided form is a working-memory problem, not a relational
one, and nothing in the literature places it in this age band). Their wording
comes from the `math.hint.rel.each_group_size` / `how_many_groups` /
`shared_into` / `how_many_shared` family, which was already translated for the
hand-authored gaps-pool problems.

Two constraints are not optional. Both operands and the result stay at 2 or
more, because the grouping sentences are plural-only in the catalog and
"shared into 1 equal groups" is not a sentence — and `3 × ? = 3` is not a
question about grouping anyway. And the distractors differ per shape, because
a missing divisor is a small number while a missing dividend is the biggest one
in the problem: sharing one list would offer a free elimination on one of them.
A missing dividend is offered `divisor + quotient` (the add-instead error) and
one group either side; a missing divisor is offered the quotient already
written down and `dividend - quotient`.

### Counting back
`stepChoices` may be negative — Sproti 1 teaches *talning aftur á bak* alongside
counting on. The step is derived from `|delta|` and magnitude, so a descending
run lands on the same rung as the ascending one and no served step moves. Runs
that would walk past zero are dropped: negative numbers are outside this game's
answer format (§8), so such a run is unanswerable rather than hard.

### Comparison / number sequence
Existing factor scores are frozen (served content). New magnitude factors sit
strictly above today's data: comparison adds >30 / >120 / >500 tiers (steps
7–9, ordering into the thousands — the end-of-grade-4 "raðað náttúrulegum
tölum" criterion); sequence adds >90 / >300 / >900 magnitude tiers and a
step-delta >12 tier for skip-counting by 25/50/100 (steps 7–10).

### Counting, pattern matching
The ladders are deliberately not extended: talning is a grade-1 skill (counting
past 20 is place-value work, covered by sequence/comparison), and Sproti's later
pattern work is geometric/symmetry — not expressible in this game's numeric MCQ
format. Counting is instead **densified downward** — more shapes, more framings,
more problems per step inside 1–20 — which is where a five-year-old actually
lives (Sproti 1a/1b work inside 1–10 and then 10–20).

## 4. Problem quality bar (every generated problem)

- **Prompt**: one skill, one question, no compound sentences a 6–10-year-old
  must re-read. Steps 0–2 of **addition and subtraction** carry **no story**: a
  narrative is a second thing to decode on top of the fact. The scope is the
  rule, not a loophole — this is about reading load for a five-year-old meeting
  their first sum, and read as a bare step index across every domain it
  contradicts §1, whose words for division are "Sharing stories (partitive) are
  the natural intro framing". A child at division step 2 has climbed the whole
  additive ladder to get there. `buildProblemFromCandidate` checks the derived
  step rather than the operand size it used to approximate with; for these two
  domains the two are provably the same test, but the step is what the rule
  says. They may use any of the short framings
  (`equation`, `question`, `solve`, `answer`, `complete`, `blank_equals`,
  `how_much`, `equals`, `quick_check`, `mental_math`), because those add a word
  of scaffolding and no math. The rule used to be `equation`/`question` only,
  which meant two framings over the four facts that exist at addition step 0 —
  the whole first-ever experience of the game, twice.
- **Options**: 4 choices, exactly one correct. Distractors are
  misconception-driven, not random noise: off-by-one, forgot-the-carry,
  digit-swap, added-instead-of-subtracted, adjacent table fact (7×8 next to
  7×7 and 8×8), and for counting the near misses a miscount produces (n±1,
  n±2). Every distractor plausible in magnitude — the mechanical
  `correct ± offset` list in `buildOptions` is a fallback for when the
  authored distractors cannot fill four slots, never a top-up on them.
- **A story's teaching belongs to its situation, not to its template.** A
  template names one hint strategy for everything it renders, which is right
  until two CGI situations come off one template. Compare and part-part-whole
  come off subtraction templates and inherited count-back and take-away, so
  `You have 10 berries. A bird has 5 berries. How many more do you have?` was
  taught as `10 take away 5 leaves 5` — a false model of a story in which
  nothing is taken away. `storyScaffold` gives those shapes the strategy their
  situation earns (count up from the smaller to the larger; one part and a
  whole), reusing the already-translated `math.hint.rel.*` family, and gives
  each the distractor its own misconception needs: the compare pair reads the
  same two numbers and runs opposite ways, so each one leads with the other's
  answer. A candidate that names its own misconception tags **replaces** the
  template's rather than adding to them — "counting_back_error" is not a mistake
  a compare story can produce.
- **A picture has to be picturable.** Equal-groups and array stories keep both
  quantities inside twelve. `8 nests, each with 90 eggs` and `48 rows of 4 eggs`
  both parse and both multiply correctly, and neither is a nest or a row.
- **A hint that names counting has to mean counting.** The relational and
  compare hints name counting-up, and the pools now reach four-digit number
  bonds, so `? + 345 = 3504` was teaching "Start at 345 and count up to 3504" —
  in both languages. Above a countable gap (ten) the sentence states the
  relation and stops: the child still has to find the missing part and is no
  longer told to find it a way nobody can. Same rule the sequence framings got,
  where *talning áfram* is refused to a run that jumps by twenty-five.
- **A declared misconception must be answerable.** A problem tagged
  `added_instead` whose options contain no added-instead value claims a
  diagnosis it cannot make. The subtracted-instead value is `|a - b|`, not
  `a - b`: a child who subtracts takes the smaller from the larger whichever way
  round the story named them.
- **Hints teach a strategy, never reveal the answer** (`renderHint`
  strategies: count_on, make_ten, bridge_ten, add_place_value,
  multiply_groups, split_tens, and for counting one per counting principle:
  count_one_each, count_whole_group, count_from_five, count_from_ten).
  Explanations state the fact in strategy language.
- **Counting markers are a shape selector, not typography.** A counting prompt
  ends in a run of one repeated marker; the board (`count_row.gd`) replaces the
  run with drawn objects and keeps only the caption, so no child reads the
  marker. Twelve markers draw twelve shapes, and a template lists `symbols` so
  the shape it draws is **independent of the count**. Pinning one marker to one
  count range (the old `symbol` field) made the shape a perfect predictor of the
  magnitude and gave the lowest band exactly one shape. A caption that NAMES a
  shape ("Count the leaves") must agree with what is drawn;
  `godot/tests/test_count_row.gd` checks the pairing on the real pools.
- **Cover every fact before repeating one.** A template renders one candidate
  per (fact × framing × marker) and keeps the first `count` by hash. Candidates
  are dealt in rounds — every distinct fact once, then again — so widening the
  framing or marker set cannot cost coverage of the content.
- **Word problems must parse.** Every story shape has a matching pattern in
  `math-kernel/math/wordedArithmetic.ts` — that is what keeps the analytics
  kind labels, replay keys, and the verifier honest. A story the parser cannot
  read does not ship.
- **Word problems keep both quantities ≥ 2** so plural nouns are correct in
  both languages without per-number inflection machinery, and Icelandic noun
  choices prefer forms stable across the 21/31 singular-agreement rule
  (ber, egg, hreiður are identical singular/plural).
- **Big numbers stay abstract.** Story framing stops at two-digit facts; a
  child sharing 847 berries is not a story, it is noise. Three- and four-digit
  steps use equation forms only. This lives in `storyFits` rather than in the
  templates, because a template that lists framings without `strictVariants`
  gets the whole fallback set unioned in and the stories arrive uninvited —
  which is how 56 three-digit stories, and one sharing 150 berries between five
  birds, reached the pools while the rule sat written and unenforced.
  `validate-content.ts` now states it over the fact rather than the step, since
  a three-digit story is noise wherever it lands.
- **Language**: all prompt/hint/explanation English lives in the phrasing
  catalog (`tools/math_phrasing_catalog.mjs`) with an Icelandic translation in
  both bundles, plural-correct in both languages, inside the pixel fit budget
  and the glyph allowlist. `npm run validate` enforces all of it.

## 5. Quantity floors

- ≥ 20 problems per populated step per domain (existing density ≈ 25).
- ≥ 2 prompt shapes per step; word-problem share ≥ 15% wherever the domain has
  a word form and operands fit the story constraint.
- At the bottom (steps 0–2 of the two domains a new child has unlocked,
  `addition` and `counting`) the floor is on **variety**, because the facts
  themselves are nearly fixed: every short framing available, and most of the
  twelve token shapes. `godot/tests/test_count_row.gd` holds the shape half.
- A step with fewer problems than the floor either gets more authoring or is
  merged — never shipped thin (thin steps make promotion streaky).
- **The count is not the width.** A second floor, `minFactsPerStep`, counts the
  DISTINCT facts on a rung rather than the problems, because twenty problems
  drawn from three facts is a rung a child can pass by remembering three
  answers — and adding framings raises the count while leaving the width exactly
  where it was. Widening a framing set is therefore never a fix for a narrow
  rung, and the width must be measured before any framing set is widened.
  `tools/validate_math_concepts.mjs` fails the build on an undeclared narrow
  rung and, symmetrically, on a declaration for a rung that has since widened.
  A fact is the multiset of numbers in play — what the prompt writes plus what
  it asks for — so `11 + 3`, `3 + 11` and `11 + ? = 14` count once between them,
  the same collapsing the step derivation already does. For a counting prompt,
  which writes no numerals, it is the count plus the marker read **from the
  glyph run alone**: scanning the whole sentence pulled in the framing's own
  punctuation, and one drawn shape then counted as two facts — making the very
  claim this floor exists to defend false inside it. The ten currently declared
  rungs are at a structural ceiling no authoring moves, in two clusters:
  addition 0 and 1 at the bottom (§1: no authoring can add a fifth fact), and
  multiplication 8–10 with division 9–11 at the top, where a fact belongs to the
  earliest table that contains it and the last tables own almost nothing.
  The report also carries **problems per fact**, because width alone cannot rank
  two narrow rungs against each other and the ratio is what says how often a
  child meets the same triple.
- Since 2026-08 **every rung the derivation can reach clears the problem
  floor.** The last two to do so needed different fixes, and the difference is
  the rule: division step 11 only needed authoring, because its two facts had
  ten framings between them and thirteen problems drawn from them; number
  sequence step 0 could not be authored past eighteen, because six possible runs
  across three framings is eighteen prompts and there is no nineteenth. That one
  needed a wider framing set — `count_on` and `count_back`, which name the
  strategy the way Sproti does — and a framing set is a phrasing-catalog change,
  not an authoring one. A framing that names a strategy is then bound to runs
  that actually use it: *talning áfram* and *talning aftur á bak* are UNIT
  counting, so both are refused to any run whose stride is not one. A jump of
  twenty-five is skip counting, and `keep_pattern` and `number_pattern` are
  what it is called. Reach for it only when the arithmetic is genuinely
  exhausted, and never as a way past a narrow rung: it cannot widen one.

## 6. Categorization rules

- **domain** = the operation/skill family, set by the template `kind`.
- **kind** (equation / word_problem / visual) is DERIVED by
  `tools/gen_problem_catalog.ts` using the same worded parser as the game —
  never hand-labeled. New story shape ⇒ new parser pattern ⇒ the catalog
  classifies it for free.
- **curriculumStep** is derived (§2.1). **Grade** comes from
  `grade_expectations.json` milestones over steps.

## 7. Authoring process (the checklist CI enforces)

1. Edit `authoring/math/band-table.json` (new step ranges need a band with an
   ELO window) and `authoring/math/batches.json` (templates).
2. `npm run math:materialize` — regenerates pools; the review gate (rubric
   ≥ 8.5 per role, ≥ 9.0 average, selector smoke) must pass.
3. `npm run math:phrasing` — new English shapes become catalog keys; add the
   Icelandic translation for any new key in BOTH bundles.
4. New story shapes: add the parser pattern in
   `math-kernel/math/wordedArithmetic.ts`, then `npm run godot:gen-math-fixtures`.
5. `npx tsx tools/gen_problem_catalog.ts` (analytics kinds) and, if milestones
   moved, `npx tsx tools/gen_grade_expectations.ts`.
6. `npm run validate` + server tests + Godot suite; rebuild the web export.

Two of those checks exist because a defect got past all the others. `npm run
validate:agreement` renders every problem in every locale and reads the
sentences back, because "You had 15. Now there are 1." / "Nú eru 1." shipped
past a toolchain that only ever inspected keys. And `validate-content.ts` now
compares each ELO band against the one before it in step order, because §2.5's
"inversion is not [fine]" was documented and enforced by nothing.

Everything in this list that can be forgotten is a CI failure, not a memory.

## 8. Known format limits (honest scope)

- No remainders, no fractions, no negative numbers, no measurement/money
  contexts — each needs either a new answer mode or a new domain, and Sproti 4
  content in those areas is deferred until one exists.
- MCQ-only answers; written-method (column) presentation is not renderable
  yet, so steps 41+ assess the computation, not the notation.
