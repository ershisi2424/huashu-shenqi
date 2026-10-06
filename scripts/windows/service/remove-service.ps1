[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ServiceDir,
  [string]$WinSwPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$resolved = [IO.Path]::GetFullPath($ServiceDir)
$winsw = if ($WinSwPath) { [IO.Path]::GetFullPath($WinSwPath) } else { Join-Path $resolved "WinSW-x64.exe" }
if (-not (Test-Path -LiteralPath $winsw -PathType Leaf)) { throw "WINSW_NOT_FOUND" }
& $winsw stop
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { throw "SERVICE_STOP_FAILED" }
& $winsw uninstall
if ($LASTEXITCODE -ne 0) { throw "SERVICE_REMOVE_FAILED" }
Write-Output "HuashuWorkbench service removed; ProgramData was not touched"
