# OCP Control Panel — Windows Native (no WSL2/systemd/Docker required)
# Run:  right-click OCP-ControlPanel.bat → Run as administrator
#       or: powershell -ExecutionPolicy Bypass -File OCP-ControlPanel.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Continue'

# ── Repo root (folder containing this script) ──
$script:RepoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# ── Load .env ──
$script:EnvFile = Join-Path $RepoRoot '.env'
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | Where-Object { $_ -match '^([^=#]+)=(.*)$' } | ForEach-Object {
        $varName = $Matches[1]
        $varValue = $Matches[2]
        Set-Item -Path "env:$varName" -Value $varValue -ErrorAction SilentlyContinue
    }
}

# ── Config ──
$script:BotPort       = if ($env:BOT_PORT -match '^\d+$') { $env:BOT_PORT } else { '8090' }
$script:BotExe        = Join-Path $RepoRoot 'bot\bot-ocp.exe'
$script:FrontendDir   = Join-Path $RepoRoot 'frontend'
$script:CampaignDir   = Join-Path $RepoRoot 'campaign-runner'
$script:BotLog        = Join-Path $RepoRoot 'bot\bot.log'
$script:FrontendLog   = Join-Path $RepoRoot 'frontend\frontend.log'
$script:CampaignLog   = Join-Path $RepoRoot 'campaign-runner\campaign.log'

$script:Sync = [hashtable]::Synchronized(@{
    BotStatus      = '...'
    EvoStatus      = 'not-installed'
    CampaignStatus = '...'
    FrontendStatus = '...'
    BotDetail      = ''
    EvoDetail      = 'Evolution GO not installed (Docker required)'
    CampaignDetail = ''
    FrontendDetail = ''
    LastCheck      = '--:--:--'
    Running        = $true
    Logs           = [System.Collections.Queue]::Synchronized([System.Collections.Queue]::new())
    Command        = ''
    CommandReady   = $false
})

function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    $script:Sync.Logs.Enqueue("[$ts] $msg")
}

# ── helpers ──
function Get-ProcByName($name) {
    Get-Process -Name $name -ErrorAction SilentlyContinue
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

function Get-ProcAge($pid) {
    try {
        $ts = (Get-Date) - (Get-Process -Id $pid -ErrorAction Stop).StartTime
        if ($ts.TotalDays -ge 1) { return ('{0}d{1}h' -f [int]$ts.TotalDays, $ts.Hours) }
        if ($ts.TotalHours -ge 1) { return ('{0}h{1}m' -f $ts.Hours, $ts.Minutes) }
        return ('{0}m' -f [Math]::Max(1, [int]$ts.TotalMinutes))
    } catch { return '?' }
}

function Get-PortDetail($port, $url) {
    $pid = Get-PortPid $port
    if (-not $pid) { return @{ Bound=$false; Text="port :$port not bound" } }
    $parts = @("pid $pid", "up $(Get-ProcAge $pid)")
    if ($url) {
        $ok = Test-Health $url
        $parts += if ($ok) { 'healthy' } else { 'no http' }
    }
    return @{ Bound=$true; Text=($parts -join ' · ') }
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
    $env:BOT_DATABASE_URL = "postgresql://postgres:ocp_db_password@localhost:5432/ocp?sslmode=disable"
    Start-Process -FilePath $script:BotExe -ArgumentList '' -RedirectStandardOutput $script:BotLog -RedirectStandardError $script:BotLog -WindowStyle Hidden -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (Test-Health "http://localhost:$($script:BotPort)/health") {
        Log "[OK] Bot healthy on :$($script:BotPort)"
    } else {
        Log "[WARN] Bot not responding on :$($script:BotPort)"
    }
}

function Stop-Bot() {
    Get-Process -Name 'bot-ocp' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
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
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Frontend && cd /d `"$($script:FrontendDir)`" && call npm run dev -- --host 0.0.0.0 --port 5173 --strictPort" -RedirectStandardOutput $script:FrontendLog -RedirectStandardError $script:FrontendLog -WindowStyle Minimized -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    if (Test-Health 'http://localhost:5173/') {
        Log "[OK] Frontend healthy on :5173"
    } else {
        Log "[WARN] Frontend not responding on :5173"
    }
}

function Stop-Frontend() {
    Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            $cmd -like "*vite*"
        } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
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
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Campaign && cd /d `"$($script:CampaignDir)`" && call node server/index.js" -RedirectStandardOutput $script:CampaignLog -RedirectStandardError $script:CampaignLog -WindowStyle Minimized -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    if (Test-Health 'http://localhost:3001/health') {
        Log "[OK] Campaign Runner healthy on :3001"
    } else {
        Log "[WARN] Campaign Runner not responding on :3001"
    }
}

function Stop-Campaign() {
    Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            $cmd -like "*server/index.js*"
        } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Log "[OK] Campaign Runner stopped"
}

