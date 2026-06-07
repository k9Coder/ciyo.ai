import { useEffect, useState } from 'react'
import { getTheme } from '../../utils/theme'
import type { Theme } from '../../utils/theme'

export function PretzelLogo({ size = 28 }: { size?: number }) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeState(getTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const src = theme === 'light' ? '/logo-light.png' : '/logo-dark.png'
  return (
    <img
      src={src}
      alt="Pretzel logo"
      style={{ display: 'block', height: size, width: 'auto', flexShrink: 0 }}
    />
  )
}
