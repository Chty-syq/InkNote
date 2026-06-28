$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $repoRoot "apps\desktop\src-tauri\icons"
[System.IO.Directory]::CreateDirectory($iconDir) | Out-Null

function New-IconColor {
    param(
        [Parameter(Mandatory = $true)][string]$Hex,
        [int]$Alpha = 255
    )

    $value = $Hex.TrimStart("#")
    return [System.Drawing.Color]::FromArgb(
        $Alpha,
        [Convert]::ToInt32($value.Substring(0, 2), 16),
        [Convert]::ToInt32($value.Substring(2, 2), 16),
        [Convert]::ToInt32($value.Substring(4, 2), 16)
    )
}

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Fill-RoundedRectangle {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Drawing.Brush]$Brush,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = New-RoundedRectanglePath $X $Y $Width $Height $Radius
    $Graphics.FillPath($Brush, $path)
    $path.Dispose()
}

function Draw-RoundedRectangle {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Drawing.Pen]$Pen,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = New-RoundedRectanglePath $X $Y $Width $Height $Radius
    $Graphics.DrawPath($Pen, $path)
    $path.Dispose()
}

function Save-ResizedPng {
    param(
        [System.Drawing.Bitmap]$Source,
        [int]$Size,
        [string]$Path
    )

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($Source, 0, 0, $Size, $Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

function Get-ResizedPngBytes {
    param(
        [System.Drawing.Bitmap]$Source,
        [int]$Size
    )

    $tempPath = [System.IO.Path]::GetTempFileName()
    Save-ResizedPng $Source $Size $tempPath
    [byte[]]$bytes = [System.IO.File]::ReadAllBytes($tempPath)
    [System.IO.File]::Delete($tempPath)
    return ,$bytes
}

function Write-Ico {
    param(
        [System.Drawing.Bitmap]$Source,
        [string]$Path
    )

    $sizes = @(16, 32, 48, 64, 128, 256)
    $entries = @()
    foreach ($size in $sizes) {
        $entries += [PSCustomObject]@{
            Size = $size
            Data = Get-ResizedPngBytes $Source $size
        }
    }

    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    $writer = [System.IO.BinaryWriter]::new($stream)
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)

    $offset = 6 + (16 * $entries.Count)
    foreach ($entry in $entries) {
        $writer.Write([byte]($(if ($entry.Size -eq 256) { 0 } else { $entry.Size })))
        $writer.Write([byte]($(if ($entry.Size -eq 256) { 0 } else { $entry.Size })))
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$entry.Data.Length)
        $writer.Write([UInt32]$offset)
        $offset += $entry.Data.Length
    }

    foreach ($entry in $entries) {
        $writer.Write($entry.Data)
    }

    $writer.Dispose()
    $stream.Dispose()
}

$canvasSize = 1024
$source = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($source)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

# Soft colored shadow.
for ($i = 22; $i -ge 1; $i--) {
    $alpha = [Math]::Max(2, [int](22 - $i / 1.3))
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha, 24, 34, 54))
    Fill-RoundedRectangle $graphics $shadowBrush (110 + $i) (118 + $i) (804 - $i * 2) (804 - $i * 2) 190
    $shadowBrush.Dispose()
}

$backRect = [System.Drawing.RectangleF]::new(118, 96, 788, 788)
$backBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $backRect,
    (New-IconColor "#2563EB"),
    (New-IconColor "#11B981"),
    135.0
)
Fill-RoundedRectangle $graphics $backBrush 118 96 788 788 188
$backBrush.Dispose()

# Warm and violet highlights make the icon less monotone.
$highlightA = [System.Drawing.SolidBrush]::new((New-IconColor "#FDE68A" 70))
$graphics.FillEllipse($highlightA, 560, 106, 290, 290)
$highlightA.Dispose()
$highlightB = [System.Drawing.SolidBrush]::new((New-IconColor "#EC4899" 72))
$graphics.FillEllipse($highlightB, 100, 550, 360, 310)
$highlightB.Dispose()
$shinePen = [System.Drawing.Pen]::new((New-IconColor "#FFFFFF" 65), 8)
$graphics.DrawArc($shinePen, 230, 182, 540, 500, 205, 92)
$shinePen.Dispose()

# Notebook drop shadow.
for ($i = 18; $i -ge 1; $i--) {
    $alpha = [Math]::Max(2, [int](30 - $i))
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha, 10, 20, 38))
    Fill-RoundedRectangle $graphics $shadowBrush (255 + $i) (184 + $i) 530 660 56
    $shadowBrush.Dispose()
}

$paperBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(236, 170, 530, 660),
    (New-IconColor "#FFF8E7"),
    (New-IconColor "#FFE9C7"),
    90.0
)
Fill-RoundedRectangle $graphics $paperBrush 236 170 530 660 56
$paperBrush.Dispose()

