param(
  [string]$PythonExe = 'python',
  [switch]$SkipInstall,
  [switch]$SkipDocker,
  [switch]$SkipAI,
  [switch]$NoSimulator,
  [switch]$WithFrontend,
  [string]$JavaHome = 'C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot'
)

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$LocalDir = Join-Path $Root '.local'
$LogDir = Join-Path $LocalDir 'logs'
$PidDir = Join-Path $LocalDir 'pids'
$NpmCacheDir = Join-Path $LocalDir 'npm-cache'

New-Item -ItemType Directory -Force -Path $LogDir, $PidDir, $NpmCacheDir | Out-Null
$env:npm_config_cache = $NpmCacheDir

function Write-Step([string]$Message) {
  Write-Host "[aqua-local] $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-ProcessId([int]$ProcessId) {
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Find-JavaTool([string]$Tool) {
  if ($JavaHome) {
    $candidate = Join-Path $JavaHome "bin\$Tool.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $command = Get-Command $Tool -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $knownRoots = @(
    'C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot',
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java'
  )

  foreach ($rootPath in $knownRoots) {
    if (-not (Test-Path $rootPath)) {
      continue
    }

    $found = Get-ChildItem -LiteralPath $rootPath -Recurse -Filter "$Tool.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }

  throw "$Tool.exe was not found. Install a JDK or pass -JavaHome."
}

function Install-NodeProject([string]$RelativePath) {
  $dir = Join-Path $Root $RelativePath
  if ($SkipInstall) {
    return
  }

  Write-Step "Installing npm dependencies: $RelativePath"
  Push-Location $dir
  try {
    npm install --cache "$NpmCacheDir"
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed in $RelativePath"
    }
  } finally {
    Pop-Location
  }
}

function Install-PythonProject([string]$RelativePath) {
  $dir = Join-Path $Root $RelativePath
  $requirements = Join-Path $dir 'requirements.txt'
  if ($SkipInstall -or -not (Test-Path $requirements)) {
    return
  }

  & $PythonExe -m pip --version *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "$PythonExe has no pip module. Skipping AI service. Pass -PythonExe to use another Python."
    $script:SkipAI = $true
    return
  }

  Write-Step "Installing Python dependencies: $RelativePath"
  Push-Location $dir
  try {
    & $PythonExe -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
      throw "pip install failed in $RelativePath"
    }
  } finally {
    Pop-Location
  }
}

function Build-JavaProject([string]$RelativePath) {
  $dir = Join-Path $Root $RelativePath
  $buildScript = Join-Path $dir 'build.ps1'
  if (-not (Test-Path $buildScript)) {
    return
  }

  Write-Step "Compiling Java service: $RelativePath"
  & $buildScript -JavaHome $JavaHome
  if ($LASTEXITCODE -ne 0) {
    throw "Java build failed in $RelativePath"
  }
}

function Start-ManagedProcess(
  [string]$Name,
  [string]$RelativePath,
  [string]$Command
) {
  $pidFile = Join-Path $PidDir "$Name.pid"
  if (Test-Path $pidFile) {
    $existingPidText = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPidText -and (Test-ProcessId ([int]$existingPidText))) {
      Write-Step "$Name already running (pid=$existingPidText)"
      return
    }
  }

  $workDir = Join-Path $Root $RelativePath
  $logFile = Join-Path $LogDir "$Name.log"
  $wrapped = "& { $Command } 2>&1 | Tee-Object -FilePath '$logFile'"

  Write-Step "Starting $Name"
  $process = Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $wrapped) `
    -WorkingDirectory $workDir `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $process.Id
  Write-Step "$Name pid=$($process.Id), log=$logFile"
}

if (-not $SkipDocker -and -not (Test-Command 'docker')) {
  Write-Warning 'Docker was not found. Skipping Redis/MySQL/InfluxDB startup.'
  $SkipDocker = $true
}

if (-not $SkipDocker) {
  Write-Step 'Starting Docker infrastructure: Redis + MySQL + InfluxDB'
  docker compose -f (Join-Path $Root 'docker-compose.dev.yml') up -d
}

$nodeProjects = @(
  'services\realtime-hub',
  'services\telemetry-service',
  'services\control-service',
  'services\rule-engine-service',
  'services\asset-service',
  'tools\dev-scripts'
)

if ($WithFrontend) {
  $nodeProjects += 'apps\command-center-web'
}

foreach ($project in $nodeProjects) {
  Install-NodeProject $project
}

if (-not $SkipAI) {
  Install-PythonProject 'ml\do-forecast-service'
}

Build-JavaProject 'services\field-service-java'

$JavaExe = Find-JavaTool 'java'

Start-ManagedProcess 'realtime-hub' 'services\realtime-hub' '$env:PORT=''3001''; $env:ALLOW_DEV_TOKEN=''true''; npm run dev'
Start-Sleep -Seconds 1
Start-ManagedProcess 'telemetry-service' 'services\telemetry-service' '$env:PORT=''3002''; npm run dev'
Start-ManagedProcess 'control-service' 'services\control-service' '$env:PORT=''3003''; npm run dev'
Start-ManagedProcess 'rule-engine-service' 'services\rule-engine-service' '$env:PORT=''3004''; npm run dev'
Start-ManagedProcess 'asset-service' 'services\asset-service' '$env:PORT=''3005''; npm run dev'
Start-ManagedProcess 'field-service-java' 'services\field-service-java' "& '$JavaExe' '-Dfile.encoding=UTF-8' -cp out com.aqua.field.FieldServiceApp"

if (-not $SkipAI) {
  Start-ManagedProcess 'do-forecast-service' 'ml\do-forecast-service' "& '$PythonExe' src\serve.py"
}

if (-not $NoSimulator) {
  Start-Sleep -Seconds 5
  Start-ManagedProcess 'sensor-simulator' 'tools\dev-scripts' '$env:WS_URL=''ws://localhost:3001''; npx tsx sensor-simulator.ts'
}

if ($WithFrontend) {
  Start-ManagedProcess 'command-center-web' 'apps\command-center-web' 'npm run dev -- --host 0.0.0.0'
}

Write-Step 'Backend startup issued.'
Write-Host ''
Write-Host 'Health checks:' -ForegroundColor Green
Write-Host '  realtime-hub      http://localhost:3001'
Write-Host '  telemetry-service http://localhost:3002/health'
Write-Host '  control-service   http://localhost:3003/health'
Write-Host '  rule-engine       http://localhost:3004/health'
Write-Host '  asset-service     http://localhost:3005/health'
Write-Host '  field-service     http://localhost:3006/health'
if (-not $SkipAI) {
  Write-Host '  AI forecast       http://localhost:8000/health'
}
Write-Host ''
Write-Host "Logs: $LogDir"
Write-Host "Stop: powershell -ExecutionPolicy Bypass -File tools\dev-scripts\stop-local-backend.ps1"
