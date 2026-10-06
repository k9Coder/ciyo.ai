import React, { useState } from 'react'
import { Logo } from '../shared/Logo'

interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Pretzel',
    body: "Pretzel checks what you send to ChatGPT, Claude, and Gemini against your organisation's policy, and steps in before anything sensitive leaves your machine.",
  },
  {
    title: 'The tray icon tells you the state',
    body: 'Green means everything is active and checking traffic. Amber means the proxy is running but no policy is loaded yet. Red means protection is off.',
  },
  {
    title: 'Sign in to load real protection',
    body: "Until you sign in, Pretzel has no rules to check against — nothing is protected. Signing in loads your organisation's policy in seconds.",
  },
  {
    title: "You'll see a popup when something's flagged",
    body: 'If a message matches a policy rule, a window appears before it sends — you can block it or allow it through, depending on the rule.',
  },
]

export function WalkthroughView({ onDone }: { onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]!
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div className="app fade-in walkthrough">
      <div className="walkthrough-body">
        <Logo size={40} />
        <p className="walkthrough-title">{step.title}</p>
        <p className="walkthrough-text">{step.body}</p>
      </div>

      <div className="walkthrough-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={`walkthrough-dot ${i === stepIndex ? 'active' : ''}`} />
        ))}
      </div>

      <div className="walkthrough-actions">
        <button className="link-btn" onClick={onDone}>Skip</button>
        <button
          className="btn btn-primary"
          onClick={() => (isLast ? onDone() : setStepIndex((i) => i + 1))}
        >
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  )
}
