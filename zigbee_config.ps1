<#
  ============================================================================
  zigbee_config.ps1  —  QUE HAY CONFIGURADO DE VERDAD EN LA PLANTA
  ----------------------------------------------------------------------------
  De los repos solo salen los DEFECTOS DE FABRICA del mapa de registros. Lo que
  la planta tiene puesto no lo sabe nadie, y de ahi dependen dos cosas del
  estudio de latencia hasta bandera:

    · cuanto tarda la HSU en DECIDIR que hay viento (promediado, tiempos de
      nivel, ventana de rachas). Con los defectos van de 1 s a 60 s segun por
      donde dispare;
    · el stow autonomo de la TCU por perdida de comunicacion (40022), que viene
      de fabrica en 10 MINUTOS y es el termino mas grande de toda la cadena.

  Esto los LEE y los pone al lado de su defecto, marcando los que no coinciden.

  ============================================================================
  ESTO NO ESCRIBE NADA, Y NO ES UNA PROMESA
  ----------------------------------------------------------------------------
  Aqui no hay funcion de escritura. Lo unico que sabe hacer este fichero es
  FC03 (Read Holding Registers): no existe FC06 ni FC16 en ninguna linea, asi
  que no puede escribir un registro ni por equivocacion ni por un cambio
  descuidado. `tools/test_config_planta.py` lo comprueba sobre el fuente y sale
  rojo si aparece cualquier codigo de escritura.

  Y aunque leer no cambie nada, se sondea UNA VEZ y se sale: no es un bucle.
  La NCU comparte esta conexion con el SCADA.
  ============================================================================

  EJECUTAR:
    powershell -ExecutionPolicy Bypass -File .\zigbee_config.ps1
  Deja config_planta.csv al lado, y saca por pantalla lo que difiere del defecto.

  OJO CON LA DIRECCION, que es el mismo tropiezo que documenta zigbee_angulos:
  la direccion documentada va TAL CUAL en la trama (41013 es 41013), no es
  4xxxx con offset y otro codigo de funcion. Escribirlo del otro modo no da
  error aqui: da IllegalDataAddress en la planta y una tarde perdida.
#>

# ======================= CONFIG (edita esto) =======================
$Ncus = @(
  @{ Name = "NCU01-GW1"; Host = "10.100.1.52"; Port = 503 }
)
# Esclavo de la HSU/NCU para los registros de viento (41xxx). En el mapa R7/R23
# la estacion meteo responde en su propio esclavo; si tu planta usa otro, cambialo.
$UnidadHsu   = 1
# TCU a las que preguntar por 40022/40029. Vacio = las que salgan de un
# barrido_*.csv o zigbee_inventario_*.csv que este al lado.
$TcusManual  = @()
$MaxTcus     = 8                  # con 3 basta para ver si estan todas igual
$TimeoutMs   = 8000
$CsvPath     = Join-Path $PSScriptRoot "config_planta.csv"
# ===================================================================

$ErrorActionPreference = "Stop"

# --- SOLO FC03. No hay mas codigos de funcion en este fichero, a proposito.
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

# --- F32 EN DOS REGISTROS, Y NO SE ADIVINA EL ORDEN DE PALABRA.
# Modbus no fija si la palabra alta va primera (ABCD) o segunda (CDAB), y el
# mapa no lo dice. Asi que se decodifican LAS DOS y se elige la que caiga en un
# rango fisico, DICIENDO cual se uso. Los umbrales de viento estan entre 0 y
# 100 m/s, asi que la otra lectura sale absurda (1e30, NaN) y se distingue
# sola. Si las dos fueran plausibles se apuntan las dos y no se elige.
function F32-Ambas([int]$hi, [int]$lo) {
  $a = New-Object byte[] 4
  $a[3] = [byte](($hi -shr 8) -band 0xFF); $a[2] = [byte]($hi -band 0xFF)
  $a[1] = [byte](($lo -shr 8) -band 0xFF); $a[0] = [byte]($lo -band 0xFF)
  $abcd = [BitConverter]::ToSingle($a, 0)
  $b = New-Object byte[] 4
  $b[3] = [byte](($lo -shr 8) -band 0xFF); $b[2] = [byte]($lo -band 0xFF)
  $b[1] = [byte](($hi -shr 8) -band 0xFF); $b[0] = [byte]($hi -band 0xFF)
  $cdab = [BitConverter]::ToSingle($b, 0)
  return @($abcd, $cdab)
}
# EL FILTRO TIENE QUE RECHAZAR LOS DENORMALES, y esto se descubrio corriendolo.
# 20,0 m/s es 0x41A00000; con las palabras al reves sale 0x000041A0, que es
# 2,35e-41: un denormal, POSITIVO y MENOR QUE 200, o sea que un filtro
# [0, 200] lo daba por bueno y entonces las dos lecturas eran plausibles y el
# script no elegia ninguna. Un umbral de viento de 2e-41 m/s no existe: por
# debajo de 0,01 se rechaza, y el cero exacto se deja pasar porque si puede
# ser un valor de verdad (y ademas sale igual en los dos ordenes).
function Plausible($v) {
  if ([double]::IsNaN($v) -or [double]::IsInfinity($v)) { return $false }
  if ($v -eq 0.0) { return $true }
  return ($v -ge 0.01 -and $v -le 200.0)
}

