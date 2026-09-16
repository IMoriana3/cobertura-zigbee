<#
  zigbee_logger.ps1  —  Captura de cobertura Zigbee en El Burgo
  Lee el RSSI de cada TCU de los gateways Digi por RCI y lo guarda en un CSV.
  Y la CPU y memoria del PROPIO gateway (query_state/device_stats), en otro CSV:
  un coordinador saturado se ve como TCUs que no contestan sin que la radio este mal.
  NO necesita instalar nada: PowerShell ya viene en Windows.

  EJECUTAR (desde la carpeta del script, no hace falta admin):
    powershell -ExecutionPolicy Bypass -File .\zigbee_logger.ps1

  Parar: Ctrl+C. Los CSV quedan en la misma carpeta (zigbee_log.csv y gateway_stats.csv).
#>

# ======================= CONFIG (edita esto) =======================
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
  # @{ Name = "GW-02"; Host = "10.100.1.55"; User = ""; Pass = "" }   # añade los que haya
)
$IntervalSec      = 600                       # recorrer todos los nodos cada 10 min
$DiscoverEverySec = 3600                      # refrescar inventario cada hora
$TimeoutSec       = 15                        # timeout por nodo (sin respuesta = enlace caído = dato)
$CsvPath          = Join-Path $PSScriptRoot "zigbee_log.csv"
$GwCsvPath        = Join-Path $PSScriptRoot "gateway_stats.csv"   # CPU/memoria del propio gateway, una fila por ciclo
# Si el webserver del gateway pide login, rellena User/Pass arriba (Digi viejos: root / dbps).
# ===================================================================

$ErrorActionPreference = "Stop"

function Invoke-RCI($GW, $Body) {
  $p = @{ Uri = "http://$($GW.Host)/UE/rci"; Method = "Post";
          ContentType = "text/xml"; Body = $Body; TimeoutSec = $TimeoutSec }
  if ($GW.User) {
    $sec = ConvertTo-SecureString $GW.Pass -AsPlainText -Force
    $p.Credential = New-Object System.Management.Automation.PSCredential($GW.User, $sec)
  }
  return Invoke-RestMethod @p
}

$discoverBody = '<rci_request version="1.1"><do_command target="zigbee"><discover option="clear"/></do_command></rci_request>'

# ---- la CARGA del gateway: CPU y memoria del PROPIO Digi ----
# A las TCUs se les pide su radio (el RSSI que recoge el recolector de
# cobertura); al gateway se le pide a si mismo. Un coordinador con la CPU
# saturada encola los mensajes Zigbee y la planta lo ve como TCUs que "no
# contestan" sin que ninguna radio este mal. La consulta RCI de Digi para eso
# es query_state/device_stats que, segun su referencia, trae la CPU en % y la
# memoria en KB. Como la identidad: NO verificado contra un Digi real. Si no
# se reconoce se vuelca crudo, y esta vez con TODO el estado del aparato
# (query_state sin hijos), para que la primera pasada de el esquema entero.
$RCI_CARGA = '<rci_request version="1.1"><query_state><device_stats/></query_state></rci_request>'
$RCI_TODO  = '<rci_request version="1.1"><query_state/></rci_request>'

# Saca CPU (%), memoria (KB) y uptime (s) del XML por patron, sin depender del
# anidado ni de si vienen como elemento (<cpu>37</cpu>) o atributo (cpu="37").
# ok solo si hay una CPU entre 0 y 100: un <cpu_type>ARM9</cpu_type> no lo es,
# y un 250 tampoco. Pura.
function Gw-Carga([string]$xml) {
    $t = "$xml"
    $r = @{cpu = $null; mem_total = $null; mem_usada = $null; mem_libre = $null; uptime = $null; ok = $false}
    $pat = @{
        cpu       = 'cpu(?:_?(?:usage|util(?:ization)?|load|pct|percent))?'
        mem_total = '(?:total_?mem(?:ory)?|mem(?:ory)?_?total)'
        mem_usada = '(?:used_?mem(?:ory)?|mem(?:ory)?_?used)'
        mem_libre = '(?:free_?mem(?:ory)?|mem(?:ory)?_?free)'
        uptime    = 'up_?time'
    }
    foreach ($k in @('cpu','mem_total','mem_usada','mem_libre','uptime')) {
        $m = [regex]::Match($t, ('(?is)<' + $pat[$k] + '\b[^>]*>\s*(\d+)'))
        if (-not $m.Success) { $m = [regex]::Match($t, ('(?is)\b' + $pat[$k] + '\b\s*"?\s*[:=]\s*"?\s*(\d+)')) }
        if ($m.Success) { $r[$k] = [long]$m.Groups[1].Value }
    }
    if ($null -ne $r.cpu -and $r.cpu -ge 0 -and $r.cpu -le 100) { $r.ok = $true } else { $r.cpu = $null }
    return $r
}

