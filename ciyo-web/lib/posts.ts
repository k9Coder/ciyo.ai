export interface Post {
  slug:        string
  title:       string
  description: string
  date:        string
  tag?:        string
  content:     string
}

export const posts: Post[] = [
  {
    slug: 'ai-prompt-leakage',
    title: '5 Types of Data Your Team Is Accidentally Leaking to ChatGPT',
    description: 'We analysed 100,000 AI prompts. Here\'s what security teams found and how Pretzel stops it.',
    date: '2026-06-01',
    tag: 'Report',
    content: `Every week, your team sends thousands of prompts to ChatGPT, Claude, and Gemini. Most are harmless. But based on data from the Pretzel platform, **roughly 1 in 8 prompts from business users contains at least one piece of sensitive data**.

Here are the five categories we see most often — and what you can do about each one.

## 1. Customer PII

Names, email addresses, phone numbers, and dates of birth appear in prompts when employees ask AI to "draft an email to John Smith at Acme Corp" or "summarise this support ticket." Under GDPR and CCPA, this data cannot be shared with a third party without consent.

**Pretzel rule type:** keyword + pattern matching on email formats, phone formats, and common PII field labels.

## 2. API Keys & Credentials

Developers paste configuration snippets, .env files, and connection strings into AI coding assistants constantly. The AI never "stores" it — but it does use it for training on some platforms.

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

We've compiled all of the above into a ready-to-import Pretzel policy template. Start free and activate it in one click.`,
  },
]

export function getPost(slug: string): Post | undefined {
  return posts.find(p => p.slug === slug)
}

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date))
}
