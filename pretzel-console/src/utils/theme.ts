export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'pretzel-theme'
const LEGACY_KEY  = 'ciyo-theme'

function migrateTheme(): void {
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_KEY)
  }
}

migrateTheme()

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

export function setTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}
