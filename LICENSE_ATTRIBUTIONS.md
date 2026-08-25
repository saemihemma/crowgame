# License Attributions

Status: Supportive
Authority: Licensing and provenance reference only. Runtime truth still lives in manifests, `godot/scripts/**`, and referenced assets under `godot/assets/**`. Code and data are Apache-2.0 (see `NOTICE`); the assets described here are not.

## Purpose

This document records third-party asset provenance and attribution obligations for the live repo.

What this is:
- a licensing and attribution reference
- a companion to asset cleanup and replacement work

What this is not:
- not the runtime asset contract
- not the canonical source for current asset counts
- not proof that every asset it lists is still shipped

For live asset expectations, use [brand/ASSET_MANIFEST.md](./brand/ASSET_MANIFEST.md).

## Current Guidance

- Treat this file as a provenance ledger, not as a manifest.
- If an asset is replaced, update this file and any related manifest or credits data in the same pass.
- Do not infer current runtime counts from this document. Mutable runtime counts live in [ONBOARDING.md](./ONBOARDING.md).

## Audio Provenance

Sound effects:
- historical sourcing work referenced the "512 Sound Effects (8-bit style)" collection by Juhani Junkala
- license: CC0 / Public Domain
- attribution is not required, but provenance is kept here for transparency

Music:
- live background music attribution is currently associated with CodeManu's "Platformer Game Music Pack"
- license: CC-BY 3.0
- attribution required:

> Music by CodeManu  
> https://opengameart.org/users/codemanu

## Visual Provenance

Tilesets:
- Kenney "Platformer Art Complete Pack"
- license: CC0 / Public Domain

Character sprites:
- Kenney "Animal Pack Redux"
- license: CC0 / Public Domain

## License Summary

CC0:
- can be used without attribution
- this repo still records provenance for transparency

CC-BY:
- requires attribution when shipped
- replacement work should preserve or update attribution obligations explicitly

## Update Checklist

When asset provenance changes:

1. Update this document.
2. Update any runtime manifest or credits file that references the asset.
3. Run `npm run validate:assets`.
4. If the asset moved out of the live tree, also update [brand/ASSET_MANIFEST.md](./brand/ASSET_MANIFEST.md) as needed. There is no archive tree: material that leaves the live tree is deleted, and git history is the record.
