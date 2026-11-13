# run-all-windows.ps1
# Starts the authoritative Journey game service and production web preview on Windows.

$ErrorActionPreference = "Stop"

Write-Host "Preparing LAST SIGNAL Journey on Windows..." -ForegroundColor Cyan

# Ensure build exists
if (!(Test-Path "apps\web\dist\index.html")) {
    Write-Host "Building production web assets..." -ForegroundColor Yellow
    npm run build
}

$env:JOURNEY_ENABLED = "true"
$env:HOST = "127.0.0.1"
$env:PORT = "3001"

Write-Host "Starting Journey game service on port 3001..." -ForegroundColor Cyan
$server = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "server" -PassThru -NoNewWindow
Start-Sleep -Seconds 2

Write-Host "Starting web preview on port 5174..." -ForegroundColor Cyan
$web = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "preview", "-w", "@last-signal/web", "--", "--port", "5174", "--host", "0.0.0.0" -PassThru -NoNewWindow

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " LAST SIGNAL Journey is running!" -ForegroundColor Green
Write-Host " Open in browser: http://127.0.0.1:5174/" -ForegroundColor Green
Write-Host " Press Ctrl+C in this terminal to stop." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

try {
    Wait-Process -Id $server.Id, $web.Id
} finally {
    Write-Host "Stopping services..." -ForegroundColor Yellow
    if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    if ($web -and !$web.HasExited) { Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue }
}
