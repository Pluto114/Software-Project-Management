param(
  [string]$JavaHome = 'C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot'
)

$ErrorActionPreference = 'Stop'

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

  $known = @(
    'C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot',
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java'
  )

  foreach ($root in $known) {
    if (-not (Test-Path $root)) {
      continue
    }
    $found = Get-ChildItem -LiteralPath $root -Recurse -Filter "$Tool.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }

  throw "$Tool.exe was not found. Install a JDK or pass -JavaHome."
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SrcDir = Join-Path $Root 'src\main\java'
$OutDir = Join-Path $Root 'out'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$sources = Get-ChildItem -LiteralPath $SrcDir -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName
if (-not $sources) {
  throw 'No Java source files found.'
}

$javac = Find-JavaTool 'javac'
& $javac -encoding UTF-8 -d $OutDir $sources

if ($LASTEXITCODE -ne 0) {
  throw 'javac failed.'
}

Write-Host "[field-service-java] compiled to $OutDir"
