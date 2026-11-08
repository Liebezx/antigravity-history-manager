Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$baseDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$verifyDir = Join-Path $baseDir "verify\release"
$distDir = Join-Path $baseDir "dist"
if (!(Test-Path $verifyDir)) { New-Item -ItemType Directory -Path $verifyDir -Force | Out-Null }

function Take-ScreenShot($filePath) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Captured screenshot: $filePath"
}

# 1. Open Explorer at dist directory
Write-Host "Opening Explorer at $distDir..."
$exp = Start-Process explorer.exe -ArgumentList "$distDir" -PassThru
Start-Sleep -Seconds 2
Take-ScreenShot (Join-Path $verifyDir "01_explorer_dist.png")

# Close the opened explorer
if ($exp) { Stop-Process -Id $exp.Id -Force -ErrorAction SilentlyContinue }

# 2. Minimize all windows to show Desktop
$shell = New-Object -ComObject Shell.Application
$shell.MinimizeAll()
Start-Sleep -Seconds 1
Take-ScreenShot (Join-Path $verifyDir "02_desktop_shortcut.png")

# 3. Launch Antigravity_History_Manager.exe
Write-Host "Launching Antigravity_History_Manager.exe..."
$env:AGH_DEMO = "1"
$appExe = Join-Path $distDir "Antigravity_History_Manager.exe"
$app = Start-Process -FilePath $appExe -PassThru
Start-Sleep -Seconds 3

# Capture window + taskbar
Take-ScreenShot (Join-Path $verifyDir "03_running_app_and_taskbar.png")

# 4. Trigger Alt+Tab display
[System.Windows.Forms.SendKeys]::SendWait("%{TAB}")
Start-Sleep -Milliseconds 800
Take-ScreenShot (Join-Path $verifyDir "05_alt_tab.png")
[System.Windows.Forms.SendKeys]::SendWait("{ESC}")

# 5. Crop Taskbar area for detailed view (bottom 50px of screen)
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$full = [System.Drawing.Image]::FromFile((Join-Path $verifyDir "03_running_app_and_taskbar.png"))
$taskbarRect = New-Object System.Drawing.Rectangle 0, ($bounds.Height - 60), $bounds.Width, 60
$tbBmp = New-Object System.Drawing.Bitmap 1920, 60
$tbG = [System.Drawing.Graphics]::FromImage($tbBmp)
$tbG.DrawImage($full, 0, 0, $taskbarRect, [System.Drawing.GraphicsUnit]::Pixel)
$tbBmp.Save((Join-Path $verifyDir "04_taskbar_icon_detail.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$tbG.Dispose()
$tbBmp.Dispose()
$full.Dispose()
Write-Host "Captured taskbar detail: 04_taskbar_icon_detail.png"

# Close the test app
if ($app) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
$shell.UndoMinimizeALL()
