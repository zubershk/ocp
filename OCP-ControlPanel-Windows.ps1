# OCP Control Panel - Windows Native (no WSL2/systemd/Docker required)
# Run:  right-click OCP-ControlPanel.bat -> Run as administrator
#       or: powershell -ExecutionPolicy Bypass -File OCP-ControlPanel.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Continue'

# Repo root
$script:RepoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# Load .env
$script:EnvFile = Join-Path $RepoRoot '.env'
if (Test-Path $EnvFile) {
    Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([^=#\s]+)\s*=\s*(.*)$' } | ForEach-Object {
        $varName = $Matches[1].Trim()
        $varValue = $Matches[2].Trim()
        if ($varValue -match '^([^#]+)#') { $varValue = $Matches[1].Trim() }
        Set-Item -Path "env:$varName" -Value $varValue -ErrorAction SilentlyContinue
    }
}

# Config
$script:BotPort = if ($env:BOT_PORT -match '^\d+$') { $env:BOT_PORT } else { '8090' }
$script:BotExe = Join-Path $RepoRoot 'bot\bot-ocp.exe'
$script:FrontendDir = Join-Path $RepoRoot 'frontend'
$script:CampaignDir = Join-Path $RepoRoot 'campaign-runner'
$script:BotLog = Join-Path $RepoRoot 'bot\bot.log'
$script:FrontendLog = Join-Path $RepoRoot 'frontend\frontend.log'
$script:CampaignLog = Join-Path $RepoRoot 'campaign-runner\campaign.log'

$script:Sync = [hashtable]::Synchronized(@{
    Running = $true
    Logs = [System.Collections.Queue]::Synchronized([System.Collections.Queue]::new())
})

function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    $script:Sync.Logs.Enqueue("[$ts] $msg")
}

function Get-PortPid($port) {
    try {
        $line = netstat -ano 2>$null | Select-String ":$port.*LISTEN" | Select-Object -First 1
        if ($line) { return ($line.ToString().Trim() -split '\s+')[-1] }
    } catch {}
    return $null
}

function Test-Health($url) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch { return $false }
}

