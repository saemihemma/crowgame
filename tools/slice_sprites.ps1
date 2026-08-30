Add-Type -AssemblyName System.Drawing

$BrainDir = "C:\Users\saemundur\.gemini\antigravity\brain\0d1e6856-d169-423e-9807-e4ec208ee2d1"

function Process-SpriteSheet {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [int]$TargetFrameW,
        [int]$TargetFrameH,
        [int]$Rows,
        [int]$Cols,
        [int]$WhiteThreshold = 235,
        [bool]$AnchorBottom = $true,
        [int]$IgnoreTopPx = 0,
        [int]$IgnoreBottomPx = 0
    )

    $src = [System.Drawing.Bitmap]::FromFile($InputFile)
    $srcW = $src.Width
    $srcH = $src.Height
    $cellW = [Math]::Floor($srcW / $Cols)
    $cellH = [Math]::Floor($srcH / $Rows)

    $totalFrames = $Rows * $Cols
    $outW = $TargetFrameW * $totalFrames
    $outH = $TargetFrameH

    $dest = [System.Drawing.Bitmap]::new($outW, $outH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gDest = [System.Drawing.Graphics]::FromImage($dest)
    $gDest.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $gDest.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $gDest.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    $frameIdx = 0
    for ($r = 0; $r -lt $Rows; $r++) {
        for ($c = 0; $c -lt $Cols; $c++) {
            $srcX = $c * $cellW
            $srcY = $r * $cellH

            # Find bounding box of content inside cell (ignoring near-white and margin ignores)
            $minX = $cellW; $maxX = 0; $minY = $cellH; $maxY = 0
            $hasPixels = $false

            $startY = $IgnoreTopPx
            $endY = $cellH - $IgnoreBottomPx

            for ($y = $startY; $y -lt $endY; $y++) {
                for ($x = 0; $x -lt $cellW; $x++) {
                    $px = $src.GetPixel($srcX + $x, $srcY + $y)
                    if ($px.R -lt $WhiteThreshold -or $px.G -lt $WhiteThreshold -or $px.B -lt $WhiteThreshold) {
                        # Avoid pure gray/white shadow pixels if desired
                        if ($px.R -gt 210 -and $px.G -gt 210 -and $px.B -gt 210) { continue }
                        $hasPixels = $true
                        if ($x -lt $minX) { $minX = $x }
                        if ($x -gt $maxX) { $maxX = $x }
                        if ($y -lt $minY) { $minY = $y }
                        if ($y -gt $maxY) { $maxY = $y }
                    }
                }
            }

            if ($hasPixels) {
                $cropW = ($maxX - $minX) + 1
                $cropH = ($maxY - $minY) + 1

                # Create transparent cropped cell
                $cellBmp = [System.Drawing.Bitmap]::new($cropW, $cropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                for ($y = 0; $y -lt $cropH; $y++) {
                    for ($x = 0; $x -lt $cropW; $x++) {
                        $px = $src.GetPixel($srcX + $minX + $x, $srcY + $minY + $y)
                        if ($px.R -ge $WhiteThreshold -and $px.G -ge $WhiteThreshold -and $px.B -ge $WhiteThreshold) {
                            $cellBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                        } elseif ($px.R -gt 210 -and $px.G -gt 210 -and $px.B -gt 210) {
                            $cellBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                        } else {
                            $cellBmp.SetPixel($x, $y, $px)
                        }
                    }
                }

                # Compute scale to fit inside TargetFrame leaving 2px margin
                $maxH = $TargetFrameH - 4
                $maxW = $TargetFrameW - 4
                $scale = [Math]::Min([double]$maxW / $cropW, [double]$maxH / $cropH)
                if ($scale -gt 1.0) { $scale = 1.0 }
                $drawW = [int][Math]::Round($cropW * $scale)
                $drawH = [int][Math]::Round($cropH * $scale)

                $destX = ($frameIdx * $TargetFrameW) + [int][Math]::Round(($TargetFrameW - $drawW) / 2)
                $destY = if ($AnchorBottom) { ($TargetFrameH - $drawH) } else { [int][Math]::Round(($TargetFrameH - $drawH) / 2) }

                $gDest.DrawImage($cellBmp, $destX, $destY, $drawW, $drawH)
                $cellBmp.Dispose()
            }
            $frameIdx++
        }
    }

    $destDir = [System.IO.Path]::GetDirectoryName($OutputFile)
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

    $dest.Save($OutputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $gDest.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Host "Processed -> $OutputFile"
}

# 1. Cockroach Walk Cycle (4 frames, ignore bottom 60px where numbers were)
Process-SpriteSheet -InputFile "$BrainDir\cockroach_walk_gen_1788133174620.jpg" `
    -OutputFile "godot\assets\sprites\characters\npcs\cockroach-walk-64.png" `
    -TargetFrameW 64 -TargetFrameH 64 -Rows 2 -Cols 2 -WhiteThreshold 240 -AnchorBottom $true -IgnoreBottomPx 55

# 2. Heavy-Chained Owl (1 frame)
Process-SpriteSheet -InputFile "$BrainDir\owl_heavy_gen_1788133186147.jpg" `
    -OutputFile "godot\assets\sprites\characters\npcs\owl-heavy-64.png" `
    -TargetFrameW 64 -TargetFrameH 64 -Rows 1 -Cols 1 -WhiteThreshold 235 -AnchorBottom $true -IgnoreBottomPx 45

# 3. Hörmann Jump Animation (4 frames)
Process-SpriteSheet -InputFile "$BrainDir\crow_jump_gen_1788133203069.jpg" `
    -OutputFile "godot\assets\sprites\characters\crow2\crow3\crow-jump-64px.png" `
    -TargetFrameW 64 -TargetFrameH 64 -Rows 2 -Cols 2 -WhiteThreshold 240 -AnchorBottom $false

# 4. Poison Spitter Beetle (1 frame)
Process-SpriteSheet -InputFile "$BrainDir\spitter_beetle_gen_1788133215010.jpg" `
    -OutputFile "godot\assets\sprites\characters\npcs\spitter-beetle-64.png" `
    -TargetFrameW 64 -TargetFrameH 64 -Rows 1 -Cols 1 -WhiteThreshold 240 -AnchorBottom $true -IgnoreBottomPx 20

# 5. Poison Spit Hazard (4 frames: 1 flying blob, 3 bubbling puddles)
Process-SpriteSheet -InputFile "$BrainDir\poison_spit_gen_1788133225289.jpg" `
    -OutputFile "godot\assets\sprites\objects\hazards\poison-spit-32.png" `
    -TargetFrameW 32 -TargetFrameH 32 -Rows 4 -Cols 4 -WhiteThreshold 235 -AnchorBottom $true -IgnoreTopPx 100

Write-Host "All sprite sheets successfully generated and saved!"
