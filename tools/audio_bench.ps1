# Start the sound bench at http://localhost:8099/audio, on this machine.
#
#   .\tools\audio_bench.ps1                              # no password, straight in
#   .\tools\audio_bench.ps1 -Password hunter2 -Port 9000  # with the real gate
#
# WHY THIS EXISTS. /audio normally runs on the deployed API, where the samples
# were copied into the image and takes do not exist. While you are CHOOSING
# between takes, you want it pointed at this working copy instead: the samples
# you are about to replace, and the takes `audio:gen` just downloaded. That is
# five environment variables and one long command, which is exactly the sort of
# thing nobody should be retyping at eleven at night.
#
# It reads only. Nothing here writes to the game; promoting a take is a separate,
# deliberate command.

[CmdletBinding()]
param(
    # Empty by default: on this machine CROW_ENV is unset, so an empty password
    # means the bench opens straight onto the sounds. Pass anything here to get
    # the real gate instead, which is worth doing once before deploying because
    # it is the only way to see the page behave as the deployed one does.
    [string]$Password = '',
    [int]$Port = 8099,
    # Open the browser once the server answers.
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

function Require-Command($name, $install) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "Missing: $name" -ForegroundColor Red
        Write-Host "  install with:  $install"
        exit 1
    }
}
Require-Command node 'winget install OpenJS.NodeJS.LTS'
Require-Command npm  'winget install OpenJS.NodeJS.LTS'

# The API's own dependencies, which a fresh clone does not have. Checked rather
# than assumed: `npm ci` on every start would add half a minute to a command
# whose whole point is that it is instant.
$serverModules = Join-Path $repo 'server/node_modules'
if (-not (Test-Path $serverModules)) {
    Write-Host 'Installing the API dependencies (first run only)...' -ForegroundColor Cyan
    Push-Location (Join-Path $repo 'server')
    npm ci
    Pop-Location
}

$takes = Join-Path $repo 'output/audio-takes'
$takeCount = 0
if (Test-Path $takes) {
    $takeCount = @(Get-ChildItem $takes -Filter '*-*.mp3' -ErrorAction SilentlyContinue).Count
}

# Point every resolver at THIS working copy. Without these the server looks for
# the layout it has inside the Docker image and finds nothing.
$env:CROW_AUDIO_PASSWORD    = $Password
# Left unset deliberately, and it is what makes an empty password mean "open"
# rather than "off": see config.audio.open. A deployed host always sets it.
$env:CROW_ENV               = ''
$env:CROW_AUDIO_ROOT        = Join-Path $repo 'godot/assets/audio'
$env:CROW_AUDIO_DATA_ROOT   = Join-Path $repo 'godot/data/audio'
$env:CROW_SOUND_DESIGN_DOC  = Join-Path $repo 'brand/SOUND_DESIGN.md'
$env:CROW_AUDIO_TAKES_ROOT  = $takes
# Localhost is plain HTTP, and a Secure cookie is not stored over HTTP — the
# login would appear to succeed and every request after it would be a 401.
$env:CROW_COOKIE_SECURE     = 'false'
# The API refuses to boot without one. Nothing /audio does touches the database.
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgres://unused' }
$env:HOST                   = '127.0.0.1'
$env:PORT                   = "$Port"
if (-not $env:LOG_LEVEL) { $env:LOG_LEVEL = 'warn' }

$url = "http://localhost:$Port/audio"
Write-Host ''
Write-Host "  $url" -ForegroundColor Green
if ($Password -eq '') {
    Write-Host '  password: none - open, because this is not a deployed host'
} else {
    Write-Host "  password: $Password"
}
Write-Host "  takes:    $takeCount waiting in output/audio-takes/"
Write-Host '  Ctrl+C to stop.'
Write-Host ''

if (-not $NoBrowser) {
    # After a moment, so the tab does not open onto a connection refused.
    Start-Job -ScriptBlock {
        param($u)
        Start-Sleep -Seconds 3
        Start-Process $u
    } -ArgumentList $url | Out-Null
}

Push-Location $repo
try {
    npx --prefix server tsx server/src/index.ts
} finally {
    Pop-Location
}
