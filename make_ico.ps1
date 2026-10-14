Add-Type -AssemblyName System.Drawing
$imgPath = "C:\Users\jmart\.gemini\antigravity-ide\scratch\stitch-web-landing\app-icon.jpg"
$img = [System.Drawing.Image]::FromFile($imgPath)
$bmp = New-Object System.Drawing.Bitmap $img, 128, 128
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::OpenWrite("app.ico")
$icon.Save($fs)
$fs.Close()
$img.Dispose()
$bmp.Dispose()
Write-Output "Icon created: $(Test-Path 'app.ico')"
