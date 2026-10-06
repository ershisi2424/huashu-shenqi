; Huashu online installer. Build only with a pinned manifest/artifact base URL.
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!ifndef HUASHU_ARTIFACT_BASE_URL
  !error "HUASHU_ARTIFACT_BASE_URL is required"
!endif
!ifndef HUASHU_RELEASE_MANIFEST
  !error "HUASHU_RELEASE_MANIFEST is required"
!endif

Unicode true
RequestExecutionLevel admin
Name "Huashu Workbench"
OutFile "Huashu-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\Huashu"
ShowInstDetails show
ShowUninstDetails show
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"

Var DataDir
Var SetupCode
; ProgramData is the per-machine business data boundary. NSIS does not expose
; a portable $COMMONAPPDATA constant, so resolve it from the Windows directory.

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "此安装包只支持 Windows x64。"
    Abort
  ${EndIf}
  StrCpy $DataDir "$WINDIR\..\ProgramData\Huashu"
FunctionEnd

Section "Huashu Workbench" SEC_MAIN
  SetOutPath "$INSTDIR"
  File /nonfatal "WinSW-x64.exe"
  File /nonfatal "runtime\node.exe"
  File /nonfatal "HuashuWorkbench.xml"
  File /nonfatal "scripts\windows\huashu-launcher.cjs"
  File /nonfatal "scripts\windows\acl.ps1"
  File /nonfatal "scripts\windows\installer\download-components.ps1"
  File /nonfatal "scripts\windows\installer\verify-component.ps1"
  File /nonfatal "scripts\windows\installer\stage-release.ps1"
  File /nonfatal "scripts\windows\installer\issue-setup-code.cjs"
  File /nonfatal "scripts\windows\installer\uninstall-preserve-data.ps1"
  CreateDirectory "$DataDir\config"
  CreateDirectory "$DataDir\data"
  CreateDirectory "$DataDir\logs"
  CreateDirectory "$DataDir\backups"
  CreateDirectory "$DataDir\cache"
  CreateDirectory "$DataDir\releases"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri ''${HUASHU_RELEASE_MANIFEST}'' -OutFile ''$INSTDIR\release-manifest.json''"'
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\scripts\windows\installer\issue-setup-code.cjs"'
  Pop $1
  Pop $SetupCode
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\download-components.ps1" -ManifestPath "$INSTDIR\release-manifest.json" -CacheDir "$DataDir\cache"'
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\stage-release.ps1" -ManifestPath "$INSTDIR\release-manifest.json" -CacheDir "$DataDir\cache" -ReleasesDir "$DataDir\releases" -ActivePointerPath "$DataDir\active-release.json"'
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\acl.ps1" -DataDir "$DataDir" -AppDir "$INSTDIR"'
  MessageBox MB_ICONINFORMATION "安装完成。请在服务器本机打开 /setup/ 页面，手动输入安装器显示的一次性初始化码。卸载默认保留业务数据。"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall-preserve-data.ps1" -AppDir "$INSTDIR" -DataDir "$DataDir"'
  RMDir /r "$INSTDIR"
SectionEnd
