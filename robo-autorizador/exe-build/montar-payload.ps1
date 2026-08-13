<#
    ============================================================
     Monta o payload do instalador do Robo Autorizador
    ============================================================

    Por que existe: ate aqui o payload era populado a mao. Duas consequencias
    concretas e ja medidas:

      1. O payload em circulacao ficou DUAS correcoes atras do repositorio
         (faltavam a regex tolerante da guia, o status concluido_sem_guia e a
         captura de diagnostico) sem que houvesse como perceber.
      2. Um `.env` com a SUPABASE_SERVICE_ROLE_KEY foi esquecido dentro do
         payload e viajou dentro do .exe distribuido por pendrive.

    Este script copia os fontes do robo por lista explicita, refaz o
    node_modules de producao e RECUSA a montagem se qualquer segredo aparecer no
    pacote.

    O que ele NAO faz: baixar Node ou Chromium. Esses dois sao grandes e
    estaveis; ficam em payload\node e payload\browsers e o script apenas
    confere se estao lá, explicando como popular quando faltarem.

    Uso:
        powershell -ExecutionPolicy Bypass -File montar-payload.ps1
#>

$ErrorActionPreference = 'Stop'

$AQUI    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROBO    = Split-Path -Parent $AQUI
$PAYLOAD = Join-Path $AQUI 'payload'

# Lista explicita. Nada de copiar a pasta inteira: e assim que ferramenta de
# mantenedor (publicar.js) e segredo (.env, *.pem) acabam no pacote.
$ARQUIVOS = @(
    'index.js',
    'worker.js',
    'rpa.js',
    'assim.js',
    'api.js',
    'humano.js',
    'segredo.js',
    'updater.js',
    'package.json',
    'package-lock.json',
    'start.bat',
    'start.vbs',
    '.env.exemplo',
    'chave-publica.json'
)

# Restos de geracoes anteriores que nao devem sobreviver a uma remontagem.
$OBSOLETOS = @('ws-polyfill.js', 'supabase.js', '.env', '.env.local', 'versao.json', '.saudavel')

Write-Host "Robo: $ROBO"
Write-Host "Payload: $PAYLOAD"
Write-Host ''

if (-not (Test-Path $PAYLOAD)) { New-Item -ItemType Directory -Path $PAYLOAD | Out-Null }

# ------------------------------------------------------------
# 1. Fontes
# ------------------------------------------------------------
Write-Host '== 1. Copiando fontes do robo =='
foreach ($nome in $ARQUIVOS) {
    $origem = Join-Path $ROBO $nome

    if (-not (Test-Path $origem)) {
        if ($nome -eq 'chave-publica.json') {
            throw @"
chave-publica.json nao existe.

Sem ela o auto-update fica desligado (o robo recusa qualquer pacote, o que e o
comportamento correto: melhor frota desatualizada que frota atualizavel por
qualquer um).

Gere o par de chaves uma unica vez, na sua maquina:
    cd $ROBO
    npm run chaves

A chave PRIVADA fica fora do repositorio (~\.robo-autorizador\). Faca backup
offline dela: perde-la significa nunca mais publicar atualizacao sem reinstalar
a publica em cada PC.
"@
        }
        throw "arquivo obrigatorio ausente: $nome"
    }

    Copy-Item $origem -Destination (Join-Path $PAYLOAD $nome) -Force
    Write-Host "   ok $nome"
}

Write-Host ''
Write-Host '== 2. Removendo restos de versoes anteriores =='
foreach ($nome in $OBSOLETOS) {
    $alvo = Join-Path $PAYLOAD $nome
    if (Test-Path $alvo) {
        Remove-Item $alvo -Force
        Write-Host "   removido $nome"
    }
}
$supaDir = Join-Path $PAYLOAD 'supabase'
if (Test-Path $supaDir) {
    Remove-Item $supaDir -Recurse -Force
    Write-Host '   removido supabase/ (config de projeto duplicada)'
}

# ------------------------------------------------------------
# 3. Dependencias
# ------------------------------------------------------------
Write-Host ''
Write-Host '== 3. node_modules de producao =='

$nodeExe = Join-Path $PAYLOAD 'node\node.exe'
if (-not (Test-Path $nodeExe)) {
    throw @"
payload\node\node.exe nao encontrado.

Baixe o Node 20 para Windows x64 (pacote .zip, nao o instalador) de
https://nodejs.org/dist/ e extraia o CONTEUDO da pasta para:
    $PAYLOAD\node

O pacote e offline de proposito: nao pode depender de Node instalado no PC da
recepcionista.
"@
}

$nmDestino = Join-Path $PAYLOAD 'node_modules'
if (Test-Path $nmDestino) { Remove-Item $nmDestino -Recurse -Force }

