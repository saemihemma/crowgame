# Hörmann — Story Bible

Status: Supportive
Authority: Canonical narrative. Character, faction and world truth. Art law lives in `BRAND_SYSTEM.md`; runtime truth lives in `godot/**`.
Last verified against code: 2026-08-25

This is the one story file. It exists to make `BRAND_SYSTEM.md §3` — "grimy,
disorganised creatures that **scramble numbers** and cage owls" — mean something
specific, so that every level, enemy, owl line and cinematic frame can be
checked against a reason rather than a vibe.

It does not change any brand law. Where this file and `BRAND_SYSTEM.md`
disagree, `BRAND_SYSTEM.md` wins, and this file is the one that is wrong.

---

## 0. The one paragraph

**The owls keep the count. The world runs on it.** The Muddle are cockroaches,
and cockroaches eat leftovers — so the Muddle farm miscounts, because a wrong
count leaves a scrap behind and the scrap is food. One night they pushed a
single bead on the owls' great Tally, the count fell over, and its pieces
scattered across five worlds along with the owls who were holding them.
**Hörmann is a crow the owls raised. He cannot count.** He is fast and small and
brave and he can get to any owl in the world, but the sum at the end is not his
to do.

**That last sentence is the whole design.** The hero cannot do the maths. The
child does. He carries you there; you get the count right; the count coming
right is what takes the Muddle's food away.

---

## 1. Why this story and not another one

Four constraints came first, and the story is what is left after them:

| Constraint | Source | What it forced |
| --- | --- | --- |
| Numbers live in the world's material — carved, cast, grown, forged, never floating in a box | `BRAND_SYSTEM.md §1` | Counting has to be a **physical craft** somebody performs, not a school subject. Hence the Tally, and owls as its keepers. |
| The owl is a friend you rescue, never an examiner | `§1`, `§3.4` | The owl cannot be the one testing you. So the owl is **stuck holding a number** and you take it off their hands. |
| Owls are drawn **stuck**, never caged or distressed | `§3.4` | The antagonist cannot be a jailer. He is a **farmer**, and a stuck owl is a crop. |
| Ugly, never scary. They grumble, they do not roar. They never win a chase | `§3.1` | The villain's menace has to come from **scale, appetite and paperwork**, never from threat of harm. |

Everything below is downstream of that table. If a future story idea breaks a
row of it, the row wins.

---

## 2. The world

**The Reckoning** is the world's name for the thing that keeps it working: every
bridge, harvest, season and stair holds together because somebody knows how
many. Not magic. Bookkeeping, taken seriously.

- **Counted things glow faintly.** This is the world's one supernatural rule and
  it does all the visual work: a thing whose count is right has a warm light in
  it (`coin` `#FFC93C` / `owl` `#FFE9A8`), and a thing whose count is wrong goes
  dull. A child can read the health of any object in the game without a word of
  text. Use it everywhere.
- **The owls are the Reckoning's keepers.** Not teachers. *Keepers* — the
  distinction matters for §3.4 of the brand system. An owl holds a count the way
  a person holds a rope: patiently, and they cannot put it down without letting
  the other end go.
- **Crows collect.** Corvids in this world are not counters. They are the ones
  who fetch, carry, pick up and bring back. A crow's talent is *getting there*.
  This is a species fact, and it is why Hörmann is the hero of a maths game
  without ever answering a question.

---

## 3. Hörmann

**Species truth:** a crow. **Character truth:** already settled in
`BRAND_SYSTEM.md §2.1` — small, fast, brave, curious before aggressive, never
speaks. Nothing here softens that.

What this file adds is **the why**:

Hörmann was found. He came out of a windfall nest with nobody around it, and the
owls of the Tally took him in — which is not a thing owls do, and they did it
anyway. He grew up in a tower of people who count, being the only one in it who
cannot.