$paperStroke = [System.Drawing.Pen]::new((New-IconColor "#F5D49C" 190), 6)
Draw-RoundedRectangle $graphics $paperStroke 236 170 530 660 56
$paperStroke.Dispose()

# Colorful notebook spine.
$spineBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(236, 170, 116, 660),
    (New-IconColor "#FF6B6B"),
    (New-IconColor "#F59E0B"),
    90.0
)
Fill-RoundedRectangle $graphics $spineBrush 236 170 128 660 56
$spineBrush.Dispose()
$spineCover = [System.Drawing.SolidBrush]::new((New-IconColor "#FFF8E7"))
$graphics.FillRectangle($spineCover, 318, 170, 60, 660)
$spineCover.Dispose()

# Spiral rings.
$ringPen = [System.Drawing.Pen]::new((New-IconColor "#FFFFFF" 215), 12)
$ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
for ($y = 252; $y -le 738; $y += 82) {
    $graphics.DrawArc($ringPen, 287, $y - 22, 78, 44, 90, 180)
}
$ringPen.Dispose()

# Page title chips and ruled lines.
$tabColors = @("#38BDF8", "#A78BFA", "#F472B6", "#FBBF24")
for ($i = 0; $i -lt $tabColors.Count; $i++) {
    $tabBrush = [System.Drawing.SolidBrush]::new((New-IconColor $tabColors[$i]))
    Fill-RoundedRectangle $graphics $tabBrush (420 + $i * 62) 214 46 38 13
    $tabBrush.Dispose()
}

$titlePen = [System.Drawing.Pen]::new((New-IconColor "#1E3A8A" 150), 14)
$titlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$titlePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($titlePen, 422, 306, 650, 306)
$titlePen.Dispose()

$linePen = [System.Drawing.Pen]::new((New-IconColor "#60A5FA" 130), 9)
$linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
for ($y = 382; $y -le 664; $y += 68) {
    $graphics.DrawLine($linePen, 414, $y, 690, $y)
}
$linePen.Dispose()

$shortLinePen = [System.Drawing.Pen]::new((New-IconColor "#14B8A6" 112), 9)
$shortLinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$shortLinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($shortLinePen, 414, 732, 604, 732)
$shortLinePen.Dispose()

# Bookmark ribbon.
$bookmarkBrush = [System.Drawing.SolidBrush]::new((New-IconColor "#F97316"))
$bookmarkPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$bookmarkPath.AddPolygon(@(
    [System.Drawing.PointF]::new(655, 170),
    [System.Drawing.PointF]::new(724, 170),
    [System.Drawing.PointF]::new(724, 412),
    [System.Drawing.PointF]::new(690, 374),
    [System.Drawing.PointF]::new(655, 412)
))
$graphics.FillPath($bookmarkBrush, $bookmarkPath)
$bookmarkPath.Dispose()
$bookmarkBrush.Dispose()

# Pen and nib.
$penBody = [System.Drawing.Pen]::new((New-IconColor "#4338CA"), 78)
$penBody.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penBody.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($penBody, 557, 703, 792, 837)
$penBody.Dispose()

$penHighlight = [System.Drawing.Pen]::new((New-IconColor "#A78BFA" 180), 16)
$penHighlight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penHighlight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($penHighlight, 532, 679, 752, 806)
$penHighlight.Dispose()

$nibBrush = [System.Drawing.SolidBrush]::new((New-IconColor "#FACC15"))
$nibStroke = [System.Drawing.Pen]::new((New-IconColor "#7C2D12" 170), 5)
$nib = @(
    [System.Drawing.PointF]::new(787, 831),
    [System.Drawing.PointF]::new(872, 902),
    [System.Drawing.PointF]::new(760, 914)
)
$graphics.FillPolygon($nibBrush, $nib)
$graphics.DrawPolygon($nibStroke, $nib)
$graphics.FillEllipse([System.Drawing.SolidBrush]::new((New-IconColor "#7C2D12")), 806, 871, 22, 22)
$nibBrush.Dispose()
$nibStroke.Dispose()

$inkBrush = [System.Drawing.SolidBrush]::new((New-IconColor "#06B6D4"))
$graphics.FillEllipse($inkBrush, 728, 642, 44, 44)
$inkBrush.Dispose()

$graphics.Dispose()

$sourcePath = Join-Path $iconDir "icon-source.png"
$pngPath = Join-Path $iconDir "icon.png"
$icoPath = Join-Path $iconDir "icon.ico"

$source.Save($sourcePath, [System.Drawing.Imaging.ImageFormat]::Png)
Save-ResizedPng $source 256 $pngPath
Write-Ico $source $icoPath
$source.Dispose()

Write-Host "Generated:"
Write-Host "  $sourcePath"
Write-Host "  $pngPath"
Write-Host "  $icoPath"
