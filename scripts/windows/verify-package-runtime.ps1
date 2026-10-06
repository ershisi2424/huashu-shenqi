[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$ReleaseDir,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$ArtifactBaseUrl,
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [switch]$RequireSignature
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Stop-WithCode([string]$Code, [string]$Message) {
  throw "$Code`: $Message"
}

if ([string]::IsNullOrWhiteSpace($ArtifactBaseUrl) -or $ArtifactBaseUrl -notmatch '^https://') {
  Stop-WithCode "ARTIFACT_URL_REQUIRED" "artifact URL must use HTTPS"
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  Stop-WithCode "RELEASE_MANIFEST_MISSING" "release manifest is missing"
}
if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
  Stop-WithCode "INSTALLER_MISSING" "installer executable is missing"
}
if (-not (Test-Path -LiteralPath $ReleaseDir -PathType Container)) {
  Stop-WithCode "RELEASE_DIR_MISSING" "release directory is missing"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$manifestArchitecture = [string]$manifest.architecture
$manifestPlatform = [string]$manifest.platform
if ($manifestArchitecture -ne "x64" -or ($manifestPlatform -ne "win32" -and $manifestPlatform -ne "windows")) {
  Stop-WithCode "RELEASE_ARCHITECTURE_INVALID" "release manifest must declare win32/x64"
}

$expected = ([string]$ExpectedSha256).Trim().ToLowerInvariant()
if ($expected -notmatch '^[0-9a-f]{64}$') {
  Stop-WithCode "SHA256_INVALID" "expected SHA-256 is invalid"
}
$actual = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
  Stop-WithCode "SHA256_MISMATCH" "installer SHA-256 mismatch"
}

$native = Join-Path $ReleaseDir "node_modules\better-sqlite3\prebuilds\win32-x64.node"
if (-not (Test-Path -LiteralPath $native -PathType Leaf)) {
  $native = Join-Path $ReleaseDir ".next\standalone\node_modules\better-sqlite3\prebuilds\win32-x64.node"
}
if (-not (Test-Path -LiteralPath $native -PathType Leaf)) {
  Stop-WithCode "WINDOWS_NATIVE_MODULE_MISSING" "better-sqlite3 win32-x64 module is missing"
}

$forbidden = '(?i)(^|\\)(?:\.env(?:\..*)?|.*\.(?:sqlite|db)(?:-(?:wal|shm))?|sessions?|tokens?|uploads?|logs?)(?:$|\\)'
$violations = Get-ChildItem -LiteralPath $ReleaseDir -Recurse -Force | Where-Object { $_.FullName -match $forbidden }
if ($violations) {
  Stop-WithCode "PACKAGE_CONTAINS_PRIVATE_DATA" "release contains private data files"
}

$signature = Get-AuthenticodeSignature -FilePath $ExePath
$signatureStatus = [string]$signature.Status
$signatureSubject = ""
if ($signature.SignerCertificate) {
  $signatureSubject = [string]$signature.SignerCertificate.Subject
}
if ($RequireSignature -and $signatureStatus -ne "Valid") {
  Stop-WithCode "SIGNATURE_REQUIRED" "Authenticode signature is required"
}

$architectureStatus = "WINDOWS_X64_DECLARED"
$dumpbin = Get-Command dumpbin.exe -ErrorAction SilentlyContinue
if ($dumpbin) {
  $headers = (& $dumpbin.Source /headers $ExePath 2>&1 | Out-String)
  if ($headers -notmatch '(?i)8664 machine|x64') {
    Stop-WithCode "INSTALLER_ARCHITECTURE_INVALID" "installer PE is not x64"
  }
  $architectureStatus = "WINDOWS_X64_VERIFIED"
}

$status = "INTERNAL_UNVERIFIED"
if ($signatureStatus -eq "Valid") {
  $status = "VERIFIED"
}
$result = [ordered]@{
  status = $status
  architecture = $architectureStatus
  sha256 = $actual
  authenticode = $signatureStatus
  signer = $signatureSubject
  artifactBaseUrl = $ArtifactBaseUrl
  releaseManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
  nativeModule = "better-sqlite3/win32-x64.node"
  dataPolicy = "ProgramData retained on uninstall"
}
$result | ConvertTo-Json -Depth 4
