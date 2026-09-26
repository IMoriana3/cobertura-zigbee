<#
  zigbee_routes_logger.ps1 — recolector PERMANENTE de rutas/hops Zigbee.

  - Multi-gateway: recorre TODOS los gateways y un fallo no detiene los demás.
  - Reabre telnet por gateway en cada vuelta: una sesión rota se recupera sola.
  - Censo acumulativo: discover añade; nunca borra.
  - schema_version=2, UTC por consulta, ciclo_id y latencia_ms.
  - Una ruta fallida también deja fila: ausencia de fila ya no significa nada.
  - Credenciales: vacías en GitHub. Se pueden poner por gateway o mediante
    FACTIUN_ZIGBEE_USER / FACTIUN_ZIGBEE_PASS en el PC de planta.
#>

# ======================= CONFIG (el paquete de planta sustituye este bloque) =======================
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = ""; TelnetPort = 23 }
)
$Prompt             = "#>"
$LoginRe            = "ogin"
$PassRe             = "assword"
$IntervalSec        = 300
$DiscoverEverySec   = 3600
$HttpTimeoutSec     = 15
$ConnectTimeoutMs   = 8000
$TimeoutMs          = 8000
$NodePauseMs        = 80
$GatewayPauseMs     = 500
$MinPauseSec        = 30
$CsvPath            = Join-Path $PSScriptRoot "zigbee_routes.csv"
$CensoPath          = Join-Path $PSScriptRoot "censo_campania.csv"
# ================================================================================================

$SchemaVersion = 2
$ErrorActionPreference = "Stop"
$Invariant = [System.Globalization.CultureInfo]::InvariantCulture
$ColsRoutes = @("schema_version","timestamp","ciclo_id","latencia_ms","gateway","target_ext","ok","motivo","hop_count","path_ids","path_addrs","path_ext")

