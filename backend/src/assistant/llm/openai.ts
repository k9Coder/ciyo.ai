import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, LlmChatOptions, Action } from './interface.js'
import { env } from '../../env.js'

export class OpenAiLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      opts?.maxTokens ?? 2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}

export function parseResponse(text: string): LlmResponse {
  try {
    const parsed = JSON.parse(text) as { reply?: string; actions?: unknown[] }
    return {
      reply:   typeof parsed.reply === 'string' ? parsed.reply : 'Done.',
      actions: Array.isArray(parsed.actions) ? (parsed.actions as Action[]) : [],
    }
  } catch {
    return { reply: text, actions: [] }
  }
}
