[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][string]$DataDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# preserve ProgramData business data by default; only app/service resources are removed.
$resolvedApp = [IO.Path]::GetFullPath($AppDir).TrimEnd('\', '/')
$resolvedData = [IO.Path]::GetFullPath($DataDir).TrimEnd('\', '/')
if ($resolvedApp -eq $resolvedData -or $resolvedData.Length -lt 12) { throw "UNINSTALL_PATH_INVALID" }
$winsw = Join-Path $resolvedApp "WinSW-x64.exe"
if (Test-Path -LiteralPath $winsw -PathType Leaf) {
  & $winsw stop
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { throw "SERVICE_STOP_FAILED" }
  & $winsw uninstall
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_REMOVE_FAILED" }
}
if (Test-Path -LiteralPath $resolvedApp) { Remove-Item -LiteralPath $resolvedApp -Recurse -Force }
Write-Output "Huashu application removed; ProgramData retained at $resolvedData"
