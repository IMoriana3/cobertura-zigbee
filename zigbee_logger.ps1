<#
  zigbee_logger.ps1 — recolector PERMANENTE de RSSI/estado Zigbee.

  Objetivo operativo:
    - 24/7, no una campaña manual.
    - todos los gateways configurados; uno caído NO detiene los demás.
    - censo acumulativo: un nodo descubierto no desaparece porque falle un discover posterior.
    - schema_version=2, UTC por fila, ciclo_id y latencia_ms.
    - el gateway caído se distingue del nodo caído.
    - el fichero vivo conserva el nombre histórico y se rota diariamente.

  Este logger NO es el canal de seguridad de viento. Su cadencia se limita para no
  competir con el tráfico de control.
#>

# ======================= CONFIG (el paquete de planta sustituye este bloque) =======================
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
)
$IntervalSec       = 600
$DiscoverEverySec = 3600
$TimeoutSec        = 15
$NodePauseMs       = 100
$GatewayPauseMs    = 500
$MinPauseSec       = 30
$CsvPath           = Join-Path $PSScriptRoot "zigbee_log.csv"
$GwCsvPath         = Join-Path $PSScriptRoot "gateway_stats.csv"
$CensoPath         = Join-Path $PSScriptRoot "censo_campania.csv"
# ================================================================================================

$SchemaVersion = 2
$ErrorActionPreference = "Stop"
$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

$ColsLog = @("schema_version","timestamp","ciclo_id","latencia_ms","tz_pc_min","gateway","ext_addr","node_id","net_addr","role","online","motivo","rssi_dbm","ack_failures","reinicio","supply_mv","temp_c")
$ColsGw = @("schema_version","timestamp","ciclo_id","gateway","host","ok","cpu_pct","mem_total_b","mem_usada_b","mem_libre_b","uptime_s")
$ColsCenso = @("schema_version","ext_addr","node_id","gateway","ncu","gw","esclavo","etiqueta","lat","lon","origen","visto_utc")

