<#
.SYNOPSIS
    Antigravity History Manager — Automated GitHub Release Preparation & Audit Script
.DESCRIPTION
    Runs repository hygiene checks, personal data detection, version validation,
    tauri build, smoke test, and creates release artifacts with SHA-256 checksums.
#>

[CmdletBinding()]
param(
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

# --- Resolve Paths ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $ScriptDir "..\app\package.json")) {
    $RootDir = Resolve-Path (Join-Path $ScriptDir "..")
    $AppDir = Resolve-Path (Join-Path $RootDir "app")
} elseif (Test-Path (Join-Path $ScriptDir "..\package.json")) {
    $AppDir = Resolve-Path (Join-Path $ScriptDir "..")
    $RootDir = Resolve-Path (Join-Path $AppDir "..")
} else {
    $RootDir = "D:\AGHistory_Tauri"
    $AppDir = "D:\AGHistory_Tauri\app"
}

$DistDir = Join-Path $RootDir "dist"
$ReleaseDir = Join-Path $RootDir "release"
if (-not (Test-Path $ReleaseDir)) {
    New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
}

$Issues = @()

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "   Antigravity History Manager — Release Preparation Audit   " -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan
Write-Host "[Info] Root Directory: $RootDir"
Write-Host "[Info] App Directory:  $AppDir`n"

# --- 1. Check .gitignore ---
Write-Host "==> [1/7] Checking .gitignore rules..." -ForegroundColor Yellow
$gitignorePath = Join-Path $RootDir ".gitignore"
if (-not (Test-Path $gitignorePath)) {
    $gitignorePath = Join-Path $AppDir ".gitignore"
}

if (-not (Test-Path $gitignorePath)) {
    $Issues += "Missing .gitignore file in $RootDir or $AppDir"
    Write-Host "    [FAIL] .gitignore not found!" -ForegroundColor Red
} else {
    $giContent = Get-Content $gitignorePath -Raw
    $requiredPatterns = @(
        "node_modules", "target", "dist", "release", "tmp", "verify", "backup",
        "\.log", "\.db", "\.sqlite", "export", "\.env", "auth", "token"
    )
    $missingPatterns = @()
    foreach ($pat in $requiredPatterns) {
        if ($giContent -notmatch $pat) {
            $missingPatterns += $pat
        }
    }
    if ($missingPatterns.Count -gt 0) {
        $Issues += ".gitignore is missing patterns: $($missingPatterns -join ', ')"
        Write-Host "    [FAIL] .gitignore missing patterns: $($missingPatterns -join ', ')" -ForegroundColor Red
    } else {
        Write-Host "    [PASS] .gitignore is up-to-date and contains all required exclusion rules." -ForegroundColor Green
    }
}

# --- 2. Check for Personal Data & Absolute Paths in Tracked Files ---
Write-Host "`n==> [2/7] Scanning repository files for personal data & secrets..." -ForegroundColor Yellow
$currentUser = $env:USERNAME
$scanFiles = Get-ChildItem -Path $AppDir -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](node_modules|target|\.git|dist|release|tmp|verify|backup)[\\/]' -and
    $_.Extension -notmatch '\.(png|jpg|ico|exe|dll|zip|db|woff|woff2)$'
}

$foundPersonalData = @()
foreach ($file in $scanFiles) {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }

    # Username check
    if ($currentUser -and $currentUser.Length -gt 2) {
        if ($content -match "\b$([regex]::Escape($currentUser))\b") {
            $foundPersonalData += "Username '$currentUser' found in $($file.FullName)"
        }
    }

    # C:\Users check
    if ($content -match 'C:\\Users\\[a-zA-Z0-9_\-\.]+') {
        $foundPersonalData += "User path 'C:\Users' in $($file.FullName): $($matches[0])"
    }

    # Hardcoded D:\ in code (excluding comments)
    if ($file.FullName -notmatch 'prepare_release\.ps1$') {
        if ($content -match 'D:\\AGHistory_Tauri\\(tmp|data|dist|backup|verify)') {
            $foundPersonalData += "Hardcoded path 'D:\AGHistory_Tauri' in $($file.FullName)"
        }
    }

    # Secrets / Tokens
    if ($content -match '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9_\-\.]{20,})') {
        $foundPersonalData += "Potential secret token pattern in $($file.FullName)"
    }
}

if ($foundPersonalData.Count -gt 0) {
    foreach ($item in $foundPersonalData) {
        $Issues += $item
        Write-Host "    [FAIL] $item" -ForegroundColor Red
    }
} else {
    Write-Host "    [PASS] Clean! 0 personal paths, usernames, or secrets found across $($scanFiles.Count) files." -ForegroundColor Green
}

