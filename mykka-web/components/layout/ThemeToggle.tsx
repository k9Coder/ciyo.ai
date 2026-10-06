'use client'
import { THEME_STORAGE_KEY } from './ThemeScript'

// The active pill is styled from data-theme on <html> (set before paint by ThemeScript),
// so this needs no state and can't mismatch between server and client render.
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* storage blocked */ }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="flex cursor-pointer rounded-btn border-0 bg-fill p-[3px] text-[13px] text-ink"
    >
      <span className="rounded-btn bg-surface px-[11px] py-[5px] [[data-theme=dark]_&]:bg-transparent">Light</span>
      <span className="rounded-btn bg-transparent px-[11px] py-[5px] [[data-theme=dark]_&]:bg-surface">Dark</span>
    </button>
  )
}
