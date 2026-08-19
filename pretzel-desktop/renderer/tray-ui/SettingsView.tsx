import React, { useEffect, useState } from 'react'

const NOTIFY_OPTIONS: Array<{ value: NotifyLevel; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'badge', label: 'Popup only (no OS notification)' },
  { value: 'native', label: 'Silent notification' },
  { value: 'native-sound', label: 'Notification with sound' },
]

function NotifyRow({
  label, value, onChange,
}: {
  label: string
  value: NotifyLevel
  onChange: (v: NotifyLevel) => void
}) {
  return (
    <label className="settings-row">
      <span className="settings-row-label">{label}</span>
      <select
        className="settings-select"
        value={value}
        onChange={(e) => onChange(e.target.value as NotifyLevel)}
      >
        {NOTIFY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  )
}

export function SettingsView({ onBack, onReplayWalkthrough }: { onBack: () => void; onReplayWalkthrough: () => void }) {
  const [settings, setSettings] = useState<SettingsPayload | null>(null)

  useEffect(() => {
    window.pretzel.getSettings().then(setSettings)
  }, [])

  function update(patch: Partial<SettingsPayload>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev)) // optimistic
    window.pretzel.setSettings(patch).then(setSettings)
  }

  return (
    <div className="app fade-in">
      <div className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back" title="Back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L3 7L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="header-text">
          <div className="title">Settings</div>
        </div>
      </div>

      {settings && (
        <div className="status-card settings-card">
          <p className="settings-section-label">Notifications</p>
          <NotifyRow
            label="When a request is blocked"
            value={settings.notifyOnBlock}
            onChange={(v) => update({ notifyOnBlock: v })}
          />
          <NotifyRow
            label="When a request is flagged"
            value={settings.notifyOnWarn}
            onChange={(v) => update({ notifyOnWarn: v })}
          />
        </div>
      )}

      <div className="status-card settings-card">
        <p className="settings-section-label">Onboarding</p>
        <button className="btn btn-outline btn-block" onClick={onReplayWalkthrough}>
          Show welcome walkthrough again
        </button>
      </div>
    </div>
  )
}
