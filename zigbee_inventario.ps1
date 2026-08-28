<#
  ============================================================================
  zigbee_inventario.ps1  —  QUE HAY en la malla: cada modulo con su numero de
  serie, su firmware y todo lo que el gateway sepa decir de el.
  ----------------------------------------------------------------------------
  Los otros dos recolectores miden como se COMPORTA la malla a lo largo del
  tiempo. Este contesta a lo otro: QUE hay puesto. Se lanza UNA VEZ y termina.

  EL NUMERO DE SERIE. En un modulo XBee/Zigbee el identificador de fabrica es su
  direccion de 64 bits (SH+SL), y es la misma que va impresa en la etiqueta del
  modulo. O sea que `ext_addr` ES el numero de serie: no hay otro que leer, y ya
  viene en el `discover`. Aqui se guarda entero y sin tocar.

  POR QUE VUELCA TAMBIEN EL XML EN CRUDO. Cada firmware de ConnectPort contesta
  con un juego de campos distinto, y no hay forma de saber cual sin preguntarle
  al de la planta. Asi que esto NO se queda con una lista de campos elegida a
  dedo: recoge TODO lo que venga —cada atributo de cada <device>, cada hijo de
  <radio>— y ademas guarda las primeras respuestas tal cual en un .xml. Con eso
  se ve que ofrece ese gateway de verdad y la proxima version ya puede pedirlo
  por su nombre. Un campo que no se pide es un campo que se pierde.

  EJECUTAR (desde la carpeta del script, no hace falta admin):
    powershell -ExecutionPolicy Bypass -File .\zigbee_inventario.ps1

  Sale: zigbee_inventario.csv  (una fila por modulo)
        zigbee_inventario_crudo.xml  (las respuestas en bruto, para mirar)
  ============================================================================
#>

# ======================= CONFIG (edita esto) =======================
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
)
$TimeoutSec  = 20
$CrudoNodos  = 3     # de cuantos nodos se guarda la respuesta entera en el .xml
$CsvPath     = Join-Path $PSScriptRoot "zigbee_inventario.csv"
$XmlPath     = Join-Path $PSScriptRoot "zigbee_inventario_crudo.xml"
# Si el webserver del gateway pide login, rellena User/Pass (Digi viejos: root / dbps).
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
# lo mismo pero devolviendo el texto sin parsear, para el volcado en crudo
function Invoke-RCIRaw($GW, $Body) {
  $p = @{ Uri = "http://$($GW.Host)/UE/rci"; Method = "Post";
          ContentType = "text/xml"; Body = $Body; TimeoutSec = $TimeoutSec }
  if ($GW.User) {
    $sec = ConvertTo-SecureString $GW.Pass -AsPlainText -Force
    $p.Credential = New-Object System.Management.Automation.PSCredential($GW.User, $sec)
  }
  return (Invoke-WebRequest @p).Content
}

# Todo lo que cuelgue de un nodo XML, aplanado a pares clave/valor. Asi no hay
# que saber de antemano como se llaman los campos: se recogen los que vengan.
function Aplana($nodo, $prefijo) {
  $out = [ordered]@{}
  if (-not $nodo) { return $out }
  foreach ($a in @($nodo.Attributes)) { if ($a) { $out[$prefijo + $a.Name] = $a.Value } }
  foreach ($h in @($nodo.ChildNodes)) {
    if (-not $h) { continue }
    if ($h.NodeType -eq "Text") { continue }
    if ($h.HasChildNodes -and $h.ChildNodes.Count -eq 1 -and $h.FirstChild.NodeType -eq "Text") {
      $out[$prefijo + $h.Name] = $h.InnerText
    } else {
      foreach ($kv in (Aplana $h ($prefijo + $h.Name + "_")).GetEnumerator()) { $out[$kv.Key] = $kv.Value }
    }
  }
  return $out
}

$discoverBody = '<rci_request version="1.1"><do_command target="zigbee"><discover option="clear"/></do_command></rci_request>'
$crudo = New-Object System.Text.StringBuilder
[void]$crudo.AppendLine("<!-- zigbee_inventario.ps1 — respuestas en bruto, $(Get-Date -Format s) -->")
[void]$crudo.AppendLine("<volcado>")

