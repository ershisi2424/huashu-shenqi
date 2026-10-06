param(
  [string]$AppDir = "C:\Huashu\app",
  [ValidateRange(1, 65535)] [int]$Port = 3102,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($AppDir) {
  $resolvedAppDir = [System.IO.Path]::GetFullPath($AppDir).TrimEnd('\', '/')
  if (-not (Test-Path -LiteralPath $resolvedAppDir -PathType Container)) {
    throw "应用目录不存在：$resolvedAppDir"
  }
  Write-Host "仅检查端口 $Port；目标应用目录：$resolvedAppDir"
}

$connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($connections.Count -eq 0) {
  Write-Host "端口 $Port 当前没有监听进程"
  exit 0
}

$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
if ($processIds.Count -gt 1 -and -not $Force) {
  throw "端口 $Port 有多个监听进程（$($processIds -join ', ')），请确认后使用 -Force 指定停止"
}

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  $commandLine = [string]$processInfo.CommandLine
  if ($AppDir -and (-not $commandLine -or $commandLine.IndexOf($resolvedAppDir, [System.StringComparison]::OrdinalIgnoreCase) -lt 0)) {
    Write-Host "PID=$processId 未确认来自应用目录，已跳过；请人工确认后再处理"
    continue
  }
  if (-not $Force) {
    Write-Host "发现监听进程 PID=$processId（$($process.ProcessName)）。确认后重新执行：-Force"
    continue
  }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  $commandLine = [string]$processInfo.CommandLine
  if (-not $commandLine -or $commandLine.IndexOf($resolvedAppDir, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "PID=$processId 不属于应用目录 $resolvedAppDir，已拒绝停止"
  }
  Stop-Process -Id $processId -Confirm:$false
  Write-Host "已停止 PID=$processId（$($process.ProcessName)）"
}
