export const THEME_STORAGE_KEY = 'mykka-theme'

// Runs before first paint so the saved theme is applied without a flash.
// Light is the default; only an explicit saved 'dark' switches it.
const script = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
