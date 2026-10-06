/**
 * Proxy sentinel — fast path for the "closed the terminal / crashed / hard
 * killed" failure mode. Watches this app's PID; the instant it disappears,
 * resets the OS proxy if it's still pointed at us. No code inside a process
 * that just died can run cleanup — this has to live entirely outside it,
 * watching from the moment the app starts.
 *
 * On Windows this runs via a one-shot Task Scheduler task, triggered to fire
 * immediately (`Start-ScheduledTask` right after registering it) — NOT a
 * spawned child process, however "detached". Two earlier attempts at this
 * (`spawn({ detached: true })`, then a `Start-Process` handoff) both failed
 * the same live test: Windows Terminal/ConPTY assigns its entire process
 * tree to a Job Object with kill-on-close semantics. That's a different
 * mechanism from process groups — `detached: true` and `CREATE_BREAKAWAY`-
 * style tricks address process-group signals (Ctrl+C), not Job Object
 * membership, and a child inherits its parent's job by default regardless
 * of how it was spawned. Every descendant of that console — spawned
 * directly, detached, or handed off via Start-Process/ShellExecute — dies
 * when the terminal does. The only thing immune to this in the codebase so
 * far is the existing 60s watchdog (proxy-watchdog.ts), because Task
 * Scheduler executes it under svchost.exe's ancestry, never ours. This
 * reuses that exact mechanism instead of a third variation on "spawn it
 * carefully" — triggered to run right now instead of on a timer.
 *
 * Same "best effort" posture as the watchdog: it can't know what the user's
 * proxy config was before us (that's only ever held in this process's
 * memory, never on disk) — it just turns the proxy off if it's still
 * pointed at our (now-dead) port, trading a perfect restore for getting the
 * user back online immediately.
 */
import { execFileSync, spawn } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'os'

function winScript(parentPid: number, port: number, taskName: string): string {
  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    `while (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 1 }`,
    '$regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"',
    '$enabled = (Get-ItemProperty -Path $regPath -Name ProxyEnable -ErrorAction SilentlyContinue).ProxyEnable',
    '$server  = (Get-ItemProperty -Path $regPath -Name ProxyServer -ErrorAction SilentlyContinue).ProxyServer',
    `if ($enabled -eq 1 -and $server -eq "127.0.0.1:${port}") {`,
    '  Set-ItemProperty -Path $regPath -Name ProxyEnable -Value 0',
    '  Remove-ItemProperty -Path $regPath -Name ProxyServer -ErrorAction SilentlyContinue',
    '}',
    // Self-cleanup: this is a one-shot task, its trigger is spent after this
    // run either way, but leaving it registered would clutter Task Scheduler
    // across every future launch (each task is named per-PID).
    `Unregister-ScheduledTask -TaskName "${taskName}" -Confirm:$false -ErrorAction SilentlyContinue`,
    'Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue',
    '',
  ].join('\r\n')
}

function macScript(parentPid: number, port: number): string {
  return [
    '#!/bin/sh',
    `while kill -0 ${parentPid} 2>/dev/null; do sleep 1; done`,
    'networksetup -listallnetworkservices | tail -n +2 | while IFS= read -r service; do',
    '  host=$(networksetup -getwebproxy "$service" 2>/dev/null | awk -F"Server: " "/^Server:/{print \\$2}")',
    `  hport=$(networksetup -getwebproxy "$service" 2>/dev/null | awk -F"Port: " "/^Port:/{print \\$2}")`,
    `  if [ "$host" = "127.0.0.1" ] && [ "$hport" = "${port}" ]; then`,
    '    networksetup -setwebproxystate "$service" off',
    '    networksetup -setsecurewebproxystate "$service" off',
    '  fi',
    'done',
    'rm -f -- "$0"',
    '',
  ].join('\n')
}

function linuxScript(parentPid: number, port: number): string {
  return [
    '#!/bin/sh',
    `while kill -0 ${parentPid} 2>/dev/null; do sleep 1; done`,
    'host=$(gsettings get org.gnome.system.proxy.http host 2>/dev/null | tr -d "\'")',
    'gport=$(gsettings get org.gnome.system.proxy.http port 2>/dev/null)',
    `if [ "$host" = "127.0.0.1" ] && [ "$gport" = "${port}" ]; then`,
    "  gsettings set org.gnome.system.proxy mode 'none'",
    'fi',
    'rm -f -- "$0"',
    '',
  ].join('\n')
}

function spawnWinSentinel(pid: number, port: number): void {
  const taskName = `PretzelDesktopSentinel${pid}`
  const scriptPath = path.join(os.tmpdir(), `pretzel-sentinel-${pid}.ps1`)
  writeFileSync(scriptPath, winScript(pid, port, taskName), 'utf-8')

  // Register + immediately fire a one-shot scheduled task. Written to a
  // wrapper .ps1 (not an inline -Command string) — no shell-quoting to get
  // wrong, same pattern as hardening.ts/proxy-watchdog.ts elsewhere in this
  // file's history. execFileSync (not spawn+detached) is deliberate here:
  // registering and starting the task are quick, synchronous CLI calls —
  // the actual long-running watch happens inside the task's own process,
  // entirely outside this one, so there's nothing to keep this call async for.
  const registerScript = [
    '$action  = New-ScheduledTaskAction -Execute "powershell.exe" ' +
      `-Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"'`,
    '$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)',
    `Register-ScheduledTask -TaskName "${taskName}" -Action $action -Trigger $trigger ` +
      '-Description "Pretzel Desktop fast proxy-recovery sentinel (one-shot)" -Force | Out-Null',
    `Start-ScheduledTask -TaskName "${taskName}"`,
    '',
  ].join('\r\n')
  const registerPath = path.join(os.tmpdir(), `pretzel-sentinel-register-${pid}.ps1`)
  writeFileSync(registerPath, registerScript, 'utf-8')
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', registerPath,
    ], { stdio: 'ignore' })
  } finally {
    try { unlinkSync(registerPath) } catch { /* best effort */ }
  }
}

/**
 * Spawn the sentinel for the current process (its own PID) watching `port`.
 * Never throws — a failed spawn just means no fast-path recovery, not a
 * broken app (the scheduled-task watchdog still covers it, slower).
 */
export function spawnProxySentinel(port: number): void {
  try {
    const pid = process.pid
    if (process.platform === 'win32') {
      spawnWinSentinel(pid, port)
    } else if (process.platform === 'darwin') {
      const scriptPath = path.join(os.tmpdir(), `pretzel-sentinel-${pid}.sh`)
      writeFileSync(scriptPath, macScript(pid, port), { mode: 0o755 })
      spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'linux') {
      const scriptPath = path.join(os.tmpdir(), `pretzel-sentinel-${pid}.sh`)
      writeFileSync(scriptPath, linuxScript(pid, port), { mode: 0o755 })
      spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch (err) {
    console.error('[pretzel-desktop] Proxy sentinel spawn failed:', err)
  }
}