# ── BACKGROUND LOG TAILER ──
$logRunspace = [runspacefactory]::CreateRunspace()
$logRunspace.ApartmentState = 'STA'
$logRunspace.ThreadOptions = 'ReuseThread'
$logRunspace.Open() | Out-Null
$logRunspace.SessionStateProxy.SetVariable('Sync', $script:Sync)
$logRunspace.SessionStateProxy.SetVariable('RepoRoot', $script:RepoRoot)
$logRunspace.SessionStateProxy.SetVariable('BotLog', $script:BotLog)
$logRunspace.SessionStateProxy.SetVariable('FrontendLog', $script:FrontendLog)
$logRunspace.SessionStateProxy.SetVariable('CampaignLog', $script:CampaignLog)

$logPsCmd = [powershell]::Create()
$logPsCmd.Runspace = $logRunspace
$logPsCmd.AddScript({
    $seen = @{}
    $files = @(
        @{ Path=$BotLog; Label='BOT'   }
        @{ Path=$FrontendLog; Label='FE'   }
        @{ Path=$CampaignLog; Label='CAMP' }
    )
    $filePos = @{}
    foreach ($f in $files) { $filePos[$f.Path] = 0 }

    while ($Sync.Running) {
        foreach ($f in $files) {
            if (-not (Test-Path $f.Path)) { continue }
            try {
                $content = Get-Content $f.Path -ErrorAction SilentlyContinue
                if (-not $content) { continue }
                $pos = $filePos[$f.Path]
                $lines = @($content)
                if ($lines.Count -le $pos) { continue }
                $newLines = $lines[$pos..($lines.Count - 1)]
                $filePos[$f.Path] = $lines.Count
                foreach ($line in $newLines) {
                    $t = "$line".Trim()
                    if (-not $t) { continue }
                    if ($seen.ContainsKey($t)) { continue }
                    $seen[$t] = $true
                    if ($seen.Count -gt 300) { $seen.Clear() }
                    $Sync.Logs.Enqueue("[$($f.Label)] $t")
                }
            } catch {}
        }
        Start-Sleep -Seconds 2
    }
}) | Out-Null
$logPsCmd.BeginInvoke() | Out-Null

# ================= UI =================
$form = New-Object System.Windows.Forms.Form
$form.Text = 'OCP Control Panel — Windows Native'
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
$titleLbl.Text = [char]0x25CF + '  Orange Cheese Pizza'
$titleLbl.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$titleLbl.ForeColor = [System.Drawing.Color]::White
$titleLbl.Location = New-Object System.Drawing.Point(20, 12)
$titleLbl.Size = New-Object System.Drawing.Size(400, 35)
$header.Controls.Add($titleLbl)

$subLbl = New-Object System.Windows.Forms.Label
$subLbl.Text = 'Server Control Panel — Windows Native'
$subLbl.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$subLbl.ForeColor = [System.Drawing.Color]::FromArgb(255, 230, 200)
$subLbl.Location = New-Object System.Drawing.Point(22, 40)
$subLbl.Size = New-Object System.Drawing.Size(300, 18)
$header.Controls.Add($subLbl)

# status cards
$y = 75

function New-StatusCard($name, $port, $label, $x) {
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
    $dot.Text = [char]0x25CF
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

    return @{ Card=$card; Dot=$dot; State=$lblState; Detail=$lblDetail; Port=$lblPort }
}

$cBot   = New-StatusCard 'bot'   $script:BotPort   'PIZZA BOT API'   20
$cEvo   = New-StatusCard 'evo'   8080              'EVOLUTION GO'   200
$cCamp  = New-StatusCard 'camp'  3001              'CAMPAIGN RUNNER' 400
$cFront = New-StatusCard 'front' 5173              'FRONTEND'       605

# action buttons
$by = 186

$btnStartAll = New-Object System.Windows.Forms.Button
$btnStartAll.Text = [char]0x25B6 + '  START ALL'
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
$btnStopAll.Text = [char]0x25A0 + '  STOP ALL'
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
$btnRestart.Text = [char]0x21BB + '  RESTART'
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
    Set-Buttons $false
    $lblFooter.Text = 'Starting all services...'
    Start-Bot
    Start-Frontend
    Start-Campaign
    Set-Buttons $true
    Log "[OK] Start ALL initiated"
})

$btnStopAll.Add_Click({
    Set-Buttons $false
    $lblFooter.Text = 'Stopping all services...'
    Stop-Bot
    Stop-Frontend
    Stop-Campaign
    Set-Buttons $true
    Log "[OK] Stop ALL initiated"
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
    [System.Diagnostics.Process]::Start('http://localhost:5173')
})

$btnAdmin = New-Object System.Windows.Forms.Button
$btnAdmin.Text = [char]0x2699 + '  Admin Board'
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
    [System.Diagnostics.Process]::Start('http://localhost:5173/admin')
})

