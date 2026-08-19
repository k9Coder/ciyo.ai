; Custom NSIS uninstall hook (electron-builder nsis.include).
;
; Uninstalling the app deletes the files, but three things this app sets up
; outside its own install folder survive that by default and were never
; cleaned up:
;   1. The OS proxy registry key, if still pointed at our (now-gone) daemon
;      — breaks the user's internet with no app left to fix it.
;   2. The PretzelDesktopProxyWatchdog scheduled task — left polling forever
;      for a binary that no longer exists.
;   3. The trusted CA cert + QUIC-block firewall rule in the LocalMachine
;      store — a dormant trust entry and a permanent HTTP/3 block with no
;      UI left to remove them.
;
; (1) and (2) are per-user (HKCU/schtasks /delete without admin) and always
; run. (3) needs admin — bundled into one UAC prompt, best-effort: if the
; user declines it, uninstall still completes rather than getting stuck
; waiting on a prompt for a lower-stakes cleanup step.

!macro customUnInstall
  DetailPrint "Resetting system proxy…"
  nsExec::ExecToLog 'reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f'
  Pop $0
  nsExec::ExecToLog 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /f'
  Pop $0

  DetailPrint "Removing background watchdog task…"
  nsExec::ExecToLog 'schtasks /delete /tn "PretzelDesktopProxyWatchdog" /f'
  Pop $0

  ; Elevated cleanup, written to a temp .ps1 and run via -File — an inline
  ; -Command string with nested quotes is exactly the class of bug that
  ; silently broke host hardening's own elevation earlier in this project
  ; (see electron/hardening.ts) — no shell-quoting left to get wrong this way.
  DetailPrint "Removing trusted certificate and firewall rule (admin prompt)…"
  GetTempFileName $1
  Delete $1
  StrCpy $1 "$1.ps1"
  FileOpen $2 $1 w
  FileWrite $2 'certutil -delstore Root "Pretzel Desktop Local CA"$\r$\n'
  FileWrite $2 'netsh advfirewall firewall delete rule name="Pretzel Desktop - Block QUIC (UDP 443)"$\r$\n'
  FileClose $2
  ExecShell "runas" "powershell.exe" '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$1"'
!macroend
