import React from "react";
import { render, screen, fireEvent, waitFor } from "../../test-utils";
import { FactoidCard } from "../factoid-card";
import { createMockFactoid } from "../../test-utils";
import * as api from "../../lib/api";
import { posthog } from "../../lib/posthog";

// Mock the API functions
jest.mock("../../lib/api", () => ({
  submitVote: jest.fn(),
  submitFeedback: jest.fn(),
}));

// Mock theme provider
jest.mock("../theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}));

// Mock PostHog
jest.mock("../../lib/posthog", () => ({
  posthog: {
    captureTraceMetric: jest.fn(),
    captureTraceFeedback: jest.fn(),
  },
}));

// Mock the chat panel component to simplify testing
jest.mock("../factoid-chat-panel", () => ({
  FactoidChatPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="chat-panel">
      <button onClick={onClose}>Close Chat</button>
    </div>
  ),
}));

const mockSubmitVote = api.submitVote as jest.MockedFunction<
  typeof api.submitVote
>;
const mockSubmitFeedback = api.submitFeedback as jest.MockedFunction<
  typeof api.submitFeedback
>;

const mockPosthog = posthog as jest.Mocked<typeof posthog>;

describe("FactoidCard", () => {
  const defaultFactoid = createMockFactoid({
    text: "This is a fascinating fact about the universe that will blow your mind and make you think.",
    subject: "Science",
    emoji: "🌌",
    votes_up: 10,
    votes_down: 2,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful API calls by default
    mockSubmitVote.mockResolvedValue(undefined);
    mockSubmitFeedback.mockResolvedValue(undefined);
  });

  describe("Basic Rendering", () => {
    it("should render factoid text, emoji, and basic info", () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      expect(screen.getByText("🌌")).toBeInTheDocument();
      expect(
        screen.getByText(/This is a fascinating fact/)
      ).toBeInTheDocument();
    });

    it("should show truncated text when collapsed", () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      // Should show truncated version with ellipsis
      expect(
        screen.getByText(/This is a fascinating fact.*…/)
      ).toBeInTheDocument();
      expect(screen.queryByText("Mind blown (10)")).not.toBeInTheDocument();
    });

    it("should show full text and voting buttons when initially expanded", () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      expect(
        screen.getByText(
          /This is a fascinating fact about the universe that will blow your mind and make you think\./
        )
      ).toBeInTheDocument();
      expect(screen.getByText("Mind blown (10)")).toBeInTheDocument();
      expect(screen.getByText("Meh (2)")).toBeInTheDocument();
    });

    it("should display fallback emoji when none provided", () => {
      const factoidNoEmoji = createMockFactoid({ emoji: undefined });
      render(<FactoidCard factoid={factoidNoEmoji} />);

      expect(screen.getByText("✨")).toBeInTheDocument();
    });
  });

  describe("Card Expansion", () => {
    it("should expand when clicked", async () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      fireEvent.click(card);

      await waitFor(() => {
        expect(screen.getByText("Mind blown (10)")).toBeInTheDocument();
      });
    });

    it("should collapse when clicked again", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      // Get the main card button (the article element)
      const card = screen.getByRole("button", {
        name: /This is a fascinating fact/,
      });
      fireEvent.click(card);

      await waitFor(() => {
        expect(screen.queryByText("Mind blown (10)")).not.toBeInTheDocument();
      });
    });

    it("should expand with Enter key", async () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      fireEvent.keyDown(card, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Mind blown (10)")).toBeInTheDocument();
      });
    });

    it("should expand with Space key", async () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      fireEvent.keyDown(card, { key: " " });

      await waitFor(() => {
        expect(screen.getByText("Mind blown (10)")).toBeInTheDocument();
      });
    });

    it("should not expand with other keys", () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      fireEvent.keyDown(card, { key: "a" });

      expect(screen.queryByText("Mind blown (10)")).not.toBeInTheDocument();
    });
  });

  describe("Voting Functionality", () => {
    it("should submit upvote and show feedback form", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const upvoteButton = screen.getByText("Mind blown (10)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(mockSubmitVote).toHaveBeenCalledWith(defaultFactoid.id, "up");
      });

      // Should show feedback form
      expect(
        screen.getByPlaceholderText("Optional feedback...")
      ).toBeInTheDocument();
    });

    it("should submit downvote and show feedback form", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const downvoteButton = screen.getByText("Meh (2)");
      fireEvent.click(downvoteButton);

      await waitFor(() => {
        expect(mockSubmitVote).toHaveBeenCalledWith(defaultFactoid.id, "down");
      });

      expect(
        screen.getByPlaceholderText("Optional feedback...")
      ).toBeInTheDocument();
    });

    it("should disable voting buttons when submitting", async () => {
      // Mock a slow API call
      mockSubmitVote.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const upvoteButton = screen.getByText("Mind blown (10)");
      fireEvent.click(upvoteButton);

      expect(upvoteButton).toBeDisabled();
      expect(screen.getByText("Meh (2)")).toBeDisabled();
    });

    it("should handle voting API errors gracefully", async () => {
      mockSubmitVote.mockRejectedValue(new Error("API Error"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const upvoteButton = screen.getByText("Mind blown (10)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Feedback Form", () => {
    beforeEach(async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const upvoteButton = screen.getByText("Mind blown (10)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Optional feedback...")
        ).toBeInTheDocument();
      });
    });

    it("should submit feedback with text", async () => {
      const textarea = screen.getByPlaceholderText("Optional feedback...");
      const submitButton = screen.getByText("Submit feedback");

      fireEvent.change(textarea, { target: { value: "Great factoid!" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitFeedback).toHaveBeenCalledWith({
          factoid: defaultFactoid.id,
          vote: "up",
          comments: "Great factoid!",
        });
      });
    });

    it("should submit feedback without text", async () => {
      const submitButton = screen.getByText("Submit feedback");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitFeedback).toHaveBeenCalledWith({
          factoid: defaultFactoid.id,
          vote: "up",
          comments: "",
        });
      });
    });

    it("should close feedback form after successful submission", async () => {
      const submitButton = screen.getByText("Submit feedback");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Optional feedback...")
        ).not.toBeInTheDocument();
      });
    });

    it("should handle feedback API errors", async () => {
      mockSubmitFeedback.mockRejectedValue(new Error("Feedback API Error"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const submitButton = screen.getByText("Submit feedback");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Copy Functionality", () => {
    beforeEach(() => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn(() => Promise.resolve()),
        },
      });
    });

    it("should copy factoid text with share URL", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const copyButton = screen.getByLabelText("Copy factoid text");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          `${defaultFactoid.text.trim()}\n\nKeep exploring factoids: http://localhost:3000/factoids/${defaultFactoid.id}?theme=light`
        );
      });
    });

    it("should copy share link", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const linkButton = screen.getByLabelText("Copy link to this factoid");
      fireEvent.click(linkButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          `http://localhost:3000/factoids/${defaultFactoid.id}?theme=light`
        );
      });
    });

    it("should show copied status temporarily", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const copyButton = screen.getByLabelText("Copy factoid text");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText("✅")).toBeInTheDocument();
      });
    });

    it("should handle clipboard API failures gracefully", async () => {
      const mockWriteText = jest.fn(() =>
        Promise.reject(new Error("Clipboard error"))
      );
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const copyButton = screen.getByLabelText("Copy factoid text");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to copy factoid",
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Google Search", () => {
    it("should open Google search in new window", () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const searchButton = screen.getByLabelText(
        "Search this factoid on Google"
      );
      fireEvent.click(searchButton);

      expect(mockOpen).toHaveBeenCalledWith(
        `https://www.google.com/search?q=${encodeURIComponent(defaultFactoid.text)}`,
        "_blank",
        "noopener,noreferrer"
      );
    });
  });

  describe("Ask ChatGPT", () => {
    it("should open ChatGPT with prompt in new window", () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const chatGPTButton = screen.getByLabelText(
        "Ask ChatJipity if this factoid is true"
      );
      fireEvent.click(chatGPTButton);

      const expectedPrompt = encodeURIComponent(
        `Is this factoid true?\n${defaultFactoid.text}`
      );
      expect(mockOpen).toHaveBeenCalledWith(
        `https://chat.openai.com/?q=${expectedPrompt}`,
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("should have proper button text and icon", () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const chatGPTButton = screen.getByText("Ask ChatJipity");
      expect(chatGPTButton).toBeInTheDocument();

      // Check that the button has the correct aria-label
      expect(
        screen.getByLabelText("Ask ChatJipity if this factoid is true")
      ).toBeInTheDocument();
    });
  });

  describe("Chat Panel", () => {
    it("should open chat panel when chat button clicked", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const chatButton = screen.getByLabelText("Chat about this factoid");
      fireEvent.click(chatButton);

      await waitFor(() => {
        expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      });
    });

    it("should close chat panel when close button clicked", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      const chatButton = screen.getByLabelText("Chat about this factoid");
      fireEvent.click(chatButton);

      await waitFor(() => {
        expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      });

      const closeButton = screen.getByText("Close Chat");
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
      });
    });

    it("should close feedback form when opening chat", async () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      // First open feedback form
      const upvoteButton = screen.getByText("Mind blown (10)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Optional feedback...")
        ).toBeInTheDocument();
      });

      // Then open chat
      const chatButton = screen.getByLabelText("Chat about this factoid");
      fireEvent.click(chatButton);

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Optional feedback...")
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      expect(card).toHaveAttribute("aria-expanded", "false");
      expect(card).toHaveAttribute("tabIndex", "0");
    });

    it("should update aria-expanded when expanded", async () => {
      render(<FactoidCard factoid={defaultFactoid} />);

      const card = screen.getByRole("button");
      fireEvent.click(card);

      await waitFor(() => {
        expect(card).toHaveAttribute("aria-expanded", "true");
      });
    });

    it("should have proper button labels", () => {
      render(<FactoidCard factoid={defaultFactoid} initiallyExpanded={true} />);

      expect(screen.getByLabelText("Copy factoid text")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Copy link to this factoid")
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Chat about this factoid")
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Search this factoid on Google")
      ).toBeInTheDocument();
    });
  });

  describe("Text Truncation Logic", () => {
    it("should deterministically truncate based on factoid ID", () => {
      const longText =
        "This is a very long factoid text that should definitely be truncated because it has many many words in it and goes on and on";
      const factoid1 = createMockFactoid({ id: "test1", text: longText });
      const factoid2 = createMockFactoid({ id: "test2", text: longText });

      const { rerender } = render(<FactoidCard factoid={factoid1} />);
      const truncated1 = screen.getByText(/This is a very.*…/);

      rerender(<FactoidCard factoid={factoid2} />);
      screen.getByText(/This is a very.*…/);

      // Should be consistent for same ID
      rerender(<FactoidCard factoid={factoid1} />);
      expect(screen.getByText(truncated1.textContent!)).toBeInTheDocument();
    });

    it("should not truncate short text", () => {
      const shortFactoid = createMockFactoid({ text: "Short text." });
      render(<FactoidCard factoid={shortFactoid} />);

      expect(screen.getByText("Short text.")).toBeInTheDocument();
      expect(screen.queryByText(/Short text\.…/)).not.toBeInTheDocument();
    });
  });

  describe("PostHog AI Feedback", () => {
    const factoidWithGenerationId = createMockFactoid({
      text: "Test factoid",
      generation_request_id: "test-generation-123",
      votes_up: 5,
      votes_down: 1,
    });

    it("should capture quality metric when voting up", async () => {
      render(
        <FactoidCard
          factoid={factoidWithGenerationId}
          initiallyExpanded={true}
        />
      );

      const upvoteButton = screen.getByText("Mind blown (5)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(mockPosthog.captureTraceMetric).toHaveBeenCalledWith(
          "test-generation-123",
          "quality",
          "good"
        );
      });
    });

    it("should capture quality metric when voting down", async () => {
      render(
        <FactoidCard
          factoid={factoidWithGenerationId}
          initiallyExpanded={true}
        />
      );

      const downvoteButton = screen.getByText("Meh (1)");
      fireEvent.click(downvoteButton);

      await waitFor(() => {
        expect(mockPosthog.captureTraceMetric).toHaveBeenCalledWith(
          "test-generation-123",
          "quality",
          "bad"
        );
      });
    });

    it("should capture text feedback when submitting feedback", async () => {
      render(
        <FactoidCard
          factoid={factoidWithGenerationId}
          initiallyExpanded={true}
        />
      );

      // First vote to open feedback form
      const upvoteButton = screen.getByText("Mind blown (5)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Optional feedback...")
        ).toBeInTheDocument();
      });

      // Add feedback text
      const feedbackTextarea = screen.getByPlaceholderText(
        "Optional feedback..."
      );
      fireEvent.change(feedbackTextarea, {
        target: { value: "This is great feedback!" },
      });

      // Submit feedback
      const submitButton = screen.getByText("Submit feedback");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPosthog.captureTraceFeedback).toHaveBeenCalledWith(
          "test-generation-123",
          "This is great feedback!"
        );
      });
    });

    it("should not capture PostHog events when generation_request_id is missing", async () => {
      const factoidWithoutGenerationId = createMockFactoid({
        text: "Test factoid",
        generation_request_id: null,
        votes_up: 5,
        votes_down: 1,
      });

      render(
        <FactoidCard
          factoid={factoidWithoutGenerationId}
          initiallyExpanded={true}
        />
      );

      const upvoteButton = screen.getByText("Mind blown (5)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(mockSubmitVote).toHaveBeenCalled();
      });

      // Should not call PostHog methods
      expect(mockPosthog.captureTraceMetric).not.toHaveBeenCalled();
    });

    it("should not capture text feedback when no text is provided", async () => {
      render(
        <FactoidCard
          factoid={factoidWithGenerationId}
          initiallyExpanded={true}
        />
      );

      // Vote to open feedback form
      const upvoteButton = screen.getByText("Mind blown (5)");
      fireEvent.click(upvoteButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Optional feedback...")
        ).toBeInTheDocument();
      });

      // Submit feedback without text
      const submitButton = screen.getByText("Submit feedback");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitFeedback).toHaveBeenCalled();
      });

      // Should not call captureTraceFeedback since no text was provided
      expect(mockPosthog.captureTraceFeedback).not.toHaveBeenCalled();
    });
  });
});
