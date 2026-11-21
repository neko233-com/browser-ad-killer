// 生成 Edge 商店提交素材：300x300 商店 logo、1280x800 截图、440x280 促销图
// 用法: node tools/store-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store');
mkdirSync(out, { recursive: true });

const ps = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$Root = '__ROOT__'
$Out = '__OUT__'
function Save-Png($bmp, $path) { $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }
function Load($p) { [System.Drawing.Image]::FromFile($p) }

$side = 300
$bmp = New-Object System.Drawing.Bitmap($side, $side)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'
$rect = New-Object System.Drawing.Rectangle(0, 0, $side, $side)
$c1 = [System.Drawing.Color]::FromArgb(255, 17, 24, 39)
$c2 = [System.Drawing.Color]::FromArgb(255, 31, 61, 122)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
$g.FillRectangle($brush, $rect)
$brush.Dispose()
$glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 88, 166, 255))
$g.FillEllipse($glow, -40, 120, 380, 380)
$glow.Dispose()
$icon = Load (Join-Path $Root 'icons/128.png')
$g.DrawImage($icon, 62, 62, 176, 176)
$icon.Dispose()
$g.Dispose()
Save-Png $bmp (Join-Path $Out 'logo-300.png')

function MakeShot($src, $dst, $topRatio) {
  $img = Load $src
  $w = 1280
  $h = [int]($img.Height * ($w / $img.Width))
  $tmp = New-Object System.Drawing.Bitmap($w, $h)
  $g2 = [System.Drawing.Graphics]::FromImage($tmp)
  $g2.InterpolationMode = 'HighQualityBicubic'
  $g2.PixelOffsetMode = 'HighQuality'
  $g2.SmoothingMode = 'AntiAlias'
  $g2.DrawImage($img, 0, 0, $w, $h)
  $g2.Dispose(); $img.Dispose()
  $y = [int](($h - 800) * $topRatio)
  if ($y -lt 0) { $y = 0 }
  $crop = New-Object System.Drawing.Bitmap(1280, 800)
  $g3 = [System.Drawing.Graphics]::FromImage($crop)
  $g3.DrawImage($tmp, (New-Object System.Drawing.Rectangle(0, 0, 1280, 800)), (New-Object System.Drawing.Rectangle(0, $y, 1280, 800)), 'Pixel')
  $g3.Dispose(); $tmp.Dispose()
  Save-Png $crop $dst
}

MakeShot (Join-Path $Root 'dist/baidu-search.png')  (Join-Path $Out 'screenshot-1-search.png') 0.06
MakeShot (Join-Path $Root 'dist/baidu-home.png')    (Join-Path $Out 'screenshot-2-home.png')   0.0
MakeShot (Join-Path $Root 'dist/baidu-search2.png') (Join-Path $Out 'screenshot-3-search.png') 0.30

$tw = 440; $th = 280
$tile = New-Object System.Drawing.Bitmap($tw, $th)
$tg = [System.Drawing.Graphics]::FromImage($tile)
$tg.SmoothingMode = 'AntiAlias'
$tg.InterpolationMode = 'HighQualityBicubic'
$t1 = [System.Drawing.Color]::FromArgb(255, 13, 20, 33)
$t2 = [System.Drawing.Color]::FromArgb(255, 35, 62, 120)
$tbr = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Rectangle(0,0,$tw,$th)), $t1, $t2, 30)
$tg.FillRectangle($tbr, 0, 0, $tw, $th)
$tbr.Dispose()
$tIcon = Load (Join-Path $Root 'icons/128.png')
$tg.DrawImage($tIcon, 28, 84, 112, 112)
$tIcon.Dispose()
$fontBig = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Regular)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$gray = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 173, 186, 204))
$tg.DrawString('Browser Ad Killer', $fontBig, $white, 156, 84)
$tg.DrawString('Ads & trackers blocked', $fontSmall, $gray, 158, 130)
$tg.DrawString('Search results cleaned', $fontSmall, $gray, 158, 152)
$tg.DrawString('No telemetry, no account', $fontSmall, $gray, 158, 174)
$tg.Dispose()
Save-Png $tile (Join-Path $Out 'small-tile-440x280.png')

Write-Host 'assets done'
`.replace('__ROOT__', root).replace('__OUT__', out);

const tmp = join(root, 'dist', '_assets.ps1');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(tmp, ps, 'utf8');
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { stdio: 'inherit' });
