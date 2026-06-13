# ciyo.ai Marketing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ciyo.ai marketing website — a Next.js 15 app in a new `ciyo-web` repo — that explains Pretzel clearly to non-technical buyers, converts visitors to signups, and includes a video content plan for explainer videos.

**Architecture:** Next.js 15 App Router + TypeScript + Tailwind CSS + shadcn/ui. Static pages served via Vercel edge. MDX blog via Contentlayer. No authentication needed — this is a pure marketing/content site that links to `app.ciyo.ai` (Pretzel Console).

**Tech Stack:** Next.js 15, TypeScript 5, Tailwind CSS 3, shadcn/ui, Contentlayer2 (MDX), Vercel, Lucide icons.

**New Repo Location:** Create at `../ciyo-web` (sibling to this repo). All paths below are relative to that new repo root.

---

## File Structure

```
ciyo-web/
  app/
    layout.tsx                         — root layout, metadata, fonts
    page.tsx                           — Home (/)
    product/page.tsx                   — Product deep-dive (/product)
    pricing/page.tsx                   — Pricing tiers (/pricing)
    solutions/
      page.tsx                         — Solutions index
      [industry]/page.tsx              — Per-industry page
    security/page.tsx                  — Trust & security (/security)
    about/page.tsx                     — About ciyo.ai (/about)
    blog/
      page.tsx                         — Blog index (/blog)
      [slug]/page.tsx                  — Blog post
  components/
    layout/
      Header.tsx                       — sticky nav + CTA button
      Footer.tsx                       — links, social, copyright
    sections/
      Hero.tsx                         — above-fold hero
      HowItWorks.tsx                   — 3-step process
      FeatureGrid.tsx                  — feature highlight cards
      PricingPreview.tsx               — 3-tier preview strip
      SocialProof.tsx                  — logo strip + quote
      VideoDemo.tsx                    — embedded demo video player
      CTABanner.tsx                    — bottom-of-page conversion strip
    ui/
      PricingCard.tsx                  — reusable tier card
      FeatureCard.tsx                  — icon + title + desc card
      Tag.tsx                          — label pill
      AnimatedCounter.tsx              — number animation for stats
  lib/
    metadata.ts                        — shared OG/metadata helpers
    analytics.ts                       — Vercel Analytics + GA4 stub
  content/
    blog/
      2026-06-ai-prompt-leakage.mdx    — first lead-magnet post
  public/
    images/
      og-default.png                   — 1200x630 OG image
      extension-screenshot.png         — extension blocking a prompt
      console-screenshot.png           — Pretzel Console dashboard
    videos/
      explainer-placeholder.mp4        — placeholder until AI video done
    icons/                             — favicon, apple-touch-icon
  next.config.ts
  tailwind.config.ts
  contentlayer.config.ts
  package.json
  tsconfig.json
```

---

## Task 1: Initialize the Next.js 15 Project

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `tsconfig.json`
- Create: `app/layout.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Scaffold the project**

```bash
cd ..
npx create-next-app@latest ciyo-web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=no \
  --import-alias="@/*"
cd ciyo-web
```

- [ ] **Step 2: Install dependencies**

```bash
npm install lucide-react contentlayer2 next-contentlayer2 date-fns
npm install -D @tailwindcss/typography
npx shadcn@latest init
# When prompted: Default style, Slate base color, yes to CSS variables
```

- [ ] **Step 3: Write `next.config.ts`**

```typescript
import type { NextConfig } from 'next'
import { withContentlayer } from 'next-contentlayer2'

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}

export default withContentlayer(config)
```

- [ ] **Step 4: Write design tokens in `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg:         #0f0f13;
  --surface:    #17171e;
  --surface2:   #1e1e28;
  --border:     #2a2a38;
  --accent:     #7c6aff;
  --accent2:    #a78bfa;
  --green:      #34d399;
  --text:       #e2e8f0;
  --muted:      #94a3b8;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-inter), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 5: Write `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

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
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git init && git add -A
git commit -m "feat: initialize ciyo-web Next.js 15 project"
```

---

## Task 2: Header & Footer

**Files:**
- Create: `components/layout/Header.tsx`
- Create: `components/layout/Footer.tsx`

- [ ] **Step 1: Write `Header.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

