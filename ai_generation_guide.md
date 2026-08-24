# AI Generation Guide

Status: Supportive
Authority: Workflow guidance for asset creation. Runtime truth still lives in live asset references and manifests.
Last verified against code: 2026-03-22

## Purpose

Use this guide when generating new art or audio with AI tools.

This is a workflow guide, not a promise that every tool or legacy asset pipeline in the repo is still active.

## Current Workflow

### Sprites

Preferred path:

1. generate the sprite externally
2. review it manually
3. place the final approved file directly in `godot/assets/**`
4. wire it through a manifest or a registry
5. test it in the game

Optional helper scripts still exist:
- `npm run ai:extract`
- `npm run ai:process`

Treat those as manual helpers, not as a guaranteed production pipeline. They can work from `ai_assets/**` or any other path you choose.

### Audio

Current runtime truth is [godot/data/audio/audio_manifest.json](./godot/data/audio/audio_manifest.json).

Use this path:

1. generate raw audio externally
2. optionally stage raw files in `ai_assets/audio/`
3. prepare final runtime files yourself
4. place the final approved files in `godot/assets/audio/**`
5. update the audio manifest if needed
6. test in game

Notes:
- Crow currently ships music-only manifest entries
- do not assume a dedicated AI audio automation pipeline exists just because older notes mention one

## Quality Bar

Sprites:
- readable at gameplay size
- transparent background
- no muddy edges
- consistent silhouette
- fits the friendly child-first tone

Audio:
- clean, loopable if music
- no clipped peaks
- short and readable if SFX
- verify against the current manifest instead of old pack assumptions

## Avoid

- using archived copy folders as source material
- assuming old sprite-manifest or sprite-post-processing systems are live
- treating staged AI output as shipped runtime content

## Verification

```powershell
npm run validate
npx tsc --noEmit
godot --path godot   # play it
```

Manual checks matter more than automation for asset quality.
