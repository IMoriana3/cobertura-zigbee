<#
  install_zigbee_collectors_task.ps1 — instala el watchdog en Task Scheduler.

  Modos:
    UserLogon    arranca al iniciar sesión el usuario actual. No es 24/7 si nadie inicia sesión.
    SystemStartup arranca con Windows como SYSTEM. Es el modo recomendado para 24/7 y requiere
                  ejecutar este instalador una vez como administrador.

  Ejemplos:
    powershell -ExecutionPolicy Bypass -File .\install_zigbee_collectors_task.ps1
    powershell -ExecutionPolicy Bypass -File .\install_zigbee_collectors_task.ps1 -Mode SystemStartup
#>
param(
  [ValidateSet("UserLogon","SystemStartup")]
  [string]$Mode = "UserLogon",
  [string]$TaskName = "Factiun-Zigbee-Collectors"
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "zigbee_collectors_supervisor.ps1"
if (-not (Test-Path $script)) { throw "No encuentro $script" }

$exe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$args = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '"'
$action = New-ScheduledTaskAction -Execute $exe -Argument $args -WorkingDirectory $PSScriptRoot

if ($Mode -eq "SystemStartup") {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} else {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Factiun COMMS: RSSI + rutas Zigbee permanentes"
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Instalado: $TaskName ($Mode)"
Write-Host "Supervisor: $script"
Write-Host "Estado: Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "Parar: Stop-ScheduledTask -TaskName '$TaskName'"
Write-Host "Quitar: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:$false"
