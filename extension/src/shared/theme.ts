export type Theme = 'dark' | 'light'

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
  chrome.storage.sync.set({ theme })
}

export function initTheme(): void {
  chrome.storage.sync.get('theme', (result) => {
    if (result.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    }
  })
}
