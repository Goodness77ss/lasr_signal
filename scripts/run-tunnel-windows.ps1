# run-tunnel-windows.ps1
# Exposes your local Journey server to a public HTTPS URL using Cloudflare Tunnel.
# Runs 100% on Windows with zero setup and free automatic HTTPS.

$ErrorActionPreference = "Stop"

$cloudflared = Get-Command "cloudflared" -ErrorAction SilentlyContinue

if (!$cloudflared) {
    $runtimeDir = Join-Path $PSScriptRoot "..\.runtime\bin"
    if (!(Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
    $localExe = Join-Path $runtimeDir "cloudflared.exe"

    if (!(Test-Path $localExe)) {
        Write-Host "Downloading official cloudflared Windows binary..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $localExe
    }
    $tunnelCmd = $localExe
} else {
    $tunnelCmd = "cloudflared"
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Starting public HTTPS tunnel to http://127.0.0.1:5174..." -ForegroundColor Green
Write-Host " Look for the public https://*.trycloudflare.com link below:" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

& $tunnelCmd tunnel --url http://127.0.0.1:5174
