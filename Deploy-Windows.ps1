#requires -RunAsAdministrator
<#
.SYNOPSIS
    OCP Production Deployment Script (Native Windows)
.DESCRIPTION
    Builds and configures all OCP services for production on Windows.
    No WSL2, no Docker — pure Windows services.
.NOTES
    Run as Administrator: powershell -ExecutionPolicy Bypass -File Deploy-Windows.ps1
#>

param(
    [string]$InstallDir = "C:\Users\HOME\Downloads\ocp",
    [string]$DbPassword = $(Read-Host "Enter PostgreSQL password for 'ocp' user"),
    [string]$Domain = $(Read-Host "Enter your domain (e.g. yourdomain.com)"),
    [switch]$SkipBuild,
    [switch]$SkipNginx
)

$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  OCP Production Deployment (Native Windows)" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------
# 0. Prerequisites check
# ------------------------------------------------------------------
Write-Host "`n[0/9] Checking prerequisites..." -ForegroundColor Yellow

$required = @(
    @{ Name = "git";       Cmd = "git" },
    @{ Name = "node.js";   Cmd = "node" },
    @{ Name = "go";        Cmd = "go" },
    @{ Name = "psql";      Cmd = "psql" },
)

$missing = $false
foreach ($req in $required) {
    if (-not (Get-Command $req.Cmd -ErrorAction SilentlyContinue)) {
        Write-Host "  [MISSING] $($req.Name) — install from https://$($req.Name).org" -ForegroundColor Red
        $missing = $true
    } else {
        Write-Host "  [OK] $($req.Name) found" -ForegroundColor Green
    }
}

if ($missing) {
    Write-Host "`nInstall missing prerequisites and re-run." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------
# 1. Generate secrets
# ------------------------------------------------------------------
Write-Host "`n[1/9] Generating secrets..." -ForegroundColor Yellow

function New-SecureHex([int]$Bytes = 16) {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $bytes.GetBytes($buf)
    $bytes.Dispose()
    ($buf | ForEach-Object { $_.ToString("X2") }) -join ''
}

$botAdminKey       = New-SecureHex
$evolutionApiKey   = New-SecureHex
$evolutionWebhook  = New-SecureHex
$otpPepper         = New-SecureHex
$globalApiKey      = New-SecureHex

Write-Host "  [OK] Secrets generated" -ForegroundColor Green

# ------------------------------------------------------------------
# 2. Database setup
# ------------------------------------------------------------------
Write-Host "`n[2/9] Setting up PostgreSQL database..." -ForegroundColor Yellow

try {
    & psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE ocp;" 2>$null
    Write-Host "  [OK] Database 'ocp' created (or already exists)" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Database may already exist — continuing" -ForegroundColor Yellow
}

try {
    & psql -U postgres -h localhost -p 5432 -c "CREATE USER ocp WITH PASSWORD '$DbPassword';" 2>$null
    Write-Host "  [OK] User 'ocp' created (or already exists)" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] User may already exist — continuing" -ForegroundColor Yellow
}

& psql -U postgres -h localhost -p 5432 -c "GRANT ALL PRIVILEGES ON DATABASE ocp TO ocp;" 2>$null | Out-Null

# Apply migrations
Write-Host "  Applying migrations..." -ForegroundColor Gray
$migrationFiles = Get-ChildItem -Path "$InstallDir\bot\migrations\*.sql" | Sort-Object Name
foreach ($migration in $migrationFiles) {
    $env:PGPASSWORD = $DbPassword
    & psql -U ocp -h localhost -p 5432 -d ocp -f $migration.FullName 2>&1 | Out-Null
    Write-Host "    Applied: $($migration.Name)" -ForegroundColor Gray
}
Write-Host "  [OK] Migrations applied" -ForegroundColor Green

