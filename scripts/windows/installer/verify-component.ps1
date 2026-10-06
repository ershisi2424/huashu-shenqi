[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$FilePath,
  [Parameter(Mandatory = $true)][string]$Sha256,
  [Parameter(Mandatory = $true)][Int64]$Size,
  [string]$Url = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Url) {
  $uri = [Uri]$Url
  if ($uri.Scheme -ne "https") { throw "COMPONENT_URL_NOT_HTTPS" }
}
if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw "COMPONENT_FILE_MISSING" }
$item = Get-Item -LiteralPath $FilePath
if ($item.Length -ne $Size) { throw "COMPONENT_SIZE_MISMATCH" }
$actual = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $Sha256.ToLowerInvariant()) { throw "COMPONENT_SHA256_MISMATCH" }

[pscustomobject]@{ ok = $true; size = [Int64]$item.Length; sha256 = $actual } | ConvertTo-Json -Compress
