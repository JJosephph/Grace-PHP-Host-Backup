param(
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$distDir = Join-Path $projectRoot 'dist'
$buildDir = Join-Path $projectRoot 'build'
$pythonCommand = $null
$pythonArgs = @()

$pythonCandidates = @(
    @{ Command = 'python'; Arguments = @() },
    @{ Command = 'py'; Arguments = @('-3') }
)

foreach ($candidate in $pythonCandidates) {
    if (-not (Get-Command $candidate.Command -ErrorAction SilentlyContinue)) {
        continue
    }
    & $candidate.Command @($candidate.Arguments) -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pythonCommand = $candidate.Command
        $pythonArgs = @($candidate.Arguments)
        break
    }
}

if (-not $pythonCommand) {
    throw 'Python 3 was not found. Install Python 3.12 or later and try again.'
}

if (-not $SkipInstall) {
    & $pythonCommand @pythonArgs -m pip install --upgrade -r (Join-Path $projectRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) {
        throw "Installing Python dependencies failed with exit code $LASTEXITCODE."
    }
}

if (Test-Path -LiteralPath $distDir) {
    Remove-Item -LiteralPath $distDir -Recurse -Force
}
if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
}

& $pythonCommand @pythonArgs (Join-Path $projectRoot 'tools\build_assets.py')
if ($LASTEXITCODE -ne 0) {
    throw "Generating application assets failed with exit code $LASTEXITCODE."
}

& $pythonCommand @pythonArgs -m PyInstaller `
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
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE."
}

& $pythonCommand @pythonArgs (Join-Path $projectRoot 'tools\finalize_build.py') $distDir
if ($LASTEXITCODE -ne 0) {
    throw "Finalizing the build failed with exit code $LASTEXITCODE."
}

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