Push-Location $PAYLOAD
try {
    # O `npm` que acompanha o Node embutido, para a arvore ser a do Node 20.
    $npmCli = Join-Path $PAYLOAD 'node\node_modules\npm\bin\npm-cli.js'
    if (Test-Path $npmCli) {
        & $nodeExe $npmCli 'ci' '--omit=dev' '--no-audit' '--no-fund'
    } else {
        Write-Host '   (npm embutido nao encontrado; usando o npm do sistema)'
        & npm ci --omit=dev --no-audit --no-fund
    }
    if ($LASTEXITCODE -ne 0) { throw "npm ci falhou com codigo $LASTEXITCODE" }
} finally {
    Pop-Location
}

# ------------------------------------------------------------
# 4. Chromium
# ------------------------------------------------------------
Write-Host ''
Write-Host '== 4. Chromium do Playwright =='
$browsers = Join-Path $PAYLOAD 'browsers'
if (-not (Test-Path (Join-Path $browsers 'chromium*'))) {
    Write-Host '   Chromium ausente. Baixando para dentro do payload...'
    $env:PLAYWRIGHT_BROWSERS_PATH = $browsers
    Push-Location $PAYLOAD
    try {
        & $nodeExe (Join-Path $PAYLOAD 'node_modules\playwright\cli.js') 'install' 'chromium'
        if ($LASTEXITCODE -ne 0) { throw "playwright install falhou com codigo $LASTEXITCODE" }
    } finally {
        Pop-Location
        Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH -ErrorAction SilentlyContinue
    }
} else {
    Write-Host '   ok (ja presente)'
}

# ------------------------------------------------------------
# 5. Barreira de seguranca
# ------------------------------------------------------------
Write-Host ''
Write-Host '== 5. Varredura de segredo no payload =='

$suspeitos = @()

foreach ($p in @('.env', '.env.local')) {
    if (Test-Path (Join-Path $PAYLOAD $p)) { $suspeitos += "arquivo $p presente" }
}

Get-ChildItem -Path $PAYLOAD -Recurse -File -Include '*.pem','*.key','*.pfx' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike '*\node_modules\*' -and $_.FullName -notlike '*\browsers\*' } |
    ForEach-Object { $suspeitos += "chave privada: $($_.FullName.Substring($PAYLOAD.Length + 1))" }

# Procura VALOR de credencial, nao mencao a ela.
#
# A primeira versao disto casava com a palavra 'service_role' e acusava
# .env.exemplo e worker.js, que citam o termo justamente nos comentarios que
# explicam por que ele nao esta mais no pacote. Varredura que grita com a propria
# documentacao e varredura que as pessoas aprendem a ignorar.
#
# Ignora node_modules e browsers: megabytes de fixture que nao sao nossos.
$PADROES = @(
    @{ nome = 'JWT do Supabase';        regex = 'eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_\-\.]{20,}' },
    @{ nome = 'chave secreta (sb_)';    regex = 'sb_secret_[A-Za-z0-9_\-]{10,}' },
    @{ nome = 'chave privada PEM';      regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    # Uma variavel de segredo com valor de verdade atribuido. Mencao em prosa nao
    # casa, porque exige o '=' seguido de 20+ caracteres sem espaco.
    @{ nome = 'segredo atribuido';      regex = '(SERVICE_ROLE_KEY|ASSIM_SENHA|MACHINE_TOKEN)\s*=\s*\S{20,}' }
)

$alvos = Get-ChildItem -Path $PAYLOAD -File -ErrorAction SilentlyContinue
foreach ($arq in $alvos) {
    $texto = Get-Content $arq.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $texto) { continue }

    foreach ($p in $PADROES) {
        $achado = [regex]::Match($texto, $p.regex)
        if ($achado.Success) {
            # Diz QUAL padrao e ONDE: falso positivo futuro tem que ser
            # diagnosticavel, nao misterioso.
            $linha = ($texto.Substring(0, $achado.Index) -split "`n").Count
            $suspeitos += "$($p.nome) em $($arq.Name):$linha"
        }
    }
}

if ($suspeitos.Count -gt 0) {
    Write-Host ''
    Write-Host 'MONTAGEM RECUSADA. O pacote nao pode carregar credencial:' -ForegroundColor Red
    foreach ($s in $suspeitos) { Write-Host "   - $s" -ForegroundColor Red }
    Write-Host ''
    Write-Host 'O .env e escrito no PC de destino, pelo assistente do instalador,'
    Write-Host 'com o token daquela maquina cifrado por DPAPI. Nada disso viaja no .exe.'
    exit 1
}

Write-Host '   ok, nenhum segredo no payload'

# ------------------------------------------------------------
Write-Host ''
Write-Host '== Payload pronto =='
$tamanho = (Get-ChildItem $PAYLOAD -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("   {0:N0} MB" -f $tamanho)
Write-Host ''
Write-Host 'Proximo passo: abrir RoboAutorizador.iss no Inno Setup e compilar,'
Write-Host 'ou rodar:'
Write-Host '   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" RoboAutorizador.iss'
