<#
  ============================================================================
  zigbee_routes_logger.ps1  —  Captura CONTINUA de RUTAS (saltos) de la malla
  ----------------------------------------------------------------------------
  Cliente telnet en PowerShell PURO (no necesita PuTTY, plink ni instalar nada).
  - AUTODESCUBRE los nodos por HTTP (RCI), igual que el logger de RSSI.
  - Por cada nodo pide su 'source_route' por telnet y guarda los saltos con
    marca de tiempo en zigbee_routes.csv.
  Las rutas de una malla Zigbee son DINAMICAS: por eso se capturan en bucle.

  EJECUTAR (en su propia ventana, a la vez que zigbee_logger.ps1):
    powershell -ExecutionPolicy Bypass -File .\zigbee_routes_logger.ps1
  Parar: Ctrl+C.
  ============================================================================
#>

# =========================== CONFIG (edita esto) ============================
$GwHost     = "10.100.1.54"     # IP del gateway (la misma que en el navegador)
$TelnetPort = 23                # telnet
$User       = "root"            # usuario del gateway (el del telnet)
$Pass       = "dbps"            # contrasena
$Prompt     = "#>"              # prompt del gateway (si el tuyo es distinto, cambialo)
$LoginRe    = "ogin"            # texto que precede al usuario  (p.ej. "login:")
$PassRe     = "assword"         # texto que precede a la clave  (p.ej. "password:")
$IntervalSec      = 300         # repetir la captura completa cada 5 min
$DiscoverEverySec = 3600        # refrescar la lista de nodos (por HTTP) cada hora
$TimeoutMs        = 8000        # espera maxima por la respuesta de cada nodo
$Debug      = $false            # ponlo a $true si el login falla, para ver que llega
$CsvPath    = Join-Path $PSScriptRoot "zigbee_routes.csv"

# Lista de nodos: por defecto se AUTODESCUBRE (deja la lista vacia).
# Si quieres fijar nodos concretos, ponlos aqui (con o sin '!' al final):
$MacsManual = @()
# ============================================================================

# ---------- Autodescubrimiento de nodos por HTTP (RCI) ----------
function Get-NodeMacs {
  if ($MacsManual.Count -gt 0) {
    return @($MacsManual | ForEach-Object { if ($_ -match '!$') { $_ } else { "$_!" } })
  }
  $body = '<rci_request version="1.1"><do_command target="zigbee"><discover option="clear"/></do_command></rci_request>'
  try {
    $r = Invoke-RestMethod -Uri "http://$GwHost/UE/rci" -Method Post -ContentType "text/xml" -Body $body -TimeoutSec 60
    $devs = $r.rci_reply.do_command.discover.device | Where-Object { $_.type -eq "1" }   # routers (TCU/HSU)
    return @($devs | ForEach-Object { "$($_.ext_addr)" })   # ext_addr ya trae el '!'
  } catch {
    Write-Warning "Autodescubrimiento HTTP fallo ($($_.Exception.Message)). Reintento mas tarde."
    return @()
  }
}

