[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ProductionDb,
  [Parameter(Mandatory = $true)][string]$CandidateDb,
  [Parameter(Mandatory = $true)][string]$StatePath,
  [Parameter(Mandatory = $true)][string]$MigrationsPath,
  [Parameter(Mandatory = $true)][string]$PointerPath,
  [Parameter(Mandatory = $true)][string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$runner = Join-Path $PSScriptRoot "upgrade-runner.cjs"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "UPGRADE_RUNNER_MISSING" }
& $NodePath $runner --mode candidate --production $ProductionDb --candidate $CandidateDb --state $StatePath --migrations $MigrationsPath
if ($LASTEXITCODE -ne 0) { throw "CANDIDATE_MIGRATION_FAILED" }
& $NodePath $runner --mode commit --production $ProductionDb --candidate $CandidateDb --state $StatePath --pointer $PointerPath --version $Version
if ($LASTEXITCODE -ne 0) { throw "UPGRADE_COMMIT_FAILED" }
