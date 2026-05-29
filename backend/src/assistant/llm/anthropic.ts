import Anthropic from '@anthropic-ai/sdk'
import type { LlmService, LlmMessage, LlmResponse, Action } from './interface.js'

export class AnthropicLlmService implements LlmService {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     systemPrompt,
      messages,
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return parseResponse(text)
  }
}

function parseResponse(text: string): LlmResponse {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found')
    const parsed = JSON.parse(match[0]) as { reply?: string; actions?: unknown[] }
    return {
      reply:   typeof parsed.reply === 'string' ? parsed.reply : 'Done.',
      actions: Array.isArray(parsed.actions) ? (parsed.actions as Action[]) : [],
    }
  } catch {
    return { reply: text, actions: [] }
  }
}
