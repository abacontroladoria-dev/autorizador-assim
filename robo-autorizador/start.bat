@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  SUPERVISOR DO ROBO AUTORIZADOR
rem ============================================================
rem  Antes desta versao havia apenas "node worker.js": uma execucao, sem laco.
rem  Consequencia real: "Reiniciar" no painel administrativo apenas MATAVA o
rem  robo (o worker fazia process.exit(0) e nada o relancava), e a maquina ficava
rem  parada ate o proximo logon do Windows. Qualquer crash tinha o mesmo efeito.
rem
rem  Contrato de codigos de saida com o worker:
rem     0  = encerrou de proposito (reinicio pedido, atualizacao aplicada) -> relancar
rem    99  = nao adianta relancar (token ausente/revogado, instalacao errada) -> parar
rem   outro = crash -> relancar com espera crescente
rem
rem  O marcador .saudavel e escrito pelo worker depois do primeiro heartbeat bem
rem  sucedido. Ele existe para o backoff distinguir "reiniciou depois de estar
rem  funcionando" de "nao consegue nem subir".
rem ============================================================

rem Chromium embutido nesta pasta, nunca o cache do usuario.
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers"

rem Node embutido quando existir (pacote offline); senao o do sistema (dev).
set "NODE_EXE=%~dp0node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if not exist "%~dp0log" mkdir "%~dp0log"

set FALHAS=0

:loop

rem Mantem apenas a execucao atual e a anterior: diagnostico sem encher o disco.
if exist "%~dp0log\anterior.log" del /q "%~dp0log\anterior.log"
if exist "%~dp0log\atual.log" move /y "%~dp0log\atual.log" "%~dp0log\anterior.log" >nul

if exist "%~dp0.saudavel" del /q "%~dp0.saudavel"

echo [%DATE% %TIME%] iniciando worker>>"%~dp0log\atual.log"

"%NODE_EXE%" worker.js >>"%~dp0log\atual.log" 2>&1
set CODIGO=!ERRORLEVEL!

echo [%DATE% %TIME%] worker saiu com codigo !CODIGO!>>"%~dp0log\atual.log"

if !CODIGO! EQU 99 goto parar

rem Subiu e funcionou: reinicio legitimo nao deve acumular penalidade.
if exist "%~dp0.saudavel" (
  set FALHAS=0
  set ESPERA=5
) else (
  set /a FALHAS=!FALHAS!+1
  if !FALHAS! GEQ 10 goto desistir
  set ESPERA=5
  if !FALHAS! GEQ 3 set ESPERA=15
  if !FALHAS! GEQ 5 set ESPERA=60
  if !FALHAS! GEQ 8 set ESPERA=300
  echo [%DATE% %TIME%] nao chegou a ficar saudavel; falha consecutiva !FALHAS!, esperando !ESPERA!s>>"%~dp0log\atual.log"
)

rem ping em vez de timeout: timeout falha quando a janela esta oculta
rem ("input redirection is not supported"), que e exatamente como start.vbs roda.
ping -n !ESPERA! 127.0.0.1 >nul

goto loop

:desistir
echo [%DATE% %TIME%] 10 falhas consecutivas sem ficar saudavel. Parando.>>"%~dp0log\atual.log"
echo.
echo  O robo nao conseguiu iniciar 10 vezes seguidas. Veja log\atual.log.
goto fim

:parar
echo [%DATE% %TIME%] worker pediu parada definitiva (codigo 99).>>"%~dp0log\atual.log"
echo.
echo  O robo parou de proposito e NAO sera relancado.
echo  Motivo no final de log\atual.log - normalmente token ausente ou revogado.

:fim
endlocal
