param(
  [switch]$StopDocker
)

$ErrorActionPreference = 'Continue'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$PidDir = Join-Path $Root '.local\pids'

function Write-Step([string]$Message) {
  Write-Host "[aqua-local] $Message" -ForegroundColor Cyan
}

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree ([int]$child.ProcessId)
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force
  }
}

if (Test-Path $PidDir) {
  Get-ChildItem -LiteralPath $PidDir -Filter '*.pid' | ForEach-Object {
    $name = $_.BaseName
    $pidText = (Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $pidText) {
      Remove-Item -LiteralPath $_.FullName -Force
      return
    }

    $processId = [int]$pidText
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
      Write-Step "Stopping $name (pid=$processId)"
      Stop-ProcessTree $processId
    } else {
      Write-Step "$name was not running"
    }

    Remove-Item -LiteralPath $_.FullName -Force
  }
} else {
  Write-Step 'No local pid directory found.'
}

$workspacePattern = "*$Root*"
$leftovers = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like $workspacePattern -and
    $_.Name -in @('node.exe', 'python.exe', 'powershell.exe', 'java.exe')
  }

foreach ($proc in $leftovers) {
  Write-Step "Stopping leftover $($proc.Name) (pid=$($proc.ProcessId))"
  Stop-ProcessTree ([int]$proc.ProcessId)
}

$ports = @(3001, 3002, 3003, 3004, 3005, 3006, 5173, 8000)
$listeners = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $pidOnPort = [int]$listener.OwningProcess
  if ($pidOnPort -gt 0) {
    Write-Step "Stopping process on port $($listener.LocalPort) (pid=$pidOnPort)"
    Stop-ProcessTree $pidOnPort
  }
}

if ($StopDocker) {
  Write-Step 'Stopping Docker infrastructure'
  docker compose -f (Join-Path $Root 'docker-compose.dev.yml') down
}

Write-Step 'Done.'
