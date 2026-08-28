<#
  ============================================================================
  rellena_barrido.ps1  —  mete en la hoja de barrido el angulo que grabo el Modbus
  ----------------------------------------------------------------------------
  Quien anda el barrido apunta solo `llega` (1/0) y la hora. El angulo lo graba
  `zigbee_angulos.ps1` en angulos.csv, y esto los cruza por la hora.

  EN POWERSHELL, no en Python: esto se corre en el PC de la planta, que tiene
  PowerShell y no tiene Python. (`tools/rellena_barrido.py` hace lo mismo para
  quien lo prefiera; los dos tienen que dar lo MISMO y hay una prueba que lo
  comprueba fila a fila.)

  EJECUTAR (desde la carpeta del ZIP):
    powershell -ExecutionPolicy Bypass -File .\rellena_barrido.ps1

  Coge el barrido_*.csv y el angulos.csv que tenga al lado. O se le dicen:
    ... -File .\rellena_barrido.ps1 -Hoja barrido_ayora_NCU11.csv -Angulos angulos.csv
  ============================================================================
#>
param(
  [string]$Hoja    = "",
  [string]$Angulos = ""
)

$ErrorActionPreference = "Stop"
# Cuanto puede separarse la hora de la medida de la del angulo. Los angulos se
# graban cada 30 s; mas de un par de minutos y el seguidor ya se ha movido lo
# bastante como para que el numero no describa esa medida.
$TolMin = 2

if (-not $Hoja) {
  $c = @(Get-ChildItem -Path $PSScriptRoot -Filter "barrido_*.csv" -ErrorAction SilentlyContinue)
  if ($c.Count -ne 1) {
    Write-Warning ("Hay {0} ficheros barrido_*.csv al lado: dime cual con -Hoja." -f $c.Count); exit 1
  }
  $Hoja = $c[0].FullName
}
if (-not $Angulos) { $Angulos = Join-Path $PSScriptRoot "angulos.csv" }
foreach ($f in @($Hoja, $Angulos)) {
  if (-not (Test-Path $f)) { Write-Warning "No existe $f"; exit 1 }
}

function Hora([string]$t) {
  $t = ("$t").Trim().Replace("T", " ").Replace("Z", "")
  foreach ($f in @("yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "HH:mm:ss", "HH:mm")) {
    [datetime]$d = [datetime]::MinValue
    if ([datetime]::TryParseExact($t, $f, [Globalization.CultureInfo]::InvariantCulture,
                                  [Globalization.DateTimeStyles]::None, [ref]$d)) { return $d }
  }
  return $null
}
# El CSV lo escribe PowerShell con la cultura de la maquina, asi que un angulo
# puede venir como "15,5" o "15.5". Se leen los dos y se escribe SIEMPRE con
# punto, que es lo que espera quien luego ajusta.
function Num([string]$s) {
  $s = ("$s").Trim().Replace(",", ".")
  [double]$d = 0
  if ([double]::TryParse($s, [Globalization.NumberStyles]::Float,
                         [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
  return $null
}

# --- los angulos que se leyeron BIEN. Un TCU que no contesto deja tilt_deg
# --- vacio y ahi se queda: sin angulo, no con un cero.
$angs = @()
foreach ($r in (Import-Csv $Angulos)) {
  $h = Hora $r.hora_utc
  $v = Num $r.tilt_deg
  if ($null -eq $h -or $null -eq $v) { continue }
  if (-not ("$($r.esclavo)" -match '^\d+$')) { continue }
  $angs += [pscustomobject]@{ esclavo = [int]$r.esclavo; hora = $h; tilt = $v; modo = "$($r.modo)".Trim() }
}
if ($angs.Count -eq 0) {
  Write-Warning "$Angulos no trae ningun angulo leido: revisa que zigbee_angulos.ps1 llegase a la NCU."
  exit 1
}

function MasCerca([int]$esclavo, $h) {
  $c = @($angs | Where-Object { $_.esclavo -eq $esclavo -and
                                [math]::Abs(($_.hora - $h).TotalMinutes) -le $TolMin })
  if ($c.Count -eq 0) { return $null }
  return ($c | Sort-Object { [math]::Abs(($_.hora - $h).TotalMinutes) })[0]
}

$filas = @(Import-Csv $Hoja)
$cols  = @($filas[0].PSObject.Properties.Name)
foreach ($c in @("beta_destino", "modo_origen")) { if ($cols -notcontains $c) { $cols += $c } }

$puestos = 0; $sinHora = 0; $sinAngulo = 0; $medidas = 0
$noAuto = @()
foreach ($r in $filas) {
  foreach ($c in $cols) {
    if (-not $r.PSObject.Properties.Name.Contains($c)) { $r | Add-Member -NotePropertyName $c -NotePropertyValue "" }
  }
  # solo las filas medidas: `llega` vacio es un par que aun no se ha hecho
  if ("$($r.llega)".Trim() -eq "") { continue }
  $medidas++
  $h = Hora $r.hora_utc
  if ($null -eq $h) { $sinHora++; continue }
  $o = $null; $d = $null
  if ("$($r.esclavo_origen)"  -match '^\d+$') { $o = MasCerca ([int]$r.esclavo_origen) $h }
  if ("$($r.esclavo_destino)" -match '^\d+$') { $d = MasCerca ([int]$r.esclavo_destino) $h }
  if ($null -eq $o -and $null -eq $d) { $sinAngulo++; continue }
  if ($o) {
    $r.beta_grados = $o.tilt.ToString("0.0", [Globalization.CultureInfo]::InvariantCulture)
    $r.modo_origen = $o.modo
    # un seguidor que no esta en AUTO no esta siguiendo: su angulo es bueno,
    # pero conviene saberlo antes de meterlo en el ajuste
    if ($o.modo -and $o.modo -ne "AUTO") { $noAuto += "$($r.esclavo_origen)=$($o.modo)" }
  }
  if ($d) { $r.beta_destino = $d.tilt.ToString("0.0", [Globalization.CultureInfo]::InvariantCulture) }
  $puestos++
}

$filas | Select-Object -Property $cols | Export-Csv -Path $Hoja -NoTypeInformation -Encoding UTF8
Write-Host ("{0}: {1} de {2} medidas con angulo" -f (Split-Path $Hoja -Leaf), $puestos, $medidas)
if ($sinHora)   { Write-Host ("  {0} medidas SIN hora: sin ella no se puede cruzar nada" -f $sinHora) }
if ($sinAngulo) { Write-Host ("  {0} medidas sin angulo a menos de {1} min: se dejan vacias, no se inventan" -f $sinAngulo, $TolMin) }
if ($noAuto)    { Write-Host ("  {0} medidas con el seguidor fuera de AUTO ({1}): no estaba siguiendo" -f $noAuto.Count, (($noAuto | Select-Object -First 4) -join ", ")) }
if ($medidas -eq 0) { Write-Host "  (la hoja aun no tiene ninguna medida: rellena `llega` y `hora_utc`)" }
