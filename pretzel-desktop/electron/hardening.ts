/**
 * Host hardening — the privileged one-time setup the MITM proxy needs to work
 * without the user running manual commands:
 *
 *   1. Trust our CA in the OS root store (so intercepted HTTPS isn't rejected
 *      with ERR_CERT_AUTHORITY_INVALID).
 *   2. Block outbound QUIC (UDP:443). Chromium prefers HTTP/3 over QUIC, which
 *      is UDP and therefore bypasses the HTTP(S) system proxy entirely — the
 *      prompt never reaches us. Blocking UDP:443 forces a transparent fallback
 *      to HTTP/2-over-TCP, which does go through the proxy. Pretzel runs at
 *      login (always-on), so a persistent block is fine; TCP fallback is
 *      invisible to the user.
 *
 * Both need admin. We batch whatever is missing into a SINGLE elevated
 * invocation so the user sees at most one native prompt (UAC / admin dialog /
 * polkit), and only when something actually needs doing.
 */
import { execSync } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { isCACertTrusted } from './ca'

const QUIC_RULE_NAME = 'Pretzel Desktop - Block QUIC (UDP 443)'

/** Is outbound QUIC (UDP:443) already blocked? */
export function isQuicBlocked(): boolean {
  try {
    switch (process.platform) {
      case 'win32': {
        const out = execSync(`netsh advfirewall firewall show rule name="${QUIC_RULE_NAME}"`, { encoding: 'utf8' })
        return !/No rules match/i.test(out)
      }
      case 'darwin': {
        // Our rules live in a dedicated pf anchor so we never clobber the
        // user's own pf config.
        const out = execSync(`pfctl -a com.mykka.pretzel/quic -sr 2>/dev/null || true`, { encoding: 'utf8' })
        return /block\s+drop\s+out\s+.*proto\s+udp.*(port\s*=\s*443|443)/i.test(out)
      }
      default:
        // Linux desktops vary too much (nftables/ufw/iptables) — skip rather
        // than prompt for something we can't reliably verify.
        return true
    }
  } catch {
    return false
  }
}

// ─── Raw (unelevated) command fragments ──────────────────────────────────────

function caTrustFragment(certPath: string): string {
  switch (process.platform) {
    case 'win32':  return `certutil -addstore Root "${certPath}"`
    case 'darwin': return `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`
    case 'linux':  return `cp "${certPath}" /usr/local/share/ca-certificates/pretzel-ca.crt && update-ca-certificates`
    default:       return ''
  }
}

function quicBlockFragment(): string {
  switch (process.platform) {
    case 'win32':
      return `netsh advfirewall firewall add rule name="${QUIC_RULE_NAME}" dir=out action=block protocol=UDP remoteport=443`
    case 'darwin':
      // Load a block rule into our own anchor and enable pf. Kept minimal;
      // removeHostHardening() flushes the anchor on uninstall/opt-out.
      return `(echo 'block drop out proto udp from any to any port 443' | pfctl -a com.mykka.pretzel/quic -f - ) && pfctl -e`
    case 'linux':
      return '' // handled as no-op above
    default:
      return ''
  }
}

// ─── Single elevated runner ──────────────────────────────────────────────────

/** Run several shell fragments in ONE elevated invocation (one native prompt). */
function runElevated(fragments: string[]): void {
  const script = fragments.filter(Boolean).join(process.platform === 'win32' ? '\r\n' : '\n')
  if (!script) return

  if (process.platform === 'win32') {
    // Write a temp .bat and elevate it via UAC — far more robust than trying to
    // quote certutil paths + netsh args through a single powershell -Command.
    const bat = path.join(os.tmpdir(), `pretzel-setup-${Date.now()}.bat`)
    fs.writeFileSync(bat, `@echo off\r\n${script}\r\n`, 'utf-8')
    try {
      execSync(
        `powershell -NoProfile -Command "Start-Process -FilePath '${bat}' -Verb RunAs -Wait"`,
        { stdio: 'ignore' },
      )
    } finally {
      try { fs.unlinkSync(bat) } catch { /* best effort */ }
    }
    return
  }

  if (process.platform === 'darwin') {
    // osascript shows one admin dialog and runs the whole script as root.
    const escaped = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    execSync(`osascript -e 'do shell script "${escaped}" with administrator privileges'`, { stdio: 'ignore' })
    return
  }

  // Linux: one polkit prompt for the batch.
  execSync(`pkexec sh -c '${script.replace(/'/g, `'\\''`)}'`, { stdio: 'ignore' })
}

/**
 * Ensure the CA is trusted AND QUIC is blocked, prompting for elevation at most
 * once and only for the pieces that are actually missing. Safe to call every
 * launch: a no-op when both are already in place. Never throws — a declined
 * prompt leaves the proxy working but degraded (untrusted cert / QUIC bypass),
 * which is strictly better than crashing on startup.
 */
export async function ensureHostHardening(certPath: string): Promise<void> {
  const fragments: string[] = []
  if (!isCACertTrusted()) fragments.push(caTrustFragment(certPath))
  if (!isQuicBlocked()) fragments.push(quicBlockFragment())
  if (fragments.length === 0) return

  try {
    runElevated(fragments)
  } catch (err) {
    console.error('[pretzel-desktop] Host hardening (CA trust / QUIC block) failed or was declined:', err)
  }
}
