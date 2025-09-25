import {
  ApiError,
  FACTOIDS_API_BASE,
  PAYMENTS_API_BASE,
  CHAT_API_BASE,
  fetchFactoids,
  fetchRandomFactoids,
  fetchFactoidById,
  generateFactoid,
  submitVote,
  submitFeedback,
  fetchRateLimitStatus,
  fetchModels,
  createCheckoutSession,
  fulfillCheckoutSession,
  createChatSession,
  sendChatMessage,
  isChatRateLimitError,
} from "../api";
import type {
  Factoid,
  PaginatedResponse,
  RateLimitStatus,
  CheckoutSessionResponse,
  ChatSessionResponse,
} from "../types";

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Helper to create mock response
const createMockResponse = (
  data: unknown,
  status = 200,
  statusText = "OK"
) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: {
    get: (name: string) => {
      if (name.toLowerCase() === "content-type") {
        return "application/json";
      }
      return null;
    },
  },
  text: () =>
    Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
});

// Mock factoid data
const createMockFactoid = (overrides = {}): Factoid => ({
  id: "test-factoid-id",
  text: "This is a test factoid.",
  subject: "Science",
  emoji: "🧪",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  votes_up: 5,
  votes_down: 1,
  generation_metadata: { model: "test-model" },
  cost_usd: 0.001,
  ...overrides,
});

describe("API Configuration", () => {
  it("should have correct default API base URLs", () => {
    expect(FACTOIDS_API_BASE).toBe("http://localhost:8000/api/factoids");
    expect(PAYMENTS_API_BASE).toBe("http://localhost:8000/api/payments");
    expect(CHAT_API_BASE).toBe("http://localhost:8000/api/chat");
  });
});

describe("ApiError", () => {
  it("should create an ApiError with message, status, and data", () => {
    const error = new ApiError("Test error", 400, { field: "invalid" });

    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("Test error");
    expect(error.status).toBe(400);
    expect(error.data).toEqual({ field: "invalid" });
    expect(error instanceof Error).toBe(true);
  });
});

describe("Factoid API Functions", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("fetchFactoids", () => {
    it("should fetch factoids with default page size", async () => {
      const mockData: PaginatedResponse<Factoid> = {
        results: [createMockFactoid()],
        count: 1,
        next: null,
        previous: null,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData) as Response);

      const result = await fetchFactoids();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/?page_size=20",
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        })
      );
      expect(result).toEqual(mockData.results);
    });

    it("should fetch factoids with custom page size", async () => {
      const mockData: PaginatedResponse<Factoid> = {
        results: [createMockFactoid(), createMockFactoid({ id: "2" })],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData) as Response);

      const result = await fetchFactoids(50);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/?page_size=50",
        expect.any(Object)
      );
      expect(result).toEqual(mockData.results);
    });

    it("should handle API errors", async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-type") {
              return "application/json";
            }
            return null;
          },
        },
        text: () => Promise.resolve(JSON.stringify({ detail: "Server error" })),
      };

      mockFetch.mockResolvedValueOnce(errorResponse as Response);

      await expect(fetchFactoids()).rejects.toThrow(ApiError);

      // Reset mock for second call
      mockFetch.mockResolvedValueOnce(errorResponse as Response);
      await expect(fetchFactoids()).rejects.toThrow("Server error");
    });
  });

  describe("fetchRandomFactoids", () => {
    it("should fetch random factoids with default limit", async () => {
      const mockData = { results: [createMockFactoid()] };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData) as Response);

      const result = await fetchRandomFactoids();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/random/?limit=50",
        expect.any(Object)
      );
      expect(result).toEqual(mockData.results);
    });

    it("should fetch random factoids with custom limit", async () => {
      const mockData = { results: [createMockFactoid()] };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData) as Response);

      const result = await fetchRandomFactoids(10);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/random/?limit=10",
        expect.any(Object)
      );
      expect(result).toEqual(mockData.results);
    });
  });

  describe("fetchFactoidById", () => {
    it("should fetch a specific factoid by ID", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await fetchFactoidById("test-id");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/test-id/",
        expect.any(Object)
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should handle not found errors", async () => {
      const notFoundResponse = {
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-type") {
              return "application/json";
            }
            return null;
          },
        },
        text: () => Promise.resolve(JSON.stringify({ detail: "Not found" })),
      };

      mockFetch.mockResolvedValueOnce(notFoundResponse as Response);

      await expect(fetchFactoidById("nonexistent")).rejects.toThrow(ApiError);

      // Reset mock for second call
      mockFetch.mockResolvedValueOnce(notFoundResponse as Response);
      try {
        await fetchFactoidById("nonexistent");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(404);
      }
    });
  });

  describe("generateFactoid", () => {
    it("should generate factoid with minimal parameters", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await generateFactoid();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/generate/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should generate factoid with topic and model", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await generateFactoid("space", "gpt-4");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/generate/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            topic: "space",
            model_key: "gpt-4",
          }),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should generate factoid with PostHog options", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await generateFactoid("science", undefined, {
        posthogDistinctId: "user-123",
        posthogProperties: { source: "web" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/generate/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            topic: "science",
            posthog_distinct_id: "user-123",
            posthog_properties: { source: "web" },
          }),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should handle rate limit errors", async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-type") {
              return "application/json";
            }
            return null;
          },
        },
        text: () =>
          Promise.resolve(
            JSON.stringify({ detail: "Rate limit exceeded", retry_after: 60 })
          ),
      };

      mockFetch.mockResolvedValueOnce(rateLimitResponse as Response);

      await expect(generateFactoid()).rejects.toThrow(ApiError);

      // Reset mock for second call
      mockFetch.mockResolvedValueOnce(rateLimitResponse as Response);
      try {
        await generateFactoid();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(429);
      }
    });
  });

  describe("submitVote", () => {
    it("should submit upvote", async () => {
      const mockFactoid = createMockFactoid({ votes_up: 6 });

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await submitVote("test-id", "up");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/test-id/vote/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ vote: "up" }),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should submit downvote", async () => {
      const mockFactoid = createMockFactoid({ votes_down: 2 });

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await submitVote("test-id", "down");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/test-id/vote/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ vote: "down" }),
        })
      );
      expect(result).toEqual(mockFactoid);
    });
  });

  describe("submitFeedback", () => {
    it("should submit feedback with minimal data", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(null, 201) as Response
      );

      await submitFeedback({
        factoid: "test-id",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/feedback/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            factoid: "test-id",
          }),
        })
      );
    });

    it("should submit feedback with full data", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(null, 201) as Response
      );

      await submitFeedback({
        factoid: "test-id",
        vote: "up",
        comments: "Great factoid!",
        tags: ["interesting", "science"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/feedback/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            factoid: "test-id",
            vote: "up",
            comments: "Great factoid!",
            tags: ["interesting", "science"],
          }),
        })
      );
    });
  });

  describe("fetchRateLimitStatus", () => {
    it("should fetch rate limit status", async () => {
      const mockStatus: RateLimitStatus = {
        profile: "anonymous",
        rate_limit: {
          per_minute: 10,
          per_hour: 100,
          per_day: 1000,
          current_window_requests: 5,
        },
        cost_budget_remaining: 0.95,
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockStatus) as Response
      );

      const result = await fetchRateLimitStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/limits/",
        expect.any(Object)
      );
      expect(result).toEqual(mockStatus);
    });
  });

  describe("fetchModels", () => {
    it("should fetch available models", async () => {
      const mockData = {
        models: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }, { id: "claude-3" }],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData) as Response);

      const result = await fetchModels();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/factoids/models/",
        expect.any(Object)
      );
      expect(result).toEqual(["gpt-4", "gpt-3.5-turbo", "claude-3"]);
    });
  });
});

