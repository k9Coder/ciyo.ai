import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, LlmChatOptions } from './interface.js'
import { parseResponse } from './openai.js'

export class GroqLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey:  process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'llama-3.3-70b-versatile',
      max_tokens:      opts?.maxTokens ?? 2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}