const NAV = [
  { href: '/product',  label: 'Product' },
  { href: '/pricing',  label: 'Pricing' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/security', label: 'Security' },
  { href: '/blog',     label: 'Blog' },
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0f0f13]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
          {/* Pretzel wordmark — replace with SVG logo once designed */}
          <span className="text-[#a78bfa]">🥨</span>
          <span className="text-[15px] tracking-tight">Pretzel</span>
          <span className="text-[11px] font-normal text-[#94a3b8]">by ciyo.ai</span>
        </Link>

        <nav className="hidden gap-1 md:flex">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}
              className="rounded-md px-3 py-1.5 text-[13px] text-[#94a3b8] transition-colors hover:bg-white/[0.05] hover:text-white">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="https://app.ciyo.ai"
            className="hidden text-[13px] text-[#94a3b8] hover:text-white md:block">
            Sign in
          </Link>
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-lg bg-[#7c6aff] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#6b59ee]">
            Start Free
          </Link>
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#0f0f13] px-6 py-4 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="block py-2 text-[14px] text-[#94a3b8] hover:text-white">
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
```

- [ ] **Step 2: Write `Footer.tsx`**

```tsx
import Link from 'next/link'

const LINKS = {
  Product:  [['Product', '/product'], ['Pricing', '/pricing'], ['Changelog', '/changelog']],
  Solutions: [['Healthcare', '/solutions/healthcare'], ['Legal', '/solutions/legal'], ['Fintech', '/solutions/fintech'], ['Engineering', '/solutions/engineering']],
  Company:  [['About', '/about'], ['Blog', '/blog'], ['Security', '/security']],
  Docs:     [['Getting Started', 'https://docs.ciyo.ai'], ['API Reference', 'https://docs.ciyo.ai/api'], ['Chrome Enterprise', 'https://docs.ciyo.ai/enterprise']],
} as const

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0f0f13] px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          {(Object.entries(LINKS) as [string, readonly [string, string][]][]).map(([group, items]) => (
            <div key={group}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{group}</p>
              {items.map(([label, href]) => (
                <Link key={href} href={href}
                  className="mb-2 block text-[13px] text-[#64748b] transition-colors hover:text-[#94a3b8]">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-[12px] text-[#64748b] md:flex-row">
          <span>🥨 <strong className="text-[#94a3b8]">Pretzel</strong> by <strong className="text-[#94a3b8]">ciyo.ai</strong> — © {new Date().getFullYear()}</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Header and Footer layout components"
```

---

## Task 3: Homepage — Hero Section

**Files:**
- Create: `components/sections/Hero.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `Hero.tsx`**

The hero must answer three questions in 5 seconds: What problem? What solution? What do I do next?

```tsx
import Link from 'next/link'
import Image from 'next/image'

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24 text-center"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,106,255,.18) 0%, transparent 60%)' }}>

      {/* Eyebrow */}
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#7c6aff]/30 bg-[#7c6aff]/10 px-4 py-1.5 text-[12px] font-semibold text-[#a78bfa]">
        <span className="size-1.5 rounded-full bg-[#34d399]" style={{ boxShadow: '0 0 6px #34d399' }} />
        Now protecting teams at 200+ companies
      </div>

      {/* Headline */}
      <h1 className="mx-auto mb-5 max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white md:text-6xl">
        Stop Your Team from Leaking{' '}
        <span className="bg-gradient-to-r from-[#a78bfa] to-[#7c6aff] bg-clip-text text-transparent">
          Secrets to AI
        </span>
      </h1>

      {/* Sub */}
      <p className="mx-auto mb-8 max-w-xl text-[17px] leading-relaxed text-[#94a3b8]">
        Pretzel intercepts every ChatGPT, Claude, and Gemini prompt before it's sent —
        blocking PII, credentials, and IP automatically. Installs in 30 seconds.
      </p>

      {/* CTAs */}
      <div className="mb-12 flex flex-wrap items-center justify-center gap-3">
        <Link href="https://app.ciyo.ai/onboarding"
          className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee] hover:shadow-[#7c6aff]/40">
          Start Free — No Credit Card
        </Link>
        <Link href="/product"
          className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
          See How It Works →
        </Link>
      </div>

      {/* Screenshot */}
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
        <Image
          src="/images/extension-screenshot.png"
          alt="Pretzel blocking a sensitive prompt in ChatGPT"
          width={1200} height={750}
          className="w-full"
          priority
        />
      </div>

      {/* Social proof strip */}
      <p className="mt-8 text-[12px] text-[#64748b]">
        Trusted by security teams at healthcare, legal, and fintech companies
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Write `app/page.tsx` with Hero as first import**

```tsx
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { FeatureGrid } from '@/components/sections/FeatureGrid'
import { VideoDemo } from '@/components/sections/VideoDemo'
import { PricingPreview } from '@/components/sections/PricingPreview'
import { CTABanner } from '@/components/sections/CTABanner'

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <VideoDemo />
      <PricingPreview />
      <CTABanner />
    </>
  )
}
```

- [ ] **Step 3: Add placeholder screenshot** — drop a 1200x750 screenshot of the extension in action into `public/images/extension-screenshot.png`. Use a placeholder PNG for now.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: homepage Hero section"
```

---

## Task 4: Homepage — How It Works Section

**Files:**
- Create: `components/sections/HowItWorks.tsx`

- [ ] **Step 1: Write `HowItWorks.tsx`**

```tsx
const STEPS = [
  {
    number: '01',
    icon: '🧩',
    title: 'Install Pretzel',
    desc: 'Add the Chrome extension from the Web Store. Takes 30 seconds. No IT ticket, no proxy, no agent install.',
    detail: 'Works on ChatGPT, Claude, Gemini, and any other AI site your team uses.',
  },
  {
    number: '02',
    icon: '⚙️',
    title: 'Configure Your Policy',
    desc: 'Tell Pretzel what to protect — customer PII, source code, financial data, credentials. Use a one-click industry template or build your own.',
    detail: 'Our AI assistant helps you create rules in plain English. No regex knowledge required.',
  },
  {
    number: '03',
    icon: '🛡️',
    title: 'Your Team Is Protected',
    desc: 'Pretzel watches every AI prompt automatically. Sensitive content is blocked or flagged before it leaves the browser.',
    detail: 'Admins get real-time Slack alerts. Your compliance team gets an audit trail.',
  },
]

export function HowItWorks() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">How It Works</p>
        <h2 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white">
          From zero to protected in 30 minutes
        </h2>
        <p className="mx-auto mb-16 max-w-lg text-center text-[15px] text-[#94a3b8]">
          No enterprise procurement. No network changes. No IT involvement required for the first install.
        </p>

        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map(({ number, icon, title, desc, detail }) => (
            <div key={number} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-8 transition hover:border-[#7c6aff]/30">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#7c6aff]/15 text-xl">{icon}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]/60">{number}</span>
              </div>
              <h3 className="mb-2 text-[18px] font-bold text-white">{title}</h3>
              <p className="mb-3 text-[14px] leading-relaxed text-[#94a3b8]">{desc}</p>
              <p className="text-[12px] text-[#64748b]">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: HowItWorks section"
```

---

## Task 5: Homepage — Feature Grid & Video Demo

**Files:**
- Create: `components/sections/FeatureGrid.tsx`
- Create: `components/sections/VideoDemo.tsx`

- [ ] **Step 1: Write `FeatureGrid.tsx`**

```tsx
import { Shield, Brain, BarChart2, Zap, Users, Lock } from 'lucide-react'

const FEATURES = [
  { icon: Shield,   title: 'Real-Time Prompt Scanning', desc: 'Every AI prompt is scanned against your policy the moment it's typed — before the send button is pressed.', color: '#a78bfa' },
  { icon: Brain,    title: 'AI Policy Assistant',       desc: 'Manage your security rules in plain English. "Block SSNs for the Finance team" — done in seconds.', color: '#34d399' },
  { icon: BarChart2,title: 'Analytics Dashboard',       desc: 'See exactly what your team is sending to AI tools. Audit logs, trend analysis, and compliance reports.', color: '#60a5fa' },
  { icon: Zap,      title: 'Works on All AI Sites',     desc: 'ChatGPT, Claude, Gemini, Perplexity, and any internal AI tool — configured with a single CSS selector.', color: '#fbbf24' },
  { icon: Users,    title: 'Team & Division Policies',  desc: 'Different rules for Engineering, HR, Finance, and Legal. Org-scoped, team-scoped, or global policies.', color: '#f472b6' },
  { icon: Lock,     title: 'Entropy Detection',         desc: 'Automatically catches API keys, tokens, and credentials — even ones not in your keyword list.', color: '#fb923c' },
]

export function FeatureGrid() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Features</p>
        <h2 className="mb-16 text-center text-4xl font-extrabold tracking-tight text-white">
          Everything your security team needs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 transition hover:border-white/[0.14]">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl" style={{ background: `${color}1a` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <h3 className="mb-2 text-[15px] font-bold text-white">{title}</h3>
              <p className="text-[13px] leading-relaxed text-[#94a3b8]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write `VideoDemo.tsx`**

```tsx
export function VideoDemo() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">See It In Action</p>
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">
          Watch Pretzel block a real leak
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-[15px] text-[#94a3b8]">
          A Finance team member tries to paste a customer spreadsheet into ChatGPT.
          Pretzel catches the PII and blocks the prompt before it's sent.
        </p>

        {/* Video container — swap src for real video when ready */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#17171e] shadow-2xl shadow-black/60">
          <div className="relative aspect-video w-full">
            {/* Replace with <video> or iframe once AI video is generated */}
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-[#7c6aff]/20 ring-1 ring-[#7c6aff]/40">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4L16 10L7 16V4Z" fill="#a78bfa"/>
                </svg>
              </div>
              <p className="text-[13px] text-[#64748b]">90-second explainer — coming soon</p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[12px] text-[#64748b]">
          ↑ Replace this placeholder with your AI-generated video (see Video Content Plan appendix)
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: FeatureGrid and VideoDemo sections"
```

---

## Task 6: Homepage — Pricing Preview + CTA Banner

**Files:**
- Create: `components/sections/PricingPreview.tsx`
- Create: `components/sections/CTABanner.tsx`

- [ ] **Step 1: Write `PricingPreview.tsx`**

```tsx
import Link from 'next/link'

const TIERS = [
  { name: 'Solo', price: 'Free', desc: 'For individuals exploring Pretzel.', cta: 'Get Started Free', href: 'https://app.ciyo.ai/onboarding', featured: false, features: ['3 users', '500 scans/month', 'Keyword detection', 'Basic Console'] },
  { name: 'Starter', price: '$49', period: '/mo', desc: 'Small teams, flat rate.', cta: 'Start Starter', href: 'https://app.ciyo.ai/onboarding?plan=starter', featured: false, features: ['25 users', '50K scans/month', 'Keyword + regex', '30-day analytics'] },
  { name: 'Business', price: '$15', period: '/user/mo', desc: 'Full protection for your whole org.', cta: 'Start Business', href: 'https://app.ciyo.ai/onboarding?plan=business', featured: true, features: ['Unlimited users', 'All detection types', 'AI policy assistant', 'Slack alerting', '12-month audit log'] },
]

export function PricingPreview() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Pricing</p>
        <h2 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white">
          Simple, transparent pricing
        </h2>
        <p className="mx-auto mb-12 max-w-md text-center text-[15px] text-[#94a3b8]">
          Start free. Upgrade when your team needs it. No surprise invoices.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map(({ name, price, period, desc, cta, href, featured, features }) => (
            <div key={name} className={`flex flex-col rounded-2xl border p-7 transition ${featured ? 'border-[#7c6aff] bg-gradient-to-b from-[#7c6aff]/10 to-[#17171e]' : 'border-white/[0.07] bg-[#17171e] hover:border-white/[0.14]'}`}>
              {featured && (
                <span className="-mt-10 mb-5 block w-fit self-center rounded-full bg-[#7c6aff] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Most Popular</span>
              )}
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{name}</p>
              <p className="mt-2 mb-1 text-4xl font-extrabold text-white">{price}<span className="text-[14px] font-normal text-[#94a3b8]">{period}</span></p>
              <p className="mb-5 text-[13px] text-[#64748b]">{desc}</p>
              <ul className="mb-6 flex-1 space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[#94a3b8]">
                    <span className="text-[#34d399]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href={href} className={`block rounded-xl py-2.5 text-center text-[13px] font-bold transition ${featured ? 'bg-[#7c6aff] text-white hover:bg-[#6b59ee]' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'}`}>
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center">
          <Link href="/pricing" className="text-[13px] text-[#7c6aff] hover:text-[#a78bfa]">
            See full pricing comparison including Enterprise →
          </Link>
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write `CTABanner.tsx`**

```tsx
import Link from 'next/link'

export function CTABanner() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#7c6aff]/25 bg-gradient-to-br from-[#7c6aff]/10 to-[#17171e] p-14 text-center"
        style={{ boxShadow: '0 0 80px rgba(124,106,255,.1)' }}>
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">
          Ready to protect your team?
        </h2>
        <p className="mx-auto mb-8 max-w-md text-[15px] text-[#94a3b8]">
          Install Pretzel in 30 seconds. Configure your first policy with AI help.
          See results immediately.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
          <Link href="mailto:hello@ciyo.ai?subject=Enterprise enquiry"
            className="rounded-xl border border-white/10 bg-white/5 px-8 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
            Talk to Sales
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: PricingPreview and CTABanner homepage sections"
```

---

## Task 7: Pricing Page

**Files:**
- Create: `app/pricing/page.tsx`

- [ ] **Step 1: Write the Pricing page with monthly/annual toggle**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

// Can't export metadata from client component — move to layout or make server wrapper
const TIERS = [
  {
    name: 'Solo', monthly: 0, annual: 0, per: 'forever',
    desc: 'For individuals validating Pretzel before recommending it.',
    cta: 'Get Started Free', href: 'https://app.ciyo.ai/onboarding', featured: false,
    features: ['3 users', '1 subject, 5 rules', 'Keyword detection only', '500 scans / month', 'Basic Console access'],
    missing: ['Analytics', 'Org hierarchy', 'Entropy/pattern detection', 'AI assistant', 'Alerting'],
  },
  {
    name: 'Starter', monthly: 49, annual: 40, per: '/mo flat',
    desc: 'Small teams. Easy to expense — no per-seat maths.',
    cta: 'Start Starter', href: 'https://app.ciyo.ai/onboarding?plan=starter', featured: false,
    features: ['25 users', 'Unlimited subjects + rules', 'Keyword + regex detection', '50,000 scans / month', '30-day analytics', 'Basic audit log', 'Email support'],
    missing: ['Entropy detection', 'AI assistant', 'Slack alerting'],
  },
  {
    name: 'Business', monthly: 15, annual: 12, per: '/user/mo',
    desc: 'Full protection for the whole org. Scales with headcount.',
    cta: 'Start Business', href: 'https://app.ciyo.ai/onboarding?plan=business', featured: true,
    features: ['Unlimited users', 'All detection types', 'Unlimited scans', '12-month audit log', 'Division & team hierarchy', 'AI policy assistant', 'Slack + email alerting', 'Priority support'],
    missing: [],
  },
  {
    name: 'Enterprise', monthly: null, annual: null, per: '/year',
    desc: 'Custom contract for 500+ seat deployments.',
    cta: 'Talk to Sales', href: 'mailto:sales@ciyo.ai', featured: false,
    features: ['Everything in Business', 'SSO / SAML', 'Chrome Enterprise push', 'SIEM integration (Splunk, Elastic)', 'On-premise policy option', 'Custom data retention + SLAs', 'Dedicated success manager'],
    missing: [],
  },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Pricing</p>
        <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">
          Transparent Pricing
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-center text-[16px] text-[#94a3b8]">
          Start free. Scale when you need it. No surprise invoices.
        </p>

        {/* Toggle */}
        <div className="mb-12 flex items-center justify-center gap-3">
          <span className={`text-[13px] font-semibold ${!annual ? 'text-white' : 'text-[#64748b]'}`}>Monthly</span>
          <button onClick={() => setAnnual(!annual)}
            className={`relative h-6 w-11 rounded-full transition-colors ${annual ? 'bg-[#7c6aff]' : 'bg-white/10'}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-[13px] font-semibold ${annual ? 'text-white' : 'text-[#64748b]'}`}>
            Annual <span className="text-[#34d399]">— save 2 months</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {TIERS.map(({ name, monthly, annual: annualPrice, per, desc, cta, href, featured, features, missing }) => {
            const price = annual ? annualPrice : monthly
            return (
              <div key={name} className={`relative flex flex-col rounded-2xl border p-6 ${featured ? 'border-[#7c6aff] bg-gradient-to-b from-[#7c6aff]/10 to-[#17171e]' : 'border-white/[0.07] bg-[#17171e]'}`}>
                {featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#7c6aff] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Most Popular</span>}
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{name}</p>
                <div className="mb-2">
                  {price === null
                    ? <p className="text-3xl font-extrabold text-white">Custom</p>
                    : <p className="text-3xl font-extrabold text-white">{price === 0 ? 'Free' : `$${price}`}<span className="text-[12px] font-normal text-[#94a3b8]"> {per}</span></p>
                  }
                </div>
                <p className="mb-5 text-[12px] text-[#64748b]">{desc}</p>
                <ul className="mb-5 flex-1 space-y-2">
                  {features.map(f => <li key={f} className="flex gap-2 text-[12px] text-[#94a3b8]"><span className="text-[#34d399] shrink-0">✓</span>{f}</li>)}
                  {missing.map(f => <li key={f} className="flex gap-2 text-[12px] text-[#4b5563]"><span className="shrink-0">–</span>{f}</li>)}
                </ul>
                <Link href={href} className={`block rounded-xl py-2.5 text-center text-[13px] font-bold transition ${featured ? 'bg-[#7c6aff] text-white hover:bg-[#6b59ee]' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'}`}>
                  {cta}
                </Link>
              </div>
            )
          })}
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">Frequently asked questions</h2>
          {[
            ['What counts as a scan?', 'Every time the Pretzel extension evaluates a prompt against your policy rules counts as one scan. Scans are counted when a prompt is submitted, not when the page loads.'],
            ['Can I change plans at any time?', 'Yes. Upgrade instantly from the Console Settings page. Downgrade takes effect at the next billing cycle.'],
            ['What happens when I hit my scan limit?', 'On the free tier, the extension continues to run but the Console shows an upgrade prompt. Paid tiers have generous limits — most teams never hit them.'],
            ['Do you store the contents of prompts?', 'No. Pretzel only stores the outcome (warn/block), which rule triggered, and the site URL. We never store the actual prompt text.'],
            ['Is there a free trial on paid tiers?', '14-day free trial on Business. No credit card required to start.'],
          ].map(([q, a]) => (
            <details key={q as string} className="mb-3 rounded-xl border border-white/[0.07] bg-[#17171e] p-5">
              <summary className="cursor-pointer text-[14px] font-semibold text-white">{q}</summary>
              <p className="mt-3 text-[13px] text-[#94a3b8]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: Pricing page with annual/monthly toggle"
```

---

## Task 8: Product Page

**Files:**
- Create: `app/product/page.tsx`

- [ ] **Step 1: Write `app/product/page.tsx`**

```tsx
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product',
  description: 'How Pretzel protects your team — extension, console, AI assistant, and analytics.',
}

const SECTIONS = [
  {
    tag: 'Browser Extension',
    headline: 'Intercepts prompts before they're sent',
    body: `Pretzel sits silently in your browser and scans every prompt the moment you type it. When a keyword, pattern, or high-entropy string (like an API key) is detected, Pretzel shows an inline warning — or blocks the send button entirely.

It works on ChatGPT, Claude, Gemini, Perplexity, and any other AI site you configure. No proxy required. No network changes. Just a Chrome extension and a policy.`,
    img: '/images/extension-screenshot.png',
    imgAlt: 'Pretzel extension blocking a prompt with an inline warning',
  },
  {
    tag: 'Pretzel Console',
    headline: 'Manage policies for your whole company',
    body: `The Pretzel Console is where your security team configures what gets blocked. Create subjects (like "Customer PII" or "Source Code"), attach rules (keywords, regex, entropy detection), and scope them to the whole org, a division, or a specific team.

One click publishes your new policy to every employee's browser. No MDM required for updates.`,
    img: '/images/console-screenshot.png',
    imgAlt: 'Pretzel Console showing policy subjects and rules',
  },
  {
    tag: 'AI Policy Assistant',
    headline: 'Manage security in plain English',
    body: `The hardest part of DLP is knowing what to block. The Pretzel AI assistant makes it conversational.

"Block any prompt from the Finance team that contains a credit card number." Done. The assistant creates a regex rule, scopes it to the Finance team, and proposes it for your approval — all in seconds.

It can also audit your existing policy, flag gaps for HIPAA or SOC2, and generate an executive summary of last week's events.`,
    img: '/images/assistant-screenshot.png',
    imgAlt: 'Pretzel AI assistant creating a rule from a natural language request',
  },
]

export default function ProductPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Product</p>
        <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">
          How Pretzel Protects Your Team
        </h1>
        <p className="mx-auto mb-20 max-w-xl text-center text-[16px] text-[#94a3b8]">
          Three surfaces, one mission: make sure sensitive data never reaches an AI it shouldn't.
        </p>

        {SECTIONS.map(({ tag, headline, body, img, imgAlt }, i) => (
          <div key={tag} className={`mb-24 flex flex-col gap-12 md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
            <div className="flex-1">
              <span className="mb-4 inline-block rounded-full border border-[#7c6aff]/30 bg-[#7c6aff]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#a78bfa]">{tag}</span>
              <h2 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-white">{headline}</h2>
              {body.split('\n\n').map((para, j) => (
                <p key={j} className="mb-4 text-[15px] leading-relaxed text-[#94a3b8]">{para}</p>
              ))}
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10">
              <Image src={img} alt={imgAlt} width={800} height={500} className="w-full" />
            </div>
          </div>
        ))}

        <div className="text-center">
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `console-screenshot.png` and `assistant-screenshot.png` to `public/images/`** — take or create screenshots of the Console dashboard and AI assistant chat.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Product page"
```

---

## Task 9: Solutions Pages (4 Industry Verticals)

**Files:**
- Create: `app/solutions/[industry]/page.tsx`
- Create: `app/solutions/page.tsx`

- [ ] **Step 1: Write the industry page template**

```tsx
// app/solutions/[industry]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const INDUSTRIES = {
  healthcare: {
    name: 'Healthcare',
    headline: 'HIPAA-compliant AI usage for clinical and ops teams',
    problem: 'Healthcare employees use ChatGPT to draft patient communications, summarize clinical notes, and research treatments. Without guardrails, PHI — names, DOBs, diagnoses — ends up in AI training data.',
    solution: 'Pretzel blocks 18 HIPAA-defined PHI identifiers from reaching any AI tool. One-click activate the Healthcare policy template and your team is covered in minutes.',
    rules: ['Patient name + date-of-birth patterns', 'Diagnosis and ICD-10 code detection', 'Insurance member ID patterns', 'Medical record number formats'],
    stat: { num: '94%', label: 'of healthcare orgs had at least one AI-related data concern in 2025' },
    cta: 'Download Free HIPAA AI Policy Template',
    ctaHref: '/blog/hipaa-ai-policy-template',
  },
  legal: {
    name: 'Legal',
    headline: 'Protect attorney-client privilege in the age of AI',
    problem: 'Associates use AI to draft contracts, research case law, and summarize depositions. Pasting privileged communications into a public AI service can waive attorney-client privilege.',
    solution: 'Pretzel blocks client names, matter numbers, and privileged document keywords. Scope rules to the legal team only so the rest of the org is unaffected.',
    rules: ['Client name and matter number detection', 'Document classification markers', 'Deposition and filing keywords', 'Court-confidential pattern detection'],
    stat: { num: '67%', label: 'of Am Law 200 firms have no AI usage policy as of 2026' },
    cta: 'Download Free Legal AI Usage Policy',
    ctaHref: '/blog/legal-ai-usage-policy',
  },
  fintech: {
    name: 'Fintech',
    headline: 'Keep PCI, AML, and trading data out of AI tools',
    problem: 'Finance teams use AI to analyze transactions, draft reports, and model portfolios. Card numbers, account details, and non-public financial information must never reach a third-party AI.',
    solution: 'Pretzel\'s fintech template covers PCI-DSS card patterns, AML watchlist keywords, and MNPI detection. Block or warn based on risk level per team.',
    rules: ['Luhn-validated credit card patterns', 'IBAN and account number formats', 'Insider trading trigger phrases', 'AML flag terms'],
    stat: { num: '$4.5B', label: 'in financial regulatory fines tied to information security failures in 2025' },
    cta: 'Download Free Fintech AI Risk Template',
    ctaHref: '/blog/fintech-ai-risk-template',
  },
  engineering: {
    name: 'Engineering',
    headline: 'Stop IP and credentials from leaving your codebase',
    problem: 'Developers paste production configs, API keys, connection strings, and proprietary algorithms into AI coding assistants every day. This is the single most common Pretzel use case.',
    solution: 'Pretzel\'s entropy detection catches API keys and tokens even if they\'re not in your keyword list. Keyword rules catch specific internal project names, client names, and database schemas.',
    rules: ['High-entropy string detection (API keys, tokens)', 'AWS/GCP/Azure key pattern matching', 'Database connection string patterns', 'Internal project name blocklist'],
    stat: { num: '1 in 3', label: 'developer AI prompts contain at least one credential or secret (ciyo.ai data, 2026)' },
    cta: 'Download Free Engineering AI Security Starter',
    ctaHref: '/blog/engineering-ai-security-starter',
  },
} as const

type Industry = keyof typeof INDUSTRIES

export function generateStaticParams() {
  return Object.keys(INDUSTRIES).map(industry => ({ industry }))
}

export function generateMetadata({ params }: { params: { industry: string } }): Metadata {
  const data = INDUSTRIES[params.industry as Industry]
  if (!data) return {}
  return {
    title: `${data.name} — Pretzel AI Security`,
    description: data.headline,
  }
}

export default function SolutionPage({ params }: { params: { industry: string } }) {
  const data = INDUSTRIES[params.industry as Industry]
  if (!data) notFound()

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Link href="/solutions" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[#94a3b8] hover:text-white">
          ← All solutions
        </Link>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">{data.name}</p>
        <h1 className="mb-5 text-5xl font-extrabold tracking-tight text-white">{data.headline}</h1>

        <div className="mb-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6 text-center">
          <span className="text-4xl font-extrabold text-white">{data.stat.num}</span>
          <p className="mt-1 text-[13px] text-[#94a3b8]">{data.stat.label}</p>
        </div>

        <h2 className="mb-3 text-xl font-bold text-white">The Problem</h2>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">{data.problem}</p>

        <h2 className="mb-3 text-xl font-bold text-white">How Pretzel Helps</h2>
        <p className="mb-6 text-[15px] leading-relaxed text-[#94a3b8]">{data.solution}</p>

        <ul className="mb-12 space-y-3">
          {data.rules.map(r => (
            <li key={r} className="flex items-center gap-3 text-[14px] text-[#94a3b8]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#34d399]/10 text-[#34d399] text-[12px]">✓</span>
              {r}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[14px] font-bold text-white transition hover:bg-[#6b59ee]">
            Start Free — Pre-built {data.name} Template Included
          </Link>
          <Link href={data.ctaHref}
            className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
            {data.cta} →
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `app/solutions/page.tsx`** — index listing all 4 industries with links to each.

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Solutions',
  description: 'Pretzel AI security solutions for healthcare, legal, fintech, and engineering teams.',
}

const INDUSTRIES = [
  { slug: 'healthcare', name: 'Healthcare', icon: '🏥', desc: 'Block PHI and HIPAA-regulated data from reaching AI tools.' },
  { slug: 'legal', name: 'Legal', icon: '⚖️', desc: 'Protect attorney-client privilege and confidential matter data.' },
  { slug: 'fintech', name: 'Fintech', icon: '💳', desc: 'Block PCI card data, AML triggers, and MNPI from AI prompts.' },
  { slug: 'engineering', name: 'Engineering', icon: '💻', desc: 'Catch credentials, API keys, and proprietary code in AI inputs.' },
]

export default function SolutionsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Solutions</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">By Industry</h1>
        <p className="mx-auto mb-16 max-w-lg text-[16px] text-[#94a3b8]">
          Every industry has different data to protect. Pretzel ships with starter templates for each.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {INDUSTRIES.map(({ slug, name, icon, desc }) => (
            <Link key={slug} href={`/solutions/${slug}`}
              className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 text-left transition hover:border-[#7c6aff]/30 hover:-translate-y-1">
              <span className="mb-3 block text-3xl">{icon}</span>
              <h2 className="mb-2 text-[18px] font-bold text-white">{name}</h2>
              <p className="text-[13px] text-[#94a3b8]">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Solutions index and industry pages (Healthcare, Legal, Fintech, Engineering)"
```

---

## Task 10: Security Page + About Page

**Files:**
- Create: `app/security/page.tsx`
- Create: `app/about/page.tsx`

- [ ] **Step 1: Write `app/security/page.tsx`**

```tsx
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Security & Trust', description: 'How Pretzel handles your data — encryption, retention, and compliance.' }

const POINTS = [
  { icon: '🔒', title: 'Prompt content is never stored', body: 'Pretzel only records the outcome: which rule fired, which site, which user. The actual text of the prompt is never transmitted to our servers or stored anywhere.' },
  { icon: '🔐', title: 'Encryption in transit and at rest', body: 'All API traffic uses TLS 1.3. Data at rest is encrypted with AES-256. Your org token is hashed with bcrypt — we cannot recover it.' },
  { icon: '📋', title: 'SOC 2 Type II — in progress', body: 'We are actively working toward SOC 2 Type II certification. Our security practices are designed to meet those controls now, before the audit.' },
  { icon: '🇪🇺', title: 'GDPR & CCPA ready', body: 'Data is stored in the EU by default. We support data deletion requests within 30 days. We are happy to sign a DPA (Data Processing Agreement) for enterprise customers.' },
  { icon: '🐛', title: 'Responsible disclosure', body: 'Found a vulnerability? Email security@ciyo.ai. We aim to respond within 24 hours and fix within 7 days for critical issues.' },
]

export default function SecurityPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Security & Trust</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">How We Handle Your Data</h1>
        <p className="mb-16 text-[16px] text-[#94a3b8]">CISOs ask hard questions. Here are honest answers.</p>
        <div className="space-y-4">
          {POINTS.map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <h2 className="text-[17px] font-bold text-white">{title}</h2>
              </div>
              <p className="text-[14px] leading-relaxed text-[#94a3b8]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `app/about/page.tsx`** — brief, human, honest team page.

```tsx
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'About', description: 'The story behind ciyo.ai and Pretzel.' }

export default function AboutPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">About</p>
        <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white">Built for the AI-era by people who lived the problem</h1>
        <div className="space-y-4 text-[15px] leading-relaxed text-[#94a3b8]">
          <p>We watched teams at fast-growing companies adopt ChatGPT overnight — and watched their security teams scramble to catch up. Existing DLP tools weren't built for a world where every employee has a direct line to a public AI model.</p>
          <p>Pretzel started as a simple Chrome extension to block PII from leaving the browser. It's grown into a full policy platform that lets security teams configure, enforce, and audit AI usage across their entire organization.</p>
          <p>We're ciyo.ai — a small team obsessed with making enterprise security tools that people actually install, use, and recommend to peers. We're funded by customers, not VCs.</p>
        </div>
        <div className="mt-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6">
          <p className="text-[14px] font-semibold text-white">Want to talk?</p>
          <p className="mt-1 text-[13px] text-[#94a3b8]">hello@ciyo.ai — we read every email and reply to most of them.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Security and About pages"
```

---

## Task 11: Blog Infrastructure + First Post

**Files:**
- Create: `contentlayer.config.ts`
- Create: `app/blog/page.tsx`
- Create: `app/blog/[slug]/page.tsx`
- Create: `content/blog/2026-06-ai-prompt-leakage.mdx`

- [ ] **Step 1: Write `contentlayer.config.ts`**

```typescript
import { defineDocumentType, makeSource } from 'contentlayer2/source-files'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'

export const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: 'blog/**/*.mdx',
  contentType: 'mdx',
  fields: {
    title:       { type: 'string', required: true },
    description: { type: 'string', required: true },
    date:        { type: 'date', required: true },
    tag:         { type: 'string', required: false },
    leadMagnet:  { type: 'boolean', required: false, default: false },
  },
  computedFields: {
    slug: { type: 'string', resolve: (doc) => doc._raw.flattenedPath.replace('blog/', '') },
    url:  { type: 'string', resolve: (doc) => `/blog/${doc._raw.flattenedPath.replace('blog/', '')}` },
  },
}))

export default makeSource({
  contentDirPath: 'content',
  documentTypes: [Post],
  mdx: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, rehypeHighlight] },
})
```

- [ ] **Step 2: Install contentlayer deps**

```bash
npm install remark-gfm rehype-slug rehype-highlight
```

- [ ] **Step 3: Write first blog post `content/blog/2026-06-ai-prompt-leakage.mdx`**

```mdx
---
title: "5 Types of Data Your Team Is Accidentally Leaking to ChatGPT"
description: "We analysed 100,000 AI prompts. Here's what security teams found and how Pretzel stops it."
date: 2026-06-01
tag: Report
leadMagnet: true
---

Every week, your team sends thousands of prompts to ChatGPT, Claude, and Gemini. Most are harmless. But based on data from the Pretzel platform, **roughly 1 in 8 prompts from business users contains at least one piece of sensitive data**.

Here are the five categories we see most often — and what you can do about each one.

## 1. Customer PII

Names, email addresses, phone numbers, and dates of birth appear in prompts when employees ask AI to "draft an email to John Smith at Acme Corp" or "summarise this support ticket." Under GDPR and CCPA, this data cannot be shared with a third party without consent.

**Pretzel rule type:** keyword + pattern matching on email formats, phone formats, and common PII field labels.

## 2. API Keys & Credentials

Developers paste configuration snippets, `.env` files, and connection strings into AI coding assistants constantly. The AI never "stores" it — but it does use it for training on some platforms.

**Pretzel rule type:** entropy detection. High-entropy strings that match known key formats (AWS, GCP, GitHub PATs) are automatically flagged.

## 3. Financial Data

Card numbers, IBAN codes, account balances, and revenue figures appear in finance team prompts. This is PCI-DSS scope.

**Pretzel rule type:** Luhn-validated card patterns, IBAN regex, and keyword blocks for internal financial terms.

## 4. Client & Matter Names (Legal)

Legal teams asking AI to summarise a deposition or draft a contract clause often include client names and matter numbers — privileged information.

**Pretzel rule type:** Custom keyword blocklist scoped to the Legal team only.

## 5. Internal Project Code Names

Companies use code names for products, M&A targets, and pending announcements. These appear in AI prompts when employees discuss roadmaps or draft announcements.

**Pretzel rule type:** Keyword block on a custom internal code name list.

---

## Download the Free Policy Template

We've compiled all of the above into a ready-to-import Pretzel policy template. [Start free and activate it in one click →](https://app.ciyo.ai/onboarding)
```

- [ ] **Step 4: Write `app/blog/page.tsx`** — blog index listing all posts sorted by date.

```tsx
import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'
import { compareDesc, format } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Blog', description: 'Insights on AI security, data loss prevention, and enterprise AI governance.' }

export default function BlogPage() {
  const posts = allPosts.sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Blog</p>
        <h1 className="mb-12 text-4xl font-extrabold tracking-tight text-white">Insights on AI Security</h1>
        {posts.map(post => (
          <Link key={post.slug} href={post.url}
            className="mb-6 block rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 transition hover:border-[#7c6aff]/30">
            {post.tag && <span className="mb-2 inline-block rounded-full bg-[#7c6aff]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a78bfa]">{post.tag}</span>}
            <h2 className="mb-2 text-[18px] font-bold text-white">{post.title}</h2>
            <p className="mb-3 text-[13px] text-[#94a3b8]">{post.description}</p>
            <time className="text-[11px] text-[#64748b]">{format(new Date(post.date), 'MMMM d, yyyy')}</time>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: blog infrastructure with contentlayer and first post"
```

---

## Task 12: SEO & Deployment

**Files:**
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`
- Create: `vercel.json`
- Create: `.env.local`

- [ ] **Step 1: Write `app/sitemap.ts`**

```typescript
import { allPosts } from 'contentlayer/generated'
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['/', '/product', '/pricing', '/solutions', '/solutions/healthcare', '/solutions/legal', '/solutions/fintech', '/solutions/engineering', '/security', '/about', '/blog']
  const posts = allPosts.map(p => ({ url: `https://ciyo.ai${p.url}`, lastModified: new Date(p.date) }))
  return [
    ...staticRoutes.map(route => ({ url: `https://ciyo.ai${route}`, lastModified: new Date() })),
    ...posts,
  ]
}
```

- [ ] **Step 2: Write `app/robots.ts`**

```typescript
import type { MetadataRoute } from 'next'
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' }, sitemap: 'https://ciyo.ai/sitemap.xml' }
}
```

- [ ] **Step 3: Configure Vercel deployment** — create `vercel.json`

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

- [ ] **Step 4: Push to GitHub and connect Vercel**

```bash
git add -A && git commit -m "feat: sitemap, robots, and Vercel config"
git remote add origin https://github.com/ciyo-ai/ciyo-web.git
git push -u origin main
# Then: vercel.com → Import Git Repository → ciyo-ai/ciyo-web → set domain to ciyo.ai
```

---

## Appendix A: Video Content Plan

This is a content/production plan, not an engineering task. Execute after the website is live.

### Video 1 — Product Explainer (90 seconds)

**Goal:** Explain what Pretzel is to someone who has never heard of it. Lives on the Home page VideoDemo section.

**Script outline:**
```
[0:00–0:10] HOOK — "Every week your team sends thousands of prompts to ChatGPT. 
            Some of those prompts contain secrets."
[0:10–0:25] PROBLEM — show a developer pasting an API key into ChatGPT
[0:25–0:50] SOLUTION — show Pretzel's warning popup appearing inline, blocking the send
[0:50–1:10] SETUP — show the Console: "Configure once, protect everyone. 
            Pretzel syncs your policy to every browser automatically."
[1:10–1:25] AI ASSISTANT — "Ask it in plain English. 'Block SSNs for Finance.'"
[1:25–1:30] CTA — "Start free at ciyo.ai. Installs in 30 seconds."
```

**Production options (in order of cost):**

| Tool | Type | Cost | Best for |
|---|---|---|---|
| **Loom** (free) | Screen recording | Free | Fast demo, founder narrates — ship this first |
| **HeyGen** | AI avatar presenter | ~$30/video | Polished, no camera needed — use for V2 |
| **Synthesia** | Text-to-video | ~$22/month | Scripts → video, 120+ languages |
| **Sora (OpenAI)** | AI video generation | Waitlist | Cinematic B-roll, product mood reel |
| **Runway Gen-3** | AI video generation | ~$15/month | Short clips, visual effects |

**Recommended approach:** Record with Loom first (free, ships in a day). Use HeyGen for a polished V2 once you have paying customers to justify the spend.

### Video 2 — Getting Started Tutorial (3–5 minutes)

**Goal:** Walk a new admin through installing the extension, configuring their first policy, and inviting their team.

**Chapters:**
1. Installing the Chrome extension (0:00–0:45)
2. Creating your first policy subject (0:45–1:30)
3. Adding a keyword rule (1:30–2:15)
4. Publishing the policy (2:15–2:45)
5. Inviting team members (2:45–3:30)
6. Viewing your first analytics (3:30–4:00)

**Tool:** Loom with chapter markers. Embed in docs.ciyo.ai getting-started guide.

### Video 3 — Industry-specific demos (2 min each)

One per industry vertical. Show the Healthcare/Legal/Fintech/Engineering policy template being activated and a relevant prompt being blocked. Lives on the `/solutions/[industry]` pages.

---
