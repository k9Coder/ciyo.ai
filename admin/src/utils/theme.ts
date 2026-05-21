export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'ciyo-theme'

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
