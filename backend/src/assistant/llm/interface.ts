export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score'
export type RuleAction  = 'warn' | 'block'
export type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'
export type MemberRole  = 'member' | 'division_admin' | 'super_admin'

export type Action =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string;   patch: Record<string, unknown> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Record<string, unknown> }
  | { op: 'delete_subject'; subjectId: string }
  // org management
  | { op: 'create_division'; name: string }
  | { op: 'delete_division'; divisionId: string }
  | { op: 'create_team'; name: string; divisionId: string }
  | { op: 'delete_team'; teamId: string }
  | { op: 'create_member'; email: string; role: MemberRole; displayName?: string; adminDivisionId?: string }
  | { op: 'delete_member'; memberId: string }
  | { op: 'assign_member_team'; memberId: string; teamId: string }
  | { op: 'remove_member_team'; memberId: string; teamId: string }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmResponse {
  reply: string
  actions: Action[]
}

export interface LlmChatOptions {
  maxTokens?: number
}

export interface LlmService {
  chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse>
}
