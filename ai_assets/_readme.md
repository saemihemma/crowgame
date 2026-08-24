# AI Assets Staging

Status: Supportive
Authority: Workflow note for staging only. Nothing in this folder is runtime truth by itself.
Last verified against code: 2026-03-22

## Purpose

`ai_assets/` is a staging area for raw AI-generated material.

Current intended use:
- raw audio holding area
- scratch notes during asset generation
- optional input location for manual sprite helper commands

Current non-use:
- not a live asset folder
- not the place to wire shipped sprites from
- not proof that an automation pipeline exists

## Practical Rule

If the game should actually use an asset, put the final approved file in `godot/assets/**` and wire it through a live runtime reference.

## Current Workflow

Sprites:
- generate externally
- review manually
- place the final approved sprite directly in `godot/assets/**`
- if helpful, manual helper commands can read source material from `ai_assets/**`, but the final live asset still belongs in `godot/assets/**`

Audio:
- stage raw files here if helpful
- prepare final runtime files yourself
- move approved output to `godot/assets/audio/**`
- update `godot/data/audio/audio_manifest.json` if needed

## Archive Reminder

Older asset copies, dead pipelines, and historical experiments now live under `archived/**`.
