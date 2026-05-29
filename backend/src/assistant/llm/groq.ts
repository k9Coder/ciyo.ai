import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, Action } from './interface.js'

export class GroqLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey:  process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'llama-3.3-70b-versatile',
      max_tokens:      2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}

function parseResponse(text: string): LlmResponse {
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
