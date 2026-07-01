import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LogRocketInit } from '@/components/LogRocketInit'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'Pretzel by ciyo.ai — AI Prompt Data Loss Prevention', template: '%s | Pretzel' },
  description: 'Stop your team from leaking sensitive data to ChatGPT, Claude, and Gemini. Pretzel intercepts AI prompts in real time — blocking PII, secrets, and IP before they leave the browser.',
  metadataBase: new URL('https://ciyo.ai'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ciyo.ai',
    siteName: 'ciyo.ai',
    images: [{ url: '/images/og-default.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', creator: '@ciyo_ai' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <LogRocketInit />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
