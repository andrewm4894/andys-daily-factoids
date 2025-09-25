import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@/test-utils";
import { GenerateFactoidForm } from "../generate-factoid-form";
import * as api from "../../lib/api";

// Mock the API functions
jest.mock("../../lib/api", () => {
  // Create a proper ApiError class for testing
  class MockApiError extends Error {
    status: number;
    data: Record<string, unknown>;

    constructor(
      message: string,
      status: number,
      data: Record<string, unknown>
    ) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }

  return {
    ApiError: MockApiError,
    FACTOIDS_API_BASE: "http://localhost:8000/api/factoids",
    generateFactoid: jest.fn(),
    createCheckoutSession: jest.fn(),
  };
});

// Mock PostHog
jest.mock("../../lib/posthog", () => ({
  posthog: {
    capture: jest.fn(),
    get_distinct_id: jest.fn(() => "test-user-id"),
    persistence: { props: { test_prop: "test_value" } },
  },
}));

// Mock Stripe
jest.mock("@stripe/stripe-js", () => ({
  loadStripe: jest.fn(() =>
    Promise.resolve({
      redirectToCheckout: jest.fn(() => Promise.resolve({ error: null })),
    })
  ),
}));

// Mock Next.js router
const mockRouter = {
  refresh: jest.fn(),
};
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];

  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  close: jest.Mock;
  url: string;

  constructor(url: string) {
    this.url = url;
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
    this.close = jest.fn();
    MockEventSource.instances.push(this);
  }

  static getLatestInstance() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  static clearInstances() {
    MockEventSource.instances = [];
  }

  // Helper to simulate events
  simulateEvent(type: string, data: Record<string, unknown>) {
    const handler = this.addEventListener.mock.calls.find(
      (call) => call[0] === type
    )?.[1];
    if (handler) {
      act(() => {
        handler({ data: JSON.stringify(data) });
      });
    }
  }
}

global.EventSource = MockEventSource as unknown as typeof EventSource;

const mockGenerateFactoid = api.generateFactoid as jest.MockedFunction<
  typeof api.generateFactoid
>;
const mockCreateCheckoutSession =
  api.createCheckoutSession as jest.MockedFunction<
    typeof api.createCheckoutSession
  >;

