import type { Metadata } from 'next'
import { Familjen_Grotesk, Geist_Mono, JetBrains_Mono, Public_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ThemeScript } from '@/components/layout/ThemeScript'
import { LogRocketInit } from '@/components/LogRocketInit'

// Light theme = Familjen Grotesk + Geist Mono, dark theme = Public Sans + JetBrains Mono.
const familjen = Familjen_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-familjen' })
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono' })
const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-public' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: { default: 'Pretzel by mykka.ai — AI Prompt Data Loss Prevention', template: '%s | Pretzel' },
  description: 'Stop your team from leaking sensitive data to ChatGPT, Claude, and Gemini. Pretzel intercepts AI prompts in real time — blocking PII, secrets, and IP before they leave the browser.',
  metadataBase: new URL('https://mykka.ai'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://mykka.ai',
    siteName: 'mykka.ai',
    images: [{ url: '/images/og-default.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', creator: '@mykka_ai' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${familjen.variable} ${geistMono.variable} ${publicSans.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <LogRocketInit />
        <Header />
        <main>{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}
