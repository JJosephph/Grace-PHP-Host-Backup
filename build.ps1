param(
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$distDir = Join-Path $projectRoot 'dist'
$buildDir = Join-Path $projectRoot 'build'

if (-not $SkipInstall) {
    py -3 -m pip install --upgrade -r (Join-Path $projectRoot 'requirements.txt')
}

if (Test-Path -LiteralPath $distDir) {
    Remove-Item -LiteralPath $distDir -Recurse -Force
}
if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
}

py -3 (Join-Path $projectRoot 'tools\build_assets.py')

py -3 -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name 'Grace-PHP-Host-Backup' `
    --icon (Join-Path $projectRoot 'assets\app.ico') `
    --distpath $distDir `
    --workpath $buildDir `
    --specpath $buildDir `
    (Join-Path $projectRoot 'app.py')

py -3 (Join-Path $projectRoot 'tools\finalize_build.py') $distDir

Copy-Item -LiteralPath (Join-Path $projectRoot 'config.example.json') -Destination $distDir
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $distDir

$exe = Join-Path $distDir 'Grace-PHP-Host-Backup.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Build failed: $exe"
}

$builtFiles = Get-ChildItem -LiteralPath $distDir -Filter '*.exe' -File
foreach ($file in $builtFiles) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "Built: $($file.FullName)"
    Write-Host "Size:  $($file.Length) bytes"
    Write-Host "SHA256: $hash"
}
