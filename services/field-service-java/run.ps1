param(
  [string]$JavaHome = 'C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot',
  [int]$Port = 3006
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $Root 'build.ps1') -JavaHome $JavaHome

$java = Join-Path $JavaHome 'bin\java.exe'
if (-not (Test-Path $java)) {
  $command = Get-Command java -ErrorAction SilentlyContinue
  if (-not $command) {
    throw 'java.exe was not found. Install a JDK/JRE or pass -JavaHome.'
  }
  $java = $command.Source
}

$env:PORT = "$Port"
& $java '-Dfile.encoding=UTF-8' -cp (Join-Path $Root 'out') com.aqua.field.FieldServiceApp