# --- LOS REGISTROS, con su defecto de fabrica del mapa R7/R23 y v6 ----------
# tipo: U16 | F32 | BITS(hi..lo)
$RegsHsu = @(
  @{ Reg=41013; N=2; Tipo="F32";        Campo="WindSpeedMid_mps";        Def="16.67"; Que="umbral que ACTIVA la alarma de viento" },
  @{ Reg=41011; N=2; Tipo="F32";        Campo="WindSpeedLow_mps";        Def="16.67"; Que="umbral que la desactiva" },
  @{ Reg=41018; N=1; Tipo="U16";        Campo="WindMidTime_s";           Def="1";     Que="tiempo sobre umbral para activar" },
  @{ Reg=41017; N=1; Tipo="U16";        Campo="WindLowTime_s";           Def="1";     Que="tiempo bajo umbral para desactivar" },
  @{ Reg=41071; N=1; Tipo="BITS15_8";   Campo="WindSpeedAVGperiod_s";    Def="0";     Que="PROMEDIADO de velocidad. El fabricante recomienda 4 s para el ULTRASONICO, que es el que lleva la HSU" },
  @{ Reg=41071; N=1; Tipo="BITS7_0";    Campo="WindDirectionAVGperiod_s";Def="30";    Que="promediado de direccion" },
  @{ Reg=41058; N=2; Tipo="F32";        Campo="WindSpeedGust_mps";       Def="16.67"; Que="umbral de racha" },
  @{ Reg=41057; N=1; Tipo="BITS7_0";    Campo="GustyWindowTime_s";       Def="60";    Que="VENTANA de rachas. Este solo puede costar 60 s" },
  @{ Reg=41057; N=1; Tipo="BITS11_8";   Campo="GustyWindNumber";         Def="3";     Que="rachas en la ventana para dar alarma" },
  @{ Reg=41057; N=1; Tipo="BITS15_12";  Campo="GustMinimumDuration_s";   Def="1";     Que="duracion minima de una racha" },
  @{ Reg=41008; N=1; Tipo="BIT6";       Campo="HasSonicAnemoSensor";     Def="0";     Que="1 = anemometro ULTRASONICO declarado. equipos.js dice que la HSU lo lleva" },
  @{ Reg=41214; N=1; Tipo="U16";        Campo="SafePosTimeout_min";      Def="20";    Que="minutos hasta soltar la posicion segura" }
)
for ($i = 1; $i -le 7; $i++) {
  $RegsHsu += @{ Reg=(41074 + 2*$i); N=2; Tipo="F32"; Campo=("WindLevel{0}Thr_mps" -f $i); Def="27.78"; Que=("umbral del nivel {0}" -f $i) }
  $RegsHsu += @{ Reg=(41089 + $i);   N=1; Tipo="U16"; Campo=("WindLevel{0}OnTime_s" -f $i); Def=$(if ($i -le 4) { "10" } else { "5" }); Que=("tiempo para activar el nivel {0}" -f $i) }
}

$RegsTcu = @(
  @{ Reg=40022; N=1; Tipo="U16"; Campo="NCU_comm_lost_timeout_min"; Def="10"; Que="STOW AUTONOMO por perdida de comunicacion. 10 min = 600 s, el termino mas grande de la cadena" },
  @{ Reg=40029; N=1; Tipo="U16"; Campo="Zigbee_watchdog_timeout_min"; Def="10"; Que="watchdog de red zigbee. El 40022 TIENE que ser mayor que el tiempo de REENGANCHE, o la TCU se guarda sola mientras vuelve a la red" }
)

function Decodifica($r, $vals) {
  switch ($r.Tipo) {
    "U16"       { return @{ v = "$($vals[0])"; nota = "" } }
    "BITS7_0"   { return @{ v = "$($vals[0] -band 0xFF)"; nota = "bits 7..0 de $($r.Reg)" } }
    "BITS15_8"  { return @{ v = "$(($vals[0] -shr 8) -band 0xFF)"; nota = "bits 15..8 de $($r.Reg)" } }
    "BITS11_8"  { return @{ v = "$(($vals[0] -shr 8) -band 0xF)"; nota = "bits 11..8 de $($r.Reg)" } }
    "BITS15_12" { return @{ v = "$(($vals[0] -shr 12) -band 0xF)"; nota = "bits 15..12 de $($r.Reg)" } }
    "BIT6"      { return @{ v = "$(($vals[0] -shr 6) -band 1)"; nota = "bit 6 de $($r.Reg)" } }
    "F32" {
      $p = F32-Ambas $vals[0] $vals[1]
      $okA = Plausible $p[0]; $okB = Plausible $p[1]
      if ($okA -and -not $okB) { return @{ v = ("{0:0.##}" -f $p[0]); nota = "F32 orden ABCD" } }
      if ($okB -and -not $okA) { return @{ v = ("{0:0.##}" -f $p[1]); nota = "F32 orden CDAB" } }
      # las dos plausibles o ninguna: NO se elige, se apuntan las dos crudas
      return @{ v = ""; nota = ("F32 SIN RESOLVER: ABCD={0} CDAB={1} (palabras {2},{3})" -f $p[0], $p[1], $vals[0], $vals[1]) }
    }
  }
  return @{ v = ""; nota = "tipo desconocido" }
}