$filas = New-Object System.Collections.Generic.List[object]
foreach ($gw in $Gateways) {
  Write-Host "$($gw.Name) ($($gw.Host)): preguntando..."

  # --- el gateway: quien es y que firmware lleva ---------------------------
  foreach ($q in @("<rci_request version=""1.1""><query_setting/></rci_request>",
                   "<rci_request version=""1.1""><query_state/></rci_request>")) {
    try {
      [void]$crudo.AppendLine("<gateway nombre=""$($gw.Name)"" host=""$($gw.Host)"">")
      [void]$crudo.AppendLine((Invoke-RCIRaw $gw $q))
      [void]$crudo.AppendLine("</gateway>")
    } catch { Write-Warning "  $($gw.Name): $q -> $($_.Exception.Message)" }
  }

  # --- el censo -------------------------------------------------------------
  try { $disc = Invoke-RCI $gw $discoverBody }
  catch { Write-Warning "  $($gw.Name): discover fallo ($($_.Exception.Message))"; continue }
  $devs = @($disc.rci_reply.do_command.discover.device)
  Write-Host "  $($devs.Count) nodos en el censo"

  $n = 0
  foreach ($d in $devs) {
    $n++
    $addr = $d.ext_addr
    $fila = [ordered]@{
      gateway = $gw.Name; gw_host = $gw.Host
      # el numero de serie del modulo: su direccion de 64 bits, la de la etiqueta
      serie   = $addr
      node_id = $d.node_id
    }
    # TODO lo que traiga el <device>, no solo los cuatro de siempre
    foreach ($kv in (Aplana $d "disc_").GetEnumerator()) { $fila[$kv.Key] = $kv.Value }

    # y TODO lo que conteste el nodo
    foreach ($par in @(@("estado", "query_state"), @("ajuste", "query_setting"))) {
      $pre, $cmd = $par
      try {
        $body = "<rci_request version=""1.1""><do_command target=""zigbee""><$cmd addr=""$addr""/></do_command></rci_request>"
        if ($n -le $CrudoNodos) {
          [void]$crudo.AppendLine("<nodo serie=""$addr"" cmd=""$cmd"">")
          [void]$crudo.AppendLine((Invoke-RCIRaw $gw $body))
          [void]$crudo.AppendLine("</nodo>")
        }
        $r = Invoke-RCI $gw $body
        $sub = $r.rci_reply.do_command.$cmd
        foreach ($kv in (Aplana $sub ($pre + "_")).GetEnumerator()) { $fila[$kv.Key] = $kv.Value }
        $fila[$pre + "_ok"] = 1
      } catch {
        # que no conteste tambien es informacion: o el nodo esta caido, o ese
        # firmware no soporta ese comando. Se distingue mirando el otro.
        $fila[$pre + "_ok"] = 0
        $fila[$pre + "_error"] = $_.Exception.Message
      }
    }
    $filas.Add([pscustomobject]$fila)
    Write-Host ("  {0,3}/{1}  {2}  {3}" -f $n, $devs.Count, $addr, $d.node_id)
    Start-Sleep -Milliseconds 150   # no saturar el radio del coordinador
  }
}
[void]$crudo.AppendLine("</volcado>")

if ($filas.Count -eq 0) { Write-Warning "Ningun nodo. Revisa la IP del gateway y el login."; exit 1 }

# UNA SOLA CABECERA CON TODAS LAS COLUMNAS. Export-Csv coge las del primer
# objeto: si un nodo contesta un campo que el primero no traia, se perderia
# justo el campo raro, que es el que interesa.
$cols = [ordered]@{}
foreach ($f in $filas) { foreach ($p in $f.PSObject.Properties) { $cols[$p.Name] = 1 } }
$claves = @($cols.Keys)
$filas | Select-Object -Property $claves |
  Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
Set-Content -Path $XmlPath -Value $crudo.ToString() -Encoding UTF8

Write-Host ""
Write-Host "$($filas.Count) modulos  ·  $($claves.Count) columnas  ->  $CsvPath"
Write-Host "respuestas en bruto de los primeros $CrudoNodos nodos  ->  $XmlPath"
Write-Host "Manda los dos ficheros: con el .xml se ve que mas sabe decir este gateway."
