[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ServiceDir,
  [string]$WinSwPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$resolved = [IO.Path]::GetFullPath($ServiceDir)
if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw "SERVICE_DIR_NOT_FOUND" }
$winsw = if ($WinSwPath) { [IO.Path]::GetFullPath($WinSwPath) } else { Join-Path $resolved "WinSW-x64.exe" }
if (-not (Test-Path -LiteralPath $winsw -PathType Leaf)) { throw "WINSW_NOT_FOUND" }
$xml = Join-Path $PSScriptRoot "HuashuWorkbench.xml"
Copy-Item -LiteralPath $xml -Destination (Join-Path $resolved "HuashuWorkbench.xml") -Force
& $winsw install
if ($LASTEXITCODE -ne 0) { throw "SERVICE_INSTALL_FAILED" }
& $winsw start
if ($LASTEXITCODE -ne 0) { throw "SERVICE_START_FAILED" }
Write-Output "HuashuWorkbench service installed and started"
