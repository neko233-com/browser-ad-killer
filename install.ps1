<#
.SYNOPSIS
  Browser Ad Killer 安装（pwsh 7 / Windows PowerShell 5.1 通用，幂等可重复执行）
.DESCRIPTION
  把运行时文件复制到稳定安装目录（默认 %LOCALAPPDATA%\browser-ad-killer\extension）。
  幂等：重复执行不会报错、不重复弹窗；仅首次安装自动打开扩展页，重跑静默刷新文件。
.PARAMETER Browser
  Edge / Chrome / QQ / All（默认）/ None。
.PARAMETER InstallDir
  自定义安装目录。
.PARAMETER Launch
  用 --load-extension 启动检测到的浏览器（仅本次会话生效）。
.PARAMETER OpenPages
  强制打开检测到浏览器的扩展管理页（默认仅首次安装打开）。
.PARAMETER Quiet
  不打印收尾提示。
.PARAMETER ScheduleUpdate
  注册 Windows 计划任务，每天静默执行 update.ps1（幂等：重复执行覆盖同名任务）。
.EXAMPLE
  .\install.ps1
  .\install.ps1 -Browser Edge -Launch
  .\install.ps1 -Browser None
  .\install.ps1 -ScheduleUpdate
#>
[CmdletBinding()]
param(
  [ValidateSet('Edge', 'Chrome', 'QQ', 'All', 'None')]
  [string]$Browser = 'All',
  [string]$InstallDir = '',
  [switch]$Launch,
  [switch]$OpenPages,
  [switch]$Quiet,
  [switch]$ScheduleUpdate
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $InstallDir) {
  $InstallDir = Join-Path $env:LOCALAPPDATA 'browser-ad-killer\extension'
}

# ---------- 前置检查 ----------
if (-not (Test-Path -LiteralPath (Join-Path $root 'manifest.json'))) {
  Write-Host '[BAK] 未在脚本目录找到 manifest.json，请在项目根目录运行 install.ps1' -ForegroundColor Red
  exit 1
}

$firstInstall = -not (Test-Path -LiteralPath (Join-Path $InstallDir 'manifest.json'))

# ---------- 复制运行时文件到稳定目录（幂等：整体刷新覆盖） ----------
$copyItems = @(
  'manifest.json',
  'rulesets\builtin.json',
  'icons',
  'src\background',
  'src\content',
  'src\popup',
  'src\options',
  'src\lib\defaults.js',
  'src\lib\filter-parser.js',
  'src\lib\mirrors.js'
)

if (Test-Path -LiteralPath $InstallDir) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

foreach ($rel in $copyItems) {
  $from = Join-Path $root $rel
  $to = Join-Path $InstallDir $rel
  if (-not (Test-Path -LiteralPath $from)) {
    Write-Host "[BAK] 跳过缺失文件: $rel" -ForegroundColor DarkYellow
    continue
  }
  $parent = Split-Path -LiteralPath $to
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -LiteralPath $from -Destination $to -Recurse -Force
}
if (-not $Quiet) { Write-Host "[BAK] 文件已复制到: $InstallDir" -ForegroundColor Green }

# ---------- 自动更新（Windows 计划任务） ----------
if ($ScheduleUpdate) {
  $toolDir = [System.IO.Path]::GetDirectoryName($InstallDir)
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
  # 任务跑安装目录旁的副本，项目目录被移动/删除也不影响
  $updater = Join-Path $toolDir 'update.ps1'
  Copy-Item -LiteralPath (Join-Path $root 'update.ps1') -Destination $updater -Force

  $shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $shell) { $shell = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source }
  if (-not $shell) { $shell = 'powershell.exe' }

  $taskName = 'Browser Ad Killer Update'
  $taskCmd = '"{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" -Quiet' -f $shell, $updater
  & schtasks.exe /create /tn $taskName /tr $taskCmd /sc daily /st 12:00 /f 2>&1 | Out-String | Write-Verbose
  if ($LASTEXITCODE -eq 0) {
    if (-not $Quiet) {
      Write-Host "[BAK] 已注册每日自动更新任务「$taskName」（12:00，静默）" -ForegroundColor Green
      Write-Host "      查看: schtasks /query /tn `"$taskName`""
      Write-Host "      删除: schtasks /delete /tn `"$taskName`" /f"
    }
  } else {
    Write-Host "[BAK] 计划任务注册失败（可手动以当前用户身份重跑 -ScheduleUpdate）" -ForegroundColor DarkYellow
  }
}

# ---------- 浏览器探测 ----------
function Find-BrowserExe {
  param([string]$Name)
  $pfX86 = ${env:ProgramFiles(x86)}
  $map = @{
    Edge = @(
      (Join-Path $pfX86 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
    )
    Chrome = @(
      (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $pfX86 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    QQ = @(
      (Join-Path $env:ProgramFiles 'Tencent\QQBrowser\QQBrowser.exe'),
      (Join-Path $pfX86 'Tencent\QQBrowser\QQBrowser.exe'),
      (Join-Path $env:LOCALAPPDATA 'Tencent\QQBrowser\QQBrowser.exe')
    )
  }
  foreach ($c in $map[$Name]) {
    if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c }
  }
  return $null
}

$extUrl = @{
  Edge = 'edge://extensions'
  Chrome = 'chrome://extensions'
  QQ = 'qqbrowser://extensions'
}

$targets = @()
if ($Browser -eq 'All' -or $Browser -eq 'None') { $targets = @('Edge', 'Chrome', 'QQ') }
else { $targets = @($Browser) }

foreach ($b in $targets) {
  if ($Browser -eq 'None') { continue }
  $exe = Find-BrowserExe $b
  if ($Launch -and $exe) {
    if (-not $Quiet) { Write-Host "[BAK] 以 --load-extension 启动 $b ..." -ForegroundColor Cyan }
    Start-Process -FilePath $exe -ArgumentList "--load-extension=`"$InstallDir`"", '--no-first-run'
  } elseif ($OpenPages -or $firstInstall) {
    if ($exe) {
      if (-not $Quiet) { Write-Host "[BAK] 打开 $b 扩展管理页: $($extUrl[$b])" -ForegroundColor Cyan }
      Start-Process -FilePath $exe -ArgumentList $extUrl[$b]
    } else {
      if (-not $Quiet) { Write-Host "[BAK] 未检测到 $b，手动打开 $($extUrl[$b]) 即可" -ForegroundColor DarkYellow }
    }
  }
}

if (-not $Quiet) {
  Write-Host ''
  Write-Host '========== 安装目录 ==========' -ForegroundColor Green
  Write-Host $InstallDir
  Write-Host '========== 接下来 ==========' -ForegroundColor Green
  Write-Host '1. 在扩展管理页打开「开发者模式」'
  Write-Host '2. 点「加载已解压的扩展程序」，选择上面的安装目录（不要选压缩包/子文件夹）'
  Write-Host '3. 夸克需先在 设置→夸克实验室 开启「扩展支持」；QQ 浏览器拖 crx 失败时改用解压目录加载'
  Write-Host '提示：-Launch 仅本次会话加载；长期使用请按上面第 2 步在开发者模式加载一次。'
}
