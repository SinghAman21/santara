param(
  [Parameter(Mandatory = $true)]
  [string]$WebView2Installer
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$setupPath = Join-Path $repoRoot 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Santara_0.1.0_x64-setup.exe'
$outputDirectory = Join-Path $repoRoot 'release/windows'
$webView2Path = (Resolve-Path -LiteralPath $WebView2Installer).Path
$signature = Get-AuthenticodeSignature -FilePath $webView2Path

if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
  throw 'The WebView2 prerequisite must have a valid Microsoft Corporation Authenticode signature.'
}

if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
  throw "Santara NSIS installer not found: $setupPath"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Copy-Item -LiteralPath $setupPath -Destination (Join-Path $outputDirectory 'Santara_0.1.0_x64-setup.exe') -Force
Copy-Item -LiteralPath $webView2Path -Destination (Join-Path $outputDirectory 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe') -Force

Write-Host "Prepared separate offline release files in $outputDirectory"
Write-Host 'Distribute both files together in the same folder or archive. Santara setup checks for an existing WebView2 Runtime and only runs the prerequisite when it is missing.'
