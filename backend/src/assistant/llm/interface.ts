export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score'
export type RuleAction  = 'warn' | 'block'
export type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'

export type Action =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string;   patch: Record<string, unknown> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Record<string, unknown> }
  | { op: 'delete_subject'; subjectId: string }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmResponse {
  reply: string
  actions: Action[]
}

export interface LlmService {
  chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse>
}