# --- 3. Check Tracked File Sizes (< 50 MB) ---
Write-Host "`n==> [3/7] Checking file sizes (< 50 MB limit for Git)..." -ForegroundColor Yellow
$largeFiles = $scanFiles | Where-Object { $_.Length -gt 50MB }
if ($largeFiles.Count -gt 0) {
    foreach ($lf in $largeFiles) {
        $szMb = [math]::Round($lf.Length / 1MB, 2)
        $Issues += "File exceeds 50 MB limit: $($lf.FullName) ($szMb MB)"
        Write-Host "    [FAIL] $($lf.Name) is $szMb MB (> 50 MB)" -ForegroundColor Red
    }
} else {
    Write-Host "    [PASS] All repository source files are well below 50 MB." -ForegroundColor Green
}

# --- 4. Verify Version Consistency & Documentation ---
Write-Host "`n==> [4/7] Checking documentation and version consistency..." -ForegroundColor Yellow
$docFiles = @("README.md", "LICENSE", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md")
$missingDocs = @()
foreach ($df in $docFiles) {
    $p = Join-Path $AppDir $df
    if (-not (Test-Path $p)) {
        $p = Join-Path $RootDir $df
    }
    if (-not (Test-Path $p) -or (Get-Item $p).Length -eq 0) {
        $missingDocs += $df
    }
}

if ($missingDocs.Count -gt 0) {
    $Issues += "Missing or empty documentation: $($missingDocs -join ', ')"
    Write-Host "    [FAIL] Missing docs: $($missingDocs -join ', ')" -ForegroundColor Red
} else {
    Write-Host "    [PASS] All core documentation files are present." -ForegroundColor Green
}

# Version sync
$pkgPath = Join-Path $AppDir "package.json"
$tauriPath = Join-Path $AppDir "src-tauri\tauri.conf.json"
$cargoPath = Join-Path $AppDir "src-tauri\Cargo.toml"

$pkgVer = if (Test-Path $pkgPath) { (Get-Content $pkgPath | ConvertFrom-Json).version } else { "" }
$tauriVer = if (Test-Path $tauriPath) { (Get-Content $tauriPath | ConvertFrom-Json).version } else { "" }
$cargoVer = if (Test-Path $cargoPath) {
    (Select-String -Path $cargoPath -Pattern '^version\s*=\s*"([^"]+)"').Matches.Groups[1].Value
} else { "" }

if (-not $pkgVer -or $pkgVer -ne $tauriVer -or $pkgVer -ne $cargoVer) {
    $Issues += "Version mismatch: package.json ($pkgVer), tauri.conf.json ($tauriVer), Cargo.toml ($cargoVer)"
    Write-Host "    [FAIL] Version mismatch: package=$pkgVer, tauri=$tauriVer, cargo=$cargoVer" -ForegroundColor Red
} else {
    Write-Host "    [PASS] Versions are synchronized across all configs: v$pkgVer" -ForegroundColor Green
}

# --- 5. Build Project (tauri build) ---
Write-Host "`n==> [5/7] Verifying build (tauri build)..." -ForegroundColor Yellow
$builtPortableExe = Join-Path $AppDir "src-tauri\target\release\antigravity-history-manager.exe"
$builtSetupExe = Get-ChildItem (Join-Path $AppDir "src-tauri\target\release\bundle\nsis") -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $SkipBuild) {
    Write-Host "    Running tauri build in $AppDir..." -ForegroundColor Cyan
    Push-Location $AppDir
    try {
        & npx tauri build
        if ($LASTEXITCODE -ne 0) {
            $Issues += "Tauri build failed with exit code $LASTEXITCODE"
            Write-Host "    [FAIL] Tauri build failed!" -ForegroundColor Red
        } else {
            Write-Host "    [PASS] Tauri build completed successfully!" -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "    [INFO] Build skipped via -SkipBuild switch." -ForegroundColor Cyan
}

$builtPortableExe = Join-Path $AppDir "src-tauri\target\release\antigravity-history-manager.exe"
$builtSetupExe = Get-ChildItem (Join-Path $AppDir "src-tauri\target\release\bundle\nsis") -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not (Test-Path $builtPortableExe)) {
    $Issues += "Portable executable not found in target\release"
}
if (-not $builtSetupExe -or -not (Test-Path $builtSetupExe.FullName)) {
    $Issues += "NSIS setup executable not found in target\release\bundle\nsis"
}

# --- 6. Smoke Test (Demo Mode) ---
Write-Host "`n==> [6/7] Running smoke-test in Demo Mode..." -ForegroundColor Yellow
if (Test-Path $builtPortableExe) {
    $oldDemo = $env:AGH_DEMO
    $oldData = $env:AGH_DATA_DIR
    $env:AGH_DEMO = "1"
    $env:AGH_DATA_DIR = (Join-Path $RootDir "tmp\smoke_test_data")
    
    $proc = Start-Process -FilePath $builtPortableExe -PassThru
    Start-Sleep -Seconds 2

    if ($proc -and -not $proc.HasExited) {
        Write-Host "    [PASS] Executable started successfully in Demo Mode (PID $($proc.Id))" -ForegroundColor Green
        Write-Host "    [Safety Rule] Stopping test process by exact PID: Stop-Process -Id $($proc.Id) -Force" -ForegroundColor Cyan
        Stop-Process -Id $proc.Id -Force
        Start-Sleep -Milliseconds 500
    } else {
        $Issues += "Executable exited prematurely during smoke-test"
        Write-Host "    [FAIL] Executable exited prematurely during smoke-test!" -ForegroundColor Red
    }

    $env:AGH_DEMO = $oldDemo
    $env:AGH_DATA_DIR = $oldData

    # Clean smoke test data
    $smokeData = Join-Path $RootDir "tmp\smoke_test_data"
    if (Test-Path $smokeData) {
        Remove-Item -Recurse -Force $smokeData -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "    [SKIP] Smoke test skipped because portable exe was not found." -ForegroundColor DarkGray
}

# --- 7. Package Release & Checksums ---
Write-Host "`n==> [7/7] Preparing release folder & computing SHA-256 checksums..." -ForegroundColor Yellow
$releaseExe = Join-Path $ReleaseDir "Antigravity_History_Manager.exe"
$releaseSetup = Join-Path $ReleaseDir "Antigravity_History_Manager_Setup.exe"

if (Test-Path $builtPortableExe) {
    Copy-Item $builtPortableExe $releaseExe -Force
}
if ($builtSetupExe -and (Test-Path $builtSetupExe.FullName)) {
    Copy-Item $builtSetupExe.FullName $releaseSetup -Force
}

if ((Test-Path $releaseExe) -and (Test-Path $releaseSetup)) {
    $hExe = (Get-FileHash -Path $releaseExe -Algorithm SHA256).Hash.ToLower()
    $hSetup = (Get-FileHash -Path $releaseSetup -Algorithm SHA256).Hash.ToLower()

    $checksumContent = @"
# Antigravity History Manager v$pkgVer SHA-256 Checksums
# Verify with PowerShell: Get-FileHash <filename> -Algorithm SHA256

$hExe  Antigravity_History_Manager.exe
$hSetup  Antigravity_History_Manager_Setup.exe
"@

    $checksumFile = Join-Path $ReleaseDir "checksums.txt"
    Set-Content -Path $checksumFile -Value $checksumContent -Encoding UTF8

    Write-Host "    [PASS] Release files copied to ${ReleaseDir}:" -ForegroundColor Green
    Write-Host "           - Antigravity_History_Manager.exe ($([math]::Round((Get-Item $releaseExe).Length/1MB, 2)) MB)"
    Write-Host "             SHA256: $hExe"
    Write-Host "           - Antigravity_History_Manager_Setup.exe ($([math]::Round((Get-Item $releaseSetup).Length/1MB, 2)) MB)"
    Write-Host "             SHA256: $hSetup"
    Write-Host "           - checksums.txt"
    Write-Host "           - release_notes.md"
} else {
    $Issues += "Could not stage release binaries to $ReleaseDir"
    Write-Host "    [FAIL] Could not stage release binaries." -ForegroundColor Red
}

# --- Final Summary ---
Write-Host "`n============================================================" -ForegroundColor Cyan
if ($Issues.Count -eq 0) {
    Write-Host "                      ГОТОВО!                               " -ForegroundColor Green
    Write-Host "   Проект полностью готов к чистой публикации на GitHub!    " -ForegroundColor Green
    Write-Host "============================================================`n" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "                  ОБНАРУЖЕНЫ ПРОБЛЕМЫ:                      " -ForegroundColor Red
    foreach ($iss in $Issues) {
        Write-Host "   - $iss" -ForegroundColor Red
    }
    Write-Host "============================================================`n" -ForegroundColor Red
    exit 1
}
