"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ChatMessage,
  ChatRateLimitSnapshot,
  ChatSessionSummary,
  ChatToolCall,
  CheckoutSessionResponse,
  Factoid,
} from "@/lib/types";
import {
  ApiError,
  createChatSession,
  isChatRateLimitError,
  sendChatMessage,
} from "@/lib/api";
import { posthog } from "@/lib/posthog";

interface FactoidChatPanelProps {
  factoid: Factoid;
  models?: string[];
  onClose?: () => void;
}

function getPosthogProperties(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  // Include session ID to link AI events to frontend session
  const sessionId = posthog?.get_session_id?.();
  if (sessionId) {
    properties.$session_id = sessionId;
  }

  return properties;
}

export function FactoidChatPanel({
  factoid,
  models,
  onClose,
}: FactoidChatPanelProps) {
  const [session, setSession] = useState<ChatSessionSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rateLimit, setRateLimit] = useState<ChatRateLimitSnapshot | null>(
    null
  );
  const [checkoutSession, setCheckoutSession] =
    useState<CheckoutSessionResponse | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    setSession(null);
    setMessages([]);
    setRateLimit(null);
    setCheckoutSession(null);
    setErrorMessage(null);
    setSelectedModel("");
    setShowModelSelector(false);
    hasInitializedRef.current = false;
    previousMessageCountRef.current = 0;
  }, [factoid.id]);

  const factoidHeader = useMemo(() => {
    if (factoid.subject && factoid.subject.trim()) {
      return `${factoid.subject.trim()} ${factoid.emoji ?? ""}`.trim();
    }
    return `Factoid Chat ${factoid.emoji ?? ""}`.trim();
  }, [factoid.emoji, factoid.subject]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior,
        block: "nearest",
      });
    }
  }, []);

  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Something went wrong while chatting.";
  };

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const nextCount = messages.length;
    if (nextCount > previousCount && nextCount > 0) {
      const behavior = previousCount === 0 ? "auto" : "smooth";
      scrollToBottom(behavior);
    }
    previousMessageCountRef.current = nextCount;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    if (session || hasInitializedRef.current) {
      return () => {
        cancelled = true;
      };
    }

    hasInitializedRef.current = true;
    setIsInitializing(true);
    setErrorMessage(null);

    const posthogProps = getPosthogProperties();
    createChatSession({
      factoidId: factoid.id,
      ...(selectedModel && { modelKey: selectedModel }),
      posthogDistinctId: posthog?.get_distinct_id?.() ?? undefined,
      posthogProperties:
        Object.keys(posthogProps).length > 0 ? posthogProps : undefined,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSession(response.session);
        setMessages(response.messages);
        setRateLimit(response.rate_limit);
        setCheckoutSession(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(extractErrorMessage(error));
        hasInitializedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [factoid.id, session, selectedModel]);

  const handleSend = useCallback(
    async (event?: FormEvent) => {
      if (event) {
        event.preventDefault();
      }

      const trimmed = inputValue.trim();
      if (!trimmed || isSending) {
        return;
      }

      setErrorMessage(null);
      setCheckoutSession(null);
      setIsSending(true);

      try {
        const posthogProps = getPosthogProperties();
        const posthogDistinctId = posthog?.get_distinct_id?.() ?? undefined;
        const posthogProperties =
          Object.keys(posthogProps).length > 0 ? posthogProps : undefined;

        if (!session) {
          const response = await createChatSession({
            factoidId: factoid.id,
            message: trimmed,
            ...(selectedModel && { modelKey: selectedModel }),
            posthogDistinctId,
            posthogProperties,
          });
          setSession(response.session);
          setMessages(response.messages);
          setRateLimit(response.rate_limit);
          setInputValue("");
          return;
        }

        const response = await sendChatMessage({
          sessionId: session.id,
          message: trimmed,
          posthogProperties,
        });
        setMessages(response.messages);
        setRateLimit(response.rate_limit);
        setSession(response.session);
      } catch (error) {
        if (isChatRateLimitError(error)) {
          setRateLimit(error.data.rate_limit);
          setCheckoutSession(error.data.checkout_session ?? null);
          setErrorMessage(error.message || error.data.detail);
        } else {
          setErrorMessage(extractErrorMessage(error));
        }
        return;
      } finally {
        setIsSending(false);
      }

      setInputValue("");
    },
    [factoid.id, inputValue, isSending, session, selectedModel]
  );

  const handleCheckoutRedirect = useCallback(() => {
    if (checkoutSession?.checkout_url) {
      window.open(checkoutSession.checkout_url, "_blank", "noopener");
    }
  }, [checkoutSession]);

  const renderMessageText = (message: ChatMessage): string => {
    const { content } = message;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((item) =>
          typeof item === "string" ? item : JSON.stringify(item, null, 2)
        )
        .join("\n");
    }
    if (content && typeof content === "object") {
      const record = content as Record<string, unknown>;
      const direct = record.text ?? record.content;
      if (typeof direct === "string") {
        return direct;
      }
      return JSON.stringify(content, null, 2);
    }
    if (content == null) {
      return "";
    }
    return String(content);
  };

  return (
    <div
      className="mt-4 space-y-3 rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-muted)] p-4"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
            {factoidHeader || "Factoid Chat"}
          </h3>
          <p className="text-xs text-[color:var(--text-muted)]">
            Ask follow-up questions or request supporting sources.
          </p>
          {session?.model_key && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--text-muted)]">
              <span title="Current AI model">ℹ️</span>
              <span>Model: {session.model_key}</span>
            </div>
          )}
          {session &&
            messages.filter((msg) => msg.role === "user").length === 0 &&
            models &&
            models.length > 0 && (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowModelSelector(!showModelSelector)}
                  className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
                >
                  {showModelSelector ? "Hide" : "Change"} AI model{" "}
                  {showModelSelector ? "▲" : "▼"}
                </button>
                {showModelSelector && (
                  <div className="space-y-2">
                    <select
                      value={selectedModel || session.model_key}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-2 py-1 text-xs text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none"
                    >
                      <option value="">Random model (recommended)</option>
                      {models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    {selectedModel && selectedModel !== session.model_key && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-[color:var(--text-muted)]">
                          Will use: {selectedModel}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            // Reset session to force recreation with new model
                            setSession(null);
                            setMessages([]);
                            hasInitializedRef.current = false;
                            setShowModelSelector(false);
                          }}
                          className="text-xs bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)] px-2 py-1 rounded hover:bg-[color:var(--button-primary-hover)] transition-colors"
                        >
                          Apply model change
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          {!session && models && models.length > 0 && (
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => setShowModelSelector(!showModelSelector)}
                className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
              >
                {showModelSelector ? "Hide" : "Choose"} AI model{" "}
                {showModelSelector ? "▲" : "▼"}
              </button>
              {showModelSelector && (
                <div className="space-y-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-2 py-1 text-xs text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none"
                  >
                    <option value="">Random model (recommended)</option>
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  {selectedModel && (
                    <p className="text-[10px] text-[color:var(--text-muted)]">
                      Selected: {selectedModel}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-card-border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted-strong)]"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {checkoutSession?.checkout_url && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <p className="mb-2 font-medium">Rate limit reached</p>
          <p className="mb-2">
            Upgrade with Factoid Chat to keep the conversation going.
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCheckoutRedirect();
            }}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--button-primary-bg)] px-3 py-1 text-sm font-medium text-[color:var(--button-primary-text)] hover:bg-[color:var(--button-primary-hover)]"
          >
            Open checkout
            <span aria-hidden>↗</span>
          </button>
        </div>
      )}

      <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] p-3 text-sm">
        {messages.length === 0 && (
          <div className="space-y-2 text-[color:var(--text-muted)]">
            {isInitializing ? (
              <p>Connecting to the factoid agent...</p>
            ) : (
              <>
                <p>Ask anything about this factoid to get started.</p>
                {session?.model_key && (
                  <p className="text-[10px] text-[color:var(--text-muted)] border-l-2 border-[color:var(--surface-card-border)] pl-2">
                    🤖 Using AI model:{" "}
                    <span className="font-mono">{session.model_key}</span>
                    {!selectedModel && models && models.length > 0 && (
                      <span className="ml-1">
                        (randomly selected - you can change it above)
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {messages
          .filter((message) => message.role !== "tool")
          .map((message) => {
            const text = renderMessageText(message);
            const isUser = message.role === "user";
            const isAssistant = message.role === "assistant";
            const toolNames = Array.isArray(message.tool_calls)
              ? message.tool_calls.map((call) => call.tool_name || "tool")
              : [];
            const hasToolCalls = toolNames.length > 0;
            const trimmedText = text.trim();
            const hasText = trimmedText.length > 0;
            const bubbleClasses = isUser
              ? "self-end bg-indigo-50 text-indigo-900"
              : isAssistant
                ? "self-start bg-slate-100 text-slate-900"
                : "self-start bg-emerald-50 text-emerald-900";

            return (
              <div key={message.id} className="flex flex-col gap-1">
                <div
                  className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs ${bubbleClasses}`}
                >
                  {hasText ? (
                    <MarkdownContent content={text} />
                  ) : hasToolCalls ? (
                    <p className="italic text-[color:var(--text-muted)]">
                      Calling {toolNames.join(", ")}...
                    </p>
                  ) : (
                    <p className="italic text-[color:var(--text-muted)]">
                      (no content)
                    </p>
                  )}
                </div>
                {message.role === "assistant" &&
                  Array.isArray(message.tool_calls) &&
                  message.tool_calls.length > 0 && (
                    <CollapsibleToolResults toolCalls={message.tool_calls} />
                  )}
              </div>
            );
          })}
        <div ref={messagesEndRef} />
        {isSending && (
          <div className="text-xs text-[color:var(--text-muted)]">
            The factoid agent is thinking…
          </div>
        )}
      </div>

      <form className="space-y-2" onSubmit={handleSend}>
        <textarea
          className="h-20 w-full resize-none rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] p-2 text-sm text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none"
          placeholder="Ask a question, request sources, or say hi"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          disabled={isInitializing || isSending}
        />
        <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
          {rateLimit && (
            <span>
              {rateLimit.current_window_requests}/{rateLimit.per_minute}{" "}
              requests used this minute
            </span>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--button-primary-bg)] px-3 py-1.5 text-sm font-medium text-[color:var(--button-primary-text)] transition-colors hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              isInitializing || isSending || inputValue.trim().length === 0
            }
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CollapsibleToolResults({ toolCalls }: { toolCalls: ChatToolCall[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toolNames = toolCalls
    .map((call) => call.tool_name ?? "tool")
    .join(", ");

  return (
    <div className="max-w-[90%] rounded-md bg-slate-50 p-2 text-[10px] text-slate-600">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between text-left hover:bg-slate-100 rounded px-1 py-0.5"
      >
        <span className="font-medium">
          Tools used: {toolNames} ({toolCalls.length})
        </span>
        <span className="ml-2 text-slate-400">{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {toolCalls.map((call, index) => (
            <ToolCallItem key={call.id ?? index} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolCallItem({ call }: { call: ChatToolCall }) {
  const toolName = call.tool_name ?? "tool";

  const parsedResult = useMemo(() => {
    if (!call.result) {
      return null;
    }
    if (typeof call.result === "string") {
      try {
        return JSON.parse(call.result);
      } catch {
        return call.result;
      }
    }
    return call.result;
  }, [call.result]);

  const searchData = useMemo(() => {
    if (toolName !== "web_search" || !parsedResult) {
      return null;
    }
    if (typeof parsedResult !== "object") {
      return null;
    }
    const record = parsedResult as Record<string, unknown>;
    const query = typeof record.query === "string" ? record.query : null;
    const rawResults = Array.isArray(record.results) ? record.results : [];
    const results = rawResults
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .map((item) => {
        const title =
          typeof item.title === "string"
            ? item.title
            : typeof item.name === "string"
              ? item.name
              : null;
        const snippet =
          typeof item.snippet === "string"
            ? item.snippet
            : typeof item.description === "string"
              ? item.description
              : null;
        const url =
          typeof item.url === "string"
            ? item.url
            : typeof item.link === "string"
              ? item.link
              : null;
        return { title, snippet, url };
      });
    return { query, results };
  }, [toolName, parsedResult]);

  const fallbackText = useMemo(() => {
    if (!parsedResult) {
      return null;
    }
    if (typeof parsedResult === "string") {
      return parsedResult;
    }
    if (typeof parsedResult === "object") {
      return JSON.stringify(parsedResult, null, 2);
    }
    return String(parsedResult);
  }, [parsedResult]);

  return (
    <li className="border-b border-slate-100 pb-2 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-[color:var(--text-primary)]">
          {toolName}
        </span>

        {toolName === "web_search" ? (
          <div className="space-y-2">
            {searchData?.query && (
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
                Query: {searchData.query}
              </p>
            )}
            {searchData && searchData.results.length > 0 ? (
              <ul className="space-y-2 text-xs text-[color:var(--text-secondary)]">
                {searchData.results.map((item, itemIndex) => (
                  <li
                    key={`${item.url ?? item.title ?? itemIndex}`}
                    className="rounded-md bg-white/60 p-2"
                  >
                    {item.title && (
                      <p className="font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </p>
                    )}
                    {item.snippet && (
                      <p className="mt-1 text-[color:var(--text-secondary)]">
                        {item.snippet}
                      </p>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-600 underline"
                      >
                        Visit source
                        <span aria-hidden>↗</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="italic text-[color:var(--text-muted)]">
                No search results available.
              </p>
            )}
          </div>
        ) : fallbackText ? (
          <div className="max-h-64 overflow-y-auto rounded-md bg-white/60 p-2 text-xs text-slate-700">
            <MarkdownContent content={fallbackText} compact />
          </div>
        ) : (
          <p className="italic text-[color:var(--text-muted)]">
            Awaiting tool result...
          </p>
        )}
      </div>
    </li>
  );
}

function MarkdownContent({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  const components = React.useMemo<Components>(
    () => ({
      p: ({ node, ...props }) => (
        <p
          {...(props as React.HTMLAttributes<HTMLParagraphElement>)}
          className={compact ? "mb-1 last:mb-0" : "mb-2 last:mb-0"}
        />
      ),
      ul: ({ node, ...props }) => (
        <ul
          {...(props as React.HTMLAttributes<HTMLUListElement>)}
          className={
            compact
              ? "mb-1 list-disc pl-4 text-[color:var(--text-secondary)]"
              : "mb-2 list-disc pl-4 text-[color:var(--text-secondary)]"
          }
        />
      ),
      ol: ({ node, ...props }) => (
        <ol
          {...(props as React.HTMLAttributes<HTMLOListElement>)}
          className={
            compact
              ? "mb-1 list-decimal pl-4 text-[color:var(--text-secondary)]"
              : "mb-2 list-decimal pl-4 text-[color:var(--text-secondary)]"
          }
        />
      ),
      li: ({ node, ...props }) => (
        <li
          {...(props as React.LiHTMLAttributes<HTMLLIElement>)}
          className="mb-1 last:mb-0"
        />
      ),
      a: ({ node, ...props }) => (
        <a
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
          className="text-indigo-600 underline hover:text-indigo-500"
          target="_blank"
          rel="noopener noreferrer"
        />
      ),
      code: ({
        inline,
        children,
        ...props
      }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
        if (!inline) {
          return (
            <pre
              className="my-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100"
              {...(props as React.HTMLAttributes<HTMLPreElement>)}
            >
              <code>{children}</code>
            </pre>
          );
        }
        return (
          <code
            className="rounded bg-slate-200 px-1 py-0.5 text-[11px] text-slate-800"
            {...(props as React.HTMLAttributes<HTMLElement>)}
          >
            {children}
          </code>
        );
      },
    }),
    [compact]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
