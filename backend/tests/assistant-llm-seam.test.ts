import { describe, it, expect, afterEach } from 'vitest'
import { getLlmClient } from '../src/assistant/llm/index.js'
import { GroqLlmService } from '../src/assistant/llm/groq.js'
import { OpenAiLlmService } from '../src/assistant/llm/openai.js'
import { AnthropicLlmService } from '../src/assistant/llm/anthropic.js'

// The seam constructs the concrete OpenAI/Anthropic SDK clients eagerly, but no
// network call happens until .chat() is invoked — so instantiation is safe here.
const original = process.env.LLM_PROVIDER

// The SDK clients throw if no key is present; provide dummies so construction
// succeeds without any network call.
process.env.GROQ_API_KEY      ??= 'test-groq-key'
process.env.OPENAI_API_KEY    ??= 'test-openai-key'
process.env.ANTHROPIC_API_KEY ??= 'test-anthropic-key'

afterEach(() => { process.env.LLM_PROVIDER = original })

describe('getLlmClient (provider seam)', () => {
  it('returns the Groq implementation when LLM_PROVIDER=groq (production pilot path)', async () => {
    process.env.LLM_PROVIDER = 'groq'
    const client = await getLlmClient()
    expect(client).toBeInstanceOf(GroqLlmService)
  })

  it('returns the OpenAI implementation when LLM_PROVIDER=openai', async () => {
    process.env.LLM_PROVIDER = 'openai'
    const client = await getLlmClient()
    expect(client).toBeInstanceOf(OpenAiLlmService)
  })

  it('falls back to Anthropic when LLM_PROVIDER is unset/unknown', async () => {
    delete process.env.LLM_PROVIDER
    const client = await getLlmClient()
    expect(client).toBeInstanceOf(AnthropicLlmService)
  })
})
