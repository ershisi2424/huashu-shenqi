[CmdletBinding()]
param(
  [string]$SourceRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location ([IO.Path]::GetFullPath($SourceRoot))

$installerScript = Join-Path $PWD.Path "scripts\windows\installer\Huashu-Setup.nsi"
$repairScript = Join-Path $PWD.Path "scripts\windows\installer\repair.ps1"
$uninstallScript = Join-Path $PWD.Path "scripts\windows\installer\uninstall-preserve-data.ps1"
foreach ($required in @($installerScript, $repairScript, $uninstallScript)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "WINDOWS_INSTALLER_INPUT_MISSING" }
}

$nodeVersion = (& node --version).Trim()
if ($nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw "NODE_VERSION_UNSUPPORTED" }
& npm ci
if ($LASTEXITCODE -ne 0) { throw "NPM_INSTALL_FAILED" }
& npm test
if ($LASTEXITCODE -ne 0) { throw "NPM_TEST_FAILED" }
& npm run build
if ($LASTEXITCODE -ne 0) { throw "NEXT_BUILD_FAILED" }

$release = Join-Path $env:RUNNER_TEMP ("huashu-release-" + [Guid]::NewGuid().ToString("N"))
# The release verifier loads better-sqlite3's win32-x64 native addon below.
& node scripts/windows/build-release.cjs --source $PWD.Path --output $release
if ($LASTEXITCODE -ne 0) { throw "WINDOWS_RELEASE_BUILD_FAILED" }

$nativeProbe = @'
const { verifyReleaseDirectory } = require('./scripts/windows/verify-release.cjs');
// verifyReleaseDirectory runs PRAGMA integrity_check through better-sqlite3.
const result = verifyReleaseDirectory(process.argv[1]);
if (result.nativeSmoke !== 'WINDOWS_NATIVE_SMOKE_PASSED') throw new Error(result.nativeSmoke);
console.log(result.nativeSmoke);
'@
& node -e $nativeProbe $release
if ($LASTEXITCODE -ne 0) { throw "WINDOWS_NATIVE_SMOKE_FAILED" }

$runtimeData = Join-Path $env:RUNNER_TEMP ("huashu-runtime-data-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeData "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeData "config") | Out-Null
$env:NODE_ENV = "production"
$env:AUTH_REQUIRED = "true"
$env:AUTH_DB_PATH = Join-Path $runtimeData "data\auth.sqlite"
$env:AI_REPLY_CONFIG_PATH = Join-Path $runtimeData "config\provider.json"
$env:HOSTNAME = "127.0.0.1"
$env:PORT = "35102"
$server = Start-Process -FilePath "node" -ArgumentList @((Join-Path $release ".next\standalone\server.js")) -WorkingDirectory (Join-Path $release ".next\standalone") -PassThru -WindowStyle Hidden
try {
  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:35102/login/" -TimeoutSec 3
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
  }
  if (-not $healthy) { throw "WINDOWS_RUNTIME_HTTP_SMOKE_FAILED" }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
Write-Output "WINDOWS_NATIVE_SMOKE_PASSED; WINDOWS_RUNTIME_HTTP_SMOKE_PASSED"
