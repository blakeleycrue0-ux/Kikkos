# Actualiza la aplicación desde el ZIP más reciente de Descargas, SIN tocar la carpeta "data"
# (partidos, plantilla, escudos, ajustes y clips). Antes hace una copia de seguridad de "data".
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot

function Fallo($msg) { Write-Host ''; Write-Host "  $msg" -ForegroundColor Yellow; Write-Host ''; exit 1 }

# 1) La aplicación no puede estar abierta
$abierta = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($abierta) { Fallo 'La aplicación está abierta. Cierra la ventana negra de iniciar.bat y vuelve a abrir este archivo.' }

# 2) Buscar el ZIP descargado más reciente
$descargas = Join-Path $env:USERPROFILE 'Downloads'
$zip = Get-ChildItem -Path $descargas -Filter 'Kikkos*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { Fallo "No encuentro ningún ZIP 'Kikkos...zip' en Descargas. Descárgalo de GitHub (Code > Download ZIP) y vuelve a abrir este archivo." }
Write-Host "  ZIP encontrado: $($zip.Name)  ($($zip.LastWriteTime))"

# 3) Copia de seguridad de los datos
$datos = Join-Path $app 'data'
if (Test-Path $datos) {
  $copia = Join-Path (Split-Path -Parent $app) ('ffsp-copia-datos-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item -Path $datos -Destination $copia -Recurse -Force
  Write-Host "  Copia de seguridad de tus datos: $copia"
}

# 4) Extraer y copiar encima (nunca borra nada; salta data y node_modules)
$tmp = Join-Path $env:TEMP ('ffsp-update-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -Path $zip.FullName -DestinationPath $tmp -Force
$marca = Get-ChildItem -Path $tmp -Recurse -Filter 'iniciar.bat' -File | Select-Object -First 1
if (-not $marca) { Remove-Item $tmp -Recurse -Force; Fallo 'Ese ZIP no parece ser de la aplicación (no contiene iniciar.bat).' }
$origen = $marca.Directory.FullName

$hashAntes = if (Test-Path (Join-Path $app 'package.json')) { (Get-FileHash (Join-Path $app 'package.json')).Hash } else { '' }
robocopy $origen $app /E /XD data node_modules .git /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Remove-Item $tmp -Recurse -Force; Fallo 'No se pudieron copiar los archivos. No se ha borrado nada.' }
$hashDespues = (Get-FileHash (Join-Path $app 'package.json')).Hash
Remove-Item $tmp -Recurse -Force

# 5) Componentes nuevos, solo si hacen falta
if (($hashAntes -ne $hashDespues) -or -not (Test-Path (Join-Path $app 'node_modules'))) {
  Write-Host '  Instalando componentes nuevos (necesita internet)...'
  Push-Location $app
  npm install --omit=dev
  Pop-Location
}

Write-Host ''
Write-Host '  Listo. Abre iniciar.bat para arrancar la versión nueva.' -ForegroundColor Green
Write-Host '  En OBS: clic derecho en la fuente de navegador > Actualizar caché del navegador.'
Write-Host ''
