import { describe, it, expect, vi, beforeEach } from 'vitest'

// Groq decommissioned llama-3.3-70b-versatile on 2026-08-16 (confirmed live on
// staging via Sentry: 404 "The model `llama-3.3-70b-versatile` does not exist
// or you do not have access to it", breaking every /v1/assistant/chat call).
// Pin the model string so a future regression back to a retired model fails
// here instead of live in production.
const createMock = vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"reply":"ok","actions":[]}' } }],
})

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: createMock } }
  },
}))

import { GroqLlmService } from '../src/assistant/llm/groq.js'

beforeEach(() => {
  createMock.mockClear()
  process.env.GROQ_API_KEY ??= 'test-groq-key'
})

describe('GroqLlmService.chat', () => {
  it('requests a model Groq currently serves, not the retired llama-3.3-70b-versatile', async () => {
    const service = new GroqLlmService()
    await service.chat('system', [], 'hello')

    expect(createMock).toHaveBeenCalledTimes(1)
    const { model } = createMock.mock.calls[0]![0]
    expect(model).not.toBe('llama-3.3-70b-versatile')
    expect(model).toBe('openai/gpt-oss-120b')
  })
})
