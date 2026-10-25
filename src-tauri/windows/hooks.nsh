!define SANTARA_HOOK_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_PREINSTALL
  ; The Evergreen Runtime is shared by WebView2 applications. Reuse an
  ; existing per-machine or per-user Runtime without downloading anything.
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_check_user
  StrCmp $0 "0.0.0.0" santara_webview2_check_user santara_webview2_ready

santara_webview2_check_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_prompt
  StrCmp $0 "0.0.0.0" santara_webview2_prompt santara_webview2_ready

santara_webview2_prompt:
  SetRegView 64
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON1 "This device needs Microsoft WebView2 Runtime to run Santara. Download and install it from Microsoft now? An internet connection is required." IDYES santara_webview2_download IDNO santara_webview2_cancel

santara_webview2_download:
  InitPluginsDir
  File /oname=$PLUGINSDIR\InstallWebView2.ps1 "${SANTARA_HOOK_DIR}\InstallWebView2.ps1"
  MessageBox MB_ICONINFORMATION|MB_OK "Downloading and installing Microsoft WebView2 Runtime. Santara setup will continue when it finishes."
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\InstallWebView2.ps1"' $0
  IntCmp $0 0 santara_webview2_verify santara_webview2_install_failed santara_webview2_install_failed

santara_webview2_verify:
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_verify_user
  StrCmp $0 "0.0.0.0" santara_webview2_verify_user santara_webview2_ready

santara_webview2_verify_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_install_failed
  StrCmp $0 "0.0.0.0" santara_webview2_install_failed santara_webview2_ready

santara_webview2_ready:
  SetRegView 64
  Goto santara_webview2_done

santara_webview2_cancel:
  MessageBox MB_ICONINFORMATION|MB_OK "Santara setup was cancelled because WebView2 Runtime is required."
  Abort

santara_webview2_install_failed:
  SetRegView 64
  MessageBox MB_ICONSTOP|MB_OK "WebView2 could not be downloaded or installed. Check your internet connection, then run Santara setup again. Santara was not installed."
  Abort

santara_webview2_done:
!macroend