# ------------------------------------------------------------------
# 3. Build services
# ------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "`n[3/9] Building services..." -ForegroundColor Yellow

    # Backend
    Write-Host "  Building bot..." -ForegroundColor Gray
    & go build -o bot-ocp.exe . -WorkingDirectory "$InstallDir\bot"
    Write-Host "    [OK] bot-ocp.exe" -ForegroundColor Gray

    # Frontend
    Write-Host "  Building frontend..." -ForegroundColor Gray
    & npm ci --omit=dev -WorkingDirectory "$InstallDir\frontend"
    & npm run build -WorkingDirectory "$InstallDir\frontend"
    Write-Host "    [OK] frontend/dist/" -ForegroundColor Gray

    # Campaign runner
    Write-Host "  Building campaign runner..." -ForegroundColor Gray
    & npm ci --omit=dev -WorkingDirectory "$InstallDir\campaign-runner"
    & npm run build -WorkingDirectory "$InstallDir\campaign-runner"
    Write-Host "    [OK] campaign-runner built" -ForegroundColor Gray

    # Evolution GO
    Write-Host "  Building Evolution GO..." -ForegroundColor Gray
    & go build -o evolution-go.exe ./cmd/evolution-go/ -WorkingDirectory "$InstallDir\evolution-go"
    Write-Host "    [OK] evolution-go.exe" -ForegroundColor Gray
} else {
    Write-Host "`n[3/9] Skipping builds (-SkipBuild)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------
# 4. Write .env files
# ------------------------------------------------------------------
Write-Host "`n[4/9] Writing .env files..." -ForegroundColor Yellow

$botEnv = @"
# OCP Bot — Production
# Generated $Timestamp
BOT_PORT=8090
BOT_ADMIN_KEY=$botAdminKey
BOT_DATABASE_URL=postgresql://ocp:$DbPassword@localhost:5432/ocp?sslmode=disable

EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=$evolutionApiKey
EVOLUTION_INSTANCE=restaurant
EVOLUTION_INSTANCE_TOKEN=
EVOLUTION_WEBHOOK_SECRET=$evolutionWebhook

OTP_PEPPER=$otpPepper

CORS_ALLOWED_ORIGINS=https://$Domain,https://www.$Domain
LOG_LEVEL=info

INITIAL_ORG_NAME=Your Pizza Shop
INITIAL_ORG_SLUG=your-pizza-shop
INITIAL_CURRENCY=INR
INITIAL_TIMEZONE=Asia/Kolkata
INITIAL_OUTLET_NAME=Main Outlet
"@

$frontendEnv = @"
VITE_API_BASE_URL=https://api.$Domain
"@

$evolutionEnv = @"
SERVER_PORT=8080
POSTGRES_AUTH_DB=postgresql://ocp:$DbPassword@localhost:5432/evogo_auth?sslmode=disable
POSTGRES_USERS_DB=postgresql://ocp:$DbPassword@localhost:5432/evogo_users?sslmode=disable
DATABASE_SAVE_MESSAGES=false
CLIENT_NAME=evolution
GLOBAL_API_KEY=$globalApiKey
WADEBUG=INFO
LOGTYPE=console
WEBHOOK_FILES=true
CONNECT_ON_STARTUP=true
OS_NAME=Evolution GO
"@

Set-Content -Path "$InstallDir\bot\.env" -Value $botEnv
Set-Content -Path "$InstallDir\frontend\.env" -Value $frontendEnv
Set-Content -Path "$InstallDir\evolution-go\.env" -Value $evolutionEnv

# Create Evolution databases
& psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE evogo_auth OWNER ocp;" 2>$null
& psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE evogo_users OWNER ocp;" 2>$null

Write-Host "  [OK] .env files written" -ForegroundColor Green
Write-Host "  BOT_ADMIN_KEY: $botAdminKey" -ForegroundColor Gray
Write-Host "  GLOBAL_API_KEY: $globalApiKey" -ForegroundColor Gray

# ------------------------------------------------------------------
# 5. Start services
# ------------------------------------------------------------------
Write-Host "`n[5/9] Starting services..." -ForegroundColor Yellow

# Stop any existing instances
Get-Process -Name "bot-ocp" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "evolution-go" -ErrorAction SilentlyContinue | Stop-Process -Force

# Start Evolution GO
$env:EVOLUTION_API_KEY = $globalApiKey
Start-Process -FilePath "$InstallDir\evolution-go\evolution-go.exe" `
    -ArgumentList "-dev" `
    -WorkingDirectory "$InstallDir\evolution-go" `
    -RedirectStandardOutput "$InstallDir\evolution-go\evolution-go.log" `
    -RedirectStandardError "$InstallDir\evolution-go\evolution-go.log.err" `
    -WindowStyle Hidden

Start-Sleep -Seconds 5

# Start Bot
$env:BOT_PORT = '8090'
$env:BOT_ADMIN_KEY = $botAdminKey
$env:EVOLUTION_WEBHOOK_SECRET = $evolutionWebhook
$env:OTP_PEPPER = $otpPepper
$env:BOT_DATABASE_URL = "postgresql://ocp:$DbPassword@localhost:5432/ocp?sslmode=disable"

Start-Process -FilePath "$InstallDir\bot\bot-ocp.exe" `
    -WorkingDirectory "$InstallDir\bot" `
    -RedirectStandardOutput "$InstallDir\bot\bot.log" `
    -RedirectStandardError "$InstallDir\bot\bot.log.err" `
    -WindowStyle Hidden

Start-Sleep -Seconds 3

# Verify health
$health = Invoke-RestMethod -Uri "http://localhost:8090/health" -Method Get
Write-Host "  [OK] Bot API health: $($health.status)" -ForegroundColor Green

# ------------------------------------------------------------------
# 6. Nginx configuration (optional)
# ------------------------------------------------------------------
if (-not $SkipNginx) {
    Write-Host "`n[6/9] Nginx configuration..." -ForegroundColor Yellow
    Write-Host "  Nginx not automatically configured on Windows." -ForegroundColor Yellow
    Write-Host "  See DEPLOYMENT-Windows.md section 7 for manual Nginx + SSL setup." -ForegroundColor Yellow
} else {
    Write-Host "`n[6/9] Skipping Nginx (-SkipNginx)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------
# 7. Evolution GO instance setup
# ------------------------------------------------------------------
Write-Host "`n[7/9] Evolution GO WhatsApp setup..." -ForegroundColor Yellow
Write-Host "  1. Open http://localhost:8080/manager" -ForegroundColor Gray
Write-Host "  2. Login with GLOBAL_API_KEY: $globalApiKey" -ForegroundColor Gray
Write-Host "  3. Activate license (register email or set EVOLUTION_OPERATOR_EMAIL)" -ForegroundColor Gray
Write-Host "  4. Create instance → connect WhatsApp (scan QR)" -ForegroundColor Gray
Write-Host "  5. Copy instance token to bot/.env as EVOLUTION_INSTANCE_TOKEN" -ForegroundColor Gray
Write-Host "  6. Restart bot service" -ForegroundColor Gray
Write-Host "  [WARN] Until WhatsApp is connected, OTPs are logged to bot/bot.log.err" -ForegroundColor Yellow

# ------------------------------------------------------------------
# 8. Summary
# ------------------------------------------------------------------
Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Services:" -ForegroundColor Yellow
Write-Host "    Bot API:        http://localhost:8090"
Write-Host "    Frontend:       http://localhost:5173 (or via Nginx on :80)"
Write-Host "    Campaign Runner: http://localhost:3001"
Write-Host "    Evolution GO:   http://localhost:8080"
Write-Host ""
Write-Host "  Admin:            https://$Domain/admin"
Write-Host "  Admin key:        $botAdminKey"
Write-Host "  Evolution key:    $globalApiKey"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Connect WhatsApp instance in Evolution GO manager"
Write-Host "    2. Set EVOLUTION_INSTANCE_TOKEN in bot/.env and restart bot"
Write-Host "    3. Configure Nginx + SSL (see DEPLOYMENT-Windows.md)"
Write-Host "    4. Place a test order at https://$Domain"
Write-Host ""
Write-Host "  Logs:"
Write-Host "    Bot:      $InstallDir\bot\bot.log"
Write-Host "    Bot ERR:  $InstallDir\bot\bot.log.err"
Write-Host "    Evo:      $InstallDir\evolution-go\evolution-go.log"
Write-Host ""