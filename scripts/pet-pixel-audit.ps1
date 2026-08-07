# pet-pixel-audit.ps1 — 12 宠资源/尺寸/行填充/guga clips 审计（可复跑）
# 依赖：ImageMagick `magick`（identify/crop/resize）；guga 仅检查 webm 路径是否存在（可选 ffmpeg 不强制）
# 用法（仓库根）：npm run audit:pets
# 或：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pet-pixel-audit.ps1

$ErrorActionPreference = 'Continue'

# 由脚本位置推算 monorepo 根（…/scripts → 上一级）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
if (-not (Test-Path (Join-Path $Root 'pets'))) {
  $fallback = 'D:\Moon\tools\desktop_pet'
  if (Test-Path (Join-Path $fallback 'pets')) { $Root = $fallback }
}

# 默认输出到 TEMP 或 scripts/.audit-out（gitignore 友好，勿提交大图）
$OutDir = if ($env:TEMP) {
  Join-Path $env:TEMP 'opencode\pet-audit'
} else {
  Join-Path $ScriptDir '.audit-out'
}
$JsonOut = Join-Path $OutDir 'pet-pixel-audit.json'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Get-ImageSize([string]$path) {
  $info = & magick identify -format '%w %h' $path 2>$null
  if ($info -match '(\d+)\s+(\d+)') {
    return @{ W = [int]$Matches[1]; H = [int]$Matches[2] }
  }
  return $null
}

function Get-CellMeanA([string]$sheet, [int]$cellW, [int]$cellH, [int]$col, [int]$row) {
  $x = $col * $cellW
  $y = $row * $cellH
  $out = & magick $sheet -alpha set -crop "${cellW}x${cellH}+${x}+${y}" +repage -format '%[fx:mean.a]' info: 2>$null
  if (-not $out) { return $null }
  return [double]$out.Trim()
}

function Get-TopHex([string]$imgPath) {
  # 可选主色：缩略后 unique-colors，取前几非透明色
  $txt = & magick $imgPath -alpha set -resize 48x48 -colors 16 -unique-colors txt: 2>$null
  if (-not $txt) { return @() }
  $hexes = @()
  foreach ($line in ($txt -split "`n")) {
    if ($line -match '#([0-9A-Fa-f]{6,8})') {
      $h = $Matches[1]
      $hex = '#' + $h.Substring(0, 6).ToLower()
      $a = 255
      if ($h.Length -ge 8) { $a = [Convert]::ToInt32($h.Substring(6, 2), 16) }
      if ($a -lt 80) { continue }
      if ($hex -eq '#ffffff' -or $hex -eq '#000000') { continue }
      if ($hexes -notcontains $hex) { $hexes += $hex }
      if ($hexes.Count -ge 5) { break }
    }
  }
  return $hexes
}

$atlasIds = @('doro', 'elaina', 'homie', 'linnea', 'mambo', 'naruto', 'nezuko', 'phoebe', 'skirk', 'taffy', 'wukong')
$results = @()

Write-Host "Root: $Root"
Write-Host "Out:  $OutDir"
Write-Host ''
Write-Host ('{0,-10} {1,-8} {2,-14} {3,-12} {4,-20} {5}' -f 'id', 'verdict', 'size', 'emptyRows', 'fps s/h/w', 'notes')
Write-Host ('-' * 90)

