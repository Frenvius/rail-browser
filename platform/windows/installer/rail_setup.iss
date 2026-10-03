#ifndef MiniInstaller
  #define MiniInstaller "..\..\..\build\src\out\Release\mini_installer.exe"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\..\build"
#endif
#define AppVersion GetVersionNumbersString(MiniInstaller)

[Setup]
AppName=Rail
AppVersion={#AppVersion}
AppPublisher=Rail
CreateAppDir=no
Uninstallable=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
SetupIconFile=..\..\..\branding\chrome\app\theme\chromium\win\chromium.ico
WizardStyle=modern
OutputDir={#OutputDir}
OutputBaseFilename=RailSetup-{#AppVersion}

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[CustomMessages]
en.InstallFailed=Rail could not be installed (status %1). Details are in %2.
ptbr.InstallFailed=Não foi possível instalar o Rail (status %1). Detalhes em %2.

[Files]
Source: "{#MiniInstaller}"; DestDir: "{tmp}"; Flags: nocompression

[Run]
Filename: "{localappdata}\Rail\Application\chrome.exe"; Description: "{cm:LaunchProgram,Rail}"; Flags: postinstall nowait skipifsilent; Check: InstallSucceeded

[Code]
var
  Succeeded: Boolean;

procedure RegisterExtraCloseApplicationsResources;
begin
  RegisterExtraCloseApplicationsResource(False, ExpandConstant('{localappdata}\Rail\User Data\lockfile'));
end;

procedure WaitForRailExit;
var
  Status: Integer;
begin
  Exec('powershell.exe', '-NoProfile -NonInteractive -Command "$d = (Get-Date).AddSeconds(60); ' +
    'while ((Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ''' +
    ExpandConstant('{localappdata}') + '\Rail\Application\*'' }) -and (Get-Date) -lt $d) { Start-Sleep -Milliseconds 250 }"',
    '', SW_HIDE, ewWaitUntilTerminated, Status);
end;

function InstallSucceeded: Boolean;
begin
  Result := Succeeded;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Status: Integer;
begin
  if CurStep <> ssPostInstall then
    Exit;
  WaitForRailExit;
  if not Exec(ExpandConstant('{tmp}\mini_installer.exe'), '--do-not-launch-chrome --verbose-logging', '', SW_HIDE, ewWaitUntilTerminated, Status) then
    Status := -1;
  Succeeded := (Status = 0) or (Status = 1) or (Status = 2) or (Status = 30);
  if not Succeeded then
    SuppressibleMsgBox(FmtMessage(CustomMessage('InstallFailed'), [IntToStr(Status), ExpandConstant('{%TEMP}\chromium_installer.log')]), mbCriticalError, MB_OK, IDOK);
end;

function GetCustomSetupExitCode: Integer;
begin
  if Succeeded then
    Result := 0
  else
    Result := 1;
end;
