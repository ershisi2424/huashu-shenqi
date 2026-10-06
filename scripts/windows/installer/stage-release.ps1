[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [Parameter(Mandatory = $true)][string]$CacheDir,
  [Parameter(Mandatory = $true)][string]$ReleasesDir,
  [Parameter(Mandatory = $true)][string]$ActivePointerPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# Active pointer filename is active-release.json in ProgramData.
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.platform -ne "win32" -or $manifest.arch -ne "x64") { throw "MANIFEST_PLATFORM_UNSUPPORTED" }
if ($manifest.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') { throw "MANIFEST_VERSION_INVALID" }
$releaseRoot = [IO.Path]::GetFullPath($ReleasesDir)
$stage = Join-Path $releaseRoot (".staging-" + [Guid]::NewGuid().ToString("N"))
$verifier = Join-Path $PSScriptRoot "verify-component.ps1"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
  foreach ($component in $manifest.components) {
    $relative = [string]$component.relativePath
    $normalized = $relative.Replace("\\", "/")
    if ([IO.Path]::IsPathRooted($normalized) -or $normalized -match '(^|/)\.\.(/|$)' -or $normalized -match '^[A-Za-z]:') { throw "COMPONENT_PATH_TRAVERSAL" }
    $source = Join-Path $CacheDir ("{0}-{1}.download" -f $component.id, $component.sha256.ToLowerInvariant())
    & $verifier -FilePath $source -Sha256 $component.sha256 -Size ([Int64]$component.size) -Url $component.url | Out-Null
    $destination = [IO.Path]::GetFullPath((Join-Path $stage $normalized))
    if (-not $destination.StartsWith($stage.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "COMPONENT_PATH_TRAVERSAL" }
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destination)) | Out-Null
    if ([IO.Path]::GetExtension($source).ToLowerInvariant() -eq ".zip" -or $component.archive -eq $true) {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $archive = [IO.Compression.ZipFile]::OpenRead($source)
      try {
        foreach ($entry in $archive.Entries) {
          $entryName = $entry.FullName.Replace("\\", "/")
          if ([IO.Path]::IsPathRooted($entryName) -or $entryName -match '(^|/)\.\.(/|$)' -or $entry.Length -gt 2147483648) { throw "ARCHIVE_PATH_TRAVERSAL" }
        }
      } finally { $archive.Dispose() }
      Expand-Archive -LiteralPath $source -DestinationPath ([IO.Path]::GetDirectoryName($destination)) -Force
    } else {
      Copy-Item -LiteralPath $source -Destination $destination -Force
    }
  }
  $reparse = Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
  if ($reparse) { throw "RELEASE_REPARSE_POINT" }
  New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
  $final = Join-Path $releaseRoot $manifest.version
  if (Test-Path -LiteralPath $final) { throw "RELEASE_VERSION_EXISTS" }
  Move-Item -LiteralPath $stage -Destination $final
  $pointerDir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ActivePointerPath))
  New-Item -ItemType Directory -Force -Path $pointerDir | Out-Null
  $pointerTemp = "$ActivePointerPath.$([Guid]::NewGuid().ToString('N')).tmp"
  @{ version = $manifest.version; release = $final; updatedAt = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $pointerTemp -Encoding UTF8
  Move-Item -LiteralPath $pointerTemp -Destination $ActivePointerPath -Force
  [pscustomobject]@{ ok = $true; version = $manifest.version; release = $final; activePointer = $ActivePointerPath } | ConvertTo-Json -Compress
} catch {
  if (Test-Path -LiteralPath $stage) { Rename-Item -LiteralPath $stage -NewName ($stage + ".quarantine") -ErrorAction SilentlyContinue }
  throw
}
