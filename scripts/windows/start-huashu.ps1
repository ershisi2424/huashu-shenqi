param(
  [string]$AppDir = "C:\Huashu\app",
  [string]$DataDir = "C:\Huashu\data",
  [ValidateRange(1, 65535)] [int]$Port = 3102,
  [ValidateSet("127.0.0.1", "0.0.0.0", "localhost", "::1", "::", "[::]")] [string]$BindHost = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedAppDir = [System.IO.Path]::GetFullPath($AppDir)
$resolvedDataDir = [System.IO.Path]::GetFullPath($DataDir)
if (-not (Test-Path -LiteralPath $resolvedAppDir -PathType Container)) {
  throw "应用目录不存在：$resolvedAppDir"
}
if (-not (Test-Path -LiteralPath $resolvedDataDir -PathType Container)) {
  New-Item -ItemType Directory -Path $resolvedDataDir -Force | Out-Null
}

$env:NODE_ENV = "production"
$env:AUTH_REQUIRED = "true"
$env:APP_DIR = $resolvedAppDir
$env:AUTH_DB_PATH = Join-Path $resolvedDataDir "auth.sqlite"
$env:BIND_HOST = $BindHost
$env:PORT = [string]$Port

Push-Location $resolvedAppDir
try {
  & node "scripts/windows-deploy-check.cjs"
  if ($LASTEXITCODE -ne 0) { throw "部署配置校验失败，已停止启动" }
  Write-Host "正在启动 Huashu 服务：$BindHost`:$Port"
  & npm run start -- -H $BindHost -p $Port
  if ($LASTEXITCODE -ne 0) { throw "Huashu 服务退出，代码：$LASTEXITCODE" }
} finally {
  Pop-Location
}
