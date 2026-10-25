$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$downloadUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
$bootstrapper = Join-Path $env:TEMP ("Santara-WebView2-{0}.exe" -f [guid]::NewGuid())

function Test-WebView2Runtime {
  $registryPaths = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  )

  foreach ($path in $registryPaths) {
    $versionText = (Get-ItemProperty -LiteralPath $path -Name pv -ErrorAction SilentlyContinue).pv
    $version = $null
    if ([version]::TryParse($versionText, [ref]$version) -and $version -gt [version]'0.0.0.0') {
      return $true
    }
  }

  return $false
}

try {
  Invoke-WebRequest -Uri $downloadUrl -OutFile $bootstrapper -UseBasicParsing

  $signature = Get-AuthenticodeSignature -FilePath $bootstrapper
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'The downloaded WebView2 bootstrapper did not have a valid Microsoft signature.'
  }

  $process = Start-Process -FilePath $bootstrapper -ArgumentList '/silent', '/install' -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "The WebView2 installer returned exit code $($process.ExitCode)."
  }

  if (-not (Test-WebView2Runtime)) {
    throw 'The WebView2 installer completed without registering a usable Runtime.'
  }
}
catch {
  Write-Error $_
  exit 1
}
finally {
  Remove-Item -LiteralPath $bootstrapper -Force -ErrorAction SilentlyContinue
}

exit 0
