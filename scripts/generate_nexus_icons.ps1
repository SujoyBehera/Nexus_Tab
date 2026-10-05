Add-Type -AssemblyName System.Drawing

$testPath = "C:\Users\sujoy\.gemini\antigravity\scratch\webpilot\scripts\test_crop.png"
$srcBmp = New-Object System.Drawing.Bitmap($testPath)
$destDir = "C:\Users\sujoy\.gemini\antigravity\scratch\webpilot\public\icon"

$sizes = @(16, 32, 48, 96, 128)

foreach ($size in $sizes) {
    $destBmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $g.DrawImage($srcBmp, $rect)
    $g.Dispose()

    $outPath = Join-Path $destDir "$size.png"
    $destBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Output "Generated icon: $outPath ($size x $size)"
}

$srcBmp.Dispose()