$btnFixPorts = New-Object System.Windows.Forms.Button
$btnFixPorts.Text = [char]0x2692 + '  Fix Ports'
$btnFixPorts.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$btnFixPorts.BackColor = [System.Drawing.Color]::FromArgb(35, 35, 50)
$btnFixPorts.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$btnFixPorts.FlatStyle = 'Flat'
$btnFixPorts.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
$btnFixPorts.Cursor = 'Hand'
$btnFixPorts.Location = New-Object System.Drawing.Point(280, 241)
$btnFixPorts.Size = New-Object System.Drawing.Size(120, 32)
$form.Controls.Add($btnFixPorts)
$btnFixPorts.Add_Click({
    $lblFooter.Text = 'Checking ports...'
    $d = Get-PortDetail $script:BotPort "http://localhost:$($script:BotPort)/health"
    Log "Bot: $($d.Text)"
    $d = Get-PortDetail 5173 'http://localhost:5173/'
    Log "Frontend: $($d.Text)"
    $d = Get-PortDetail 3001 'http://localhost:3001/health'
    Log "Campaign: $($d.Text)"
    Log "[OK] Port check complete"
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
$uiTimer.Interval = 1000

$uiTimer.Add_Tick({
    try {
        $green = [System.Drawing.Color]::Lime
        $red = [System.Drawing.Color]::FromArgb(255, 80, 80)
        $gray = [System.Drawing.Color]::Gray
        $amber = [System.Drawing.Color]::FromArgb(255, 180, 0)
        $txtGreen = [System.Drawing.Color]::FromArgb(110, 220, 110)
        $txtAmber = [System.Drawing.Color]::FromArgb(255, 200, 100)
        $txtRed = [System.Drawing.Color]::FromArgb(255, 110, 110)

        $botUp = Test-Health "http://localhost:$($script:BotPort)/health"
        $evoUp = $false
        $campUp = Test-Health 'http://localhost:3001/health'
        $frontUp = Test-Health 'http://localhost:5173/'

        $cBot.Dot.ForeColor = if ($botUp) { $green } else { $red }
        $cEvo.Dot.ForeColor = $gray
        $cCamp.Dot.ForeColor = if ($campUp) { $green } else { $red }
        $cFront.Dot.ForeColor = if ($frontUp) { $green } else { $red }

        $cBot.State.Text   = if ($botUp) { 'ACTIVE' } else { 'STOPPED' }
        $cEvo.State.Text   = 'N/A'
        $cCamp.State.Text  = if ($campUp) { 'ACTIVE' } else { 'STOPPED' }
        $cFront.State.Text = if ($frontUp) { 'ACTIVE' } else { 'STOPPED' }

        $d = Get-PortDetail $script:BotPort "http://localhost:$($script:BotPort)/health"
        $cBot.Detail.Text = $d.Text
        $d = Get-PortDetail 8080 'http://127.0.0.1:8080/server/ok'
        $cEvo.Detail.Text = $d.Text
        $d = Get-PortDetail 3001 'http://localhost:3001/health'
        $cCamp.Detail.Text = $d.Text
        $d = Get-PortDetail 5173 'http://localhost:5173/'
        $cFront.Detail.Text = $d.Text

        while ($script:Sync.Logs.Count -gt 0) {
            $line = $script:Sync.Logs.Dequeue()
            $ts = Get-Date -Format 'HH:mm:ss'
            $logBox.SelectionStart = $logBox.TextLength
            $logBox.SelectionLength = 0
            if ($line -match '(?i)error|fail|exception|denied|refused|blocked|invalid|crash') { $logBox.SelectionColor = $txtRed }
            elseif ($line -match '(?i)warn|not responding|not bound|no http') { $logBox.SelectionColor = $txtAmber }
            elseif ($line -match '(?i)\bok\b|success|healthy|listening|started|clear') { $logBox.SelectionColor = $txtGreen }
            else { $logBox.SelectionColor = $logBox.ForeColor }
            $logBox.AppendText("[$ts] $line`r`n")
        }

        $lines = $logBox.Lines
        if ($lines.Count -gt 200) {
            $logBox.Lines = $lines[($lines.Count - 150)..($lines.Count - 1)]
            $logBox.SelectionStart = $logBox.TextLength
            $logBox.ScrollToCaret()
        }

        $count = @($botUp, $campUp, $frontUp | Where-Object { $_ }).Count
        $lblFooter.Text = "$count of 3 services running · checked $(Get-Date -Format 'HH:mm:ss')"
    } catch {}
})

function Set-Buttons($enabled) {
    $btnStartAll.Enabled = $enabled
    $btnStopAll.Enabled = $enabled
    $btnRestart.Enabled = $enabled
}

$form.Add_FormClosed({
    $script:Sync.Running = $false
    $uiTimer.Stop()
})

$uiTimer.Start()

# ── INITIAL LOG LOAD ──
try {
    foreach ($f in @($script:BotLog, $script:FrontendLog, $script:CampaignLog)) {
        if (-not (Test-Path $f)) { continue }
        $label = if ($f -eq $script:BotLog) { 'BOT' } elseif ($f -eq $script:FrontendLog) { 'FE' } else { 'CAMP' }
        $content = Get-Content $f -ErrorAction SilentlyContinue -Tail 50
        foreach ($line in $content) {
            $t = "$line".Trim()
            if ($t) { $script:Sync.Logs.Enqueue("[$label] $t") }
        }
    }
} catch {}

[void]$form.ShowDialog()