- **He cannot count.** Not a joke and not a weakness to be cured by the end of
  the game. It is his species. The owls never once treated it as a fault, and
  the game must not either. There is no scene, line, or reward anywhere in this
  product in which Hörmann learns to do maths.
- **The scarf is theirs.** The scarlet flight-scarf (`§2.3`) was knitted by the
  owl who raised him. That is why it is the same shape as Professor Hoot's
  (`§3.4`) — the visual rhyme the brand system already asked for now has a
  reason, and the highest-value sprite addition in the pack becomes the
  emotional centre of the story for free.
- **He is silent because he is a bird**, not because he is stoic. `§2.1` says a
  silent hero is a hero any child can be. Keep it that way: no thought bubbles,
  no interior monologue, no growth arc narrated at the player.
- **His arc is not competence, it is company.** He begins alone in a forest and
  ends in a tower full of the family that raised him. That is the whole shape.
  Five worlds, and each one he is less alone than the last — because the owls
  he freed are up there waiting, and the HUD's owl count is the visible form of
  it (`§8.2`).

**What the child is.** The child is the count. Not a co-pilot, not a coach —
they are the half of the hero that Hörmann does not have. The correct framing in
copy is always *"He cannot count. You can."* Never *"help Hörmann learn."*

---

## 4. The Muddle, and what they actually want

`BRAND_SYSTEM.md §3` sets the faction. This section sets the **motive**, and the
motive is the reason the faction is not generically evil.

**Cockroaches eat what is left over.** A roach lives on crumbs, spillage, the
uncounted. So:

> **A wrong count leaves a scrap behind, and the scrap is food.**

Count nine stones as ten and there is a tenth stone's worth of *nothing* loose
in the world — a leftover, a not-quite. The Muddle eat those. It is the only
thing they eat.

Four consequences, and each one earns its keep:

1. **They are farmers, not vandals.** Scrambling numbers is *agriculture*. This
   is far more unsettling than malice and far less frightening, which is exactly
   the register `§3.1` demands. They are not coming for the child. They are
   running a business.
2. **They need owls alive, stuck, and holding.** A dead owl is one meal. An owl
   who cannot put their count down is a **permanent leak**. This is why `§3.4`'s
   drawing law — stuck, never caged, never distressed — is not a squeamish
   compromise but the literal truth of the fiction. The Muddle *want* the owl
   comfortable. A comfortable owl leaks longer.
3. **A right answer starves them.** The child's victory condition is arithmetic
   accuracy, and the fiction pays it out directly: get the count right, the
   leftover never exists, there is nothing to eat. Nobody is hurt in this game.
   The villain simply goes hungry. That is the whole combat model of the plot,
   and it is fully compatible with `§3.2` — a Muddle deflates and pops into
   coloured dust because it was only ever *inflated with someone else's
   mistake*.
4. **It scales without escalating cruelty.** Bigger Muddle = bigger appetite,
   never bigger threat. World 4 is dangerous because it is an industrial site,
   not because the enemies got meaner.

### 4.1 The species, restated as a supply chain

The roster in `§3.3` is unchanged. This is what each one *does for a living*:

| World | Species | Job in the operation |
| --- | --- | --- |
| Emberwood | **Grubbin** | Field hands. They walk a line and nudge things out of true. |
| Prism Hollow | **Shardling** | Larder keepers. Miscounts store well in crystal; they guard the stock and freeze when watched. |
| Sugarstorm | **Gumsnap** | Front of house. Sugarstorm has no enemies patrolling it because it does not need any (see §6.3). |
| Geyserworks | **Slagjaw** | Foremen. Plated, bolted, vents steam on a two-second tell — the tell is a shift whistle. |
| Aurora Spire | **Gloomgull** | Couriers. They drift between the Spire and the floor carrying the day's take. |

`Grubbin` are named after Grubb. Little Grubbs. He named them.

---

## 5. Grubb the Countless

**The antagonist.** One name, and it is both halves of the character:

> **GRUBB THE COUNTLESS.** His own staff are required to say *His Immensity*.

- **Grubb**, because the field hands are named after him and he thinks that is
  the same thing as being loved.
- **The Countless**, because it is his whole ambition stated as a title. He wants
  a world where nothing can be counted — not destroyed, *uncountable*. Endless
  crumbs, forever. A child does not need this explained; they need to watch him
  push one bead and then watch a tower fall.

Short form in every UI string and caption: **Grubb**. One syllable, sayable at
five, and it fits an Icelandic layout at 1.4× (`§4.4`).

### 5.1 How he is menacing without being frightening

This is the hard part of the brief, and it is solved by **one rule**:

> **Grubb is never fully in frame. Not once, in any shot, in the entire product.**

You see a claw. A segment of back. The lower half of an abacus. One antenna
crossing the whole width of the screen. The camera pans and he does not end.

Why this is the right answer and not a dodge:

- **Scale reads without a face**, and a face is where a six-year-old's fear
  lives. There is no monstrous head to be afraid of because there is never a
  head on screen. What the child feels is *how big*, which is awe, not terror.
- It is **honest about the audience** while giving up nothing. Jaws, the shark
  you don't see; the difference is we are doing it so a five-year-old can watch,
  not so a fifteen-year-old can flinch.
- It is **cheap**. A full boss sprite at readable scale is the most expensive
  single asset a game like this can commission. Partial reveals cost one still
  each and get *better* the less they show.
- It **makes the last shot of the game possible** (§6.5).

### 5.2 The design, against §3.1

Every item on the ugly law, applied:

| Law | Grubb |
| --- | --- |
| Asymmetric | One claw is enormous and one is a normal Grubbin claw he has never grown out of. He gestures with the small one. |
| Lumpy | The back is a stack of unequal segments, each a slightly different rust, like plates from different animals. |
| Over-limbed | Seven legs. Always an odd number visible; you can never see enough of him to check. |
| Snaggled | One antenna is bent at a right angle and has been *splinted with a twig and tape*. |
| Badly assembled | Everything he wears is stolen counting equipment (below). |
| **Eyes** | Yellow, mismatched, far too big. A monocle on the **larger** one, which is the joke. Never red, never glowing. |
| **Audio** | He never roars. He **counts out loud, wrong**: a slow, wet, satisfied *"one… one… one… one…"* under everything. Ceiling 0.5 volume, as `§3.1`. |
| **Chase** | He never chases. He does not need to. He **sends a form**. |

**The three props, in priority order.** If only one gets drawn, draw the first.

1. **The bib.** He wears **a stolen owl's knitted scarf** — Professor Hoot's
   shape, one world's accent colour, far too small for him — **tied under his
   chin as a napkin.** This single prop is the character. It is menacing (he
   eats their work, and dresses for it), it is comic (it is a bib), it is not
   frightening (bibs are not frightening), and it rhymes against Hörmann's
   scarlet flight-scarf and Professor Hoot's knitted one so that the three
   characters share one object with three meanings. Nothing else in this
   document is as good as this and nothing should be drawn before it.
2. **The abacus chestplate.** A stolen abacus worn as armour, **every bead shoved
   to one side.** A miscount, worn as a medal.
3. **The ledger.** Carried, never read. Full of tallies in the wrong hand. Used
   as a fan, a fly-swat, and once as an umbrella.

### 5.3 How he is defeated

At the top of the Spire the count comes right, and **there is nothing to eat.**

He deflates — `§3.2`, the same rule as every other Muddle, because he is not
special enough to warrant an exception. He goes down to the size of an ordinary
Grubbin, the bib falls off him and lands the right way up, and he scuttles off
the edge of frame **grumbling and still counting wrong.** No blow is struck. No
door closes on him. He is not killed, jailed, or humiliated by anyone — he is
simply **diminished by a correct answer**, which is the only victory this game
is allowed to sell and happens to be the best one available.