function Start-Bot() {
    if (Test-Health "http://localhost:$($script:BotPort)/health") {
        Log "[OK] Bot already healthy on :$($script:BotPort)"
        return
    }
    if (-not (Test-Path $script:BotExe)) {
        Log "[ERR] Bot executable not found: $($script:BotExe)"
        return
    }
    if (-not $env:BOT_DATABASE_URL) {
        $dbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { '9f4a2c1e8b6d3f7a1c5e9b2d4f6a8c3e' }
        $env:BOT_DATABASE_URL = "postgresql://ocp:${dbPass}@localhost:5432/ocp?sslmode=disable"
    }
    if (-not $env:BOT_ADMIN_KEY) { $env:BOT_ADMIN_KEY = 'a7b3c9d1e5f7a2b4c6d8e0f1a3b5c7d9' }
    if (-not $env:EVOLUTION_WEBHOOK_SECRET) { $env:EVOLUTION_WEBHOOK_SECRET = 'f4e6d8c0a2b1d3f5a7b9c1d3e5f7a9b1' }
    if (-not $env:OTP_PEPPER) { $env:OTP_PEPPER = '3c5e7a9b1d3f5a7c9e0b2d4f6a8c1e3f' }
    if (-not $env:BOT_PORT) { $env:BOT_PORT = $script:BotPort }
    if (Test-Path $script:BotLog) { Remove-Item $script:BotLog -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath $script:BotExe -WorkingDirectory (Split-Path $script:BotExe) -RedirectStandardOutput $script:BotLog -RedirectStandardError "$($script:BotLog).err" -WindowStyle Hidden -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (Test-Health "http://localhost:$($script:BotPort)/health") {
        Log "[OK] Bot healthy on :$($script:BotPort)"
    } else {
        Log "[WARN] Bot not responding on :$($script:BotPort)"
    }
}

function Stop-Bot() {
    Get-Process -Name 'bot-ocp' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $pid = Get-PortPid $script:BotPort
    if ($pid) { try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {} }
    Log "[OK] Bot stopped"
}

function Start-Frontend() {
    if (Test-Health 'http://localhost:5173/') {
        Log "[OK] Frontend already healthy on :5173"
        return
    }
    if (-not (Test-Path $script:FrontendDir)) {
        Log "[ERR] Frontend dir not found: $($script:FrontendDir)"
        return
    }
    if (Test-Path $script:FrontendLog) { Remove-Item $script:FrontendLog -Force -ErrorAction SilentlyContinue }
    $feErrLog = "$($script:FrontendLog).err"
    if (Test-Path $feErrLog) { Remove-Item $feErrLog -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$($script:FrontendDir)`" && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort" -RedirectStandardOutput $script:FrontendLog -RedirectStandardError $feErrLog -WindowStyle Minimized -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    if (Test-Health 'http://localhost:5173/') {
        Log "[OK] Frontend healthy on :5173"
    } else {
        Log "[WARN] Frontend not responding on :5173"
    }
}

function Stop-Frontend() {
    Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
        try { (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*vite*" } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    $pid = Get-PortPid 5173
    if ($pid) { try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {} }
    Log "[OK] Frontend stopped"
}

function Start-Campaign() {
    if (Test-Health 'http://localhost:3001/health') {
        Log "[OK] Campaign Runner already healthy on :3001"
        return
    }
    if (-not (Test-Path $script:CampaignDir)) {
        Log "[ERR] Campaign dir not found: $($script:CampaignDir)"
        return
    }
    if (Test-Path $script:CampaignLog) { Remove-Item $script:CampaignLog -Force -ErrorAction SilentlyContinue }
    $campErrLog = "$($script:CampaignLog).err"
    if (Test-Path $campErrLog) { Remove-Item $campErrLog -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$($script:CampaignDir)`" && node server/index.js" -RedirectStandardOutput $script:CampaignLog -RedirectStandardError $campErrLog -WindowStyle Minimized -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    if (Test-Health 'http://localhost:3001/health') {
        Log "[OK] Campaign Runner healthy on :3001"
    } else {
        Log "[WARN] Campaign Runner not responding on :3001"
    }
}

function Stop-Campaign() {
    Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
        try { (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*server/index.js*" } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    $pid = Get-PortPid 3001
    if ($pid) { try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {} }
    Log "[OK] Campaign Runner stopped"
}

# UI
$form = New-Object System.Windows.Forms.Form
$form.Text = 'OCP Control Panel - Windows Native'
$form.Size = New-Object System.Drawing.Size(820, 640)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 26)

# header
$header = New-Object System.Windows.Forms.Panel
$header.BackColor = [System.Drawing.Color]::FromArgb(249, 115, 22)
$header.Dock = 'Top'
$header.Height = 60
$form.Controls.Add($header)

$titleLbl = New-Object System.Windows.Forms.Label
$titleLbl.Text = 'Orange Cheese Pizza'
$titleLbl.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$titleLbl.ForeColor = [System.Drawing.Color]::White
$titleLbl.Location = New-Object System.Drawing.Point(20, 12)
$titleLbl.Size = New-Object System.Drawing.Size(400, 35)
$header.Controls.Add($titleLbl)

$subLbl = New-Object System.Windows.Forms.Label
$subLbl.Text = 'Server Control Panel - Windows Native'
$subLbl.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$subLbl.ForeColor = [System.Drawing.Color]::FromArgb(255, 230, 200)
$subLbl.Location = New-Object System.Drawing.Point(22, 40)
$subLbl.Size = New-Object System.Drawing.Size(300, 18)
$header.Controls.Add($subLbl)

# status cards
$y = 75

function New-StatusCard($label, $port, $x) {
    $card = New-Object System.Windows.Forms.Panel
    $card.Location = New-Object System.Drawing.Point($x, $y)
    $card.Size = New-Object System.Drawing.Size(175, 96)
    $card.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
    $form.Controls.Add($card)

    $lblName = New-Object System.Windows.Forms.Label
    $lblName.Text = $label
    $lblName.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
    $lblName.ForeColor = [System.Drawing.Color]::Gray
    $lblName.Location = New-Object System.Drawing.Point(10, 8)
    $lblName.Size = New-Object System.Drawing.Size(120, 16)
    $card.Controls.Add($lblName)

    $lblPort = New-Object System.Windows.Forms.Label
    $lblPort.Text = ":$port"
    $lblPort.Font = New-Object System.Drawing.Font('Consolas', 9)
    $lblPort.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
    $lblPort.Location = New-Object System.Drawing.Point(10, 24)
    $lblPort.Size = New-Object System.Drawing.Size(60, 18)
    $card.Controls.Add($lblPort)

    $dot = New-Object System.Windows.Forms.Label
    $dot.Text = '*'
    $dot.Font = New-Object System.Drawing.Font('Arial', 16)
    $dot.ForeColor = [System.Drawing.Color]::Gray
    $dot.Location = New-Object System.Drawing.Point(150, 30)
    $dot.Size = New-Object System.Drawing.Size(30, 30)
    $card.Controls.Add($dot)

    $lblState = New-Object System.Windows.Forms.Label
    $lblState.Text = '---'
    $lblState.Font = New-Object System.Drawing.Font('Consolas', 9)
    $lblState.ForeColor = [System.Drawing.Color]::Gray
    $lblState.Location = New-Object System.Drawing.Point(10, 50)
    $lblState.Size = New-Object System.Drawing.Size(150, 18)
    $card.Controls.Add($lblState)

    $lblDetail = New-Object System.Windows.Forms.Label
    $lblDetail.Text = ''
    $lblDetail.Font = New-Object System.Drawing.Font('Consolas', 7.5)
    $lblDetail.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
    $lblDetail.Location = New-Object System.Drawing.Point(10, 70)
    $lblDetail.Size = New-Object System.Drawing.Size(160, 16)
    $card.Controls.Add($lblDetail)

    return @{ Card=$card; Dot=$dot; State=$lblState; Detail=$lblDetail }
}

$cBot = New-StatusCard 'PIZZA BOT API' $script:BotPort 20
$cCamp = New-StatusCard 'CAMPAIGN RUNNER' 3001 200
$cFront = New-StatusCard 'FRONTEND' 5173 400

# action buttons
$by = 186

$btnStartAll = New-Object System.Windows.Forms.Button
$btnStartAll.Text = 'START ALL'
$btnStartAll.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnStartAll.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
$btnStartAll.ForeColor = [System.Drawing.Color]::White
$btnStartAll.FlatStyle = 'Flat'
$btnStartAll.FlatAppearance.BorderSize = 0
$btnStartAll.Cursor = 'Hand'
$btnStartAll.Location = New-Object System.Drawing.Point(20, $by)
$btnStartAll.Size = New-Object System.Drawing.Size(190, 42)
$form.Controls.Add($btnStartAll)

$btnStopAll = New-Object System.Windows.Forms.Button
$btnStopAll.Text = 'STOP ALL'
$btnStopAll.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnStopAll.BackColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
$btnStopAll.ForeColor = [System.Drawing.Color]::White
$btnStopAll.FlatStyle = 'Flat'
$btnStopAll.FlatAppearance.BorderSize = 0
$btnStopAll.Cursor = 'Hand'
$btnStopAll.Location = New-Object System.Drawing.Point(220, $by)
$btnStopAll.Size = New-Object System.Drawing.Size(190, 42)
$form.Controls.Add($btnStopAll)

$btnRestart = New-Object System.Windows.Forms.Button
$btnRestart.Text = 'RESTART'
$btnRestart.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnRestart.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
$btnRestart.ForeColor = [System.Drawing.Color]::White
$btnRestart.FlatStyle = 'Flat'
$btnRestart.FlatAppearance.BorderSize = 0
$btnRestart.Cursor = 'Hand'
$btnRestart.Location = New-Object System.Drawing.Point(420, $by)
$btnRestart.Size = New-Object System.Drawing.Size(190, 42)
$form.Controls.Add($btnRestart)

$btnStartAll.Add_Click({
    $lblFooter.Text = 'Starting all services...'
    Start-Bot
    Start-Frontend
    Start-Campaign
    Log "[OK] Start ALL initiated"
})

$btnStopAll.Add_Click({
    $lblFooter.Text = 'Stopping all services...'
    Stop-Bot
    Stop-Frontend
    Stop-Campaign
    Log "[OK] Stop ALL initiated"
})

$btnRestart.Add_Click({
    $lblFooter.Text = 'Restarting all services...'
    Stop-Bot
    Stop-Frontend
    Stop-Campaign
    Start-Sleep -Seconds 2
    Start-Bot
    Start-Frontend
    Start-Campaign
    Log "[OK] Restart ALL completed"
})

# website shortcuts
$btnWebsite = New-Object System.Windows.Forms.Button
$btnWebsite.Text = 'Open Website'
$btnWebsite.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$btnWebsite.BackColor = [System.Drawing.Color]::FromArgb(35, 35, 50)
$btnWebsite.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$btnWebsite.FlatStyle = 'Flat'
$btnWebsite.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
$btnWebsite.Cursor = 'Hand'
$btnWebsite.Location = New-Object System.Drawing.Point(20, 241)
$btnWebsite.Size = New-Object System.Drawing.Size(120, 32)
$form.Controls.Add($btnWebsite)
$btnWebsite.Add_Click({
    Start-Process 'http://localhost:5173'
})

$btnAdmin = New-Object System.Windows.Forms.Button
$btnAdmin.Text = 'Admin Board'
$btnAdmin.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$btnAdmin.BackColor = [System.Drawing.Color]::FromArgb(35, 35, 50)
$btnAdmin.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$btnAdmin.FlatStyle = 'Flat'
$btnAdmin.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
$btnAdmin.Cursor = 'Hand'
$btnAdmin.Location = New-Object System.Drawing.Point(150, 241)
$btnAdmin.Size = New-Object System.Drawing.Size(120, 32)
$form.Controls.Add($btnAdmin)
$btnAdmin.Add_Click({
    Start-Process 'http://localhost:5173/admin'
})

# log section
$logHeader = New-Object System.Windows.Forms.Label
$logHeader.Text = 'LIVE LOGS'
$logHeader.Font = New-Object System.Drawing.Font('Consolas', 9, [System.Drawing.FontStyle]::Bold)
$logHeader.ForeColor = [System.Drawing.Color]::FromArgb(100, 200, 100)
$logHeader.Location = New-Object System.Drawing.Point(20, 281)
$logHeader.Size = New-Object System.Drawing.Size(200, 18)
$form.Controls.Add($logHeader)

$logBox = New-Object System.Windows.Forms.RichTextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.WordWrap = $false
$logBox.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 8, 14)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(120, 220, 120)
$logBox.BorderStyle = 'None'
$logBox.Location = New-Object System.Drawing.Point(20, 301)
$logBox.Size = New-Object System.Drawing.Size(760, 269)
$form.Controls.Add($logBox)

# footer
$footer = New-Object System.Windows.Forms.Panel
$footer.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
$footer.Dock = 'Bottom'
$footer.Height = 28
$form.Controls.Add($footer)

$lblFooter = New-Object System.Windows.Forms.Label
$lblFooter.Text = 'Ready'
$lblFooter.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$lblFooter.ForeColor = [System.Drawing.Color]::Gray
$lblFooter.Location = New-Object System.Drawing.Point(10, 6)
$lblFooter.Size = New-Object System.Drawing.Size(700, 18)
$footer.Controls.Add($lblFooter)

# UI update timer
$uiTimer = New-Object System.Windows.Forms.Timer
$uiTimer.Interval = 2000

$uiTimer.Add_Tick({
    try {
        $botUp = Test-Health "http://localhost:$($script:BotPort)/health"
        $campUp = Test-Health 'http://localhost:3001/health'
        $frontUp = Test-Health 'http://localhost:5173/'

        $cBot.Dot.ForeColor = if ($botUp) { [System.Drawing.Color]::Lime } else { [System.Drawing.Color]::FromArgb(255, 80, 80) }
        $cCamp.Dot.ForeColor = if ($campUp) { [System.Drawing.Color]::Lime } else { [System.Drawing.Color]::FromArgb(255, 80, 80) }
        $cFront.Dot.ForeColor = if ($frontUp) { [System.Drawing.Color]::Lime } else { [System.Drawing.Color]::FromArgb(255, 80, 80) }

        $cBot.State.Text = if ($botUp) { 'ACTIVE' } else { 'STOPPED' }
        $cCamp.State.Text = if ($campUp) { 'ACTIVE' } else { 'STOPPED' }
        $cFront.State.Text = if ($frontUp) { 'ACTIVE' } else { 'STOPPED' }

        $count = @($botUp, $campUp, $frontUp | Where-Object { $_ }).Count
        $lblFooter.Text = "$count of 3 services running"
    } catch {}
})

$form.Add_FormClosed({
    $script:Sync.Running = $false
    $uiTimer.Stop()
})

$uiTimer.Start()

[void]$form.ShowDialog()