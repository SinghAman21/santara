param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'build'),
    [switch]$SkipSelfTest
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw 'MSVC cl.exe was not found. Run from Developer PowerShell for Visual Studio or a Windows CI job initialized with the MSVC x64 environment.'
}

$buildPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $buildPath | Out-Null
$sourcePath = Join-Path $PSScriptRoot 'drag_watcher.cpp'

Push-Location $buildPath
try {
    & cl.exe /nologo /std:c++17 /EHsc /MT /W4 /WX /permissive- /DUNICODE /D_UNICODE $sourcePath user32.lib /Fe:santra-drag-watcher.exe
    if ($LASTEXITCODE -ne 0) {
        throw "MSVC build failed with exit code $LASTEXITCODE"
    }

    if (-not $SkipSelfTest) {
        & .\santra-drag-watcher.exe --self-test
        if ($LASTEXITCODE -ne 0) {
            throw "Watcher self-test failed with exit code $LASTEXITCODE"
        }
    }
} finally {
    Pop-Location
}

Write-Output "Built $buildPath\santra-drag-watcher.exe"
