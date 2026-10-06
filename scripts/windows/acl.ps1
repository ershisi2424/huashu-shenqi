[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$DataDir,
  [Parameter(Mandatory = $true)][string]$AppDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$resolvedData = [IO.Path]::GetFullPath($DataDir)
$resolvedApp = [IO.Path]::GetFullPath($AppDir)
foreach ($directory in @($resolvedData, $resolvedApp)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }

# SYSTEM and Administrators own the deployment; LocalService receives only the
# runtime data/config/log access it needs. Users never receive provider/DB access.
& icacls $resolvedApp /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "Administrators:(OI)(CI)(F)" /remove:g "Users" | Out-Null
& icacls $resolvedData /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "Administrators:(OI)(CI)(F)" "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)(M)" /remove:g "Users" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "ACL_APPLY_FAILED" }
Write-Output "Huashu ACL applied"
