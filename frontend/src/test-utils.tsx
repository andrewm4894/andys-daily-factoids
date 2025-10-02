import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";

// Mock the theme provider for tests
const MockThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="theme-provider">{children}</div>;
};

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <MockThemeProvider>{children}</MockThemeProvider>;
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from "@testing-library/react";
export { customRender as render };

// Common test data factories
export const createMockFactoid = (overrides = {}) => ({
  id: "test-factoid-id",
  text: "This is a test factoid about interesting facts.",
  subject: "Science",
  emoji: "🧪",
  votes_up: 5,
  votes_down: 1,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  cost_usd: 0.001,
  generation_metadata: {
    model: "test-model",
    raw: { temperature: 0.7 },
  },
  generation_request_id: null,
  ...overrides,
});

export const createMockChatSession = (overrides = {}) => ({
  id: "test-session-id",
  factoid_id: "test-factoid-id",
  model_key: "test-model",
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockChatMessage = (overrides = {}) => ({
  id: "test-message-id",
  session_id: "test-session-id",
  role: "user" as const,
  content: { text: "Test message" },
  created_at: "2024-01-01T00:00:00Z",
  tool_calls: [],
  ...overrides,
});
