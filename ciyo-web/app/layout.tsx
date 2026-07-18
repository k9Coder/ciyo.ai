import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'Pretzel by ciyo.ai - AI Prompt Policy', template: '%s | Pretzel' },
  description: 'Configure local prompt detection and warn or block actions for supported ChatGPT, Claude, and Gemini hosts.',
  metadataBase: new URL('https://ciyo.ai'),
  openGraph: {
    title: 'Pretzel by ciyo.ai - AI Prompt Policy',
    description: 'Configure local prompt detection and warn or block actions for supported ChatGPT, Claude, and Gemini hosts.',
    url: 'https://ciyo.ai',
    siteName: 'ciyo.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pretzel by ciyo.ai - AI Prompt Policy',
    description: 'Configure local prompt detection and warn or block actions for supported ChatGPT, Claude, and Gemini hosts.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={inter.variable}><body><Header /><main>{children}</main><Footer /></body></html>
}
