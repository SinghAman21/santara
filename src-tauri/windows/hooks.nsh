!macro NSIS_HOOK_PREINSTALL
  ; WebView2 Evergreen Runtime is shared by Windows applications. Respect an
  ; existing per-machine or per-user installation before requiring the
  ; separately distributed offline prerequisite.
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_check_user
  StrCmp $0 "0.0.0.0" santara_webview2_check_user santara_webview2_ready

santara_webview2_check_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_missing
  StrCmp $0 "0.0.0.0" santara_webview2_missing santara_webview2_ready

santara_webview2_missing:
  IfFileExists "$EXEDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" santara_webview2_install santara_webview2_prerequisite_missing

santara_webview2_install:
  ExecWait '"$EXEDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install' $0
  IntCmp $0 0 santara_webview2_verify santara_webview2_install_failed santara_webview2_install_failed

santara_webview2_verify:
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_verify_user
  StrCmp $0 "0.0.0.0" santara_webview2_verify_user santara_webview2_ready

santara_webview2_verify_user:
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" santara_webview2_install_failed
  StrCmp $0 "0.0.0.0" santara_webview2_install_failed santara_webview2_ready

santara_webview2_prerequisite_missing:
  SetRegView 64
  MessageBox MB_ICONSTOP|MB_OK "Microsoft WebView2 Runtime is required. Place MicrosoftEdgeWebView2RuntimeInstallerX64.exe beside this setup file, then run setup again. The offline installer is available from Microsoft's WebView2 Runtime download page."
  Abort

santara_webview2_install_failed:
  SetRegView 64
  MessageBox MB_ICONSTOP|MB_OK "WebView2 Runtime installation failed. Santara was not installed. Run the separate WebView2 offline installer and retry Santara setup."
  Abort

santara_webview2_ready:
  SetRegView 64
!macroend
