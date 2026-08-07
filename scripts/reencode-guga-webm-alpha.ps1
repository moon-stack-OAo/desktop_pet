# reencode-guga-webm-alpha.ps1
# Re-encode guga WebM to VP9 + alpha (yuva420p).
# Source clips are often black-bg yuv420p (no alpha). Pipeline:
#   colorkey near-black -> RGBA PNG sequence -> libvpx-vp9 with alpha track.
# Requires: ffmpeg (libvpx-vp9). Optional: ffprobe for post-check.
# Usage (repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reencode-guga-webm-alpha.ps1
# Env:
#   FFMPEG / FFPROBE
#   GUGA_ALPHA_DRY_RUN=1   only idle.webm
#   GUGA_ALPHA_SIM=0.18 GUGA_ALPHA_BLEND=0.08 GUGA_ALPHA_CRF=30

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
if (-not (Test-Path (Join-Path $Root 'pets\guga'))) {
  throw "pets/guga not found, Root=$Root"
}

function Resolve-Tool([string]$envName, [string]$fallbackName) {
  $fromEnv = [Environment]::GetEnvironmentVariable($envName)
  if ($fromEnv -and (Test-Path -LiteralPath $fromEnv)) { return $fromEnv }
  $cmd = Get-Command $fallbackName -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$Ffmpeg = Resolve-Tool 'FFMPEG' 'ffmpeg'
$Ffprobe = Resolve-Tool 'FFPROBE' 'ffprobe'
if (-not $Ffmpeg) { throw 'ffmpeg not found; install and add to PATH, or set FFMPEG' }
if (-not $Ffprobe) { Write-Warning 'ffprobe not found; skip post encode probe' }

$WebmDir = Join-Path $Root 'pets\guga\large\webm'
$WorkRoot = if ($env:TEMP) {
  Join-Path $env:TEMP 'opencode\guga-reencode'
} else {
  Join-Path $ScriptDir '.guga-reencode'
}
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

$Sim = if ($env:GUGA_ALPHA_SIM) { $env:GUGA_ALPHA_SIM } else { '0.18' }
$Blend = if ($env:GUGA_ALPHA_BLEND) { $env:GUGA_ALPHA_BLEND } else { '0.08' }
$Crf = if ($env:GUGA_ALPHA_CRF) { $env:GUGA_ALPHA_CRF } else { '30' }
$Dry = $env:GUGA_ALPHA_DRY_RUN -eq '1'

$files = @(Get-ChildItem -LiteralPath $WebmDir -Filter '*.webm' | Sort-Object Name)
if ($Dry) {
  $files = @($files | Where-Object { $_.Name -eq 'idle.webm' })
  if (-not $files.Count) { throw 'DRY_RUN requires idle.webm' }
}

Write-Host "Root:   $Root"
Write-Host "ffmpeg: $Ffmpeg"
Write-Host "files:  $($files.Count)  colorkey sim=$Sim blend=$Blend crf=$Crf dry=$Dry"
Write-Host ''

$ok = 0
$fail = 0

foreach ($f in $files) {
  $name = $f.BaseName
  $src = $f.FullName
  $tmpDir = Join-Path $WorkRoot $name
  $frameDir = Join-Path $tmpDir 'frames'
  $outWebm = Join-Path $tmpDir "$name.webm"
  $bak = Join-Path $tmpDir "$name.src.bak.webm"

  Write-Host "=== $name ==="
  try {
    if (Test-Path $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $frameDir | Out-Null

    & $Ffmpeg -hide_banner -loglevel error -y -i $src `
      -vf "colorkey=0x000000:${Sim}:${Blend},format=rgba" `
      (Join-Path $frameDir '%04d.png')
    if ($LASTEXITCODE -ne 0) { throw "colorkey/frames failed exit=$LASTEXITCODE" }

    $frameN = @(Get-ChildItem -LiteralPath $frameDir -Filter '*.png').Count
    if ($frameN -lt 1) { throw 'no frames produced' }

    $fps = '12'
    if ($Ffprobe) {
      $r = & $Ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 $src 2>$null
      if ($r -and ($r -match '^\d+/\d+$' -or $r -match '^\d+(\.\d+)?$')) { $fps = $r.Trim() }
    }

    # auto-alt-ref 0 is required for VP8/VP9 alpha
    & $Ffmpeg -hide_banner -loglevel error -y -framerate $fps -i (Join-Path $frameDir '%04d.png') `
      -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -lag-in-frames 0 `
      -b:v 0 -crf $Crf -an $outWebm
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outWebm)) {
      throw "VP9 alpha encode failed exit=$LASTEXITCODE"
    }

    if ($Ffprobe) {
      $probeOut = & $Ffprobe -v error -select_streams v:0 `
        -show_entries stream=codec_name:stream_tags=alpha_mode `
        -of default=noprint_wrappers=1 $outWebm 2>$null
      $joined = ($probeOut | Out-String)
      if ($joined -notmatch 'alpha_mode\s*=\s*1') {
        Write-Warning "  $name : alpha_mode=1 tag not found"
      }
    }

    $decPng = Join-Path $tmpDir 'alpha-check.png'
    & $Ffmpeg -hide_banner -loglevel error -y -c:v libvpx-vp9 -i $outWebm `
      -pix_fmt rgba -frames:v 1 -update 1 $decPng
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $decPng)) {
      throw 'libvpx-vp9 decode check failed'
    }

    Copy-Item -LiteralPath $src -Destination $bak -Force
    Copy-Item -LiteralPath $outWebm -Destination $src -Force

    $srcKb = [math]::Round((Get-Item $src).Length / 1KB)
    Write-Host "  OK frames=$frameN fps=$fps size=${srcKb}KB"
    $ok++
  }
  catch {
    Write-Host "  FAIL: $($_.Exception.Message)"
    $fail++
  }
}

Write-Host ''
Write-Host "Done: ok=$ok fail=$fail work=$WorkRoot"
if ($fail -gt 0) { exit 1 }
exit 0
