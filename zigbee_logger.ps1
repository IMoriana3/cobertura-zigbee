<#
  zigbee_logger.ps1  —  Captura de cobertura Zigbee en El Burgo
  Lee el RSSI de cada TCU de los gateways Digi por RCI y lo guarda en un CSV.
  NO necesita instalar nada: PowerShell ya viene en Windows.

  EJECUTAR (desde la carpeta del script, no hace falta admin):
    powershell -ExecutionPolicy Bypass -File .\zigbee_logger.ps1

  Parar: Ctrl+C. El CSV queda en la misma carpeta (zigbee_log.csv).
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
    Write-Host "$stamp  $($gw.Name): $($rows.Count) nodos, $online online, RSSI medio $avg dBm  -> CSV"
  }

  Start-Sleep -Seconds $IntervalSec
}
