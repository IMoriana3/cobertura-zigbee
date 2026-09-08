<#
  ============================================================================
  zigbee_angulos.ps1  —  el ANGULO de cada seguidor mientras se hace el barrido
  ----------------------------------------------------------------------------
  El barrido de calibracion necesita saber a que angulo estaba el seguidor en
  cada medida: con las palas planas y de canto la obstruccion no es la misma, y
  sin el angulo no se puede separar una cosa de la otra.

  Eso NO se apunta a mano. Esta en el Modbus y se lee solo: registro 30111
  (tilt_angle) de cada TCU. Esto lo graba en bucle con marca de tiempo, y al
  volver `rellena_barrido.py` lo cruza con la hoja por la hora.

  OJO, QUE AQUI LA DIRECCION ES LA OTRA. Los otros tres recolectores hablan con
  el gateway DIGI (HTTP/RCI 80, telnet 23). Este habla con el MODBUS TCP de la
  NCU, que es otro aparato y otro puerto (503 el GW1, 504 el GW2). Es justo al
  reves, y por eso la IP va en un CONFIG aparte.

  SOLO SONDEA LOS TCU DE LA HOJA. Lee el barrido_*.csv que tenga al lado y se
  queda con los esclavos que salen en el. Sondear la NCU entera cada medio
  minuto la carga sin necesidad, y ademas compite con el SCADA por la misma
  conexion.

  EJECUTAR (en su propia ventana, mientras se anda el barrido):
    powershell -ExecutionPolicy Bypass -File .\zigbee_angulos.ps1
  Parar: Ctrl+C. Deja angulos.csv al lado.
  ============================================================================
#>

# ======================= CONFIG (edita esto) =======================
$Ncus = @(
  @{ Name = "NCU01-GW1"; Host = "10.100.1.52"; Port = 503 }
)
$IntervalSec = 30                 # una pasada a los TCU de la hoja cada 30 s
$TimeoutMs   = 8000
$CsvPath     = Join-Path $PSScriptRoot "angulos.csv"
# ===================================================================

$ErrorActionPreference = "Stop"

# --- Modbus TCP, lo justo: FC03. Misma convencion que la TCU Toolbox, y esto
# --- importa: la direccion documentada 30111 va TAL CUAL en la trama (no es
# --- 3xxxx con offset y FC04). Escribirlo del otro modo no da error: da
# --- IllegalDataAddress en la planta y una tarde perdida.
function Modbus-Leer($cli, [byte]$unit, [int]$addr, [int]$n) {
  $st = $cli.GetStream()
  $script:Tid = (($script:Tid + 1) % 65535); if ($script:Tid -eq 0) { $script:Tid = 1 }
  $pdu = [byte[]](3, (($addr -shr 8) -band 0xFF), ($addr -band 0xFF), (($n -shr 8) -band 0xFF), ($n -band 0xFF))
  $adu = New-Object byte[] (7 + $pdu.Length)
  $adu[0] = [byte](($script:Tid -shr 8) -band 0xFF); $adu[1] = [byte]($script:Tid -band 0xFF)
  $adu[4] = [byte]((($pdu.Length + 1) -shr 8) -band 0xFF); $adu[5] = [byte](($pdu.Length + 1) -band 0xFF)
  $adu[6] = $unit
  [Array]::Copy($pdu, 0, $adu, 7, $pdu.Length)
  $st.Write($adu, 0, $adu.Length)

  function Leer-Exacto($n2) {
    $b = New-Object byte[] $n2; $l = 0
    while ($l -lt $n2) {
      $k = $st.Read($b, $l, $n2 - $l)
      if ($k -le 0) { throw "conexion cerrada" }
      $l += $k
    }
    return $b
  }
  $cab = Leer-Exacto 7
  $rlen = ([int]$cab[4] -shl 8) -bor [int]$cab[5]
  $cuerpo = Leer-Exacto ($rlen - 1)
  if ($cuerpo[0] -band 0x80) { throw ("excepcion Modbus 0x{0:X2}" -f [int]$cuerpo[1]) }
  $vals = New-Object int[] $n
  for ($i = 0; $i -lt $n; $i++) { $vals[$i] = (([int]$cuerpo[2 + 2*$i] -shl 8) -bor [int]$cuerpo[3 + 2*$i]) }
  return ,$vals
}
# 30111 y 30112 son s16 con una decima: 155 -> 15,5 grados. Sin el signo, un
# seguidor a -30 sale a 6528.
function S16([int]$v) { if ($v -gt 32767) { return $v - 65536 } return $v }

