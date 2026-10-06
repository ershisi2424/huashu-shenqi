[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [int]$Port = 3102
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$resolvedApp = [IO.Path]::GetFullPath($AppDir)
$resolvedData = [IO.Path]::GetFullPath($DataDir)
$node = Join-Path $resolvedApp "runtime\node.exe"
$verifier = Join-Path $resolvedApp "scripts\windows\verify-release.cjs"
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "NODE_RUNTIME_MISSING" }
if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) { throw "RELEASE_VERIFIER_MISSING" }
& $node $verifier $resolvedData
if ($LASTEXITCODE -ne 0) { throw "RELEASE_VERIFY_FAILED" }
$env:NODE_ENV = "production"
$env:AUTH_REQUIRED = "true"
$env:APP_DIR = $resolvedApp
$env:DATA_DIR = $resolvedData
$env:AUTH_DB_PATH = Join-Path $resolvedData "data\auth.sqlite"
$env:AI_REPLY_CONFIG_PATH = Join-Path $resolvedData "config\provider.json"
$env:PORT = [string]$Port
& $node (Join-Path $resolvedApp "scripts\windows-deploy-check.cjs")
if ($LASTEXITCODE -ne 0) { throw "DEPLOY_CHECK_FAILED" }
Write-Output "Huashu repair checks passed"