describe("GenerateFactoidForm", () => {
  const defaultProps = {
    models: ["gpt-4", "gpt-3.5-turbo", "claude-3"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockEventSource.clearInstances();
    mockGenerateFactoid.mockResolvedValue(undefined);
    mockCreateCheckoutSession.mockResolvedValue({
      session_id: "cs_test",
      checkout_url: "https://checkout.stripe.com/test",
      publishable_key: "pk_test",
    });

    // Mock window.location
    Object.defineProperty(window, "location", {
      value: {
        origin: "http://localhost:3000",
        href: "http://localhost:3000",
        assign: jest.fn(),
      },
      writable: true,
    });
  });

  describe("Basic Rendering", () => {
    it("should render the form with generate button", () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /Generate factoid/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Show options/i })
      ).toBeInTheDocument();
    });

    it("should render shuffle button when onShuffle prop is provided", () => {
      const onShuffle = jest.fn();
      render(<GenerateFactoidForm {...defaultProps} onShuffle={onShuffle} />);

      expect(
        screen.getByRole("button", { name: /Shuffle factoids/i })
      ).toBeInTheDocument();
    });

    it("should not render shuffle button when onShuffle prop is not provided", () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      expect(
        screen.queryByRole("button", { name: /Shuffle factoids/i })
      ).not.toBeInTheDocument();
    });

    it("should render shuffle loading state", () => {
      const onShuffle = jest.fn();
      render(
        <GenerateFactoidForm
          {...defaultProps}
          onShuffle={onShuffle}
          shuffleLoading={true}
        />
      );

      expect(
        screen.getByRole("button", { name: /Shuffling/i })
      ).toBeInTheDocument();
    });
  });

  describe("Advanced Options", () => {
    it("should show/hide advanced options when toggle is clicked", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      // Initially hidden
      expect(
        screen.queryByLabelText("Topic (optional)")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Model (optional)")
      ).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        expect(screen.getByLabelText("Topic (optional)")).toBeInTheDocument();
        expect(screen.getByLabelText("Model (optional)")).toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: /Hide options/i })
      ).toBeInTheDocument();

      // Click to hide
      fireEvent.click(screen.getByRole("button", { name: /Hide options/i }));

      await waitFor(() => {
        expect(
          screen.queryByLabelText("Topic (optional)")
        ).not.toBeInTheDocument();
      });
    });

    it("should populate model dropdown with provided models", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        const modelSelect = screen.getByLabelText("Model (optional)");
        expect(modelSelect).toBeInTheDocument();

        expect(screen.getByText("Automatic selection")).toBeInTheDocument();
        expect(screen.getByText("gpt-4")).toBeInTheDocument();
        expect(screen.getByText("gpt-3.5-turbo")).toBeInTheDocument();
        expect(screen.getByText("claude-3")).toBeInTheDocument();
      });
    });

    it("should update topic and model state when inputs change", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        const topicInput = screen.getByLabelText("Topic (optional)");
        const modelSelect = screen.getByLabelText("Model (optional)");

        fireEvent.change(topicInput, {
          target: { value: "space exploration" },
        });
        fireEvent.change(modelSelect, { target: { value: "gpt-4" } });

        expect(topicInput).toHaveValue("space exploration");
        expect(modelSelect).toHaveValue("gpt-4");
      });
    });
  });

  describe("Form Submission", () => {
    it("should call generateFactoid with no parameters when EventSource is not available", async () => {
      // Mock EventSource as undefined
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockGenerateFactoid).toHaveBeenCalledWith(
          "",
          undefined,
          expect.objectContaining({
            posthogDistinctId: "test-user-id",
          })
        );
      });
    });

    it("should call generateFactoid with topic and model when provided", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      render(<GenerateFactoidForm {...defaultProps} />);

      // Show advanced options and fill form
      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        const topicInput = screen.getByLabelText("Topic (optional)");
        const modelSelect = screen.getByLabelText("Model (optional)");

        fireEvent.change(topicInput, { target: { value: "science" } });
        fireEvent.change(modelSelect, { target: { value: "gpt-4" } });
      });

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockGenerateFactoid).toHaveBeenCalledWith(
          "science",
          "gpt-4",
          expect.objectContaining({
            posthogDistinctId: "test-user-id",
          })
        );
      });
    });

    it("should use EventSource when available", async () => {
      global.EventSource = MockEventSource as unknown as typeof EventSource;

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
        const instance = MockEventSource.getLatestInstance();
        expect(instance.url).toContain("/generate/stream/");
        expect(mockGenerateFactoid).not.toHaveBeenCalled();
      });
    });

    it("should disable buttons during generation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      // Mock a slow API call
      mockGenerateFactoid.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<GenerateFactoidForm {...defaultProps} onShuffle={jest.fn()} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      const shuffleButton = screen.getByRole("button", {
        name: /Shuffle factoids/i,
      });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toBeDisabled();
        expect(shuffleButton).toBeDisabled();
      });
    });

    it("should show generating state during submission", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      mockGenerateFactoid.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Generating...")).toBeInTheDocument();
      });
    });

    it("should show success state after successful generation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Factoid ready!")).toBeInTheDocument();
      });

      // Should reset to idle after timeout
      await waitFor(
        () => {
          expect(screen.getByText("Generate factoid")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe("EventSource Streaming", () => {
    beforeEach(() => {
      global.EventSource = MockEventSource as unknown as typeof EventSource;
    });

    it("should handle successful factoid event", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate successful factoid generation
      eventSource.simulateEvent("factoid", {
        text: "New factoid",
        subject: "Science",
        emoji: "🧬",
      });

      await waitFor(() => {
        expect(screen.getByText("Factoid ready!")).toBeInTheDocument();
        expect(eventSource.close).toHaveBeenCalled();
        expect(mockRouter.refresh).toHaveBeenCalled();
      });
    });

    it("should handle error events", async () => {
      const onGenerationError = jest.fn();
      render(
        <GenerateFactoidForm
          {...defaultProps}
          onGenerationError={onGenerationError}
        />
      );

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate error
      eventSource.simulateEvent("error", {
        detail: "Generation failed",
        code: "server_error",
      });

      await waitFor(() => {
        expect(screen.getByText("Generation failed")).toBeInTheDocument();
        expect(onGenerationError).toHaveBeenCalledWith("Generation failed");
        expect(eventSource.close).toHaveBeenCalled();
      });
    });

    it("should handle rate limit errors and start checkout flow", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate rate limit error
      eventSource.simulateEvent("error", {
        detail: "Rate limit exceeded",
        code: "rate_limit",
        retry_after: 60,
      });

      await waitFor(() => {
        expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            source: "rate_limit",
            metadata: expect.objectContaining({
              retry_after: 60,
            }),
          })
        );
      });
    });

    it("should handle status events", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate status event
      eventSource.simulateEvent("status", { state: "processing" });

      // Should still show generating state
      expect(screen.getByText("Generating...")).toBeInTheDocument();
    });

    it("should close EventSource on component unmount", async () => {
      const { unmount } = render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      const eventSource = MockEventSource.getLatestInstance();

      unmount();

      expect(eventSource.close).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors during generation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const onGenerationError = jest.fn();
      mockGenerateFactoid.mockRejectedValueOnce(new Error("API Error"));

      render(
        <GenerateFactoidForm
          {...defaultProps}
          onGenerationError={onGenerationError}
        />
      );

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Generation failed")).toBeInTheDocument();
        expect(onGenerationError).toHaveBeenCalledWith("API Error");
      });
    });

    it("should handle rate limit errors from API", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const rateLimitError = new api.ApiError("Rate limit exceeded", 429, {
        retry_after: 60,
      });

      mockGenerateFactoid.mockRejectedValueOnce(rateLimitError);

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(
        () => {
          expect(mockCreateCheckoutSession).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it("should handle checkout session creation errors", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const rateLimitError = new api.ApiError("Rate limit exceeded", 429, {});

      mockGenerateFactoid.mockRejectedValueOnce(rateLimitError);
      mockCreateCheckoutSession.mockRejectedValueOnce(
        new Error("Stripe error")
      );

      const onGenerationError = jest.fn();
      render(
        <GenerateFactoidForm
          {...defaultProps}
          onGenerationError={onGenerationError}
        />
      );

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(
        () => {
          expect(onGenerationError).toHaveBeenCalledWith("Stripe error");
        },
        { timeout: 2000 }
      );
    });
  });

  describe("Shuffle Functionality", () => {
    it("should call onShuffle when shuffle button is clicked", () => {
      const onShuffle = jest.fn();
      render(<GenerateFactoidForm {...defaultProps} onShuffle={onShuffle} />);

      const shuffleButton = screen.getByRole("button", {
        name: /Shuffle factoids/i,
      });
      fireEvent.click(shuffleButton);

      expect(onShuffle).toHaveBeenCalledTimes(1);
    });

    it("should disable shuffle button when shuffling", () => {
      const onShuffle = jest.fn();
      render(
        <GenerateFactoidForm
          {...defaultProps}
          onShuffle={onShuffle}
          shuffleLoading={true}
        />
      );

      const shuffleButton = screen.getByRole("button", { name: /Shuffling/i });
      expect(shuffleButton).toBeDisabled();
    });

    it("should disable shuffle button during generation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const onShuffle = jest.fn();
      mockGenerateFactoid.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<GenerateFactoidForm {...defaultProps} onShuffle={onShuffle} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const shuffleButton = screen.getByRole("button", {
          name: /Shuffle factoids/i,
        });
        expect(shuffleButton).toBeDisabled();
      });
    });
  });

  describe("Accessibility", () => {
    it("should have proper form labels and ARIA attributes", async () => {
      render(<GenerateFactoidForm {...defaultProps} />);

      // Show advanced options
      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        const topicInput = screen.getByLabelText("Topic (optional)");
        const modelSelect = screen.getByLabelText("Model (optional)");
        const advancedToggle = screen.getByRole("button", {
          name: /Hide options/i,
        });

        expect(topicInput).toHaveAttribute("id", "topic");
        expect(modelSelect).toHaveAttribute("id", "model");
        expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
        expect(advancedToggle).toHaveAttribute(
          "aria-controls",
          "generate-factoid-options"
        );
      });
    });

    it("should have proper button titles and tooltips", () => {
      const onShuffle = jest.fn();
      render(<GenerateFactoidForm {...defaultProps} onShuffle={onShuffle} />);

      const generateButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      const shuffleButton = screen.getByRole("button", {
        name: /Shuffle factoids/i,
      });

      expect(generateButton).toHaveAttribute(
        "title",
        "Generate a factoid - press show options to pick topic and model"
      );
      expect(shuffleButton).toHaveAttribute(
        "title",
        "Randomly sample a different batch"
      );
    });

    it("should disable inputs during generation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      mockGenerateFactoid.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<GenerateFactoidForm {...defaultProps} />);

      // Show advanced options first
      fireEvent.click(screen.getByRole("button", { name: /Show options/i }));

      await waitFor(() => {
        expect(screen.getByLabelText("Topic (optional)")).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const topicInput = screen.getByLabelText("Topic (optional)");
        const modelSelect = screen.getByLabelText("Model (optional)");
        const advancedToggle = screen.getByRole("button", {
          name: /Hide options/i,
        });

        expect(topicInput).toBeDisabled();
        expect(modelSelect).toBeDisabled();
        expect(advancedToggle).toBeDisabled();
      });
    });
  });

  describe("Stripe Integration", () => {
    it("should redirect to Stripe checkout on successful session creation", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const rateLimitError = new api.ApiError("Rate limit exceeded", 429, {});

      mockGenerateFactoid.mockRejectedValueOnce(rateLimitError);

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(
        () => {
          expect(window.location.assign).toHaveBeenCalledWith(
            "https://checkout.stripe.com/test"
          );
        },
        { timeout: 2000 }
      );
    });

    it("should show redirecting state during checkout", async () => {
      delete (global as typeof globalThis & { EventSource?: unknown })
        .EventSource;

      const rateLimitError = new api.ApiError("Rate limit exceeded", 429, {});

      mockGenerateFactoid.mockRejectedValueOnce(rateLimitError);
      mockCreateCheckoutSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<GenerateFactoidForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /Generate factoid/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Redirecting to checkout/i })
        ).toBeInTheDocument();
      });
    });
  });
});
