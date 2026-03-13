$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://localhost:3000/api/health"
$appUrl = "http://localhost:3000"

function Show-LauncherError([string]$message) {
    Write-Host "" -ForegroundColor Red
    Write-Host $message -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Read-Host "Press Enter to close"
}

function Test-AppRunning {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Show-LauncherError "npm was not found. Install Node.js first."
    exit 1
}

if (-not (Test-AppRunning)) {
    $command = "Set-Location '$repoRoot'; npm start"
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $command) -WindowStyle Normal

    $started = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-AppRunning) {
            $started = $true
            break
        }
    }

    if (-not $started) {
        Show-LauncherError "The server did not start within 30 seconds. Check the server window for errors."
        exit 1
    }
}

Start-Process $appUrl