# --- que TCU hay que mirar: los de la hoja de barrido que este al lado --------
$esclavos = @{}
foreach ($h in @(Get-ChildItem -Path $PSScriptRoot -Filter "barrido_*.csv" -ErrorAction SilentlyContinue)) {
  foreach ($f in (Import-Csv $h.FullName)) {
    foreach ($c in @($f.esclavo_origen, $f.esclavo_destino)) {
      if ("$c" -match '^\d+$') { $esclavos[[int]$c] = 1 }
    }
  }
}
$lista = @($esclavos.Keys | Sort-Object)
if ($lista.Count -eq 0) {
  Write-Warning "No hay ningun barrido_*.csv al lado, o no trae esclavos. Sin eso no se que TCU mirar."
  exit 1
}
Write-Host "Angulos -> $CsvPath"
Write-Host "$($lista.Count) TCU de la hoja de barrido  |  cada $IntervalSec s  |  Ctrl+C para parar`n"

$script:Tid = 0
while ($true) {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
  $filas = New-Object System.Collections.Generic.List[object]
  foreach ($ncu in $Ncus) {
    $cli = $null
    try {
      $cli = New-Object System.Net.Sockets.TcpClient
      $cli.SendTimeout = $TimeoutMs; $cli.ReceiveTimeout = $TimeoutMs
      $cli.Connect($ncu.Host, $ncu.Port)
    } catch {
      Write-Warning "$stamp  $($ncu.Name): no conecta a $($ncu.Host):$($ncu.Port) ($($_.Exception.Message))"
      if ($cli) { $cli.Close() }
      continue
    }
    $ok = 0
    foreach ($e in $lista) {
      $fila = [ordered]@{ hora_utc = $stamp; ncu = $ncu.Name; ip = $ncu.Host; puerto = $ncu.Port
                          esclavo = $e; tilt_deg = $null; target_deg = $null; modo = ""; error = "" }
      try {
        $a = Modbus-Leer $cli ([byte]$e) 30111 2
        $fila.tilt_deg   = [math]::Round((S16 $a[0]) / 10.0, 1)
        $fila.target_deg = [math]::Round((S16 $a[1]) / 10.0, 1)
        # 30001 bits 9:8 = modo. Un seguidor que no esta en AUTO no esta
        # siguiendo, y su angulo no dice lo mismo: hay que poder distinguirlo.
        $m = Modbus-Leer $cli ([byte]$e) 30001 1
        $fila.modo = @('OFF','MANUAL','AUTO','?')[(($m[0] -shr 8) -band 0x3)]
        $ok++
      } catch {
        # que un TCU no conteste tambien es dato: al cruzar con la hoja se vera
        # que ese par se midio sin saber el angulo, en vez de colar un 0
        $fila.error = $_.Exception.Message
      }
      $filas.Add([pscustomobject]$fila)
    }
    $cli.Close()
    Write-Host "$stamp  $($ncu.Name): $ok/$($lista.Count) angulos"
  }
  if ($filas.Count) {
    $existe = Test-Path $CsvPath
    $csv = $filas | ConvertTo-Csv -NoTypeInformation
    if ($existe) { $csv = $csv | Select-Object -Skip 1 }
    Add-Content -Path $CsvPath -Value $csv -Encoding UTF8
  }
  Start-Sleep -Seconds $IntervalSec
}
