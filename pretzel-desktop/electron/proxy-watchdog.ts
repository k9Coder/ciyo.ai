/**
 * Proxy watchdog — an OS-scheduled task that runs INDEPENDENTLY of this app
 * process, so it survives the one failure mode nothing inside the process can
 * catch: a hard kill (Task Manager "End Task", a crash, power loss). If the
 * app dies without running its own cleanup, the system proxy is left pointed
 * at our (now-dead) port — no JS code runs on a SIGKILL, so nothing inside the
 * process can ever fix that. The watchdog checks, roughly once a minute,
 * "is the OS proxy pointed at our port, and is anything actually listening
 * there?" — if the app is gone, it resets the proxy itself.
 *
 * No elevation needed: resetting the proxy registry key (Windows) / networksetup
 * state (macOS) is a per-user operation, same as activateSystemProxy/
 * restoreSystemProxy already do unelevated. Only the *scheduling* mechanism
 * differs per platform, and none of those need admin for a per-user task either.
 */
import { execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

const TASK_NAME = 'PretzelDesktopProxyWatchdog'
const LAUNCHD_LABEL = 'ai.mykka.pretzel.proxywatchdog'

function winRegPath(): string {
  return 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
}

function watchdogScriptPath(userDataDir: string, ext: string): string {
  return path.join(userDataDir, `proxy-watchdog.${ext}`)
}

// ─── Windows ───────────────────────────────────────────────────────────────

function winWatchdogScript(port: number): string {
  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$regPath = "${winRegPath()}"`,
    '$enabled = (Get-ItemProperty -Path $regPath -Name ProxyEnable).ProxyEnable',
    '$server  = (Get-ItemProperty -Path $regPath -Name ProxyServer).ProxyServer',
    `if ($enabled -eq 1 -and $server -eq "127.0.0.1:${port}") {`,
    `  $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port ${port} -WarningAction SilentlyContinue -InformationLevel Quiet`,
    '  if (-not $conn) {',
    '    Set-ItemProperty -Path $regPath -Name ProxyEnable -Value 0',
    '    Remove-ItemProperty -Path $regPath -Name ProxyServer -ErrorAction SilentlyContinue',
    '  }',
    '}',
    '',
  ].join('\r\n')
}

function winEnsureWatchdog(userDataDir: string, port: number): void {
  const scriptPath = watchdogScriptPath(userDataDir, 'ps1')
  // Rewrite every launch — cheap, and keeps the watchdog in sync if PROXY_PORT
  // ever changes between builds.
  fs.writeFileSync(scriptPath, winWatchdogScript(port), 'utf-8')

  let exists = false
  try {
    execFileSync('schtasks.exe', ['/query', '/tn', TASK_NAME], { stdio: 'ignore' })
    exists = true
  } catch { /* not registered yet */ }
  if (exists) return

  // A per-user repeating task needs no admin — same trust level as the proxy
  // registry key it corrects. Built via a wrapper .ps1 (not an inline
  // -Command string) so there's zero shell-quoting to get wrong — the same
  // class of bug that silently broke host hardening's elevation earlier.
  const installScript = [
    '$action  = New-ScheduledTaskAction -Execute "powershell.exe" ' +
      `-Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"'`,
    '$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) ' +
      '-RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue)',
    `Register-ScheduledTask -TaskName "${TASK_NAME}" -Action $action -Trigger $trigger ` +
      '-Description "Resets the Pretzel Desktop proxy if the app is no longer running." -Force | Out-Null',
    '',
  ].join('\r\n')
  const installPath = path.join(os.tmpdir(), `pretzel-watchdog-install-${Date.now()}.ps1`)
  fs.writeFileSync(installPath, installScript, 'utf-8')
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installPath], { stdio: 'ignore' })
  } finally {
    try { fs.unlinkSync(installPath) } catch { /* best effort */ }
  }
}

function winRemoveWatchdog(): void {
  try {
    execFileSync('schtasks.exe', ['/delete', '/tn', TASK_NAME, '/f'], { stdio: 'ignore' })
  } catch { /* wasn't registered */ }
}

// ─── macOS ─────────────────────────────────────────────────────────────────

function macWatchdogScript(port: number): string {
  return [
    '#!/bin/sh',
    'service=$(networksetup -listallnetworkservices | tail -n +2 | head -n 1)',
    '[ -z "$service" ] && exit 0',
    'server=$(networksetup -getwebproxy "$service" | awk "/^Server:/{print \\$2}")',
    `if [ "$server" = "127.0.0.1" ]; then`,
    `  if ! nc -z -w1 127.0.0.1 ${port} 2>/dev/null; then`,
    '    networksetup -setwebproxystate "$service" off',
    '    networksetup -setsecurewebproxystate "$service" off',
    '  fi',
    'fi',
    '',
  ].join('\n')
}

function macEnsureWatchdog(userDataDir: string, port: number): void {
  const scriptPath = watchdogScriptPath(userDataDir, 'sh')
  fs.writeFileSync(scriptPath, macWatchdogScript(port), { mode: 0o755 })

  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
  if (fs.existsSync(plistPath)) return

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>${scriptPath}</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><false/>
</dict></plist>
`
  fs.mkdirSync(path.dirname(plistPath), { recursive: true })
  fs.writeFileSync(plistPath, plist, 'utf-8')
  try {
    execFileSync('launchctl', ['load', plistPath], { stdio: 'ignore' })
  } catch { /* best effort — proxy still works, just without the watchdog */ }
}

function macRemoveWatchdog(): void {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
  try { execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' }) } catch { /* wasn't loaded */ }
  try { fs.unlinkSync(plistPath) } catch { /* wasn't there */ }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Install (idempotently) the platform watchdog. Call once at startup, after
 * activateSystemProxy(). Never throws — a failed install just means no
 * independent safety net, not a broken app.
 */
export function ensureProxyWatchdog(userDataDir: string, port: number): void {
  try {
    if (process.platform === 'win32') winEnsureWatchdog(userDataDir, port)
    else if (process.platform === 'darwin') macEnsureWatchdog(userDataDir, port)
    // Linux desktop environments vary too much (systemd-user/cron/none) to
    // reliably automate here — the crash-recovery guard in system-proxy.ts
    // (self-heals on the app's own next launch) is the fallback there.
  } catch (err) {
    console.error('[pretzel-desktop] Proxy watchdog install failed:', err)
  }
}

/** Remove the watchdog (e.g. on uninstall). Never throws. */
export function removeProxyWatchdog(): void {
  try {
    if (process.platform === 'win32') winRemoveWatchdog()
    else if (process.platform === 'darwin') macRemoveWatchdog()
  } catch (err) {
    console.error('[pretzel-desktop] Proxy watchdog removal failed:', err)
  }
}
