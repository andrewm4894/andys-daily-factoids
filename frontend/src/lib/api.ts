import type { Factoid, PaginatedResponse, RateLimitStatus } from "@/lib/types";

const DEFAULT_BASE = "http://localhost:8000/api/factoids";

const FACTOIDS_API_BASE =
  process.env.NEXT_PUBLIC_FACTOIDS_API_BASE?.replace(/\/$/, "") || DEFAULT_BASE;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${FACTOIDS_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function fetchFactoids(): Promise<Factoid[]> {
  const data = await request<PaginatedResponse<Factoid>>("/?page_size=20");
  return data.results;
}

export async function generateFactoid(topic?: string, modelKey?: string): Promise<Factoid> {
  return request<Factoid>("/generate/", {
    method: "POST",
    body: JSON.stringify({
      topic,
      model_key: modelKey,
    }),
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