function Utc-Now {
  return [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", $Invariant)
}
function Utc-Tag {
  return [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ", $Invariant)
}
function Pc-OffsetMin {
  return [int][Math]::Round([TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes)
}
function Csv-HeaderNames([string]$Path) {
  if (-not (Test-Path $Path)) { return @() }
  $h = Get-Content -Path $Path -TotalCount 1
  if ([string]::IsNullOrWhiteSpace($h)) { return @() }
  return @($h.Split(",") | ForEach-Object { $_.Trim().Trim('"') })
}
function Same-Header($a, $b) {
  if ($a.Count -ne $b.Count) { return $false }
  for ($i=0; $i -lt $a.Count; $i++) { if ("$($a[$i])" -ne "$($b[$i])") { return $false } }
  return $true
}
function Move-Safe([string]$Path, [string]$Tag) {
  if (-not (Test-Path $Path)) { return }
  $dir = Split-Path $Path -Parent
  $base = [IO.Path]::GetFileNameWithoutExtension($Path)
  $ext = [IO.Path]::GetExtension($Path)
  $dst = Join-Path $dir ($base + "." + $Tag + $ext)
  $n = 1
  while (Test-Path $dst) {
    $dst = Join-Path $dir ($base + "." + $Tag + "." + $n + $ext)
    $n++
  }
  Move-Item -Path $Path -Destination $dst
}
function Ensure-LiveCsv([string]$Path, $ExpectedColumns) {
  if (-not (Test-Path $Path)) { return }
  $fi = Get-Item $Path
  $today = [DateTime]::UtcNow.ToString("yyyyMMdd", $Invariant)
  $fileDay = $fi.LastWriteTimeUtc.ToString("yyyyMMdd", $Invariant)
  if ($fileDay -ne $today) {
    Move-Safe $Path $fileDay
    return
  }
  $got = Csv-HeaderNames $Path
  if (-not (Same-Header $got $ExpectedColumns)) {
    Move-Safe $Path ("schema-old." + (Utc-Tag))
  }
}
function Append-Rows([string]$Path, $Rows, $ExpectedColumns) {
  if (-not $Rows -or @($Rows).Count -eq 0) { return }
  Ensure-LiveCsv $Path $ExpectedColumns
  @($Rows) | Select-Object $ExpectedColumns | Export-Csv -Path $Path -Append -NoTypeInformation -Encoding UTF8
}

function Invoke-RCI($GW, $Body, [int]$Timeout = $TimeoutSec) {
  $p = @{
    Uri = "http://$($GW.Host)/UE/rci"
    Method = "Post"
    ContentType = "text/xml"
    Body = $Body
    TimeoutSec = $Timeout
  }
  if ($GW.User) {
    $sec = ConvertTo-SecureString $GW.Pass -AsPlainText -Force
    $p.Credential = New-Object System.Management.Automation.PSCredential($GW.User, $sec)
  }
  return Invoke-RestMethod @p
}
function Rci-Texto($r) {
  if ($r -is [string]) { return $r }
  if ($r -and $r.OuterXml) { return "$($r.OuterXml)" }
  return "$r"
}
function Error-Motivo($e, [string]$fallback) {
  $m = "$($e.Exception.Message)"
  if ($m -match "(401|403|unauthor|forbidden)") { return "auth" }
  if ($m -match "(500|501|502|503|504|server error)") { return "http_error" }
  return $fallback
}

$DiscoverBody = '<rci_request version="1.1"><do_command target="zigbee"><discover option="clear"/></do_command></rci_request>'
$RCI_CARGA = '<rci_request version="1.1"><query_state><device_stats/></query_state></rci_request>'
$RCI_TODO  = '<rci_request version="1.1"><query_state/></rci_request>'

function Gw-Carga([string]$xml) {
  $t = "$xml"
  $r = @{cpu=$null; mem_total=$null; mem_usada=$null; mem_libre=$null; uptime=$null; ok=$false}
  $pat = @{
    cpu       = 'cpu(?:_?(?:usage|util(?:ization)?|load|pct|percent))?'
    mem_total = '(?:total_?mem(?:ory)?|mem(?:ory)?_?total)'
    mem_usada = '(?:used_?mem(?:ory)?|mem(?:ory)?_?used)'
    mem_libre = '(?:free_?mem(?:ory)?|mem(?:ory)?_?free)'
    uptime    = 'up_?time'
  }
  foreach ($k in @("cpu","mem_total","mem_usada","mem_libre","uptime")) {
    $m = [regex]::Match($t, ('(?is)<' + $pat[$k] + '\b[^>]*>\s*(\d+)'))
    if (-not $m.Success) { $m = [regex]::Match($t, ('(?is)\b' + $pat[$k] + '\b\s*"?\s*[:=]\s*"?\s*(\d+)')) }
    if ($m.Success) { $r[$k] = [long]$m.Groups[1].Value }
  }
  if ($null -ne $r.cpu -and $r.cpu -ge 0 -and $r.cpu -le 100) { $r.ok = $true } else { $r.cpu = $null }
  return $r
}
function Gw-Carga-Leer($GW) {
  $anyReply = $false
  $raw = ""
  foreach ($body in @($RCI_CARGA, $RCI_TODO)) {
    try {
      $txt = Rci-Texto (Invoke-RCI $GW $body)
      $anyReply = $true
      $raw += $txt + [Environment]::NewLine
      $c = Gw-Carga $txt
      if ($c.ok) { return @{ reachable=$true; ok=$true; carga=$c; crudo=$raw } }
    } catch {
      if (Error-Motivo $_ "" -eq "auth") { return @{ reachable=$false; ok=$false; carga=$null; crudo=$raw; motivo="auth" } }
    }
  }
  return @{ reachable=$anyReply; ok=$false; carga=$null; crudo=$raw; motivo=($(if ($anyReply) { "sin_metricas" } else { "gw_caido" })) }
}
function Test-Gateway($GW) {
  try {
    [void](Invoke-RCI $GW $RCI_TODO ([Math]::Min($TimeoutSec, 5)))
    return $true
  } catch { return $false }
}

function Device-Role($d) {
  switch ("$($d.device_type)") {
    "0x170000" { return "TCU" }
    "0x120000" { return "HSU" }
    default { return "$($d.device_type)" }
  }
}

$inventory = @{}
$lastDisc = @{}
$lastAck = @{}
$censoSeen = @{}
if (Test-Path $CensoPath) {
  try {
    foreach ($r in Import-Csv $CensoPath) { $censoSeen["$($r.gateway)|$($r.ext_addr)"] = $true }
  } catch { Write-Warning "No puedo leer el censo existente: $($_.Exception.Message)" }
}

function Add-Censo($GW, $d) {
  $k = "$($GW.Name)|$($d.ext_addr)"
  if ($censoSeen.ContainsKey($k)) { return }
  $censoSeen[$k] = $true
  $row = [pscustomobject][ordered]@{
    schema_version=$SchemaVersion; ext_addr="$($d.ext_addr)"; node_id="$($d.node_id)"; gateway=$GW.Name
    ncu=$null; gw=$null; esclavo=$null; etiqueta=$null; lat=$null; lon=$null
    origen="discover"; visto_utc=(Utc-Now)
  }
  Append-Rows $CensoPath @($row) $ColsCenso
}
function Merge-Discovery($GW, $devices) {
  if (-not $inventory.ContainsKey($GW.Name)) { $inventory[$GW.Name] = @{} }
  foreach ($d in @($devices | Where-Object { $_.type -eq "1" })) {
    $inventory[$GW.Name]["$($d.ext_addr)"] = $d
    Add-Censo $GW $d
  }
}

Write-Host "Logger Zigbee permanente (schema v2)"
Write-Host "Gateways: $($Gateways.Name -join ', ') | objetivo de ciclo $IntervalSec s | Ctrl+C para parar"
Write-Host "CSV vivo: $CsvPath | rutas de dias anteriores se rotan automaticamente"

$ciclo = 0
while ($true) {
  $cycleSw = [Diagnostics.Stopwatch]::StartNew()

  foreach ($gw in $Gateways) {
    if (-not $inventory.ContainsKey($gw.Name)) { $inventory[$gw.Name] = @{} }
    $due = (-not $lastDisc.ContainsKey($gw.Name)) -or (((Get-Date) - $lastDisc[$gw.Name]).TotalSeconds -ge $DiscoverEverySec)
    if ($due) {
      try {
        $disc = Invoke-RCI $gw $DiscoverBody
        Merge-Discovery $gw @($disc.rci_reply.do_command.discover.device)
        $lastDisc[$gw.Name] = Get-Date
        Write-Host "$(Utc-Now) $($gw.Name): censo acumulado $($inventory[$gw.Name].Count) nodos"
      } catch {
        Write-Warning "$(Utc-Now) $($gw.Name): discover fallo; conservo el censo anterior ($($_.Exception.Message))"
      }
    }

    $g = Gw-Carga-Leer $gw
    $gwrow = [pscustomobject][ordered]@{
      schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; gateway=$gw.Name; host=$gw.Host
      ok=0; cpu_pct=$null; mem_total_b=$null; mem_usada_b=$null; mem_libre_b=$null; uptime_s=$null
    }
    if ($g.ok) {
      $c = $g.carga
      $gwrow.ok = 1
      $gwrow.cpu_pct = $c.cpu
      $gwrow.mem_total_b = $c.mem_total
      $gwrow.mem_usada_b = $c.mem_usada
      $gwrow.mem_libre_b = $c.mem_libre
      $gwrow.uptime_s = $c.uptime
    }
    Append-Rows $GwCsvPath @($gwrow) $ColsGw

    $known = @($inventory[$gw.Name].Values)
    if ($known.Count -eq 0) {
      Write-Warning "$(Utc-Now) $($gw.Name): sin censo; salto este gateway y sigo con los demas"
      Start-Sleep -Milliseconds $GatewayPauseMs
      continue
    }

    $rows = New-Object System.Collections.Generic.List[object]
    if (-not $g.reachable) {
      $mot = if ($g.motivo -eq "auth") { "auth" } else { "gw_caido" }
      foreach ($d in $known) {
        $rows.Add([pscustomobject][ordered]@{
          schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=0; tz_pc_min=(Pc-OffsetMin)
          gateway=$gw.Name; ext_addr="$($d.ext_addr)"; node_id="$($d.node_id)"; net_addr="$($d.net_addr)"
          role=(Device-Role $d); online=$null; motivo=$mot; rssi_dbm=$null; ack_failures=$null
          reinicio=0; supply_mv=$null; temp_c=$null
        })
      }
      Append-Rows $CsvPath $rows $ColsLog
      Write-Warning "$(Utc-Now) $($gw.Name): gateway no observable; $($known.Count) filas marcadas $mot"
      Start-Sleep -Milliseconds $GatewayPauseMs
      continue
    }

    $gatewayFell = $false
    foreach ($d in $known) {
      if ($gatewayFell) {
        $rows.Add([pscustomobject][ordered]@{
          schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=0; tz_pc_min=(Pc-OffsetMin)
          gateway=$gw.Name; ext_addr="$($d.ext_addr)"; node_id="$($d.node_id)"; net_addr="$($d.net_addr)"
          role=(Device-Role $d); online=$null; motivo="gw_caido"; rssi_dbm=$null; ack_failures=$null
          reinicio=0; supply_mv=$null; temp_c=$null
        })
        continue
      }

      $sw = [Diagnostics.Stopwatch]::StartNew()
      $online = 0; $motivo = "timeout_nodo"; $rssi=$null; $ack=$null; $supply=$null; $temp=$null; $net="$($d.net_addr)"; $reinicio=0
      try {
        $body = '<rci_request version="1.1"><do_command target="zigbee"><query_state addr="' + $d.ext_addr + '"/></do_command></rci_request>'
        $resp = Invoke-RCI $gw $body
        $radio = $resp.rci_reply.do_command.query_state.radio
        if ($radio -and $null -ne $radio.rssi -and "$($radio.rssi)" -ne "") {
          $online = 1; $motivo = "ok"
          $rssi = -[int]$radio.rssi
          $ack = [int]$radio.ack_failures
          $supply = [int]$radio.supply_voltage
          $temp = [int]$radio.temperature
          $net = "$($radio.net_addr)"
          $ak = "$($gw.Name)|$($d.ext_addr)"
          if ($lastAck.ContainsKey($ak) -and $ack -lt $lastAck[$ak]) { $reinicio = 1 }
          $lastAck[$ak] = $ack
        } else {
          $motivo = "sin_radio"
        }
      } catch {
        $motivo = Error-Motivo $_ "timeout_nodo"
        if ($motivo -eq "timeout_nodo" -or $motivo -eq "http_error") {
          if (-not (Test-Gateway $gw)) {
            $motivo = "gw_caido"
            $online = $null
            $gatewayFell = $true
          }
        }
      }
      $sw.Stop()
      $rows.Add([pscustomobject][ordered]@{
        schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=[int]$sw.ElapsedMilliseconds; tz_pc_min=(Pc-OffsetMin)
        gateway=$gw.Name; ext_addr="$($d.ext_addr)"; node_id="$($d.node_id)"; net_addr=$net
        role=(Device-Role $d); online=$online; motivo=$motivo; rssi_dbm=$rssi; ack_failures=$ack
        reinicio=$reinicio; supply_mv=$supply; temp_c=$temp
      })
      Start-Sleep -Milliseconds $NodePauseMs
    }

    Append-Rows $CsvPath $rows $ColsLog
    $ok = @($rows | Where-Object { $_.motivo -eq "ok" }).Count
    $mudos = @($rows | Where-Object { $_.motivo -ne "ok" }).Count
    Write-Host "$(Utc-Now) $($gw.Name): $ok OK, $mudos no OK, censo $($known.Count) -> CSV"
    Start-Sleep -Milliseconds $GatewayPauseMs
  }

  $cycleSw.Stop()
  $ciclo++
  $sleep = [Math]::Max($MinPauseSec, $IntervalSec - [int][Math]::Ceiling($cycleSw.Elapsed.TotalSeconds))
  Write-Host "$(Utc-Now) ciclo terminado en $([int]$cycleSw.Elapsed.TotalSeconds) s; pausa $sleep s"
  Start-Sleep -Seconds $sleep
}