describe("Payment API Functions", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("createCheckoutSession", () => {
    it("should create checkout session with minimal parameters", async () => {
      const mockResponse: CheckoutSessionResponse = {
        session_id: "cs_test",
        checkout_url: "https://checkout.stripe.com/pay/cs_test",
        publishable_key: "pk_test",
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await createCheckoutSession();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/payments/checkout/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ source: "rate_limit" }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should create checkout session with full parameters", async () => {
      const mockResponse: CheckoutSessionResponse = {
        session_id: "cs_test",
        checkout_url: "https://checkout.stripe.com/pay/cs_test",
        publishable_key: "pk_test",
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await createCheckoutSession({
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
        source: "manual",
        metadata: { user_id: "123" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/payments/checkout/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            success_url: "https://example.com/success",
            cancel_url: "https://example.com/cancel",
            source: "manual",
            metadata: { user_id: "123" },
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("fulfillCheckoutSession", () => {
    it("should fulfill checkout session with minimal parameters", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await fulfillCheckoutSession("cs_test");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/payments/checkout/cs_test/fulfill/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should fulfill checkout session with options", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      const result = await fulfillCheckoutSession("cs_test", {
        topic: "space",
        modelKey: "gpt-4",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/payments/checkout/cs_test/fulfill/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            topic: "space",
            model_key: "gpt-4",
          }),
        })
      );
      expect(result).toEqual(mockFactoid);
    });

    it("should handle session ID encoding", async () => {
      const mockFactoid = createMockFactoid();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockFactoid) as Response
      );

      await fulfillCheckoutSession("cs_test/with/slashes");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/payments/checkout/cs_test%2Fwith%2Fslashes/fulfill/",
        expect.any(Object)
      );
    });
  });
});

