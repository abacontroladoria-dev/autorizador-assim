# ============================================================
#  Instala a versao de TESTE nesta maquina, sem publicar nada
# ============================================================
#
#  POR QUE ISTO EXISTE
#  `versao_disponivel` do robo_heartbeat e GLOBAL: e o ultimo pacote com
#  publicado = true. Nao existe "liberar so para uma maquina". Entao publicar
#  para testar atingiria as 9 maquinas da recepcao de uma vez.
#
#  Este script copia os .js direto do repositorio para a instalacao
#  (C:\RoboAutorizadorASSIM), guardando os originais. Nada e assinado, nada vai
#  para robo_pacotes, nenhuma outra maquina e afetada.
#
#  IMPORTANTE: a instalacao continua marcada como 1.1.6 no versao.json de
#  proposito. Assim, quando o 1.1.7 for publicado de verdade, o updater aplica
#  o pacote assinado por cima e a maquina volta ao fluxo normal.
#
#  USO (PowerShell, nesta pasta):
#     .\testar-nesta-maquina.ps1            instala o teste
#     .\testar-nesta-maquina.ps1 -Voltar    desfaz e volta ao 1.1.6
#
# ============================================================

param([switch]$Voltar, [switch]$Parar)

$ErrorActionPreference = 'Stop'

$Origem   = $PSScriptRoot
$Destino  = 'C:\RoboAutorizadorASSIM'
$Guardado = Join-Path $Destino 'antes-do-teste'

# Os mesmos arquivos que o publicar.js manda para a frota.
$Arquivos = @('index.js','worker.js','rpa.js','assim.js','api.js','humano.js','segredo.js','updater.js')

if (-not (Test-Path $Destino)) {
  Write-Host "Nao achei a instalacao em $Destino" -ForegroundColor Red
  exit 1
}

# ------------------------------------------------------------
# 1. Parar o robo INTEIRO — supervisor primeiro
# ------------------------------------------------------------
#  ARMADILHA: matar so o node.exe nao adianta. Quem o mantem de pe e o
#  supervisor `cmd.exe /c start.bat`, cujo laco (`goto loop`) relanca o worker
#  em 5 segundos, para sempre. Matar o node so faz o supervisor criar outro.
#  A ordem correta e: supervisor primeiro, worker depois.
function Parar-Robo {
  $supervisores = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
                  Where-Object { $_.CommandLine -match 'start\.bat' -and $_.CommandLine -match 'RoboAutorizador' }

  foreach ($s in $supervisores) {
    Write-Host "  parando o supervisor (cmd.exe PID $($s.ProcessId))"
    Stop-Process -Id $s.ProcessId -Force -ErrorAction SilentlyContinue
  }

  # So o worker DESTA instalacao. `Stop-Process -Name node` mataria tambem o
  # `npm run dev` do sistema-pulsar, que nao tem nada a ver com isto.
  $workers = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
             Where-Object { $_.CommandLine -match 'RoboAutorizador' }

  foreach ($w in $workers) {
    Write-Host "  parando o worker (node.exe PID $($w.ProcessId))"
    Stop-Process -Id $w.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 2

  # Confere que ninguem voltou: se o supervisor escapou, ele ja recriou o worker.
  $sobrou = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'RoboAutorizador' }
  return (-not $sobrou)
}

if ($Parar) {
  if (Parar-Robo) { Write-Host "Robo parado." -ForegroundColor Green; exit 0 }
  Write-Host "O worker voltou — ha outro supervisor de pe." -ForegroundColor Red
  exit 1
}

Write-Host "Parando o robo (supervisor primeiro, senao ele relanca)..." -ForegroundColor DarkGray
if (-not (Parar-Robo)) {
  Write-Host ""
  Write-Host "O worker continua voltando: sobrou algum supervisor." -ForegroundColor Red
  Write-Host "Veja quem e:  Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Select ProcessId,CommandLine"
  exit 1
}

# ------------------------------------------------------------
# 2. Voltar atras
# ------------------------------------------------------------
if ($Voltar) {
  if (-not (Test-Path $Guardado)) {
    Write-Host "Nao ha nada guardado em $Guardado — nada a desfazer." -ForegroundColor Yellow
    exit 0
  }
  foreach ($a in $Arquivos) {
    $b = Join-Path $Guardado $a
    if (Test-Path $b) { Copy-Item $b (Join-Path $Destino $a) -Force }
  }
  Write-Host "Restaurado o 1.1.6 original." -ForegroundColor Green
  Write-Host "Suba o robo de novo pelo atalho de sempre."
  exit 0
}

# ------------------------------------------------------------
# 3. Guardar os originais (uma vez so: nao sobrescrever o backup bom
#    com arquivos de teste numa segunda execucao)
# ------------------------------------------------------------
if (-not (Test-Path $Guardado)) {
  New-Item -ItemType Directory $Guardado | Out-Null
  foreach ($a in $Arquivos) {
    $o = Join-Path $Destino $a
    if (Test-Path $o) { Copy-Item $o (Join-Path $Guardado $a) -Force }
  }
  Write-Host "Originais guardados em $Guardado" -ForegroundColor DarkGray
} else {
  Write-Host "Backup ja existia em $Guardado (mantido)" -ForegroundColor DarkGray
}

# ------------------------------------------------------------
# 4. Copiar a versao de teste
# ------------------------------------------------------------
foreach ($a in $Arquivos) {
  Copy-Item (Join-Path $Origem $a) (Join-Path $Destino $a) -Force
  Write-Host "  copiado  $a"
}

Write-Host ""
Write-Host "Versao de teste instalada em $Destino" -ForegroundColor Green
Write-Host "Nenhum pacote foi publicado — as outras maquinas seguem no 1.1.6."
Write-Host ""
Write-Host "Agora suba o robo pelo atalho de sempre e acompanhe a janela preta."
Write-Host "Para desfazer:  .\testar-nesta-maquina.ps1 -Voltar"
