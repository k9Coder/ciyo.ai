'use client'

import { useState } from 'react'
import type { DownloadAsset, Downloads } from './getDownloads'

type Platform = 'mac-arm' | 'mac-intel' | 'windows' | 'linux' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) {
    // Apple Silicon detection via canvas trick or just default to arm64 since 2021+ is ARM
    return (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData?.platform?.toLowerCase().includes('arm') !== false
      ? 'mac-arm'
      : 'mac-intel'
  }
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DownloadClient({ downloads: releaseDownloads }: { downloads: Downloads }) {
  const [platform] = useState<Platform>(detectPlatform)

  const version = releaseDownloads.version ? `v${releaseDownloads.version}` : ''

  const downloads: Array<{
    id: Platform
    label: string
    sublabel: string
    icon: string
    asset: DownloadAsset | null
    installCmd?: string
    installCmdLabel?: string
  }> = [
    {
      id: 'mac-arm',
      label: 'macOS',
      sublabel: 'Apple Silicon (M1/M2/M3/M4)',
      icon: '🍎',
      asset: releaseDownloads.macArm,
      installCmd: 'brew install --cask pretzel-desktop',
      installCmdLabel: 'or via Homebrew',
    },
    {
      id: 'mac-intel',
      label: 'macOS',
      sublabel: 'Intel (2020 and earlier)',
      icon: '🍎',
      asset: releaseDownloads.macIntel,
    },
    {
      id: 'windows',
      label: 'Windows',
      sublabel: 'Windows 10 / 11 (x64)',
      icon: '🪟',
      asset: releaseDownloads.windows,
      installCmd: 'winget install mykka.PretzelDesktop',
      installCmdLabel: 'or via winget',
    },
    {
      id: 'linux',
      label: 'Linux',
      sublabel: 'AppImage (x64)',
      icon: '🐧',
      asset: releaseDownloads.linux,
    },
  ]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '4px 14px', fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          {version ? `Latest: ${version}` : 'Latest release'}
        </div>

        <h1 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1, marginBottom: 16 }}>
          Download Pretzel Desktop
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 520, margin: '0 auto' }}>
          System-wide AI prompt DLP. Monitors all apps — including Chrome, Safari, and native AI tools — not just the browser.
        </p>
      </div>

      {/* Platform cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
        {downloads.map(d => {
          const isDetected = d.id === platform || (platform === 'mac-arm' && d.id === 'mac-arm')
          const url = d.asset?.url ?? '#'
          const size = d.asset ? formatBytes(d.asset.size) : ''

          return (
            <div
              key={d.id}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${isDetected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 16,
                padding: 24,
                position: 'relative',
                boxShadow: isDetected ? '0 0 0 1px var(--accent)' : 'none',
              }}
            >
              {isDetected && (
                <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>
                  Recommended for you
                </div>
              )}

              <div style={{ fontSize: 28, marginBottom: 10 }}>{d.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{d.label}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>{d.sublabel}</div>

              <a
                href={url}
                download={!!d.asset}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  padding: '10px 0',
                  background: isDetected ? 'var(--accent)' : 'var(--surface2)',
                  color: '#fff',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                  marginBottom: d.installCmd ? 12 : 0,
                  cursor: 'pointer',
                }}
              >
                {d.asset ? `Download ${size ? `(${size})` : ''}` : 'Unavailable'}
              </a>

              {d.installCmd && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>{d.installCmdLabel}</div>
                  <code
                    style={{
                      display: 'block',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12,
                      color: 'var(--accent2)',
                      cursor: 'pointer',
                      userSelect: 'all',
                    }}
                    title="Click to copy"
                    onClick={() => navigator.clipboard?.writeText(d.installCmd!)}
                  >
                    {d.installCmd}
                  </code>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Requirements + what it does */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 48 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>System requirements</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>✓ macOS 12+ (Monterey or later)</li>
            <li>✓ Windows 10 / 11 (64-bit)</li>
            <li>✓ Linux (glibc 2.28+)</li>
            <li>✓ 50 MB disk space</li>
            <li>✓ Admin rights for CA cert install</li>
          </ul>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>What it does</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>🔍 Inspects all HTTPS traffic system-wide</li>
            <li>🛡️ Applies your org policy to every AI request</li>
            <li>🪟 Works with Chrome, Edge, Safari, Copilot</li>
            <li>🔔 Decision window for warn/block actions</li>
            <li>📊 Audit events sent to your dashboard</li>
          </ul>
        </div>
      </div>

      {/* First-run steps */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>After installing</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['1', 'Launch Pretzel Desktop', 'It installs a local CA cert and sets up your system proxy. You\'ll be prompted for admin password once.'],
            ['2', 'Sign in with mykka.ai', 'Click the tray icon → "Sign in" to load your organisation\'s policy. Opens in your browser.'],
            ['3', 'Done', 'The tray icon turns green. Every HTTPS request from every app is now checked against your policy.'],
          ].map(([num, title, desc]) => (
            <div key={num} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {num}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