# --- que TCU mirar ----------------------------------------------------------
$tcus = @($TcusManual)
if ($tcus.Count -eq 0) {
  $vistos = @{}
  foreach ($h in @(Get-ChildItem -Path $PSScriptRoot -Filter "barrido_*.csv" -ErrorAction SilentlyContinue)) {
    foreach ($f in (Import-Csv $h.FullName)) {
      foreach ($c in @($f.esclavo_origen, $f.esclavo_destino)) {
        if ("$c" -match '^\d+$') { $vistos[[int]$c] = 1 }
      }
    }
  }
  $tcus = @($vistos.Keys | Sort-Object | Select-Object -First $MaxTcus)
}
if ($tcus.Count -eq 0) {
  Write-Warning "No hay barrido_*.csv al lado y TcusManual esta vacio: no se a que TCU preguntar por el 40022."
  Write-Warning "Se leera SOLO la parte de la HSU. Rellena TcusManual si quieres el stow autonomo."
}

Write-Host "Configuracion de planta -> $CsvPath"
Write-Host "$($RegsHsu.Count) registros de la HSU/NCU  +  $($RegsTcu.Count) por TCU en $($tcus.Count) TCU"
Write-Host "SOLO LECTURA: este fichero no sabe escribir registros`n"

$script:Tid = 0
$filas = New-Object System.Collections.Generic.List[object]
$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
$distintos = 0

foreach ($ncu in $Ncus) {
  $cli = $null
  try {
    $cli = New-Object System.Net.Sockets.TcpClient
    $cli.SendTimeout = $TimeoutMs; $cli.ReceiveTimeout = $TimeoutMs
    $cli.Connect($ncu.Host, $ncu.Port)
  } catch {
    Write-Warning "$($ncu.Name): no conecta a $($ncu.Host):$($ncu.Port) ($($_.Exception.Message))"
    if ($cli) { $cli.Close() }
    continue
  }

  $lote = @()
  foreach ($r in $RegsHsu) { $lote += @{ R=$r; U=[byte]$UnidadHsu; Q="HSU" } }
  foreach ($t in $tcus) { foreach ($r in $RegsTcu) { $lote += @{ R=$r; U=[byte]$t; Q=("TCU " + $t) } } }

  foreach ($it in $lote) {
    $r = $it.R
    $fila = [ordered]@{ hora_utc=$stamp; ncu=$ncu.Name; quien=$it.Q; esclavo=[int]$it.U
                        registro=$r.Reg; campo=$r.Campo; leido=""; defecto=$r.Def
                        igual=""; nota=""; que_es=$r.Que; error="" }
    try {
      $vals = Modbus-Leer $cli $it.U ([int]$r.Reg) ([int]$r.N)
      $d = Decodifica $r $vals
      $fila.leido = $d.v
      $fila.nota  = $d.nota
      if ($d.v -ne "") {
        $mismo = ([double]$d.v -eq [double]$r.Def)
        $fila.igual = $(if ($mismo) { "si" } else { "NO" })
        if (-not $mismo) {
          $distintos++
          Write-Host ("  DISTINTO  {0,-10} {1,-28} leido {2,-10} defecto {3}" -f $it.Q, $r.Campo, $d.v, $r.Def)
        }
      }
    } catch {
      $fila.error = $_.Exception.Message
    }
    $filas.Add([pscustomobject]$fila)
  }
  $cli.Close()
}

if ($filas.Count) {
  $csv = $filas | ConvertTo-Csv -NoTypeInformation
  Set-Content -Path $CsvPath -Value $csv -Encoding UTF8
  $conError = @($filas | Where-Object { $_.error -ne "" }).Count
  Write-Host ""
  Write-Host "$($filas.Count) registros leidos, $conError con error, $distintos DISTINTOS del defecto"
  if ($distintos -eq 0 -and $conError -eq 0) {
    Write-Host "Todo igual que el defecto de fabrica. Eso TAMBIEN es el dato que faltaba."
  }
} else {
  Write-Warning "No se ha leido nada."
  exit 1
}
