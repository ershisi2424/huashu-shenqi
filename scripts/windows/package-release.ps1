[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReleaseDir,
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [Parameter(Mandatory = $true)][string]$ArtifactBaseUrl,
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [string]$SigningCertificateThumbprint = "",
  [switch]$RequireSignature
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Stop-WithCode([string]$Code, [string]$Message) {
  throw "$Code`: $Message"
}

if (-not $ArtifactBaseUrl -or $ArtifactBaseUrl -notmatch '^https://') {
  Stop-WithCode "PACKAGE_CONFIG_REQUIRED" "必须提供 HTTPS 版本下载地址"
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  Stop-WithCode "PACKAGE_CONFIG_REQUIRED" "必须提供已锁定的发布清单"
}
if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
  Stop-WithCode "PACKAGE_INPUT_MISSING" "待封装的 EXE 不存在"
}
if (-not (Test-Path -LiteralPath $ReleaseDir -PathType Container)) {
  Stop-WithCode "PACKAGE_INPUT_MISSING" "发布目录不存在"
}

$verifierPath = Join-Path -Path (Split-Path -Parent $PSCommandPath) -ChildPath "verify-package.ps1"
if (-not (Test-Path -LiteralPath $verifierPath -PathType Leaf)) {
  Stop-WithCode "PACKAGE_VERIFIER_MISSING" "缺少交付包校验脚本"
}
$expected = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash
$verificationArgs = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $verifierPath,
  "-ExePath", $ExePath, "-ReleaseDir", $ReleaseDir, "-ExpectedSha256", $expected,
  "-ArtifactBaseUrl", $ArtifactBaseUrl, "-ManifestPath", $ManifestPath
)
if ($RequireSignature) { $verificationArgs += "-RequireSignature" }
$verificationJson = & powershell.exe @verificationArgs
if ($LASTEXITCODE -ne 0) { Stop-WithCode "PACKAGE_VERIFY_FAILED" "交付包校验失败" }
$verification = ($verificationJson -join "`n") | ConvertFrom-Json

$signingStatus = [string]$verification.authenticode
if ($SigningCertificateThumbprint) {
  $requestedThumbprint = ($SigningCertificateThumbprint -replace '\s', '').ToUpperInvariant()
  $actualThumbprint = ""
  $signature = Get-AuthenticodeSignature -FilePath $ExePath
  if ($signature.SignerCertificate) { $actualThumbprint = ($signature.SignerCertificate.Thumbprint -replace '\s', '').ToUpperInvariant() }
  if ($signingStatus -ne "Valid" -or $actualThumbprint -ne $requestedThumbprint) {
    Stop-WithCode "SIGNATURE_CERTIFICATE_MISMATCH" "签名证书与发布配置不匹配"
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDir).Path
$installerName = "Huashu-Setup-x64.exe"
$targetExe = Join-Path $resolvedOutput $installerName
Copy-Item -LiteralPath $ExePath -Destination $targetExe -Force
$manifestCopy = Join-Path $resolvedOutput "release-manifest.json"
Copy-Item -LiteralPath $ManifestPath -Destination $manifestCopy -Force

# Never package API keys, passwords, business databases, or chat history.
$packageManifest = [ordered]@{
  packageStatus = if ($signingStatus -eq "Valid") { "VERIFIED" } else { "INTERNAL_UNVERIFIED" }
  architecture = "win32/x64"
  installer = $installerName
  installerSha256 = (Get-FileHash -LiteralPath $targetExe -Algorithm SHA256).Hash.ToLowerInvariant()
  artifactBaseUrl = $ArtifactBaseUrl
  releaseManifest = "release-manifest.json"
  dataRoot = "C:\ProgramData\Huashu"
  uninstallPolicy = "retain ProgramData business data"
  authenticode = $signingStatus
}
$packageManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $resolvedOutput "package-manifest.json") -Encoding UTF8
Write-Output "Package created: $targetExe ($($packageManifest.packageStatus))"
