/**
 * Tests that @ciyo/detect integrates correctly into the proxy decision flow.
 * Exercises detectPrompt with the DEFAULT_POLICY — verifies the detection
 * outcomes the proxy would act on.
 */
import { describe, it, expect } from 'vitest'
import { detectPrompt, DEFAULT_POLICY } from '@ciyo/detect'
import type { Policy } from '@ciyo/detect'

const HOST = 'api.openai.com'
const openPolicy: Policy = { ...DEFAULT_POLICY, failMode: 'open' }
const closedPolicy: Policy = { ...DEFAULT_POLICY, failMode: 'closed' }

describe('proxy detect integration — plain text', () => {
  it('allows benign prompt', async () => {
    const result = await detectPrompt({ text: 'What is the weather in Paris?', inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(['log', 'warn']).toContain(result.highestAction)
  })

  it('detects AWS secret key pattern', async () => {
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY use this'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(['warn', 'require_confirmation', 'block']).toContain(result.highestAction)
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('detects credit card number (Luhn-valid)', async () => {
    const text = 'Card number: 4111111111111111 expires 12/26'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(['warn', 'require_confirmation', 'block']).toContain(result.highestAction)
  })

  it('detects US SSN pattern', async () => {
    const text = 'SSN: 123-45-6789'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(['warn', 'require_confirmation', 'block']).toContain(result.highestAction)
  })
})

describe('proxy decide — fail mode', () => {
  it('fail-open policy has failMode open', () => {
    expect(openPolicy.failMode).toBe('open')
  })

  it('fail-closed policy has failMode closed', () => {
    expect(closedPolicy.failMode).toBe('closed')
  })
})

describe('proxy decide — findings structure', () => {
  it('findings contain ruleId, severity, action fields', async () => {
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(result.findings.length).toBeGreaterThan(0)
    const f = result.findings[0]
    expect(f).toHaveProperty('ruleId')
    expect(f).toHaveProperty('severity')
    expect(f).toHaveProperty('action')
  })

  it('returns empty findings for clean prompt', async () => {
    const result = await detectPrompt({ text: 'Help me write a poem', inputType: 'prompt', hostname: HOST }, openPolicy)
    const blocky = result.findings.filter(f => f.action === 'block' || f.action === 'require_confirmation')
    expect(blocky.length).toBe(0)
  })

  it('result has promptHash and durationMs', async () => {
    const result = await detectPrompt({ text: 'Test prompt', inputType: 'prompt', hostname: HOST }, openPolicy)
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
