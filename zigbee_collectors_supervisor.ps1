<#
  zigbee_collectors_supervisor.ps1 — watchdog de los recolectores permanentes.

  Lanza RSSI y rutas, los reinicia si salen y deja un heartbeat legible.
  No contiene credenciales: los hijos leen FACTIUN_ZIGBEE_USER/PASS o su CONFIG.
#>

$CheckEverySec = 15
$RestartBackoffSec = 5
$HealthPath = Join-Path $PSScriptRoot "collector_health.csv"
$OutDir = Join-Path $PSScriptRoot "collector_process_logs"
$ErrorActionPreference = "Stop"
$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$Collectors = @(
  @{ Name="rssi"; Script=(Join-Path $PSScriptRoot "zigbee_logger.ps1") }
  @{ Name="routes"; Script=(Join-Path $PSScriptRoot "zigbee_routes_logger.ps1") }
)

$State = @{}
$Exe = (Get-Process -Id $PID).Path

function Utc-Now { return [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", $Invariant) }
function Start-Collector($c) {
  if (-not (Test-Path $c.Script)) { throw "No existe $($c.Script)" }
  $tag = [DateTime]::UtcNow.ToString("yyyyMMdd", $Invariant)
  $out = Join-Path $OutDir ($c.Name + "." + $tag + ".out.log")
  $err = Join-Path $OutDir ($c.Name + "." + $tag + ".err.log")
  $p = Start-Process -FilePath $Exe -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",$c.Script) -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
  $old = if ($State.ContainsKey($c.Name)) { $State[$c.Name] } else { $null }
  $restarts = if ($old) { [int]$old.restarts + 1 } else { 0 }
  $State[$c.Name] = @{ process=$p; restarts=$restarts; started=(Utc-Now); script=$c.Script }
  Write-Host "$(Utc-Now) arrancado $($c.Name) PID $($p.Id) reinicios=$restarts"
}
function Health-Write {
  $rows = @()
  foreach ($c in $Collectors) {
    $s = $State[$c.Name]
    $alive = $false
    $pidv = $null
    if ($s -and $s.process) {
      try { $alive = -not $s.process.HasExited; $pidv = $s.process.Id } catch { $alive = $false }
    }
    $rows += [pscustomobject][ordered]@{
      timestamp=(Utc-Now); collector=$c.Name; alive=$(if($alive){1}else{0}); pid=$pidv
      restarts=$(if($s){$s.restarts}else{0}); started_utc=$(if($s){$s.started}else{$null})
    }
  }
  $rows | Export-Csv -Path $HealthPath -Append -NoTypeInformation -Encoding UTF8
}

foreach ($c in $Collectors) { Start-Collector $c }

$lastHealth = [DateTime]::MinValue
while ($true) {
  foreach ($c in $Collectors) {
    $s = $State[$c.Name]
    $dead = $true
    if ($s -and $s.process) {
      try { $dead = $s.process.HasExited } catch { $dead = $true }
    }
    if ($dead) {
      Write-Warning "$(Utc-Now) $($c.Name) se ha detenido; reinicio en $RestartBackoffSec s"
      Start-Sleep -Seconds $RestartBackoffSec
      Start-Collector $c
    }
  }
  if (((Get-Date) - $lastHealth).TotalSeconds -ge 60) {
    Health-Write
    $lastHealth = Get-Date
  }
  Start-Sleep -Seconds $CheckEverySec
}
