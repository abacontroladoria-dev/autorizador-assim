; ============================================================
;  Robo Autorizador ASSIM - Instalador (Inno Setup)
;
;  Pacote 100% OFFLINE: Node 20, node_modules e Chromium embutidos.
;
;  MUDANCA PRINCIPAL DESTA VERSAO: o instalador deixou de ser portador de
;  credencial.
;
;  Antes, payload\.env vinha pronto no pacote com a SUPABASE_SERVICE_ROLE_KEY
;  (bypass total de RLS, validade 2036) e a senha do portal da ASSIM em texto
;  puro. Qualquer pessoa com o pendrive - ou com o .exe, que `innounp` abre em
;  segundos - ficava com o banco inteiro. O assistente perguntava apenas o
;  MACHINE_ID, que o robo depois se auto-declarava ao servidor.
;
;  Agora o assistente pede o TOKEN daquela maquina, cifra com DPAPI (escopo
;  LocalMachine) e escreve o .env na hora da instalacao. Consequencias:
;    - o pacote nao contem segredo nenhum;
;    - o .env resultante nao funciona em outro computador;
;    - a identidade da maquina passa a vir do servidor, derivada do token.
;
;  O token e gerado em supabase/snippets/robo_provisionar.sql, bloco 2.
; ============================================================

#define MyAppName "Robo Autorizador ASSIM"
#define MyAppVersion "1.1.4"
#define MyAppPublisher "Universo ABA"
#define MyTaskName "RoboAutorizadorAssim"

