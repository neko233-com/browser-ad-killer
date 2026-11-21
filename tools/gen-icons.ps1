# 开发期工具：生成 16/48/128 扩展图标（蓝色圆角底 + 白色对勾）
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Icon([int]$size) {
  [int]$pad = [Math]::Max(1, [int]($size * 0.06))
  [int]$w = $size - 2 * $pad
  [int]$radius = [int]($size * 0.22)
  [int]$d = $radius * 2

  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $rect = New-Object System.Drawing.Rectangle($pad, $pad, $w, $w)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 47, 111, 237))
  $g.FillPath($brush, $path)

  [float]$tick = [Math]::Max(2, $size * 0.09)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $tick)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $p1 = New-Object System.Drawing.PointF(($size * 0.30), ($size * 0.52))
  $p2 = New-Object System.Drawing.PointF(($size * 0.45), ($size * 0.66))
  $p3 = New-Object System.Drawing.PointF(($size * 0.72), ($size * 0.36))
  $g.DrawLines($pen, [System.Drawing.PointF[]]@($p1, $p2, $p3))

  $bmp.Save((Join-Path $outDir "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

foreach ($s in 16, 48, 128) { New-Icon $s }
Write-Host 'icons generated: 16.png, 48.png, 128.png'
