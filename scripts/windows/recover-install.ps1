[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ProductionDb,
  [Parameter(Mandatory = $true)][string]$StatePath,
  [Parameter(Mandatory = $true)][string]$PointerPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$runner = Join-Path $PSScriptRoot "upgrade-runner.cjs"
& $NodePath $runner --mode recover --production $ProductionDb --state $StatePath --pointer $PointerPath
if ($LASTEXITCODE -ne 0) { throw "UPGRADE_RECOVERY_FAILED" }