# ---------- Cliente telnet (TCP + manejo de negociacion IAC) ----------
function TelnetSend($ns, $s) {
  $b = [Text.Encoding]::ASCII.GetBytes($s + "`r`n"); $ns.Write($b, 0, $b.Length); $ns.Flush()
}
function TelnetRead($ns, $until, $timeoutMs) {
  $sb = New-Object Text.StringBuilder; $deadline = (Get-Date).AddMilliseconds($timeoutMs); $buf = New-Object byte[] 4096
  while ((Get-Date) -lt $deadline) {
    if ($ns.DataAvailable) {
      $n = $ns.Read($buf, 0, $buf.Length); $i = 0
      while ($i -lt $n) {
        $b = $buf[$i]
        if ($b -eq 255) {                                   # IAC (negociacion telnet)
          if ($i + 1 -lt $n) {
            $cmd = $buf[$i + 1]
            if ($cmd -eq 250) { $i += 2; while ($i -lt $n -and $buf[$i] -ne 240) { $i++ }; $i++; continue }  # SB..SE
            elseif ($cmd -ge 251 -and $cmd -le 254) {
              $opt = if ($i + 2 -lt $n) { $buf[$i + 2] } else { 0 }
              $resp = $null; if ($cmd -eq 253) { $resp = 252 } elseif ($cmd -eq 251) { $resp = 254 }  # DO->WONT, WILL->DONT
              if ($resp) { $ns.Write([byte[]]@(255, $resp, $opt), 0, 3) }
              $i += 3; continue
            } else { $i += 2; continue }
          } else { $i++; continue }
        } else { [void]$sb.Append([char]$b); $i++ }
      }
      if ($sb.ToString() -match [regex]::Escape($until)) { return $sb.ToString() }
    } else { Start-Sleep -Milliseconds 40 }
  }
  return $sb.ToString()
}
function ParseRoute($text) {
  $ids = @(); $addrs = @()
  foreach ($line in ($text -split "`n")) {
    if ($line -match '^\s*(\S*)\s*\[([0-9a-fA-F]{1,4})\]!') {
      $nid = $Matches[1]; $addr = $Matches[2]
      if ([string]::IsNullOrEmpty($nid)) { $nid = "COORD" }
      $ids += $nid; $addrs += $addr
    }
  }
  return @{ ids = $ids; addrs = $addrs }
}

# ---------- Conexion + login ----------
Write-Host "Conectando a $GwHost`:$TelnetPort (telnet)..."
$client = New-Object Net.Sockets.TcpClient
try { $client.Connect($GwHost, $TelnetPort) } catch { Write-Error "No conecta: $($_.Exception.Message)"; exit 1 }
$ns = $client.GetStream()
$r = TelnetRead $ns $LoginRe 7000; if ($Debug) { Write-Host "[prompt login]`n$r" -ForegroundColor DarkGray }
TelnetSend $ns $User
$r = TelnetRead $ns $PassRe 7000;  if ($Debug) { Write-Host "[prompt pass]`n$r" -ForegroundColor DarkGray }
TelnetSend $ns $Pass
$r = TelnetRead $ns $Prompt 7000;  if ($Debug) { Write-Host "[tras login]`n$r" -ForegroundColor DarkGray }
if ($r -notmatch [regex]::Escape($Prompt)) {
  Write-Warning "No veo el prompt '$Prompt' tras el login. Revisa usuario/clave/prompt y pon `$Debug = `$true."
}
Write-Host "Conectado. Capturando rutas cada $IntervalSec s. Ctrl+C para parar.`n"

# ---------- Bucle principal ----------
$macs = @(); $lastDiscover = [datetime]::MinValue
while ($true) {
  if (((Get-Date) - $lastDiscover).TotalSeconds -gt $DiscoverEverySec -or $macs.Count -eq 0) {
    $macs = Get-NodeMacs
    if ($macs.Count -gt 0) { $lastDiscover = Get-Date; Write-Host "$((Get-Date).ToString('HH:mm:ss'))  nodos descubiertos: $($macs.Count)" }
    else { Start-Sleep -Seconds 15; continue }
  }
  $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $rows = New-Object Collections.Generic.List[object]
  $sumHops = 0; $ok = 0
  foreach ($mac in $macs) {
    TelnetSend $ns "xbee source_route $mac"
    $out = TelnetRead $ns $Prompt $TimeoutMs
    $p = ParseRoute $out
    if ($p.addrs.Count -gt 0) {
      $hops = $p.addrs.Count - 1
      $rows.Add([pscustomobject][ordered]@{
          timestamp  = $stamp; target = $mac; hop_count = $hops
          path_ids   = ($p.ids -join '>'); path_addrs = ($p.addrs -join '>')
        })
      $sumHops += $hops; $ok++
    }
    Start-Sleep -Milliseconds 80
  }
  $rows | Export-Csv -Path $CsvPath -Append -NoTypeInformation -Encoding UTF8
  $avg = if ($ok) { [math]::Round($sumHops / $ok, 1) } else { "-" }
  Write-Host "$stamp  $ok/$($macs.Count) rutas, saltos medios $avg  -> CSV"
  Start-Sleep -Seconds $IntervalSec
}
