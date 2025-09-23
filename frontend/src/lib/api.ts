import type {
  CheckoutSessionResponse,
  Factoid,
  PaginatedResponse,
  RateLimitStatus,
} from "@/lib/types";

const DEFAULT_FACTOIDS_BASE = "http://localhost:8000/api/factoids";
const DEFAULT_PAYMENTS_BASE = "http://localhost:8000/api/payments";

function inferPaymentsBase(factoidsBase: string): string {
  const trimmed = factoidsBase.replace(/\/$/, "");
  if (trimmed.endsWith("/factoids")) {
    return `${trimmed.slice(0, -"/factoids".length)}/payments`;
  }
  return DEFAULT_PAYMENTS_BASE;
}

export const FACTOIDS_API_BASE =
  process.env.NEXT_PUBLIC_FACTOIDS_API_BASE?.replace(/\/$/, "") || DEFAULT_FACTOIDS_BASE;

export const PAYMENTS_API_BASE =
  process.env.NEXT_PUBLIC_PAYMENTS_API_BASE?.replace(/\/$/, "") ||
  inferPaymentsBase(FACTOIDS_API_BASE);

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function apiRequest<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const rawBody = await response.text();
  let parsed: unknown = rawBody;
  let isJson = false;

  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
      isJson = true;
    } catch {
      parsed = rawBody;
    }
  } else {
    parsed = null;
    isJson = response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
  }

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    if (isJson && parsed && typeof parsed === "object" && "detail" in parsed) {
      const detail = (parsed as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) {
        message = detail;
      }
    } else if (!isJson && typeof parsed === "string" && parsed.trim()) {
      message = parsed;
    }

    throw new ApiError(message, response.status, parsed);
  }

  if (isJson) {
    return parsed as T;
  }

  if (typeof parsed === "string" && parsed.length === 0) {
    return undefined as T;
  }

  return parsed as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(FACTOIDS_API_BASE, path, init);
}

export async function fetchFactoids(pageSize = 20): Promise<Factoid[]> {
  const data = await request<PaginatedResponse<Factoid>>(`/?page_size=${pageSize}`);
  return data.results;
}

export async function fetchRandomFactoids(limit = 50): Promise<Factoid[]> {
  const data = await request<{ results: Factoid[] }>(`/random/?limit=${limit}`);
  return data.results;
}

export async function fetchFactoidById(id: string): Promise<Factoid> {
  return request<Factoid>(`/${id}/`);
}

export interface GenerateFactoidOptions {
  posthogDistinctId?: string;
  posthogProperties?: Record<string, unknown>;
}

export async function generateFactoid(
  topic?: string,
  modelKey?: string,
  options: GenerateFactoidOptions = {}
): Promise<Factoid> {
  const payload: Record<string, unknown> = {};

  if (topic) {
    payload.topic = topic;
  }
  if (modelKey) {
    payload.model_key = modelKey;
  }
  if (options.posthogDistinctId) {
    payload.posthog_distinct_id = options.posthogDistinctId;
  }
  if (options.posthogProperties && Object.keys(options.posthogProperties).length > 0) {
    payload.posthog_properties = options.posthogProperties;
  }

  return request<Factoid>("/generate/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitVote(factoidId: string, vote: "up" | "down"): Promise<Factoid> {
  return request<Factoid>(`/${factoidId}/vote/`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export interface FeedbackPayload {
  factoid: string;
  vote?: "up" | "down";
  comments?: string;
  tags?: string[];
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  await request("/feedback/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRateLimitStatus(): Promise<RateLimitStatus> {
  return request<RateLimitStatus>("/limits/");
}

export async function fetchModels(): Promise<string[]> {
  const data = await request<{ models: { id: string }[] }>("/models/");
  return data.models.map((model) => model.id);
}

export interface CheckoutSessionPayload {
  success_url?: string;
  cancel_url?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export async function createCheckoutSession(
  payload: CheckoutSessionPayload = {}
): Promise<CheckoutSessionResponse> {
  const requestPayload: CheckoutSessionPayload = { ...payload };
  if (!requestPayload.source) {
    requestPayload.source = "rate_limit";
  }

  return apiRequest<CheckoutSessionResponse>(PAYMENTS_API_BASE, "/checkout/", {
    method: "POST",
    body: JSON.stringify(requestPayload),
  });
}

export interface FulfillCheckoutOptions {
  topic?: string;
  modelKey?: string;
}

export async function fulfillCheckoutSession(
  sessionId: string,
  options: FulfillCheckoutOptions = {}
): Promise<Factoid> {
  const payload: Record<string, unknown> = {};
  if (options.topic) {
    payload.topic = options.topic;
  }
  if (options.modelKey) {
    payload.model_key = options.modelKey;
  }

  return apiRequest<Factoid>(
    PAYMENTS_API_BASE,
    `/checkout/${encodeURIComponent(sessionId)}/fulfill/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