function Utc-Now { return [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", $Invariant) }
function Utc-Tag { return [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ", $Invariant) }
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
  while (Test-Path $dst) { $dst = Join-Path $dir ($base + "." + $Tag + "." + $n + $ext); $n++ }
  Move-Item -Path $Path -Destination $dst
}
function Ensure-LiveCsv([string]$Path, $ExpectedColumns) {
  if (-not (Test-Path $Path)) { return }
  $fi = Get-Item $Path
  $today = [DateTime]::UtcNow.ToString("yyyyMMdd", $Invariant)
  $fileDay = $fi.LastWriteTimeUtc.ToString("yyyyMMdd", $Invariant)
  if ($fileDay -ne $today) { Move-Safe $Path $fileDay; return }
  if (-not (Same-Header (Csv-HeaderNames $Path) $ExpectedColumns)) { Move-Safe $Path ("schema-old." + (Utc-Tag)) }
}
function Append-Rows([string]$Path, $Rows, $ExpectedColumns) {
  if (-not $Rows -or @($Rows).Count -eq 0) { return }
  Ensure-LiveCsv $Path $ExpectedColumns
  @($Rows) | Select-Object $ExpectedColumns | Export-Csv -Path $Path -Append -NoTypeInformation -Encoding UTF8
}

function Gateway-User($GW) {
  if ($GW.User) { return "$($GW.User)" }
  return "$env:FACTIUN_ZIGBEE_USER"
}
function Gateway-Pass($GW) {
  if ($GW.Pass) { return "$($GW.Pass)" }
  return "$env:FACTIUN_ZIGBEE_PASS"
}
function Invoke-RCI($GW, $Body) {
  $p = @{
    Uri = "http://$($GW.Host)/UE/rci"
    Method = "Post"
    ContentType = "text/xml"
    Body = $Body
    TimeoutSec = $HttpTimeoutSec
  }
  $u = Gateway-User $GW
  $pw = Gateway-Pass $GW
  if ($u) {
    $sec = ConvertTo-SecureString $pw -AsPlainText -Force
    $p.Credential = New-Object System.Management.Automation.PSCredential($u, $sec)
  }
  return Invoke-RestMethod @p
}
$DiscoverBody = '<rci_request version="1.1"><do_command target="zigbee"><discover option="clear"/></do_command></rci_request>'

function TelnetSend($ns, [string]$s) {
  $b = [Text.Encoding]::ASCII.GetBytes($s + [char]13 + [char]10)
  $ns.Write($b, 0, $b.Length)
  $ns.Flush()
}
function TelnetRead($ns, [string]$until, [int]$timeoutMs) {
  $sb = New-Object Text.StringBuilder
  $deadline = (Get-Date).AddMilliseconds($timeoutMs)
  $buf = New-Object byte[] 4096
  while ((Get-Date) -lt $deadline) {
    if ($ns.DataAvailable) {
      $n = $ns.Read($buf, 0, $buf.Length)
      $i = 0
      while ($i -lt $n) {
        $b = $buf[$i]
        if ($b -eq 255) {
          if ($i + 1 -lt $n) {
            $cmd = $buf[$i + 1]
            if ($cmd -eq 250) {
              $i += 2
              while ($i -lt $n -and $buf[$i] -ne 240) { $i++ }
              $i++
              continue
            }
            if ($cmd -ge 251 -and $cmd -le 254) {
              $opt = if ($i + 2 -lt $n) { $buf[$i + 2] } else { 0 }
              $resp = $null
              if ($cmd -eq 253) { $resp = 252 }
              elseif ($cmd -eq 251) { $resp = 254 }
              if ($null -ne $resp) { $ns.Write([byte[]]@(255, $resp, $opt), 0, 3) }
              $i += 3
              continue
            }
            $i += 2
            continue
          }
          $i++
          continue
        }
        [void]$sb.Append([char]$b)
        $i++
      }
      if ($sb.ToString() -match [regex]::Escape($until)) { return $sb.ToString() }
    } else {
      Start-Sleep -Milliseconds 40
    }
  }
  return $sb.ToString()
}
function ParseRoute([string]$text) {
  $ids = @()
  $addrs = @()
  foreach ($line in ($text -split [Environment]::NewLine)) {
    if ($line -match '^\s*(\S*)\s*\[([0-9a-fA-F]{1,4})\]!') {
      $nid = $Matches[1]
      if ([string]::IsNullOrEmpty($nid)) { $nid = "COORD" }
      $ids += $nid
      $addrs += $Matches[2]
    }
  }
  return @{ ids=$ids; addrs=$addrs }
}
function Net-Key([string]$s) {
  $x = "$s".Trim().ToLowerInvariant()
  $x = $x -replace '^0x',''
  if ($x -notmatch '^[0-9a-f]+$') { return $null }
  try { return ([Convert]::ToInt32($x, 16)).ToString("x", $Invariant) } catch { return $null }
}
function Resolve-PathExt($p, $known) {
  $netToExt = @{}
  foreach ($d in @($known.Values)) {
    $k = Net-Key "$($d.net_addr)"
    if ($k) { $netToExt[$k] = "$($d.ext_addr)" }
  }
  $out = @()
  for ($i=0; $i -lt $p.addrs.Count; $i++) {
    if ($p.ids[$i] -eq "COORD") { $out += "COORD"; continue }
    $k = Net-Key "$($p.addrs[$i])"
    if (-not $k -or -not $netToExt.ContainsKey($k)) { return "" }
    $out += $netToExt[$k]
  }
  return ($out -join ">")
}

function Open-Telnet($GW) {
  $hostOnly = ("$($GW.Host)" -split ':')[0]
  $port = if ($GW.TelnetPort) { [int]$GW.TelnetPort } else { 23 }
  $user = Gateway-User $GW
  $pass = Gateway-Pass $GW

  $client = New-Object Net.Sockets.TcpClient
  $ar = $client.BeginConnect($hostOnly, $port, $null, $null)
  if (-not $ar.AsyncWaitHandle.WaitOne($ConnectTimeoutMs)) {
    $client.Close()
    throw "timeout conectando a $hostOnly:$port"
  }
  $client.EndConnect($ar)
  $ns = $client.GetStream()

  $r = TelnetRead $ns $LoginRe 7000
  if ($r -match [regex]::Escape($Prompt)) { return @{client=$client; ns=$ns} }
  if (-not $user) { $client.Close(); throw "auth: falta FACTIUN_ZIGBEE_USER o User en CONFIG" }
  TelnetSend $ns $user
  $r = TelnetRead $ns $PassRe 7000
  if (-not $pass) { $client.Close(); throw "auth: falta FACTIUN_ZIGBEE_PASS o Pass en CONFIG" }
  TelnetSend $ns $pass
  $r = TelnetRead $ns $Prompt 7000
  if ($r -notmatch [regex]::Escape($Prompt)) { $client.Close(); throw "auth: no aparece el prompt tras login" }
  return @{client=$client; ns=$ns}
}

$inventory = @{}
$lastDisc = @{}
foreach ($gw in $Gateways) { $inventory[$gw.Name] = @{} }

if (Test-Path $CensoPath) {
  try {
    foreach ($r in Import-Csv $CensoPath) {
      if (-not $inventory.ContainsKey($r.gateway)) { continue }
      if (-not $r.ext_addr) { continue }
      $inventory[$r.gateway][$r.ext_addr] = [pscustomobject]@{
        ext_addr=$r.ext_addr; node_id=$r.node_id; net_addr=$null; type="1"; device_type=$null
      }
    }
  } catch { Write-Warning "No puedo precargar censo_campania.csv: $($_.Exception.Message)" }
}

function Discover-Merge($GW) {
  $r = Invoke-RCI $GW $DiscoverBody
  $devs = @($r.rci_reply.do_command.discover.device | Where-Object { $_.type -eq "1" })
  foreach ($d in $devs) { $inventory[$GW.Name]["$($d.ext_addr)"] = $d }
  return $devs.Count
}

Write-Host "Logger de rutas permanente (schema v2)"
Write-Host "Gateways: $($Gateways.Name -join ', ') | objetivo de ciclo $IntervalSec s | Ctrl+C para parar"
if (-not $env:FACTIUN_ZIGBEE_USER) { Write-Host "Credenciales telnet: no hay FACTIUN_ZIGBEE_USER en el entorno; se usaran las de CONFIG si existen" }

$ciclo = 0
while ($true) {
  $cycleSw = [Diagnostics.Stopwatch]::StartNew()

  foreach ($gw in $Gateways) {
    $due = (-not $lastDisc.ContainsKey($gw.Name)) -or (((Get-Date) - $lastDisc[$gw.Name]).TotalSeconds -ge $DiscoverEverySec)
    if ($due) {
      try {
        $n = Discover-Merge $gw
        $lastDisc[$gw.Name] = Get-Date
        Write-Host "$(Utc-Now) $($gw.Name): discover $n; censo acumulado $($inventory[$gw.Name].Count)"
      } catch {
        Write-Warning "$(Utc-Now) $($gw.Name): discover fallo; mantengo $($inventory[$gw.Name].Count) nodos conocidos"
      }
    }

    $known = @($inventory[$gw.Name].Values)
    if ($known.Count -eq 0) {
      Write-Warning "$(Utc-Now) $($gw.Name): sin censo, sigo con el siguiente gateway"
      Start-Sleep -Milliseconds $GatewayPauseMs
      continue
    }

    $rows = New-Object System.Collections.Generic.List[object]
    $connSw = [Diagnostics.Stopwatch]::StartNew()
    $session = $null
    try {
      $session = Open-Telnet $gw
    } catch {
      $connSw.Stop()
      $mot = if ("$($_.Exception.Message)" -match "auth") { "auth" } else { "telnet_caido" }
      foreach ($d in $known) {
        $rows.Add([pscustomobject][ordered]@{
          schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=[int]$connSw.ElapsedMilliseconds
          gateway=$gw.Name; target_ext="$($d.ext_addr)"; ok=0; motivo=$mot
          hop_count=$null; path_ids=$null; path_addrs=$null; path_ext=$null
        })
      }
      Append-Rows $CsvPath $rows $ColsRoutes
      Write-Warning "$(Utc-Now) $($gw.Name): $mot; dejo $($known.Count) filas y sigo"
      Start-Sleep -Milliseconds $GatewayPauseMs
      continue
    }
    $connSw.Stop()

    $sessionBroken = $false
    try {
      foreach ($d in $known) {
        if ($sessionBroken) {
          $rows.Add([pscustomobject][ordered]@{
            schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=0
            gateway=$gw.Name; target_ext="$($d.ext_addr)"; ok=0; motivo="telnet_caido"
            hop_count=$null; path_ids=$null; path_addrs=$null; path_ext=$null
          })
          continue
        }

        $sw = [Diagnostics.Stopwatch]::StartNew()
        $ok = 0; $motivo = "sin_ruta"; $hop=$null; $ids=$null; $addrs=$null; $exts=$null
        try {
          TelnetSend $session.ns ("xbee source_route " + $d.ext_addr)
          $out = TelnetRead $session.ns $Prompt $TimeoutMs
          if ($out -notmatch [regex]::Escape($Prompt)) {
            $motivo = "telnet_caido"
            $sessionBroken = $true
          } else {
            $p = ParseRoute $out
            if ($p.addrs.Count -gt 0) {
              $ok = 1
              $motivo = "ok"
              $hop = $p.addrs.Count - 1
              $ids = $p.ids -join ">"
              $addrs = $p.addrs -join ">"
              $exts = Resolve-PathExt $p $inventory[$gw.Name]
            }
          }
        } catch {
          $motivo = "telnet_caido"
          $sessionBroken = $true
        }
        $sw.Stop()
        $rows.Add([pscustomobject][ordered]@{
          schema_version=$SchemaVersion; timestamp=(Utc-Now); ciclo_id=$ciclo; latencia_ms=[int]$sw.ElapsedMilliseconds
          gateway=$gw.Name; target_ext="$($d.ext_addr)"; ok=$ok; motivo=$motivo
          hop_count=$hop; path_ids=$ids; path_addrs=$addrs; path_ext=$exts
        })
        Start-Sleep -Milliseconds $NodePauseMs
      }
    } finally {
      if ($session -and $session.client) { try { $session.client.Close() } catch { } }
    }

    Append-Rows $CsvPath $rows $ColsRoutes
    $nOk = @($rows | Where-Object { $_.ok -eq 1 }).Count
    $nFail = @($rows | Where-Object { $_.ok -ne 1 }).Count
    $hops = @($rows | Where-Object { $null -ne $_.hop_count } | ForEach-Object { [int]$_.hop_count })
    $avg = if ($hops.Count) { [Math]::Round(($hops | Measure-Object -Average).Average, 1) } else { "-" }
    Write-Host "$(Utc-Now) $($gw.Name): $nOk rutas, $nFail fallos, hops medios $avg"
    Start-Sleep -Milliseconds $GatewayPauseMs
  }

  $cycleSw.Stop()
  $ciclo++
  $sleep = [Math]::Max($MinPauseSec, $IntervalSec - [int][Math]::Ceiling($cycleSw.Elapsed.TotalSeconds))
  Write-Host "$(Utc-Now) ciclo rutas terminado en $([int]$cycleSw.Elapsed.TotalSeconds) s; pausa $sleep s"
  Start-Sleep -Seconds $sleep
}
