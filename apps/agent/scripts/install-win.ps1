# Easy Access Agent — Windows Installation Script
# Run: powershell -ExecutionPolicy Bypass -File install-win.ps1

param(
    [string]$HubUrl,
    [string]$AgentToken,
    [string[]]$AllowedDirs
)

$ErrorActionPreference = "Stop"
$ConfigDir = "$env:USERPROFILE\.easy-access-agent"
$ConfigFile = "$ConfigDir\config.json"

Write-Host ""
Write-Host "=== Easy Access Agent Installer ===" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = & node --version 2>$null
    Write-Host "[OK] Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Interactive prompts if args not provided
if (-not $HubUrl) {
    $HubUrl = Read-Host "Hub WebSocket URL (e.g. wss://myserver.com/ws)"
}
if (-not $AgentToken) {
    $AgentToken = Read-Host "Agent Token (from dashboard)"
}
if (-not $AllowedDirs -or $AllowedDirs.Count -eq 0) {
    $dirsInput = Read-Host "Allowed Directories (comma-separated, e.g. C:\Users\Data,D:\Shared)"
    $AllowedDirs = $dirsInput -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

# Validate
if (-not $HubUrl.Trim()) { Write-Host "[ERROR] Hub URL is required" -ForegroundColor Red; exit 1 }
if (-not $AgentToken.Trim()) { Write-Host "[ERROR] Agent Token is required" -ForegroundColor Red; exit 1 }
if ($AllowedDirs.Count -eq 0) { Write-Host "[ERROR] At least one allowed directory is required" -ForegroundColor Red; exit 1 }

# Create config directory
if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }

# Write config
$config = @{
    hubUrl = $HubUrl.Trim()
    agentToken = $AgentToken.Trim()
    allowedDirs = @($AllowedDirs)
} | ConvertTo-Json -Depth 3

Set-Content -Path $ConfigFile -Value $config -Encoding UTF8

Write-Host ""
Write-Host "[OK] Config saved to $ConfigFile" -ForegroundColor Green
Write-Host ""
Write-Host "To start the agent:" -ForegroundColor Yellow
Write-Host "  cd <easy-access-project>"
Write-Host "  pnpm --filter @easy-access/agent dev"
Write-Host ""
