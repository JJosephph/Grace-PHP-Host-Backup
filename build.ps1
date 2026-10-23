param(
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22 or later was not found.'
}

Push-Location $projectRoot
try {
    if (-not $SkipInstall) {
        if (Test-Path -LiteralPath (Join-Path $projectRoot 'package-lock.json')) {
            npm ci
        } else {
            npm install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Installing Node dependencies failed with exit code $LASTEXITCODE."
        }
    }

    npm run dist
    if ($LASTEXITCODE -ne 0) {
        throw "Building the Windows application failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
