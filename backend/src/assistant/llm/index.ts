import type { LlmService } from './interface.js'
import { env } from '../../env.js'

// Provider selection seam. Router and tests both import from here so that the
// concrete provider is chosen in exactly one place; tests mock THIS module
// (env-independent) rather than a specific provider implementation.
export async function getLlmClient(): Promise<LlmService> {
  if (env.LLM_PROVIDER === 'openai') {
    const { OpenAiLlmService } = await import('./openai.js')
    return new OpenAiLlmService()
  }
  if (env.LLM_PROVIDER === 'groq') {
    const { GroqLlmService } = await import('./groq.js')
    return new GroqLlmService()
  }
  const { AnthropicLlmService } = await import('./anthropic.js')
  return new AnthropicLlmService()
}
