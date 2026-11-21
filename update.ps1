<#
.SYNOPSIS
  Browser Ad Killer 自动更新（pwsh 7 / PowerShell 5.1，幂等可重复执行）
.DESCRIPTION
  通过镜像链检查 GitHub 远程版本：已是最新则 no-op；有新版才下载整仓 zip 并刷新安装目录。
  所有镜像不可达时仅告警退出，不破坏现有安装。
.PARAMETER InstallDir
  安装目录（默认 %LOCALAPPDATA%\browser-ad-killer\extension）。
.PARAMETER Force
  强制重新安装（忽略版本对比）。
.PARAMETER Quiet
  静默。
.EXAMPLE
  .\update.ps1
  .\update.ps1 -Force
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
if (-not $InstallDir) {
  $InstallDir = Join-Path $env:LOCALAPPDATA 'browser-ad-killer\extension'
}

# 与 src/lib/mirrors.js 保持一致的镜像顺序
$remoteManifestUrls = @(
  'https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json',
  'https://cdn.jsdelivr.net/gh/neko233-com/browser-ad-killer@main/manifest.json',
  'https://ghproxy.net/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json',
  'https://ghfast.top/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json'
)
$codeloadMirrors = @(
  'https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main',
  'https://ghproxy.net/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main',
  'https://ghfast.top/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main'
)

function Read-ManifestVersion($path) {
  if (-not (Test-Path -LiteralPath $path)) { return '0.0.0' }
  try { return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).version } catch { return '0.0.0' }
}

function Compare-Ver($a, $b) {
  $pa = $a.Split('.') | ForEach-Object { $n = $_ -replace '\D', ''; if ([string]::IsNullOrEmpty($n)) { 0 } else { [int]$n } }
  $pb = $b.Split('.') | ForEach-Object { $n = $_ -replace '\D', ''; if ([string]::IsNullOrEmpty($n)) { 0 } else { [int]$n } }
  $len = [Math]::Max($pa.Count, $pb.Count)
  for ($i = 0; $i -lt $len; $i++) {
    $x = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $y = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($x -gt $y) { return 1 }
    if ($x -lt $y) { return -1 }
  }
  return 0
}

# ---------- 本地版本 ----------
$localVer = Read-ManifestVersion (Join-Path $InstallDir 'manifest.json')

# ---------- 远程版本（镜像链逐个尝试） ----------
$remoteVer = $null
foreach ($u in $remoteManifestUrls) {
  try {
    $json = & curl.exe -fsSL --max-time 8 $u 2>$null
    if ($json) { $remoteVer = ($json | ConvertFrom-Json).version; if ($remoteVer) { break } }
  } catch {}
}

if (-not $Force -and $remoteVer -and (Compare-Ver $remoteVer $localVer) -le 0) {
  if (-not $Quiet) { Write-Host "[BAK] 已是最新 v$localVer，无需更新" -ForegroundColor Green }
  return
}

# ---------- 下载整仓 zip（镜像链） ----------
$tmp = Join-Path $env:TEMP ('bak-update-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'repo.zip'
$downloaded = $false
foreach ($m in $codeloadMirrors) {
  try {
    & curl.exe -fsSL --max-time 30 -o $zip $m 2>$null
    if ((Test-Path $zip) -and ((Get-Item $zip).Length -gt 1000)) { $downloaded = $true; break }
  } catch {}
}

if (-not $downloaded) {
  if (-not $Quiet) { Write-Host '[BAK] 所有镜像均不可达，跳过更新（可 git pull 或稍后重试）' -ForegroundColor DarkYellow }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  return
}

# ---------- 解压并定位源码根 ----------
$extract = Join-Path $tmp 'x'
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
$srcRoot = (Get-ChildItem -LiteralPath $extract -Recurse -Filter manifest.json -Depth 2 | Select-Object -First 1).Directory.FullName
if (-not $srcRoot) {
  if (-not $Quiet) { Write-Host '[BAK] 压缩包结构异常，跳过更新' -ForegroundColor DarkYellow }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  return
}

# ---------- 刷新安装目录 ----------
$copyItems = @(
  'manifest.json', 'rulesets\builtin.json', 'icons',
  'src\background', 'src\content', 'src\popup', 'src\options',
  'src\lib\defaults.js', 'src\lib\filter-parser.js', 'src\lib\mirrors.js'
)
if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($rel in $copyItems) {
  $from = Join-Path $srcRoot $rel
  $to = Join-Path $InstallDir $rel
  if (-not (Test-Path -LiteralPath $from)) { continue }
  $parent = Split-Path -LiteralPath $to
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -LiteralPath $from -Destination $to -Recurse -Force
}
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

if (-not $Quiet) {
  $newVer = Read-ManifestVersion (Join-Path $InstallDir 'manifest.json')
  Write-Host "[BAK] 更新完成 v$localVer -> v$newVer（刷新扩展页即可生效）" -ForegroundColor Green
}
