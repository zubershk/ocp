Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ============================================================
# OCP Control Panel - Production Build
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
    BotDetail      = ''
    EvoDetail      = ''
    CampaignDetail = ''
    FrontendDetail = ''
    BotPort        = $false
    EvoPort        = $false
    CampaignPort   = $false
    LastCheck      = '--:--:--'
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
# Service names must be shared explicitly — a fresh runspace does not
# inherit script variables, so without this Get-Svc always got ''.
$runspace.SessionStateProxy.SetVariable('BotSvc', $script:BotSvc)
$runspace.SessionStateProxy.SetVariable('EvoSvc', $script:EvoSvc)
$runspace.SessionStateProxy.SetVariable('CampaignSvc', $script:CampaignSvc)
# Repo root must be shared explicitly too — $PSScriptRoot is empty inside
# a fresh runspace, so START ALL previously couldn't locate OCP-FRONTEND.bat.
$runspace.SessionStateProxy.SetVariable('RepoRoot', $PSScriptRoot)

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
    function Clear-StrayBot {
        # Kill stray bot-ocp processes (manual nohup runs) that squat :8090
        # and crash-loop the systemd service with "bind: address already in use".
        # Only kills pizza-owned processes; root-owned squatters are reported.
        try { wsl -u pizza -e bash -c "pkill -f 'bot-ocp'; sleep 1" 2>$null | Out-Null } catch {}
    }
    function Test-BotPort {
        try {
            $code = wsl -u pizza -e bash -c "curl -s -m 4 -o /dev/null -w '%{http_code}' http://localhost:8090/health" 2>$null
            return "$code".Trim() -eq '200'
        } catch { return $false }
    }
    function Start-BotClean {
        # Idempotent: never kill a healthy bot — pkill first caused a
        # self-inflicted outage on every START ALL press.
        if (Test-BotPort) {
            $Sync.Logs.Enqueue('[OK] Bot already healthy on :8090 — left running')
            return
        }
        Clear-StrayBot
        Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start orange-cheese-pizza-bot'
        Start-Sleep -Seconds 4
        if (Test-BotPort) {
            $Sync.Logs.Enqueue('[OK] Bot healthy on :8090')
        } else {
            $Sync.Logs.Enqueue('[WARN] Bot not responding — port 8090 may be held by a root process.')
            $Sync.Logs.Enqueue("[FIX] Run in PowerShell: wsl -u root -e bash -c 'pkill -f bot-ocp'")
        }
    }
    function Get-Frontend {
        try {
            # CIM CommandLine match — Get-Process Path is always node.exe,
            # so a Path-based vite check can never match (dead code before).
            $p = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
                try {
                    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                    $cmd -like "*vite*"
                } catch { $false }
            }
            if ($p) { return 'active' }
            $port = netstat -ano 2>$null | Select-String ":5173.*LISTEN"
            if ($port) { return 'active' }
        } catch {}
        return 'stopped'
    }
    function Start-FrontendDev {
        $root = if ($RepoRoot) { $RepoRoot } else { (Get-Location).Path }
        $bat = Join-Path $root 'OCP-FRONTEND.bat'
        if (Test-Path $bat) {
            Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WindowStyle Minimized
        } else {
            $feDir = Join-Path $root 'frontend'
            if (Test-Path $feDir) {
                # strictPort: never drift to 5174 — panel links assume :5173
                Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Frontend && cd /d `"$feDir`" && netsh interface portproxy delete v4tov4 listenport=5173 listenaddress=127.0.0.1 >nul 2>&1 & call npm run dev -- --host 0.0.0.0 --port 5173 --strictPort" -WindowStyle Minimized
            } else {
                $Sync.Logs.Enqueue("[WARN] Frontend not found under $root")
            }
        }
    }
    function Test-CampaignPort {
        # true when the runner API actually LISTENs on :3001
        try {
            $port = netstat -ano 2>$null | Select-String ":3001.*LISTEN"
            return [bool]$port
        } catch { return $false }
    }
    function Test-CampaignUiPort {
        # true when the campaign UI (vite) actually LISTENs on :5174
        try {
            $port = netstat -ano 2>$null | Select-String ":5174.*LISTEN"
            return [bool]$port
        } catch { return $false }
    }
    function Stop-CampaignVite {
        # campaign UI only (frontend vite on :5173 untouched)
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            try {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                ($cmd -like "*campaign-runner*") -and ($cmd -like "*vite*")
            } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    function Start-CampaignRunner {
        # The runner is a Windows node app (bat-first); there is no
        # ocp-campaign-runner systemd unit, so systemctl start is a no-op.
        $root = if ($RepoRoot) { $RepoRoot } else { (Get-Location).Path }
        # Stand down the scheduled task so it doesn't fight the new window.
        try { schtasks /end /tn "OCP-Campaign-Runner" 2>$null | Out-Null } catch {}
        $bat = Join-Path $root 'OCP-CAMPAIGN.bat'
        if (Test-Path $bat) {
            Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WindowStyle Minimized
        } else {
            $srvDir = Join-Path $root 'campaign-runner'
            if (Test-Path $srvDir) {
                Stop-CampaignVite
                Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Campaign UI && cd /d `"$srvDir`" && call npm run dev:client -- --host 0.0.0.0 --port 5174 --strictPort" -WindowStyle Minimized
                Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title OCP Campaign Runner && cd /d `"$srvDir`" && call node server/index.js" -WindowStyle Minimized
            } else {
                $Sync.Logs.Enqueue("[WARN] Campaign runner not found under $root")
            }
        }
    }
    function Stop-CampaignRunner {
        # End the scheduled task first (clean stop, no restart fight),
        # then kill any remaining server/index.js holders (vite untouched).
        try { schtasks /end /tn "OCP-Campaign-Runner" 2>$null | Out-Null } catch {}
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            try {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                $cmd -like "*server/index.js*"
            } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    function Stop-FrontendDev {
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            try {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
                $cmd -like "*vite*"
            } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    function Get-PortPid($port) {
        # PID actually LISTENing on a TCP port (service state can lie)
        try {
            $line = netstat -ano 2>$null | Select-String ":$port.*LISTEN" | Select-Object -First 1
            if ($line) { return ($line.ToString().Trim() -split '\s+')[-1] }
        } catch {}
        return $null
    }
    function Get-ProcAge($pid) {
        try {
            $ts = (Get-Date) - (Get-Process -Id $pid -ErrorAction Stop).StartTime
            if ($ts.TotalDays -ge 1) { return ('{0}d{1}h' -f [int]$ts.TotalDays, $ts.Hours) }
            if ($ts.TotalHours -ge 1) { return ('{0}h{1}m' -f $ts.Hours, $ts.Minutes) }
            return ('{0}m' -f [Math]::Max(1, [int]$ts.TotalMinutes))
        } catch { return '?' }
    }
    function Test-UrlMs($url) {
        # HTTP latency in ms, or $null when unreachable
        try {
            $t = wsl -u pizza -e bash -c "curl -s -m 4 -o /dev/null -w '%{time_total}' $url" 2>$null
            $t = "$t".Trim()
            if ($t -match '^[\d\.]+$') { return [int]([double]$t * 1000) }
        } catch {}
        return $null
    }
    function Set-PortDetail($port, $url) {
        # "pid 422 · up 3h12m · 4ms" / "port :8090 not bound"
        $pid = Get-PortPid $port
        if (-not $pid) { return @{ Bound = $false; Text = "port :$port not bound" } }
        $parts = @("pid $pid", "up $(Get-ProcAge $pid)")
        if ($url) {
            $ms = Test-UrlMs $url
            $parts += if ($null -ne $ms) { "${ms}ms" } else { 'no http' }
        }
        return @{ Bound = $true; Text = ($parts -join ' · ') }
    }

    # already-seen journal lines (dedupe so repeats don't flood the log)
    $seen = @{}

    while ($Sync.Running) {
        # check for pending command
        if ($Sync.CommandReady) {
            $cmd = $Sync.Command
            $Sync.CommandReady = $false
            $Sync.Command = ''
            switch ($cmd) {
                'start_all' {
                    $Sync.Logs.Enqueue('[INFO] Starting all services + frontend...')
                    # Only clear strays when the port is actually down —
                    # otherwise pkill murders the healthy bot (self-outage).
                    if (-not (Test-BotPort)) { Clear-StrayBot }
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start evolution-go orange-cheese-pizza-bot ocp-campaign-runner'
                    Start-FrontendDev
                    Start-CampaignRunner
                    Start-Sleep -Seconds 4
                    if (Test-BotPort) {
                        $Sync.Logs.Enqueue('[OK] All services + frontend started (bot healthy)')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Bot not responding — possible port squatter on :8090.')
                        $Sync.Logs.Enqueue("[FIX] Press FIX PORTS, or run: wsl -u root -e bash -c 'pkill -f bot-ocp'")
                    }
                    if ($null -ne (Test-UrlMs 'http://127.0.0.1:8080/server/ok')) {
                        $Sync.Logs.Enqueue('[OK] Evolution GO healthy on :8080')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Evolution GO not responding yet — WhatsApp link may still be connecting.')
                    }
                    # Frontend needs its own check — vite takes ~15s on first boot
                    Start-Sleep -Seconds 12
                    if (Test-FrontendPort) {
                        $Sync.Logs.Enqueue('[OK] Frontend listening on :5173')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Frontend did not come up — check its minimized window for the bind error.')
                    }
                    if (Test-CampaignPort) {
                        $Sync.Logs.Enqueue('[OK] Campaign Runner listening on :3001')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Campaign Runner did not come up — check its minimized window.')
                    }
                    if (Test-CampaignUiPort) {
                        $Sync.Logs.Enqueue('[OK] Campaign UI listening on :5174')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Campaign UI did not come up — check its minimized window.')
                    }
                }
                'stop_all' {
                    $Sync.Logs.Enqueue('[INFO] Stopping all services + frontend...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user stop evolution-go orange-cheese-pizza-bot ocp-campaign-runner'
                    Stop-FrontendDev
                    Stop-CampaignRunner
                    Stop-CampaignVite
                    $Sync.Logs.Enqueue('[OK] All services + frontend stopped')
                }
                'start_bot' {
                    $Sync.Logs.Enqueue('[INFO] Starting bot...')
                    Start-BotClean
                }
                'fix_ports' {
                    $Sync.Logs.Enqueue('[INFO] Checking ports...')
                    $evoOk = $null -ne (Test-UrlMs 'http://127.0.0.1:8080/server/ok')
                    if ((Test-BotPort) -and $evoOk) {
                        $Sync.Logs.Enqueue('[OK] :8090 and :8080 both healthy — nothing to fix')
                    } else {
                        $Sync.Logs.Enqueue('[INFO] Clearing stray processes on blocked ports...')
                        try { wsl -u pizza -e bash -c "pkill -f 'bot-ocp'; pkill -f 'evolution-go'; sleep 1" 2>$null | Out-Null } catch {}
                        Stop-FrontendDev
                        Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart evolution-go orange-cheese-pizza-bot'
                        Start-Sleep -Seconds 5
                        if (Test-BotPort) {
                            $Sync.Logs.Enqueue('[OK] Ports clear, bot healthy on :8090')
                        } else {
                            $Sync.Logs.Enqueue('[WARN] Still blocked — a root-owned process holds :8090.')
                            $Sync.Logs.Enqueue("[FIX] Run in PowerShell: wsl -u root -e bash -c 'pkill -f bot-ocp'")
                        }
                        if (Test-FrontendPort) {
                            $Sync.Logs.Enqueue('[OK] Frontend port :5173 listening')
                        } else {
                            $Sync.Logs.Enqueue('[INFO] Frontend not on :5173 — press START ALL or start it from its .bat')
                        }
                    }
                }
                'start_evo' {
                    $Sync.Logs.Enqueue('[INFO] Starting Evolution GO...')
                    Send-Cmd 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user start evolution-go'
                    Start-Sleep -Seconds 6
                    if ($null -ne (Test-UrlMs 'http://127.0.0.1:8080/server/ok')) {
                        $Sync.Logs.Enqueue('[OK] Evolution GO healthy on :8080')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Evolution GO not responding yet — WhatsApp link may still be connecting.')
                    }
                }
                'start_campaign' {
                    $Sync.Logs.Enqueue('[INFO] Starting Campaign Runner...')
                    Start-CampaignRunner
                    Start-Sleep -Seconds 8
                    if (Test-CampaignPort) {
                        $Sync.Logs.Enqueue('[OK] Campaign Runner listening on :3001')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Campaign Runner did not come up — check its minimized window.')
                    }
                    if (Test-CampaignUiPort) {
                        $Sync.Logs.Enqueue('[OK] Campaign UI listening on :5174')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Campaign UI did not come up — check its minimized window.')
                    }
                }
                'stop_campaign' {
                    $Sync.Logs.Enqueue('[INFO] Stopping Campaign Runner...')
                    Stop-CampaignRunner
                    Stop-CampaignVite
                    $Sync.Logs.Enqueue('[OK] Campaign Runner stopped')
                }
                'start_frontend' {
                    $Sync.Logs.Enqueue('[INFO] Starting frontend dev server...')
                    Start-FrontendDev
                    Start-Sleep -Seconds 8
                    if (Test-FrontendPort) {
                        $Sync.Logs.Enqueue('[OK] Frontend listening on :5173')
                    } else {
                        $Sync.Logs.Enqueue('[WARN] Frontend did not come up on :5173 — check its window for the bind error.')
                    }
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
        if (Test-CampaignPort) { $Sync.CampaignStatus = 'active' } else { $Sync.CampaignStatus = Get-Svc $CampaignSvc }
        $Sync.FrontendStatus = Get-Frontend

        # port truth + numbers for the cards (service state can lie)
        $d = Set-PortDetail 8090 'http://localhost:8090/health'
        $Sync.BotPort = $d.Bound; $Sync.BotDetail = $d.Text
        $d = Set-PortDetail 8080 'http://127.0.0.1:8080/server/ok'
        $Sync.EvoPort = $d.Bound; $Sync.EvoDetail = $d.Text
        $d = Set-PortDetail 3001 'http://localhost:3001/api/settings'
        $Sync.CampaignPort = $d.Bound; $Sync.CampaignDetail = $d.Text
        $d = Set-PortDetail 5173 'http://localhost:5173/'
        if ($d.Bound) { $Sync.FrontendStatus = 'active'; $Sync.FrontendDetail = $d.Text } else { $Sync.FrontendDetail = 'not listening' }
        $Sync.LastCheck = Get-Date -Format 'HH:mm:ss'

        # drain log queue from service journal — only NEW lines (the old
        # tail-every-cycle re-appended the same lines forever)
        try {
            $lines = wsl -u pizza -e bash -c "journalctl --user -u orange-cheese-pizza-bot --since '8 seconds ago' --no-pager -o cat 2>/dev/null" 2>$null
            foreach ($line in $lines) {
                $t = "$line".Trim()
                if ($t -and -not $seen.ContainsKey($t)) {
                    $seen[$t] = $true
                    $Sync.Logs.Enqueue($t)
                }
            }
            if ($seen.Count -gt 400) { $seen.Clear() }
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
$cardEvo.Size = New-Object System.Drawing.Size(175, 96)
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

$lblEvoDetail = New-Object System.Windows.Forms.Label
$lblEvoDetail.Text = ''
$lblEvoDetail.Font = New-Object System.Drawing.Font('Consolas', 7.5)
$lblEvoDetail.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblEvoDetail.Location = New-Object System.Drawing.Point(10, 70)
$lblEvoDetail.Size = New-Object System.Drawing.Size(160, 16)
$cardEvo.Controls.Add($lblEvoDetail)

# Bot card
$cardBot = New-Object System.Windows.Forms.Panel
$cardBot.Location = New-Object System.Drawing.Point(200, $y)
$cardBot.Size = New-Object System.Drawing.Size(175, 96)
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

$lblBotDetail = New-Object System.Windows.Forms.Label
$lblBotDetail.Text = ''
$lblBotDetail.Font = New-Object System.Drawing.Font('Consolas', 7.5)
$lblBotDetail.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblBotDetail.Location = New-Object System.Drawing.Point(10, 70)
$lblBotDetail.Size = New-Object System.Drawing.Size(160, 16)
$cardBot.Controls.Add($lblBotDetail)

# Campaign Runner card
$cardCampaign = New-Object System.Windows.Forms.Panel
$cardCampaign.Location = New-Object System.Drawing.Point(400, $y)
$cardCampaign.Size = New-Object System.Drawing.Size(175, 96)
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

$lblCampaignDetail = New-Object System.Windows.Forms.Label
$lblCampaignDetail.Text = ''
$lblCampaignDetail.Font = New-Object System.Drawing.Font('Consolas', 7.5)
$lblCampaignDetail.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblCampaignDetail.Location = New-Object System.Drawing.Point(10, 70)
$lblCampaignDetail.Size = New-Object System.Drawing.Size(160, 16)
$cardCampaign.Controls.Add($lblCampaignDetail)

# Frontend card
$cardFrontend = New-Object System.Windows.Forms.Panel
$cardFrontend.Location = New-Object System.Drawing.Point(605, $y)
$cardFrontend.Size = New-Object System.Drawing.Size(175, 96)
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

$lblFrontendDetail = New-Object System.Windows.Forms.Label
$lblFrontendDetail.Text = ''
$lblFrontendDetail.Font = New-Object System.Drawing.Font('Consolas', 7.5)
$lblFrontendDetail.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$lblFrontendDetail.Location = New-Object System.Drawing.Point(10, 70)
$lblFrontendDetail.Size = New-Object System.Drawing.Size(160, 16)
$cardFrontend.Controls.Add($lblFrontendDetail)

# ---- action buttons ----
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
    $lblFooter.Text = 'Clearing stray processes...'
    $Sync.Command = 'fix_ports'
    $Sync.CommandReady = $true
})

# ---- log section ----
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
        $amber = [System.Drawing.Color]::FromArgb(255, 180, 0)
        $txtGreen = [System.Drawing.Color]::FromArgb(110, 220, 110)
        $txtAmber = [System.Drawing.Color]::FromArgb(255, 200, 100)
        $txtRed = [System.Drawing.Color]::FromArgb(255, 110, 110)

        # green only when service AND port agree; amber = degraded mismatch
        $dotBot.ForeColor = if ($botUp -and $Sync.BotPort) { $green } elseif ($botUp -or $Sync.BotPort) { $amber } elseif ($Sync.BotStatus -eq '...') { $gray } else { $red }
        $dotEvo.ForeColor = if ($evoUp -and $Sync.EvoPort) { $green } elseif ($evoUp -or $Sync.EvoPort) { $amber } elseif ($Sync.EvoStatus -eq '...') { $gray } else { $red }
        $dotCampaign.ForeColor = if ($campaignUp -and $Sync.CampaignPort) { $green } elseif ($campaignUp -or $Sync.CampaignPort) { $amber } elseif ($Sync.CampaignStatus -eq '...') { $gray } else { $red }
        $dotFrontend.ForeColor = if ($frontendUp) { $green } elseif ($Sync.FrontendStatus -eq '...') { $gray } else { $red }

        $lblBotState.Text = $Sync.BotStatus.ToUpper()
        $lblEvoState.Text = $Sync.EvoStatus.ToUpper()
        $lblCampaignState.Text = $Sync.CampaignStatus.ToUpper()
        $lblFrontendState.Text = $Sync.FrontendStatus.ToUpper()
        $lblBotDetail.Text = $Sync.BotDetail
        $lblEvoDetail.Text = $Sync.EvoDetail
        $lblCampaignDetail.Text = $Sync.CampaignDetail
        $lblFrontendDetail.Text = $Sync.FrontendDetail

        while ($Sync.Logs.Count -gt 0) {
            $line = $Sync.Logs.Dequeue()
            $ts = Get-Date -Format 'HH:mm:ss'
            $logBox.SelectionStart = $logBox.TextLength
            $logBox.SelectionLength = 0
            if ($line -match '(?i)error|fail|exception|denied|refused|blocked|invalid|crash') { $logBox.SelectionColor = $txtRed }
            elseif ($line -match '(?i)warn|still|not responding|restart|not bound|no http') { $logBox.SelectionColor = $txtAmber }
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

        if ($Sync.CommandReady) {
            $lblFooter.Text = 'Processing command...'
        } else {
            $count = @($botUp, $evoUp, $campaignUp, $frontendUp | Where-Object { $_ }).Count
            $lblFooter.Text = "$count of 4 services running · checked $($Sync.LastCheck)"
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