The bib is given back. That is the last beat of the story.

---

## 6. The Great Miscount, and the five worlds

### 6.1 The inciting incident

The owls kept **the Tally** at the top of the world: a tower of counted things,
every count in the Reckoning held on it, and the whole structure standing up
because all of it agreed.

One night the Muddle got in, and **Grubb pushed one bead.**

One bead. One count wrong by one. And every count that leaned on it leaned on
nothing — the Tally came apart, and its pieces went out across five worlds in
five lights, **and the owls holding those counts went with them.** They are not
imprisoned anywhere. They are scattered, wedged, tangled, stranded — each one
still holding a number that no longer adds up, and none of them able to let go.

**Why one bead.** Because it is the entire pedagogy in one image. One small
wrong number brought down everything; one small right number begins putting it
back. A five-year-old gets this instantly and it is *true*, which is rarer in
children's media than it should be.

### 6.2 What the five worlds are, structurally

The five worlds are **the five scattered pieces of the Tally.** That is why
there are five, why they are travelled in order, and why the fifth is the Spire.

The emotional beats below are `LEVEL_ART_BIBLE.md`'s, unchanged. The story was
written to fit them, not the other way round.

### 6.3 The beats

| # | World | Beat (art bible) | Story beat | What the child learns about the enemy |
| --- | --- | --- | --- | --- |
| 1 | **EMBERWOOD** | waking up | Hörmann wakes in the woods where a piece of the Tally came down. Grubbin are already walking the line, nudging things out of true. First owl, stuck in a split trunk, still holding her number. | They are *working*. Nobody is chasing him. |
| 2 | **PRISM HOLLOW** | holding your breath | Underground: the **larder**. Miscounts keep well in crystal, and there are shelves of them, going back further than the fall. This did not start last night. First sight of Grubb — one antenna crossing the dark, and the wrong count heard for the first time. | The scale. It is an operation, and it is old. |
| 3 | **SUGARSTORM** | showing off | A carnival built on a rigged count, and **the most profitable thing they own.** No enemies patrol it because it does not need them: every ramp, bumper and prize counter in the place is designed to make a visitor lose count on their own and enjoy it. | You can be robbed while having a wonderful time. The safest-feeling world is the worst one. |
| 4 | **GEYSERWORKS** | pushing through | The mill, where leftovers are processed. Slagjaw foremen, a shift whistle, and at the far end of the floor — with his back to us, too big for the frame — **His Immensity**, inspecting. | What it is all *for*. And how big he is. |
| 5 | **AURORA SPIRE** | arriving | The Tally itself, quiet and cold and nearly empty. Every owl freed is already up here. You put the beads back. The count comes right, and Grubb goes hungry (§5.3). | It ends by being correct, not by being brave. |

**Sugarstorm is the load-bearing one.** `LEVEL_ART_BIBLE.md` gives world 3 no
enemies for pacing reasons — contrast, the breather, Casino Night where Green
Hill's second act would go. The story now makes that a *fact about the villain*
rather than a scheduling decision: the Muddle's best operation needs no muscle.
An art-direction choice and a narrative choice landing on the same beat is the
sign the two documents are actually one document.

### 6.4 What is deliberately left unresolved

Do not answer these in shipped content. They are the room a sequel or a season
lives in, and a six-year-old does not need a closed world:

- Who left Hörmann's nest, and why there was nobody around it.
- How far back the Prism Hollow shelves go. Somebody was miscounting long before
  Grubb.
- Whether the Tally can be finished, or only kept.

### 6.5 The last shot of the game

Grubb, gone off the edge of frame. The bib on the floor of the Spire, the right
way up. An owl picks it up. **Hörmann is still never seen counting anything.**

---

## 7. How story is delivered

The audience is five to eight and **may not read at all.** So:

> **Every story beat in this product must be fully comprehensible with the sound
> off and the captions unread.**

