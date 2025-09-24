export interface Factoid {
  id: string;
  text: string;
  subject: string;
  emoji: string;
  created_at: string;
  updated_at: string;
  votes_up: number;
  votes_down: number;
  generation_metadata?: Record<string, unknown>;
  cost_usd?: number | null;
}

export interface RateLimitStatus {
  profile: string;
  rate_limit: {
    per_minute: number;
    per_hour?: number | null;
    per_day?: number | null;
    current_window_requests: number;
  };
  cost_budget_remaining: number | null;
}

export interface PaginatedResponse<T> {
  results: T[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export interface CheckoutSessionResponse {
  session_id: string;
  checkout_url?: string | null;
  publishable_key?: string | null;
}

export type ChatMessageRole = "user" | "assistant" | "tool";

export interface ChatToolCall {
  id: string | null;
  tool_name: string;
  arguments?: Record<string, unknown> | null;
  result?: unknown;
}

export interface ChatMessage {
  id: number;
  role: ChatMessageRole;
  content: unknown;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatSessionSummary {
  id: string;
  status: string;
  model_key: string;
  factoid_id?: string | null;
  created_at: string;
  last_activity_at?: string | null;
}

export interface ChatRateLimitSnapshot {
  per_minute: number;
  current_window_requests: number;
}

export interface ChatSessionResponse {
  session: ChatSessionSummary;
  messages: ChatMessage[];
  rate_limit: ChatRateLimitSnapshot;
}

export interface ChatRateLimitErrorData {
  detail: string;
  code: "rate_limit";
  retry_after: number;
  rate_limit: ChatRateLimitSnapshot;
  checkout_session?: CheckoutSessionResponse;
}
