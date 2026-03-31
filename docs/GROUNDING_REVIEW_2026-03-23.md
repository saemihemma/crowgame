Status: Supportive
Authority: Review artifact for the 2026-03-23 grounding pass, not the long-term source of truth for rendering architecture.
Last verified against code: 2026-03-23

# Grounding Review - 2026-03-23

## What This Is
- An agent-skills-guided review of the reported "floating" look for grounded actors in Crow.
- A decision record for the asset-level fixes that improved the planted read without changing collision math.
- A Lead Producer synthesis of runtime evidence, frontend/readability judgment, and player-feel judgment.

## What This Is Not
- Not proof of a collision-gap bug.
- Not a scale-mode redesign, mobile pass, or camera pass.
- Not permission to add sprite Y nudges, body-offset hacks, or scale hacks to fake weight.
- Not a permanent replacement for source-of-truth runtime code and assets.

## Lead Producer Report

### Routing
- Primary owner: [team-lead-producer](C:/Users/saemundur/Desktop/Dev%20Projects/agent-skills/team-lead-producer/SKILL.md)
- Review team: [team-frontend-team](C:/Users/saemundur/Desktop/Dev%20Projects/agent-skills/team-frontend-team/SKILL.md)
- Experience lens: [role-game-designer](C:/Users/saemundur/Desktop/Dev%20Projects/agent-skills/role-game-designer/SKILL.md)
- Not used: [team-blue-team](C:/Users/saemundur/Desktop/Dev%20Projects/agent-skills/team-blue-team/SKILL.md), because this pass was not reduction/simplification work.

### Dependencies
- Browser truth came from live Playwright runs at desktop `1920x1080`.
- Asset truth came from direct runtime-sheet inspection of `crow`, `cockroach`, `owl`, and the live grass tiles.
- Grounding math came from browser-side inspection of `player.body.bottom`, `enemy.body.bottom`, and the tile top under each actor.

### Findings
- The reported "floating" look was real from the player eye, but it was not a measured collision gap.
- Verified runtime numbers on level 01:
  - player body bottom = `512`
  - enemy body bottom = `512`
  - tile top under both = `512`
  - measured gap = `0`
- The crow, cockroach, and owl runtime assets already touch their bottom image bounds, so the issue was not hidden transparent padding under the actors.
- Follow-up review invalidated the earlier floor-only conclusion. The remaining strongest culprits were the grounded sprite contact patches themselves:
  - the crow feet/claws were visually too airy
  - the owl had detached low-alpha smudge/shadow pixels under the feet
  - the cockroach also carried low-level artifact pixels around the contact area
- The live floor art can influence readability, but it was not sufficient as the primary fix.

### Stress Test
- Devil's Advocate challenge: "What if the crow silhouette alone is the culprit?"
  - Result: correct. The follow-up pass confirmed the crow and owl contact silhouettes needed actual PNG edits.
- Devil's Advocate challenge: "What if the fix is secretly changing gameplay?"
  - Result: no code-level origin/body/collider math was touched, and post-change runtime numbers still show a `0` gap.
- Devil's Advocate challenge: "Is this a mobile or scaling issue instead?"
  - Result: this pass was validated at the current desktop integer-scale policy and does not claim to solve mobile presentation.

### Acceptance
- Accept
- Evidence used:
  - Playwright desktop screenshots before and after the pass
  - runtime numeric grounding check
  - direct asset-bound inspection
  - live level inspection against the actual compiled tileset in use

## Frontend Team Review

### Journey
- Critical journey reviewed: actor idle on ground, actor patrol on ground, NPC idle on ground, flat-ground readability on level 01.

### Implementation
- All compiled levels currently point at [forest_tiles.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/tilesets/forest_tiles.png), but the accepted grounding fix was sprite-side, not level-side.
- The runtime PNGs were edited directly:
  - [crow1-64px-fixed.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png)
  - [crow-walk-64px-fixed.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png)
  - [owl-runtime-64.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/npcs/owl-runtime-64.png)
  - [cockroach.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/npcs/cockroach.png)
- The change removed detached low-alpha bottom junk and strengthened the actual contact patch inside the sprite images. No level geometry, collision, tile placement, or actor positioning changed.

### Quality
- The grounded read is materially stronger after the sprite contact edits, especially for the owl and the crow idle/walk cycle.
- Residual risk: the crow remains a light-footed silhouette by design, so a future art pass could still improve weight further if desired.
- No new console/runtime issues were introduced during the browser pass.

### Recommendation
- Ship this as the clean first real grounding correction.
- If the crow still feels too airy after more playtesting, do a second crow-only art pass, still asset-only.

## Game Design Review

### Core Loop Read
- The crow now reads more planted during the base traversal loop because the contact surface is clearer at rest.
- The fix helps the player trust the ground without changing jump timing or movement feel.

### Player Experience Verdict
- Good change for clarity.
- The experience risk that remains is aesthetic, not mechanical: the crow still has a narrow, airy foot silhouette compared with its body mass.

### Strongest Next Design Change To Test
- If more grounding is needed after playtesting, further tune the crow's lowest contact silhouette in the runtime art rather than changing the movement system.

## Change Summary
- Changed:
  - contact/readability pixels in [crow1-64px-fixed.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png)
  - grounded contact pixels across [crow-walk-64px-fixed.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png)
  - bottom contact cleanup in [owl-runtime-64.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/npcs/owl-runtime-64.png)
  - bottom contact cleanup in [cockroach.png](C:/Users/saemundur/Desktop/Dev%20Projects/Crow/public/assets/sprites/characters/npcs/cockroach.png)
- Did not change:
  - player origin
  - enemy origin
  - body size/offset math
  - collision height
  - camera policy
  - mobile/touch behavior
