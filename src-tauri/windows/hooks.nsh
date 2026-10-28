!define SANTRA_HOOK_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_PREINSTALL
  ; The Evergreen Runtime is shared by WebView2 applications. Reuse an
  ; existing per-machine or per-user Runtime without downloading anything.
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santra_webview2_check_user
  StrCmp $0 "0.0.0.0" santra_webview2_check_user santra_webview2_ready

santra_webview2_check_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santra_webview2_prompt
  StrCmp $0 "0.0.0.0" santra_webview2_prompt santra_webview2_ready

santra_webview2_prompt:
  SetRegView 64
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON1 "This device needs Microsoft WebView2 Runtime to run Santra. Download and install it from Microsoft now? An internet connection is required." IDYES santra_webview2_download IDNO santra_webview2_cancel

santra_webview2_download:
  InitPluginsDir
  File /oname=$PLUGINSDIR\InstallWebView2.ps1 "${SANTRA_HOOK_DIR}\InstallWebView2.ps1"
  MessageBox MB_ICONINFORMATION|MB_OK "Downloading and installing Microsoft WebView2 Runtime. Santra setup will continue when it finishes."
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\InstallWebView2.ps1"' $0
  IntCmp $0 0 santra_webview2_verify santra_webview2_install_failed santra_webview2_install_failed

santra_webview2_verify:
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santra_webview2_verify_user
  StrCmp $0 "0.0.0.0" santra_webview2_verify_user santra_webview2_ready

santra_webview2_verify_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santra_webview2_install_failed
  StrCmp $0 "0.0.0.0" santra_webview2_install_failed santra_webview2_ready

santra_webview2_ready:
  SetRegView 64
  Goto santra_webview2_done

santra_webview2_cancel:
  MessageBox MB_ICONINFORMATION|MB_OK "Santra setup was cancelled because WebView2 Runtime is required."
  Abort

santra_webview2_install_failed:
  SetRegView 64
  MessageBox MB_ICONSTOP|MB_OK "WebView2 could not be downloaded or installed. Check your internet connection, then run Santra setup again. Santra was not installed."
  Abort

santra_webview2_done:
!macroend
