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

if (-not $ArtifactBaseUrl -or $ArtifactBaseUrl -notmatch '^https://') {
  Stop-WithCode "ARTIFACT_URL_REQUIRED" "发布下载地址必须是 HTTPS"
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  Stop-WithCode "RELEASE_MANIFEST_MISSING" "缺少已签名发布清单"
}
if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
  Stop-WithCode "INSTALLER_MISSING" "缺少安装器 EXE"
}
if (-not (Test-Path -LiteralPath $ReleaseDir -PathType Container)) {
  Stop-WithCode "RELEASE_DIR_MISSING" "缺少 Windows x64 发布目录"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$manifestArchitecture = [string]$manifest.architecture
$manifestPlatform = [string]$manifest.platform
if ($manifestArchitecture -ne "x64" -or ($manifestPlatform -ne "win32" -and $manifestPlatform -ne "windows")) {
  Stop-WithCode "RELEASE_ARCHITECTURE_INVALID" "发布清单必须声明 win32/x64"
}
$expected = ([string]$ExpectedSha256).Trim().ToLowerInvariant()
if ($expected -notmatch '^[0-9a-f]{64}$') {
  Stop-WithCode "SHA256_INVALID" "期望 SHA-256 必须是 64 位十六进制"
}
$actual = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
  Stop-WithCode "SHA256_MISMATCH" "安装器校验值不匹配"
}

$native = Join-Path $ReleaseDir "node_modules\better-sqlite3\prebuilds\win32-x64.node"
if (-not (Test-Path -LiteralPath $native -PathType Leaf)) {
  $native = Join-Path $ReleaseDir ".next\standalone\node_modules\better-sqlite3\prebuilds\win32-x64.node"
}
if (-not (Test-Path -LiteralPath $native -PathType Leaf)) {
  Stop-WithCode "WINDOWS_NATIVE_MODULE_MISSING" "发布包缺少 better-sqlite3 win32-x64 原生模块"
}

# ProgramData is intentionally outside the package. Uninstall/repair must preserve it.
$forbidden = '(?i)(^|\\)(?:\.env(?:\..*)?|.*\.(?:sqlite|db)(?:-(?:wal|shm))?|sessions?|tokens?|uploads?|logs?)(?:$|\\)'
$violations = Get-ChildItem -LiteralPath $ReleaseDir -Recurse -Force | Where-Object { $_.FullName -match $forbidden }
if ($violations) {
  Stop-WithCode "PACKAGE_CONTAINS_PRIVATE_DATA" "发布包不得包含数据库、会话、Token、日志或环境文件"
}

$signature = Get-AuthenticodeSignature -FilePath $ExePath
$signatureStatus = [string]$signature.Status
$signatureSubject = ""
if ($signature.SignerCertificate) {
  $signatureSubject = [string]$signature.SignerCertificate.Subject
}
if ($RequireSignature -and $signatureStatus -ne "Valid") {
  Stop-WithCode "SIGNATURE_REQUIRED" "生产发布必须通过 Authenticode 签名验证"
}

$architectureStatus = "WINDOWS_X64_DECLARED"
$dumpbin = Get-Command dumpbin.exe -ErrorAction SilentlyContinue
if ($dumpbin) {
  $headers = (& $dumpbin.Source /headers $ExePath 2>&1 | Out-String)
  if ($headers -notmatch '(?i)8664 machine|x64') {
    Stop-WithCode "INSTALLER_ARCHITECTURE_INVALID" "安装器 PE 不是 x64"
  }
  $architectureStatus = "WINDOWS_X64_VERIFIED"
}

$status = "INTERNAL_UNVERIFIED"
if ($signatureStatus -eq "Valid") {
  $status = "VERIFIED"
}
[ordered]@{
  status = $status
  architecture = $architectureStatus
  sha256 = $actual
  authenticode = $signatureStatus
  signer = $signatureSubject
  artifactBaseUrl = $ArtifactBaseUrl
  releaseManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
  nativeModule = "better-sqlite3/win32-x64.node"
  dataPolicy = "ProgramData retained on uninstall"
} | ConvertTo-Json -Depth 4