That is a hard gate, not an aspiration. Test it by watching any beat muted with
a hand over the caption band. If the child cannot tell what happened, the beat
is not finished — and no amount of caption rewriting fixes it, because the
caption was never the channel.

The four channels, in the order they carry meaning:

1. **Image.** Silhouette, scale, and the counted-things glow (§2). This carries
   everything essential.
2. **Motion.** A pan that does not end tells you how big he is. A held frame
   tells you something just happened. Motion grammar is `BRAND_SYSTEM.md §9`;
   the cinematic extension is `CINEMATIC_DIRECTION.md §3`.
3. **Sound.** The wrong count, the wooden click of a bead, one hoot. Never
   required, always confirming.
4. **Caption.** One line, eight words maximum (`§4.2`), optional, read aloud by
   a parent if there is one. **Never the only source of a fact.**

### 7.1 Voice, applied to story copy

`BRAND_SYSTEM.md §4` governs, unchanged, with three story-specific additions:

- **Never name the Muddle's food in front of the child as "mistakes".** They eat
  *leftovers*, *crumbs*, *scraps*, *what does not add up*. The word "mistake"
  never appears near the antagonist, because the child makes mistakes and must
  never read themselves into the villain's diet. This is the single most
  important line in this section.
- **Grubb is never sarcastic.** `§4.2` bans adult wink everywhere, and a villain
  is the place it would sneak in. He is pompous, greedy and wrong. He is not
  clever.
- **Owl dialogue: twelve words, and always about the count, never about the
  child's performance.** "I have been holding this since Tuesday." Good. "You
  are so smart." Banned twice over (`§4.2`).

---

## 8. The naming sheet

Every proper noun this document creates, in the form it may appear in a string
bundle. All ASCII or Latin-1, per `tools/validate_i18n.mjs`.

| Name | What | Notes |
| --- | --- | --- |
| **Hörmann** | The hero, a crow | Keeps the umlaut, always (`§4.4`) |
| **Professor Hoot** | Lead owl | Already canon, `§3.4` |
| **the Reckoning** | The world's count, the thing that holds it up | Lower-case "the" |
| **the Tally** | The tower of counted things, at the Spire | |
| **the Great Miscount** | The night Grubb pushed one bead | Never abbreviated |
| **the Muddle** | The faction | Already canon, `§3` |
| **Grubb** | The antagonist. Full: *Grubb the Countless* | UI always uses **Grubb** |
| **His Immensity** | What his staff must call him | Used by Muddle, never by the game |
| **Grubbin, Shardling, Gumsnap, Slagjaw, Gloomgull** | The five species | Already canon, `§3.3` |

---

## 9. What this document does not do

- **It sets no numbers.** Difficulty bands, chain links, owl rosters and
  progression gates belong to `PROJECT.md`, `npc_registry.json` and the level
  registry. A story reason is never grounds for changing a curriculum band.
- **It adds no enemy to the roster.** `§3.3`'s five species stand. Grubb is a
  cinematic and set-piece presence, not an `enemy_registry.json` entry — he is
  never fought as a patrolling enemy, because he never chases (§5.2).
- **It does not make the game about plot.** `§1` is unchanged: the reward for
  answering is progress in the adventure. A child who never watches a single
  cinematic must lose nothing but flavour.

---

## 10. Open questions for the product owner

1. **Does the prologue ship at launch, or after the five worlds have art?**
   `CINEMATIC_DIRECTION.md` is built so the answer can be "after" without
   anything being wasted — the prologue runs on placeholders today.
2. **Is Grubb ever *heard* in gameplay, or only in cinematics?** The wrong count
   under a Geyserworks track is the cheapest way to make world 4 land, and it is
   one audio file. Recommend yes; it is not decided.
3. **Sequel room.** §6.4 is deliberately unclosed. Confirm that is wanted before
   anyone writes an ending that closes it.