# Memoria usada en %, con lo que haya: la usada, o total menos libre. Pura.
function Gw-MemPct($c) {
    if ($null -eq $c.mem_total -or $c.mem_total -le 0) { return $null }
    $u = $c.mem_usada
    if ($null -eq $u -and $null -ne $c.mem_libre) { $u = $c.mem_total - $c.mem_libre }
    if ($null -eq $u -or $u -lt 0) { return $null }
    return [int][math]::Round(100.0 * $u / $c.mem_total)
}

# Lo leido, en una linea; vacia si no se reconocio. Pura.
function Gw-CargaResumen($c) {
    if (-not $c -or -not $c.ok) { return '' }
    $s = "CPU $($c.cpu) %"
    $p = Gw-MemPct $c
    if ($null -ne $p) {
        $u = $c.mem_usada; if ($null -eq $u) { $u = $c.mem_total - $c.mem_libre }
        $s += ", memoria $p % usada ($u de $($c.mem_total) KB)"
    }
    if ($null -ne $c.uptime) {
        if ($c.uptime -ge 86400) { $s += ", $([int][math]::Floor($c.uptime / 86400)) d en marcha" }
        else { $s += ", $([int][math]::Floor($c.uptime / 3600)) h en marcha" }
    }
    return $s
}

# Lo que devuelve Invoke-RestMethod (XML ya parseado, o texto), como texto.
function Rci-Texto($r) {
  if ($r -is [string]) { return $r }
  if ($r -and $r.OuterXml) { return "$($r.OuterXml)" }
  return "$r"
}

# La carga del gateway: primero device_stats; si no se reconoce, TODO el estado
# (query_state sin hijos), que a lo mejor la trae en otro grupo y, si no, es el
# esquema entero para volcarlo y saber que pedir de verdad.
function Gw-Carga-Leer($GW) {
  $t1 = ""; $t2 = ""
  try { $t1 = Rci-Texto (Invoke-RCI $GW $RCI_CARGA) } catch { }
  $c = Gw-Carga $t1
  if ($c.ok) { return @{ ok = $true; carga = $c; crudo = $t1 } }
  try { $t2 = Rci-Texto (Invoke-RCI $GW $RCI_TODO) } catch { }
  $c = Gw-Carga $t2
  if ($c.ok) { return @{ ok = $true; carga = $c; crudo = $t2 } }
  return @{ ok = $false; carga = $null; crudo = ("$t1`n$t2").Trim() }
}
$cargaAvisada = @{}   # nombre gateway -> ya se aviso (y volco) que no se reconoce la CPU

$inventory = @{}    # nombre gateway -> lista de nodos
$lastDisc  = @{}    # nombre gateway -> hora del último discover

Write-Host "Logger Zigbee -> $CsvPath"
Write-Host "Gateways: $($Gateways.Name -join ', ')  |  ciclo cada $IntervalSec s  |  Ctrl+C para parar`n"

