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
