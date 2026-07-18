export interface Post {
  slug: string
  title: string
  description: string
  date: string
  tag?: string
  content: string
}

const LIMIT = `Pretzel currently evaluates prompts locally for authenticated Chrome extension users on supported ChatGPT, Claude, and Gemini hosts. Administrators can configure pattern, entropy, dictionary, and score rules with warn or block actions, then publish policy from the Console.

Detection is best-effort. These examples are not legal advice, compliance guarantees, or evidence that a particular rule will detect every sensitive value.`

export const posts: Post[] = [
  { slug: 'ai-prompt-leakage', title: 'Configuring Prompt Data Rules', description: 'Examples of limitation-aware prompt policy configuration.', date: '2026-06-01', tag: 'Guide', content: `${LIMIT}\n\n## Example categories\n\nOrganizations can configure dictionary terms, structured patterns, entropy thresholds, and score rules based on their own risk model.` },
  { slug: 'hipaa-ai-policy-template', title: 'Healthcare Prompt Policy Considerations', description: 'Examples for configuring healthcare-related prompt policy.', date: '2026-06-03', tag: 'Healthcare', content: `${LIMIT}\n\n## Configuration examples\n\nAn administrator may configure patient identifier terms and medical record formats. Consult qualified counsel for healthcare privacy obligations.` },
  { slug: 'legal-ai-usage-policy', title: 'Legal Prompt Policy Considerations', description: 'Examples for configuring legal-related prompt policy.', date: '2026-06-04', tag: 'Legal', content: `${LIMIT}\n\n## Configuration examples\n\nAn administrator may configure client names, matter identifiers, and confidentiality markers. Consult qualified counsel for professional obligations.` },
  { slug: 'fintech-ai-risk-template', title: 'Financial Prompt Policy Considerations', description: 'Examples for configuring financial prompt policy.', date: '2026-06-05', tag: 'Finance', content: `${LIMIT}\n\n## Configuration examples\n\nAn administrator may configure account patterns, deal codenames, and organization-specific terms. Consult qualified counsel for financial obligations.` },
  { slug: 'engineering-ai-security-starter', title: 'Engineering Prompt Policy Considerations', description: 'Examples for configuring engineering prompt policy.', date: '2026-06-06', tag: 'Engineering', content: `${LIMIT}\n\n## Configuration examples\n\nAn administrator may combine entropy detection, credential patterns, and internal project dictionaries.` },
]

export function getPost(slug: string): Post | undefined {
  return posts.find(post => post.slug === slug)
}

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date))
}