while ($true) {
  $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

  foreach ($gw in $Gateways) {
    # --- inventario (discover) sólo al principio y cada hora ---
    $needDisc = (-not $inventory.ContainsKey($gw.Name)) -or `
                (((Get-Date) - $lastDisc[$gw.Name]).TotalSeconds -gt $DiscoverEverySec)
    if ($needDisc) {
      try {
        $disc = Invoke-RCI $gw $discoverBody
        $inventory[$gw.Name] = @($disc.rci_reply.do_command.discover.device | Where-Object { $_.type -eq "1" })
        $lastDisc[$gw.Name]  = Get-Date
        Write-Host "$stamp  $($gw.Name): inventario $($inventory[$gw.Name].Count) nodos"
      } catch {
        Write-Warning "$stamp  $($gw.Name): discover falló ($($_.Exception.Message)). Reintento al próximo ciclo."
        continue
      }
    }

    # --- RSSI de cada nodo (query_state) ---
    $rows = New-Object System.Collections.Generic.List[object]
    $online = 0; $rssis = @()
    foreach ($d in $inventory[$gw.Name]) {
      $addr = $d.ext_addr
      $nid  = if ([string]::IsNullOrEmpty($d.node_id)) { $addr } else { $d.node_id }
      $role = switch ($d.device_type) { "0x170000" { "TCU" } "0x120000" { "HSU" } default { "$($d.device_type)" } }

      $row = [ordered]@{
        timestamp = $stamp; gateway = $gw.Name; node_id = $nid; role = $role; ext_addr = $addr
        online = 0; rssi_dbm = $null; ack_failures = $null; supply_mv = $null; temp_c = $null; net_addr = $null
      }
      try {
        $body  = "<rci_request version=""1.1""><do_command target=""zigbee""><query_state addr=""$addr""/></do_command></rci_request>"
        $radio = (Invoke-RCI $gw $body).rci_reply.do_command.query_state.radio
        if ($radio -and $radio.rssi) {
          $row.online       = 1
          $row.rssi_dbm     = -[int]$radio.rssi          # 61 -> -61 dBm
          $row.ack_failures = [int]$radio.ack_failures
          $row.supply_mv    = [int]$radio.supply_voltage
          $row.temp_c       = [int]$radio.temperature
          $row.net_addr     = "$($radio.net_addr)"
          $online++; $rssis += $row.rssi_dbm
        }
      } catch { }   # timeout / sin respuesta -> online = 0 (enlace malo)
      $rows.Add([pscustomobject]$row)
      Start-Sleep -Milliseconds 100   # no saturar el radio del coordinador
    }

    $rows | Export-Csv -Path $CsvPath -Append -NoTypeInformation -Encoding UTF8
    $avg = if ($rssis.Count) { [math]::Round(($rssis | Measure-Object -Average).Average, 1) } else { "-" }

    # --- CPU y memoria del PROPIO gateway (query_state/device_stats) ---
    # Va a su CSV, no a zigbee_log.csv: Export-Csv -Append rechaza columnas
    # nuevas contra un fichero ya empezado, y el visor lee ese por fila de nodo.
    $k = Gw-Carga-Leer $gw
    $fila = [ordered]@{ timestamp = $stamp; gateway = $gw.Name; host = $gw.Host; ok = 0
                        cpu_pct = $null; mem_total_kb = $null; mem_usada_kb = $null; mem_libre_kb = $null; uptime_s = $null }
    $txtCarga = "CPU sin leer"
    if ($k.ok) {
      $c = $k.carga
      $fila.ok = 1; $fila.cpu_pct = $c.cpu; $fila.mem_total_kb = $c.mem_total; $fila.mem_usada_kb = $c.mem_usada
      $fila.mem_libre_kb = $c.mem_libre; $fila.uptime_s = $c.uptime
      $txtCarga = Gw-CargaResumen $c
    } elseif (-not $cargaAvisada.ContainsKey($gw.Name)) {
      $cargaAvisada[$gw.Name] = $true
      if ("$($k.crudo)" -ne "") {
        $fx = Join-Path $PSScriptRoot "gateway_stats_crudo_$($gw.Name).xml"
        Set-Content -Path $fx -Value $k.crudo -Encoding UTF8
        Write-Warning "$stamp  $($gw.Name): no reconozco la CPU en lo que contesta el Digi. Respuesta cruda en $fx (se avisa una vez): con ese fichero se ajusta el patron."
      } else {
        Write-Warning "$stamp  $($gw.Name): el Digi no contesta a query_state (o pide login: User/Pass en CONFIG). Se avisa una vez."
      }
    }
    [pscustomobject]$fila | Export-Csv -Path $GwCsvPath -Append -NoTypeInformation -Encoding UTF8
    Write-Host "$stamp  $($gw.Name): $($rows.Count) nodos, $online online, RSSI medio $avg dBm  |  $txtCarga  -> CSV"
  }

  Start-Sleep -Seconds $IntervalSec
}
