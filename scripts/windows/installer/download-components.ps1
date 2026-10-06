[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [Parameter(Mandatory = $true)][string]$CacheDir,
  [int]$MaxRetries = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.platform -ne "win32" -or $manifest.arch -ne "x64") { throw "MANIFEST_PLATFORM_UNSUPPORTED" }
if (-not $manifest.components) { throw "MANIFEST_COMPONENTS_REQUIRED" }
$cache = New-Item -ItemType Directory -Force -Path $CacheDir
$quarantine = New-Item -ItemType Directory -Force -Path (Join-Path $cache.FullName "quarantine")
$verifier = Join-Path $PSScriptRoot "verify-component.ps1"
$results = @()
# Retry: failed downloads are quarantined before the next attempt.

foreach ($component in $manifest.components) {
  $uri = [Uri]$component.url
  if ($uri.Scheme -ne "https") { throw "COMPONENT_URL_NOT_HTTPS" }
  if ([Int64]$component.size -lt 1 -or [Int64]$component.size -gt 2147483648) { throw "COMPONENT_SIZE_INVALID" }
  if ($component.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "COMPONENT_SHA256_INVALID" }
  $target = Join-Path $cache.FullName ("{0}-{1}.download" -f $component.id, $component.sha256.ToLowerInvariant())
  try {
    & $verifier -FilePath $target -Sha256 $component.sha256 -Size ([Int64]$component.size) -Url $component.url | Out-Null
    $results += [pscustomobject]@{ id = $component.id; path = $target; reused = $true }
    continue
  } catch { }

  $completed = $false
  for ($attempt = 1; $attempt -le [Math]::Max(1, [Math]::Min($MaxRetries, 5)); $attempt++) {
    $partial = Join-Path $cache.FullName ("{0}-{1}.{2}.partial" -f $component.id, $component.sha256.ToLowerInvariant(), $attempt)
    try {
      Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
      Invoke-WebRequest -Uri $component.url -OutFile $partial -UseBasicParsing -TimeoutSec 120
      & $verifier -FilePath $partial -Sha256 $component.sha256 -Size ([Int64]$component.size) -Url $component.url | Out-Null
      Move-Item -LiteralPath $partial -Destination $target -Force
      $results += [pscustomobject]@{ id = $component.id; path = $target; reused = $false; attempts = $attempt }
      $completed = $true
      break
    } catch {
      if (Test-Path -LiteralPath $partial) {
        $quarantinePath = Join-Path $quarantine ("{0}-{1}-{2}.partial" -f $component.id, [DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff"), $attempt)
        Move-Item -LiteralPath $partial -Destination $quarantinePath -Force
      }
      if ($attempt -lt [Math]::Max(1, [Math]::Min($MaxRetries, 5))) { Start-Sleep -Seconds ([Math]::Min(8, [Math]::Pow(2, $attempt - 1))) }
    }
  }
  if (-not $completed) { throw "COMPONENT_DOWNLOAD_FAILED_$($component.id)" }
}

[pscustomobject]@{ ok = $true; cache = $cache.FullName; items = $results } | ConvertTo-Json -Depth 5 -Compress