describe("Chat API Functions", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("createChatSession", () => {
    it("should create chat session with minimal parameters", async () => {
      const mockResponse: ChatSessionResponse = {
        session: {
          id: "session-1",
          status: "active",
          model_key: "gpt-4",
          factoid_id: "factoid-1",
          created_at: "2024-01-01T00:00:00Z",
        },
        messages: [],
        rate_limit: {
          per_minute: 10,
          current_window_requests: 1,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await createChatSession({
        factoidId: "factoid-1",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/chat/sessions/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            factoid_id: "factoid-1",
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should create chat session with full parameters", async () => {
      const mockResponse: ChatSessionResponse = {
        session: {
          id: "session-1",
          status: "active",
          model_key: "gpt-4",
          factoid_id: "factoid-1",
          created_at: "2024-01-01T00:00:00Z",
        },
        messages: [
          {
            id: 1,
            role: "user",
            content: { text: "Tell me more" },
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
        rate_limit: {
          per_minute: 10,
          current_window_requests: 1,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await createChatSession({
        factoidId: "factoid-1",
        message: "Tell me more",
        modelKey: "gpt-4",
        temperature: 0.7,
        posthogDistinctId: "user-123",
        posthogProperties: { source: "web" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/chat/sessions/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            factoid_id: "factoid-1",
            message: "Tell me more",
            model_key: "gpt-4",
            temperature: 0.7,
            posthog_distinct_id: "user-123",
            posthog_properties: { source: "web" },
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("sendChatMessage", () => {
    it("should send chat message", async () => {
      const mockResponse: ChatSessionResponse = {
        session: {
          id: "session-1",
          status: "active",
          model_key: "gpt-4",
          factoid_id: "factoid-1",
          created_at: "2024-01-01T00:00:00Z",
        },
        messages: [
          {
            id: 2,
            role: "assistant",
            content: { text: "Here is more information..." },
            created_at: "2024-01-01T00:01:00Z",
          },
        ],
        rate_limit: {
          per_minute: 10,
          current_window_requests: 2,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await sendChatMessage({
        sessionId: "session-1",
        message: "Can you elaborate?",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/chat/sessions/session-1/messages/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            message: "Can you elaborate?",
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should send chat message with PostHog properties", async () => {
      const mockResponse: ChatSessionResponse = {
        session: {
          id: "session-1",
          status: "active",
          model_key: "gpt-4",
          factoid_id: "factoid-1",
          created_at: "2024-01-01T00:00:00Z",
        },
        messages: [],
        rate_limit: {
          per_minute: 10,
          current_window_requests: 2,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      const result = await sendChatMessage({
        sessionId: "session-1",
        message: "Can you elaborate?",
        posthogProperties: { source: "mobile" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/chat/sessions/session-1/messages/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            message: "Can you elaborate?",
            posthog_properties: { source: "mobile" },
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should handle session ID encoding", async () => {
      const mockResponse: ChatSessionResponse = {
        session: {
          id: "session/with/slashes",
          status: "active",
          model_key: "gpt-4",
          created_at: "2024-01-01T00:00:00Z",
        },
        messages: [],
        rate_limit: {
          per_minute: 10,
          current_window_requests: 1,
        },
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockResponse) as Response
      );

      await sendChatMessage({
        sessionId: "session/with/slashes",
        message: "Test",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/chat/sessions/session%2Fwith%2Fslashes/messages/",
        expect.any(Object)
      );
    });
  });

  describe("isChatRateLimitError", () => {
    it("should identify chat rate limit errors", () => {
      const rateLimitError = new ApiError("Rate limit exceeded", 429, {
        detail: "Rate limit exceeded",
        code: "rate_limit",
        retry_after: 60,
        rate_limit: {
          per_minute: 10,
          current_window_requests: 10,
        },
      });

      expect(isChatRateLimitError(rateLimitError)).toBe(true);
    });

    it("should not identify non-rate-limit errors", () => {
      const normalError = new ApiError("Bad request", 400, {
        detail: "Invalid input",
      });

      expect(isChatRateLimitError(normalError)).toBe(false);
    });

    it("should not identify non-API errors", () => {
      const regularError = new Error("Regular error");

      expect(isChatRateLimitError(regularError)).toBe(false);
    });

    it("should not identify non-429 errors", () => {
      const serverError = new ApiError("Server error", 500, {
        code: "rate_limit",
      });

      expect(isChatRateLimitError(serverError)).toBe(false);
    });

    it("should not identify 429 errors without rate_limit code", () => {
      const otherTooManyRequests = new ApiError("Too many requests", 429, {
        detail: "Different rate limit",
        code: "other_limit",
      });

      expect(isChatRateLimitError(otherTooManyRequests)).toBe(false);
    });
  });
});

describe("Error Handling", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchFactoids()).rejects.toThrow("Network error");
  });

  it("should handle non-JSON error responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") {
            return "text/plain";
          }
          return null;
        },
      },
      text: () => Promise.resolve("Server is down"),
    } as Response);

    await expect(fetchFactoids()).rejects.toThrow("Server is down");
  });

  it("should handle empty error responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
      text: () => Promise.resolve(""),
    } as Response);

    await expect(fetchFactoids()).rejects.toThrow("Bad Gateway");
  });

  it("should handle malformed JSON responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
      text: () => Promise.resolve("invalid json{"),
    } as Response);

    // When JSON parsing fails, it returns the raw text as T,
    // so fetchFactoids will try to access .results on a string, which returns undefined
    const result = await fetchFactoids();
    expect(result).toBeUndefined();
  });

  it("should handle empty successful responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
      text: () => Promise.resolve(""),
    } as Response);

    const result = await submitFeedback({ factoid: "test" });
    expect(result).toBeUndefined();
  });
});