foreach ($id in $atlasIds) {
  $petPath = Join-Path $Root "pets\$id\pet.json"
  $notes = @()
  $verdict = 'OK'

  if (-not (Test-Path $petPath)) {
    $results += [pscustomobject]@{ id = $id; verdict = 'FAIL'; notes = @('missing pet.json') }
    Write-Host ('{0,-10} {1,-8} {2}' -f $id, 'FAIL', 'missing pet.json')
    continue
  }

  $pet = Get-Content $petPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $imgName = $pet.atlas.image
  $sheet = Join-Path $Root "pets\$id\$imgName"
  $cellW = [int]$pet.atlas.cellW
  $cellH = [int]$pet.atlas.cellH
  $cols = [int]$pet.atlas.cols
  $rows = [int]$pet.atlas.rows
  $expW = $cols * $cellW
  $expH = $rows * $cellH

  $sizeStr = 'N/A'
  $sizeOk = $false
  if (-not (Test-Path $sheet)) {
    $notes += 'MISSING_SHEET'
    $verdict = 'FAIL'
  } else {
    $size = Get-ImageSize $sheet
    if ($size) {
      $sizeStr = "$($size.W)x$($size.H)"
      $sizeOk = ($size.W -eq $expW) -and ($size.H -eq $expH)
      if (-not $sizeOk) {
        $notes += "SIZE exp=${expW}x${expH} act=$sizeStr"
        $verdict = 'FAIL'
      }
    } else {
      $notes += 'IDENTIFY_FAIL'
      $verdict = 'FAIL'
    }
  }

  $emptyRows = @()
  $rowFill = @()
  if ((Test-Path $sheet) -and $sizeOk) {
    for ($r = 0; $r -lt $rows; $r++) {
      $filled = 0
      for ($c = 0; $c -lt $cols; $c++) {
        $a = Get-CellMeanA $sheet $cellW $cellH $c $r
        if ($null -ne $a -and $a -ge 0.02) { $filled++ }
      }
      $rowFill += [pscustomobject]@{ row = $r; filled = $filled }
      if ($filled -eq 0) { $emptyRows += $r }
    }
    if ($emptyRows.Count -gt 0) {
      $notes += ('EMPTY_ROWS=' + ($emptyRows -join ','))
      if ($verdict -eq 'OK') { $verdict = 'WARN' }
    }
  }

  # sleep / hungry / waiting fps（期望 3 / 5 / 4，同 row6）
  $st = $pet.atlas.states
  $fpsSleep = if ($st.sleep) { [int]$st.sleep.fps } else { -1 }
  $fpsHungry = if ($st.hungry) { [int]$st.hungry.fps } else { -1 }
  $fpsWait = if ($st.waiting) { [int]$st.waiting.fps } else { -1 }
  $rowSleep = if ($st.sleep) { [int]$st.sleep.row } else { -1 }
  $rowHungry = if ($st.hungry) { [int]$st.hungry.row } else { -1 }
  $rowWait = if ($st.waiting) { [int]$st.waiting.row } else { -1 }
  $fpsStr = "$fpsSleep/$fpsHungry/$fpsWait"
  if ($rowSleep -eq $rowHungry -and $rowHungry -eq $rowWait -and $rowSleep -eq 6) {
    # 预期美术债：同 row，仅 fps 区分
    if ($fpsSleep -ne 3 -or $fpsHungry -ne 5 -or $fpsWait -ne 4) {
      $notes += "ROW6_FPS_UNEXPECTED $fpsStr"
      if ($verdict -eq 'OK') { $verdict = 'WARN' }
    }
  } elseif ($rowSleep -ge 0) {
    $notes += "ROW6_SPLIT? s/h/w=$rowSleep/$rowHungry/$rowWait"
  }

  $topColors = @()
  $colorsCfg = $null
  if ($pet.colors) {
    $colorsCfg = @{
      body   = [string]$pet.colors.body
      accent = [string]$pet.colors.accent
      cheek  = [string]$pet.colors.cheek
    }
  }
  if ((Test-Path $sheet) -and $sizeOk) {
    $thumb = Join-Path $OutDir "$id-idle.png"
    & magick $sheet -alpha set -crop "${cellW}x${cellH}+0+0" +repage -resize 96x96 $thumb 2>$null | Out-Null
    if (Test-Path $thumb) { $topColors = @(Get-TopHex $thumb) }
  }

  $entry = [pscustomobject]@{
    id         = $id
    renderer   = 'atlas'
    sheet      = $imgName
    size       = $sizeStr
    expected   = "${expW}x${expH}"
    sizeOk     = $sizeOk
    emptyRows  = $emptyRows
    rowFill    = $rowFill
    row6       = @{ sleep = $rowSleep; hungry = $rowHungry; waiting = $rowWait; fps = $fpsStr }
    colors     = $colorsCfg
    topColors  = $topColors
    verdict    = $verdict
    notes      = $notes
  }
  $results += $entry

  $emptyStr = if ($emptyRows.Count) { ($emptyRows -join ',') } else { '-' }
  $noteStr = if ($notes.Count) { ($notes -join '; ') } else { '-' }
  Write-Host ('{0,-10} {1,-8} {2,-14} {3,-12} {4,-20} {5}' -f $id, $verdict, $sizeStr, $emptyStr, $fpsStr, $noteStr)
}

# guga video clips
Write-Host ''
Write-Host '=== GUGA (video) ==='
$gugaPath = Join-Path $Root 'pets\guga\pet.json'
if (Test-Path $gugaPath) {
  $guga = Get-Content $gugaPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $clipNotes = @()
  $missing = @()
  $clipCount = 0
  # clips 可能在 video.clips / states / animations 等；尽量宽松枚举字符串路径
  $jsonRaw = Get-Content $gugaPath -Raw -Encoding UTF8
  $paths = [regex]::Matches($jsonRaw, '"([^"]+\.webm)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
  foreach ($rel in $paths) {
    $clipCount++
    $full = Join-Path $Root "pets\guga\$rel"
    if (-not (Test-Path $full)) {
      $missing += $rel
      $clipNotes += "MISSING:$rel"
    }
  }
  $gVerdict = if ($missing.Count) { 'FAIL' } elseif ($clipCount -eq 0) { 'WARN' } else { 'OK' }
  if ($clipCount -eq 0) { $clipNotes += 'no .webm paths in pet.json' }
  $results += [pscustomobject]@{
    id        = 'guga'
    renderer  = 'video'
    clipCount = $clipCount
    missing   = $missing
    verdict   = $gVerdict
    notes     = $clipNotes
  }
  Write-Host ("guga clips=$clipCount missing=$($missing.Count) verdict=$gVerdict")
  if ($missing.Count) { $missing | ForEach-Object { Write-Host "  - $_" } }
} else {
  Write-Host 'guga pet.json missing'
  $results += [pscustomobject]@{ id = 'guga'; verdict = 'FAIL'; notes = @('missing pet.json') }
}

$results | ConvertTo-Json -Depth 8 | Set-Content -Path $JsonOut -Encoding UTF8
Write-Host ''
Write-Host "JSON: $JsonOut"
$failN = @($results | Where-Object { $_.verdict -eq 'FAIL' }).Count
$warnN = @($results | Where-Object { $_.verdict -eq 'WARN' }).Count
Write-Host "Summary: total=$($results.Count) fail=$failN warn=$warnN"
if ($failN -gt 0) { exit 1 }
exit 0