[Setup]
AppId={{B7A9C3E1-5D42-4F8A-9E1B-2C3D4E5F6A7B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={sd}\RoboAutorizadorAssim
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=RoboAutorizadorASSIM-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\node\node.exe

[Languages]
Name: "brazilian"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
; O payload NAO contem .env. Ele e escrito no post-install, com o token cifrado.
; `excludes` e cinto e suspensorio: se alguem esquecer um .env dentro de payload\,
; ele nao viaja no pacote.
Source: "payload\*"; DestDir: "{app}"; Excludes: ".env,.env.local,*.pem,versao.json,.saudavel,log\*,*.bak"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Iniciar Robo Autorizador"; Filename: "{app}\start.vbs"
Name: "{group}\Iniciar com logs (janela)"; Filename: "{app}\start.bat"
Name: "{group}\Painel de saude (health)"; Filename: "http://127.0.0.1:3010/health"
Name: "{group}\Ver log da execucao atual"; Filename: "notepad.exe"; Parameters: """{app}\log\atual.log"""
Name: "{group}\Desinstalar Robo Autorizador"; Filename: "{uninstallexe}"
; AUTO-START no logon: atalho que chama o wscript.exe EXPLICITAMENTE (nao depende
; da associacao de .vbs, que em algumas maquinas esta quebrada). Roda o worker
; escondido para todos os usuarios que fizerem logon.
Name: "{commonstartup}\RoboAutorizadorAssim"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; Comment: "Inicia o Robo Autorizador ao fazer logon"

[InstallDelete]
; Remove atalhos/copias quebrados de instaladores antigos (davam erro 80070002 no logon)
Type: files; Name: "{userstartup}\start.vbs"
Type: files; Name: "{userstartup}\RoboAutorizadorAssim.vbs"
Type: files; Name: "{commonstartup}\start.vbs"
Type: files; Name: "{commonstartup}\RoboAutorizadorAssim.vbs"
; Resquicios do tempo em que o robo usava @supabase/supabase-js e precisava de
; polyfill de WebSocket no Node 20. Nao ha mais nem a dependencia nem o polyfill.
Type: files; Name: "{app}\ws-polyfill.js"
; Config de projeto Supabase duplicada, que competia com a da raiz do repositorio.
Type: filesandordirs; Name: "{app}\supabase"

[Run]
Filename: "wscript.exe"; Parameters: """{app}\start.vbs"""; Description: "Iniciar o Robo Autorizador agora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Remove eventual tarefa agendada criada por versoes anteriores do instalador
Filename: "schtasks.exe"; Parameters: "/delete /tn ""{#MyTaskName}"" /f"; Flags: runhidden; RunOnceId: "DelRoboTask"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  ConfigPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(wpSelectDir,
    'Credencial desta maquina',
    'Cole o token gerado para este computador',
    'O token identifica ESTE computador no servidor e vale so para ele.' + #13#10 +
    'Gere um em supabase/snippets/robo_provisionar.sql (bloco 2) - ele aparece uma unica vez.' + #13#10 + #13#10 +
    'Sao 64 caracteres. O instalador vai cifra-lo com a protecao do Windows (DPAPI), ' +
    'de modo que o arquivo resultante nao funciona em nenhuma outra maquina.');
  ConfigPage.Add('Token da maquina:', False);
  ConfigPage.Add('URL do Supabase:', False);
  ConfigPage.Add('Chave publica (anon/publishable):', False);
  ConfigPage.Values[0] := '';
  ConfigPage.Values[1] := 'https://wmugemamnqxjfpxrlwes.supabase.co';
  ConfigPage.Values[2] := '';
end;

function SoHex(S: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := True;
  for I := 1 to Length(S) do
  begin
    C := S[I];
    if not (((C >= '0') and (C <= '9')) or ((C >= 'a') and (C <= 'f')) or ((C >= 'A') and (C <= 'F'))) then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Token, Url, Chave: String;
begin
  Result := True;
  if CurPageID <> ConfigPage.ID then Exit;

  Token := Trim(ConfigPage.Values[0]);
  Url   := Trim(ConfigPage.Values[1]);
  Chave := Trim(ConfigPage.Values[2]);

  if Token = '' then
  begin
    MsgBox('Cole o token desta maquina.' + #13#10 +
           'Ele e gerado por supabase/snippets/robo_provisionar.sql, bloco 2.', mbError, MB_OK);
    Result := False;
    Exit;
  end;

  // Validar aqui evita a pior falha possivel: instalar, ir embora, e o robo
  // nunca subir porque faltava um caractere no token.
  if (Length(Token) <> 64) or (not SoHex(Token)) then
  begin
    MsgBox('O token deve ter exatamente 64 caracteres hexadecimais.' + #13#10 +
           'Foram informados ' + IntToStr(Length(Token)) + '. Confira se a copia veio completa.',
           mbError, MB_OK);
    Result := False;
    Exit;
  end;

  if Url = '' then
  begin
    MsgBox('Informe a URL do Supabase.', mbError, MB_OK);
    Result := False;
    Exit;
  end;

  if Chave = '' then
  begin
    MsgBox('Informe a chave publica (anon/publishable) do projeto.' + #13#10 +
           'Ela nao e segredo: e a mesma que o site usa no navegador.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
end;

// Cifra o token com DPAPI chamando o proprio Node embutido. O token entra por
// STDIN, nunca por linha de comando: argv de processo e legivel por outros
// processos da maquina, o que anularia o proposito.
function CifrarToken(Token: String; var Cifrado: String): Boolean;
var
  Codigo: Integer;
  ArqEntrada, ArqSaida, ArqBat: String;
  Linhas: TArrayOfString;
begin
  Result := False;
  ArqEntrada := ExpandConstant('{tmp}\tok.txt');
  ArqSaida   := ExpandConstant('{tmp}\tok.enc');
  ArqBat     := ExpandConstant('{tmp}\cifrar.bat');

  if not SaveStringToFile(ArqEntrada, Token, False) then Exit;

  SaveStringToFile(ArqBat,
    '@echo off' + #13#10 +
    'type "' + ArqEntrada + '" | "' + ExpandConstant('{app}\node\node.exe') + '" ' +
    '"' + ExpandConstant('{app}\segredo.js') + '" proteger > "' + ArqSaida + '"' + #13#10, False);

  if not Exec(ExpandConstant('{cmd}'), '/c "' + ArqBat + '"', '', SW_HIDE, ewWaitUntilTerminated, Codigo) then Exit;

  // O arquivo com o token em claro nao pode sobreviver ao instalador.
  DeleteFile(ArqEntrada);
  DeleteFile(ArqBat);

  if Codigo <> 0 then Exit;
  if not LoadStringsFromFile(ArqSaida, Linhas) then Exit;
  DeleteFile(ArqSaida);
  if GetArrayLength(Linhas) < 1 then Exit;

  Cifrado := Trim(Linhas[0]);
  Result := Cifrado <> '';
end;

// Escreve o .env do zero, sempre. A versao anterior usava SaveStringToFile com
// append, entao cada reinstalacao ACRESCENTAVA outro MACHINE_ID e o arquivo ia
// acumulando linhas duplicadas.
procedure EscreverEnv();
var
  Cifrado, Conteudo: String;
begin
  if not CifrarToken(Trim(ConfigPage.Values[0]), Cifrado) then
  begin
    MsgBox('Nao foi possivel cifrar o token nesta maquina (DPAPI).' + #13#10 + #13#10 +
           'A instalacao dos arquivos terminou, mas o robo nao vai subir sem o .env.' + #13#10 +
           'Rode manualmente na pasta da instalacao:' + #13#10 +
           '  echo SEU_TOKEN | node\node.exe segredo.js proteger' + #13#10 +
           'e coloque o resultado em MACHINE_TOKEN_ENC no arquivo .env.',
           mbError, MB_OK);
    Exit;
  end;

  Conteudo :=
    '# Gerado pelo instalador em ' + GetDateTimeString('yyyy-mm-dd hh:nn', '-', ':') + #13#10 +
    '# Nenhum valor aqui e utilizavel em outro computador.' + #13#10 +
    '#' + #13#10 +
    '# MACHINE_TOKEN_ENC esta cifrado com DPAPI (escopo LocalMachine): copiar este' + #13#10 +
    '# arquivo para outra maquina nao serve para nada. A senha da ASSIM e o' + #13#10 +
    '# machine_id vem do servidor em tempo de execucao e nunca tocam o disco.' + #13#10 +
    '' + #13#10 +
    'SUPABASE_URL=' + Trim(ConfigPage.Values[1]) + #13#10 +
    'SUPABASE_ANON_KEY=' + Trim(ConfigPage.Values[2]) + #13#10 +
    'MACHINE_TOKEN_ENC=' + Cifrado + #13#10 +
    'LOCAL_API_PORT=3010' + #13#10;

  if not SaveStringToFile(ExpandConstant('{app}\.env'), Conteudo, False) then
    MsgBox('Falha ao gravar o .env em ' + ExpandConstant('{app}'), mbError, MB_OK);
end;

// Uma instalacao nova nao pode herdar a versao que o auto-update deixou na
// instalacao anterior: os arquivos .js acabaram de voltar para os do pacote.
procedure LimparEstadoDeVersao();
begin
  DeleteFile(ExpandConstant('{app}\versao.json'));
  DeleteFile(ExpandConstant('{app}\.saudavel'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    LimparEstadoDeVersao();
    EscreverEnv();
  end;
  // O auto-start e feito pelo atalho em [Icons] ({commonstartup}), que chama
  // o wscript.exe diretamente -- mais confiavel que a tarefa agendada.
end;
