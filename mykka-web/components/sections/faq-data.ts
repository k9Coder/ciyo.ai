// Single source for the visible FAQ accordion and the FAQPage JSON-LD in app/page.tsx,
// so structured data always matches what is on the page.
export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Does prompt text leave the device?',
    answer:
      'No. Detection runs inside the browser before the prompt is submitted. What the admin sees depends on each rule\'s report level: none, action and site only, who triggered it, or the matched term.',
  },
  {
    question: 'Which AI tools are covered?',
    answer: 'ChatGPT, Claude and Gemini today. Sites are enabled per organization in the console.',
  },
  {
    question: 'What happens if the extension fails?',
    answer:
      'It fails open so work isn\'t blocked, and the console shows a "protection degraded" alert with the site and reason.',
  },
  {
    question: 'What is Pretzel?',
    answer:
      'Pretzel is a Chrome browser extension that prevents employees from accidentally sending sensitive data to AI tools like ChatGPT, Claude, and Gemini. It works by intercepting every AI prompt before it is submitted — scanning the text for personally identifiable information (PII), source code, API keys, credentials, and other sensitive content your organization needs to protect. When Pretzel detects a policy violation, it blocks the prompt and shows the user exactly what was caught. Unlike traditional data loss prevention solutions that operate at the network level, Pretzel stops leaks at the source — inside the browser, before any data is transmitted. Security administrators manage protection policies through Pretzel Console, a centralized dashboard where teams define custom detection rules, publish policy updates across the organization, and review a full audit log of every blocked event.',
  },
  {
    question: 'What is AI DLP (AI Data Loss Prevention)?',
    answer:
      'AI DLP — Artificial Intelligence Data Loss Prevention — is a category of security software designed to prevent employees from sharing sensitive organizational data with AI tools and large language models. As tools like ChatGPT, Claude, and Gemini became standard in the workplace, organizations face a new class of data leakage risk: employees pasting customer PII, source code, financial records, legal documents, and credentials into AI chat interfaces. Traditional DLP solutions were built for email, file transfers, and removable media — they cannot intercept browser-based AI prompt submissions. AI DLP tools close this gap by monitoring and blocking sensitive content at the point of input, before a prompt reaches the AI provider\'s servers. Policy-based AI DLP platforms allow security administrators to define what constitutes sensitive data, enforce different rules for different teams, and maintain audit trails for regulatory compliance.',
  },
  {
    question: 'How is browser-native AI DLP different from network DLP?',
    answer:
      'Browser-native AI DLP operates inside the web browser, intercepting prompts before they are submitted — before any data leaves the user\'s device. Network-level DLP tools sit between the corporate network and the internet, inspecting traffic after it has already been sent from the browser. This architectural difference has significant security implications. Network DLP cannot inspect encrypted HTTPS traffic without complex TLS inspection setups, which are difficult to maintain and can break modern web applications. Browser-native DLP like Pretzel operates at the point of input, reading the full unencrypted prompt text exactly as the user typed it — before encryption occurs. It also requires no network configuration changes, no proxy setup, and no IT infrastructure modifications. Employees install the extension in under a minute, and administrators configure and publish policies centrally through the Pretzel Console.',
  },
]
