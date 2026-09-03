Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ============================================================
# OCP Control Panel â€” Production Build
# Non-blocking async architecture (no UI freezes)
# ============================================================

$script:BotSvc = 'orange-cheese-pizza-bot'
$script:EvoSvc = 'evolution-go'
$script:CampaignSvc = 'ocp-campaign-runner'
$script:Sync = [hashtable]::Synchronized(@{
    BotStatus      = '...'
    EvoStatus      = '...'
    CampaignStatus = '...'
    FrontendStatus = '...'
    Running        = $true
    Logs           = [System.Collections.Queue]::Synchronized([System.Collections.Queue]::new())
    Command        = ''
    CommandReady   = $false
})

# ================= BACKGROUND RUNSPACE =================
$runspace = [runspacefactory]::CreateRunspace()
$runspace.ApartmentState = 'STA'
$runspace.ThreadOptions = 'ReuseThread'
$runspace.Open() | Out-Null
$runspace.SessionStateProxy.SetVariable('Sync', $Sync)

$psCmd = [powershell]::Create()
$psCmd.Runspace = $runspace
$psCmd.AddScript({
    function Get-Svc($name) {
        try {
            $r = wsl -u pizza -e bash -c "systemctl --user is-active $name" 2>$null
            return "$r".Trim()
        } catch { return 'unknown' }
    }
    function Send-Cmd($cmd) {
        try { wsl -u pizza -e bash -c $cmd 2>$null | Out-Null } catch {}
    }
    function Get-Frontend {
        try {
            $p = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
                try { $_.Path -like "*vite*" -or $_.MainModule.FileName -like "*vite*" } catch { $false }
            }
            if ($p) { return 'active' }
            $port = netstat -ano 2>$null | Select-String ":5173.*LISTEN"
            if ($port) { return 'active' }
        } catch {}
        return 'stopped'
    }
    function Start-FrontendDev {
        $bat = Join-Path $PSScriptRoot 'OCP-FRONTEND.bat'
        if (Test-Path $bat) {
            Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WindowStyle Minimized
        } else {
            $feDir = Join-Path $PSScriptRoot 'frontend'
            if (Test-Path $feDir) {
                Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Frontend && cd /d `"$feDir`" && wsl -d Ubuntu -u pizza -e bash -c `"cd /mnt/c/Users/Pizza/Downloads/Tech-OCP/frontend && npx vite --host`"" -WindowStyle Minimized
            }
        }
    }
    function Stop-FrontendDev {
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            try {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                $cmd -like "*vite*"
            } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    while ($Sync.Running) {
        # check for pending command
        if ($Sync.CommandReady) {
            $cmd = $Sync.Command
            $Sync.CommandReady = $false
            $Sync.Command = ''
            switch ($cmd) {
                'start_all' {
                    $Sync.Logs.Enqueue('[INFO] Starting all services + frontend...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start evolution-go orange-cheese-pizza-bot ocp-campaign-runner'
                    Start-FrontendDev
                    $Sync.Logs.Enqueue('[OK] All services + frontend started')
                }
                'stop_all' {
                    $Sync.Logs.Enqueue('[INFO] Stopping all services + frontend...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user stop evolution-go orange-cheese-pizza-bot ocp-campaign-runner'
                    Stop-FrontendDev
                    $Sync.Logs.Enqueue('[OK] All services + frontend stopped')
                }
                'start_bot' {
                    $Sync.Logs.Enqueue('[INFO] Starting bot...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start orange-cheese-pizza-bot'
                }
                'start_evo' {
                    $Sync.Logs.Enqueue('[INFO] Starting Evolution GO...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start evolution-go'
                }
                'start_campaign' {
                    $Sync.Logs.Enqueue('[INFO] Starting Campaign Runner...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start ocp-campaign-runner'
                }
                'stop_campaign' {
                    $Sync.Logs.Enqueue('[INFO] Stopping Campaign Runner...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user stop ocp-campaign-runner'
                }
                'start_frontend' {
                    $Sync.Logs.Enqueue('[INFO] Starting frontend dev server...')
                    Start-FrontendDev
                    $Sync.Logs.Enqueue('[OK] Frontend started')
                }
                'stop_frontend' {
                    $Sync.Logs.Enqueue('[INFO] Stopping frontend dev server...')
                    Stop-FrontendDev
                    $Sync.Logs.Enqueue('[OK] Frontend stopped')
                }
            }
        }

        # poll status
        $Sync.BotStatus = Get-Svc $BotSvc
        $Sync.EvoStatus = Get-Svc $EvoSvc
        $Sync.CampaignStatus = Get-Svc $CampaignSvc
        $Sync.FrontendStatus = Get-Frontend

        # drain log queue from service journal
        try {
            $lines = wsl -u pizza -e bash -c "journalctl --user -u orange-cheese-pizza-bot -n 5 --no-pager -o cat 2>/dev/null" 2>$null
            foreach ($line in $lines) {
                if ($line -and $line.Trim()) {
                    $Sync.Logs.Enqueue($line.Trim())
                }
            }
            while ($Sync.Logs.Count -gt 100) { $Sync.Logs.Dequeue() | Out-Null }
        } catch {}

        Start-Sleep -Seconds 3
    }
}) | Out-Null
$psCmd.BeginInvoke() | Out-Null

# ================= UI THREAD =================
$form = New-Object System.Windows.Forms.Form
$form.Text = 'OCP Control Panel v2'
$form.Size = New-Object System.Drawing.Size(810, 640)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 26)
$form.Icon = [System.Drawing.SystemIcons]::Application

# ---- header bar ----
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
$subLbl.Text = 'Server Control Panel v2.0'
$subLbl.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$subLbl.ForeColor = [System.Drawing.Color]::FromArgb(255, 230, 200)
$subLbl.Location = New-Object System.Drawing.Point(22, 40)
$subLbl.Size = New-Object System.Drawing.Size(300, 18)
$header.Controls.Add($subLbl)

# ---- status cards ----
$y = 75

# Evolution card
$cardEvo = New-Object System.Windows.Forms.Panel
$cardEvo.Location = New-Object System.Drawing.Point(20, $y)
$cardEvo.Size = New-Object System.Drawing.Size(175, 80)
$cardEvo.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
$form.Controls.Add($cardEvo)

$lblEvoName = New-Object System.Windows.Forms.Label
$lblEvoName.Text = 'EVOLUTION GO'
$lblEvoName.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
$lblEvoName.ForeColor = [System.Drawing.Color]::Gray
$lblEvoName.Location = New-Object System.Drawing.Point(10, 8)
$lblEvoName.Size = New-Object System.Drawing.Size(120, 16)
$cardEvo.Controls.Add($lblEvoName)

$lblEvoPort = New-Object System.Windows.Forms.Label
$lblEvoPort.Text = ':8080'
$lblEvoPort.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblEvoPort.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblEvoPort.Location = New-Object System.Drawing.Point(10, 24)
$lblEvoPort.Size = New-Object System.Drawing.Size(60, 18)
$cardEvo.Controls.Add($lblEvoPort)

$dotEvo = New-Object System.Windows.Forms.Label
$dotEvo.Text = [char]0x25CF
$dotEvo.Font = New-Object System.Drawing.Font('Arial', 16)
$dotEvo.ForeColor = [System.Drawing.Color]::Gray
$dotEvo.Location = New-Object System.Drawing.Point(150, 30)
$dotEvo.Size = New-Object System.Drawing.Size(30, 30)
$cardEvo.Controls.Add($dotEvo)

$lblEvoState = New-Object System.Windows.Forms.Label
$lblEvoState.Text = '---'
$lblEvoState.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblEvoState.ForeColor = [System.Drawing.Color]::Gray
$lblEvoState.Location = New-Object System.Drawing.Point(10, 50)
$lblEvoState.Size = New-Object System.Drawing.Size(150, 18)
$cardEvo.Controls.Add($lblEvoState)

# Bot card
$cardBot = New-Object System.Windows.Forms.Panel
$cardBot.Location = New-Object System.Drawing.Point(200, $y)
$cardBot.Size = New-Object System.Drawing.Size(175, 80)
$cardBot.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
$form.Controls.Add($cardBot)

$lblBotName = New-Object System.Windows.Forms.Label
$lblBotName.Text = 'PIZZA BOT API'
$lblBotName.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
$lblBotName.ForeColor = [System.Drawing.Color]::Gray
$lblBotName.Location = New-Object System.Drawing.Point(10, 8)
$lblBotName.Size = New-Object System.Drawing.Size(120, 16)
$cardBot.Controls.Add($lblBotName)

$lblBotPort = New-Object System.Windows.Forms.Label
$lblBotPort.Text = ':8090'
$lblBotPort.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblBotPort.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblBotPort.Location = New-Object System.Drawing.Point(10, 24)
$lblBotPort.Size = New-Object System.Drawing.Size(60, 18)
$cardBot.Controls.Add($lblBotPort)

$dotBot = New-Object System.Windows.Forms.Label
$dotBot.Text = [char]0x25CF
$dotBot.Font = New-Object System.Drawing.Font('Arial', 16)
$dotBot.ForeColor = [System.Drawing.Color]::Gray
$dotBot.Location = New-Object System.Drawing.Point(150, 30)
$dotBot.Size = New-Object System.Drawing.Size(30, 30)
$cardBot.Controls.Add($dotBot)

$lblBotState = New-Object System.Windows.Forms.Label
$lblBotState.Text = '---'
$lblBotState.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblBotState.ForeColor = [System.Drawing.Color]::Gray
$lblBotState.Location = New-Object System.Drawing.Point(10, 50)
$lblBotState.Size = New-Object System.Drawing.Size(150, 18)
$cardBot.Controls.Add($lblBotState)

# Campaign Runner card
$cardCampaign = New-Object System.Windows.Forms.Panel
$cardCampaign.Location = New-Object System.Drawing.Point(400, $y)
$cardCampaign.Size = New-Object System.Drawing.Size(175, 80)
$cardCampaign.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
$form.Controls.Add($cardCampaign)

$lblCampaignName = New-Object System.Windows.Forms.Label
$lblCampaignName.Text = 'CAMPAIGN RUNNER'
$lblCampaignName.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
$lblCampaignName.ForeColor = [System.Drawing.Color]::Gray
$lblCampaignName.Location = New-Object System.Drawing.Point(10, 8)
$lblCampaignName.Size = New-Object System.Drawing.Size(130, 16)
$cardCampaign.Controls.Add($lblCampaignName)

$lblCampaignPort = New-Object System.Windows.Forms.Label
$lblCampaignPort.Text = ':3001'
$lblCampaignPort.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblCampaignPort.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblCampaignPort.Location = New-Object System.Drawing.Point(10, 24)
$lblCampaignPort.Size = New-Object System.Drawing.Size(60, 18)
$cardCampaign.Controls.Add($lblCampaignPort)

$dotCampaign = New-Object System.Windows.Forms.Label
$dotCampaign.Text = [char]0x25CF
$dotCampaign.Font = New-Object System.Drawing.Font('Arial', 16)
$dotCampaign.ForeColor = [System.Drawing.Color]::Gray
$dotCampaign.Location = New-Object System.Drawing.Point(140, 30)
$dotCampaign.Size = New-Object System.Drawing.Size(30, 30)
$cardCampaign.Controls.Add($dotCampaign)

$lblCampaignState = New-Object System.Windows.Forms.Label
$lblCampaignState.Text = '---'
$lblCampaignState.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblCampaignState.ForeColor = [System.Drawing.Color]::Gray
$lblCampaignState.Location = New-Object System.Drawing.Point(10, 50)
$lblCampaignState.Size = New-Object System.Drawing.Size(150, 18)
$cardCampaign.Controls.Add($lblCampaignState)

# Frontend card
$cardFrontend = New-Object System.Windows.Forms.Panel
$cardFrontend.Location = New-Object System.Drawing.Point(605, $y)
$cardFrontend.Size = New-Object System.Drawing.Size(175, 80)
$cardFrontend.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 40)
$form.Controls.Add($cardFrontend)

$lblFrontendName = New-Object System.Windows.Forms.Label
$lblFrontendName.Text = 'FRONTEND'
$lblFrontendName.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
$lblFrontendName.ForeColor = [System.Drawing.Color]::Gray
$lblFrontendName.Location = New-Object System.Drawing.Point(10, 8)
$lblFrontendName.Size = New-Object System.Drawing.Size(100, 16)
$cardFrontend.Controls.Add($lblFrontendName)

$lblFrontendPort = New-Object System.Windows.Forms.Label
$lblFrontendPort.Text = ':5173'
$lblFrontendPort.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblFrontendPort.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblFrontendPort.Location = New-Object System.Drawing.Point(10, 24)
$lblFrontendPort.Size = New-Object System.Drawing.Size(60, 18)
$cardFrontend.Controls.Add($lblFrontendPort)

$dotFrontend = New-Object System.Windows.Forms.Label
$dotFrontend.Text = [char]0x25CF
$dotFrontend.Font = New-Object System.Drawing.Font('Arial', 16)
$dotFrontend.ForeColor = [System.Drawing.Color]::Gray
$dotFrontend.Location = New-Object System.Drawing.Point(140, 30)
$dotFrontend.Size = New-Object System.Drawing.Size(30, 30)
$cardFrontend.Controls.Add($dotFrontend)

$lblFrontendState = New-Object System.Windows.Forms.Label
$lblFrontendState.Text = '---'
$lblFrontendState.Font = New-Object System.Drawing.Font('Consolas', 9)
$lblFrontendState.ForeColor = [System.Drawing.Color]::Gray
$lblFrontendState.Location = New-Object System.Drawing.Point(10, 50)
$lblFrontendState.Size = New-Object System.Drawing.Size(150, 18)
$cardFrontend.Controls.Add($lblFrontendState)

# ---- action buttons ----
$by = 170

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
    $lblFooter.Text = 'Starting all services + frontend...'
    $Sync.Command = 'start_all'
    $Sync.CommandReady = $true
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 4000
    $timer.Add_Tick({ Set-Buttons $true; $this.Stop() })
    $timer.Start()
})

$btnStopAll.Add_Click({
    Set-Buttons $false
    $lblFooter.Text = 'Stopping all services + frontend...'
    $Sync.Command = 'stop_all'
    $Sync.CommandReady = $true
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 3000
    $timer.Add_Tick({ Set-Buttons $true; $this.Stop() })
    $timer.Start()
})

$btnRestart.Add_Click({
    Set-Buttons $false
    $lblFooter.Text = 'Restarting all...'
    $Sync.Command = 'stop_all'
    $Sync.CommandReady = $true
    $restartTimer = New-Object System.Windows.Forms.Timer
    $restartTimer.Interval = 3500
    $restartTimer.Add_Tick({
        $Sync.Command = 'start_all'
        $Sync.CommandReady = $true
        $this.Stop()
        Set-Buttons $true
    })
    $restartTimer.Start()
})

# ---- website shortcuts ----
$btnWebsite = New-Object System.Windows.Forms.Button
$btnWebsite.Text = 'Open Website'
$btnWebsite.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$btnWebsite.BackColor = [System.Drawing.Color]::FromArgb(35, 35, 50)
$btnWebsite.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$btnWebsite.FlatStyle = 'Flat'
$btnWebsite.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
$btnWebsite.Cursor = 'Hand'
$btnWebsite.Location = New-Object System.Drawing.Point(20, 225)
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
$btnAdmin.Location = New-Object System.Drawing.Point(150, 225)
$btnAdmin.Size = New-Object System.Drawing.Size(120, 32)
$form.Controls.Add($btnAdmin)
$btnAdmin.Add_Click({
    [System.Diagnostics.Process]::Start('http://localhost:5173/admin')
})

# ---- log section ----
$logHeader = New-Object System.Windows.Forms.Label
$logHeader.Text = 'LIVE LOGS'
$logHeader.Font = New-Object System.Drawing.Font('Consolas', 9, [System.Drawing.FontStyle]::Bold)
$logHeader.ForeColor = [System.Drawing.Color]::FromArgb(100, 200, 100)
$logHeader.Location = New-Object System.Drawing.Point(20, 265)
$logHeader.Size = New-Object System.Drawing.Size(200, 18)
$form.Controls.Add($logHeader)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.WordWrap = $false
$logBox.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 8, 14)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(120, 220, 120)
$logBox.BorderStyle = 'None'
$logBox.Location = New-Object System.Drawing.Point(20, 285)
$logBox.Size = New-Object System.Drawing.Size(760, 285)
$form.Controls.Add($logBox)

# ---- footer status bar ----
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

# ================= UI UPDATE TIMER =================
$uiTimer = New-Object System.Windows.Forms.Timer
$uiTimer.Interval = 1000

$lastLogCount = 0
$uiTimer.Add_Tick({
    try {
        $botUp = $Sync.BotStatus -eq 'active'
        $evoUp = $Sync.EvoStatus -eq 'active'
        $campaignUp = $Sync.CampaignStatus -eq 'active'
        $frontendUp = $Sync.FrontendStatus -eq 'active'

        $green = [System.Drawing.Color]::Lime
        $red = [System.Drawing.Color]::FromArgb(255, 80, 80)
        $gray = [System.Drawing.Color]::Gray

        $dotBot.ForeColor = if ($botUp) { $green } elseif ($Sync.BotStatus -eq '...') { $gray } else { $red }
        $dotEvo.ForeColor = if ($evoUp) { $green } elseif ($Sync.EvoStatus -eq '...') { $gray } else { $red }
        $dotCampaign.ForeColor = if ($campaignUp) { $green } elseif ($Sync.CampaignStatus -eq '...') { $gray } else { $red }
        $dotFrontend.ForeColor = if ($frontendUp) { $green } elseif ($Sync.FrontendStatus -eq '...') { $gray } else { $red }

        $lblBotState.Text = $Sync.BotStatus.ToUpper()
        $lblEvoState.Text = $Sync.EvoStatus.ToUpper()
        $lblCampaignState.Text = $Sync.CampaignStatus.ToUpper()
        $lblFrontendState.Text = $Sync.FrontendStatus.ToUpper()

        while ($Sync.Logs.Count -gt 0) {
            $line = $Sync.Logs.Dequeue()
            $ts = Get-Date -Format 'HH:mm:ss'
            $logBox.AppendText("[$ts] $line`r`n")
        }

        $lines = $logBox.Lines
        if ($lines.Count -gt 200) {
            $logBox.Lines = $lines[($lines.Count - 150)..($lines.Count - 1)]
            $logBox.SelectionStart = $logBox.TextLength
            $logBox.ScrollToCaret()
        }

        if ($Sync.CommandReady) {
            $lblFooter.Text = 'Processing command...'
        } else {
            $count = @($botUp, $evoUp, $campaignUp, $frontendUp | Where-Object { $_ }).Count
            $lblFooter.Text = "$count of 4 services running"
        }
    } catch {}
})

# ================= BUTTON EVENTS =================
function Set-Buttons($enabled) {
    $btnStartAll.Enabled = $enabled
    $btnStopAll.Enabled = $enabled
    $btnRestart.Enabled = $enabled
}

# ================= CLEANUP ON CLOSE =================
$form.Add_FormClosed({
    $Sync.Running = $false
    $uiTimer.Stop()
    $psCmd.Stop()
    $runspace.Close()
})

# ================= SHOW =================
$uiTimer.Start()
[void]$form.ShowDialog()
