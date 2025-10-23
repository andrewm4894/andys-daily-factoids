/**
 * Frontend session ID management for linking LLM analytics traces.
 *
 * Generates and persists a session ID that:
 * - Persists across page reloads within the same browsing session
 * - Expires after 60 minutes of inactivity
 * - Links all factoid generations and chat interactions in PostHog
 */

const SESSION_ID_KEY = "andys_factoids_session_id";
const SESSION_TIMESTAMP_KEY = "andys_factoids_session_timestamp";
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function isSessionExpired(timestamp: number): boolean {
  return Date.now() - timestamp > SESSION_TIMEOUT_MS;
}

/**
 * Get or create a session ID.
 * Returns the existing session ID if valid, or creates a new one if expired/missing.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    // SSR context - generate a temporary session ID
    return generateSessionId();
  }

  try {
    const existingId = localStorage.getItem(SESSION_ID_KEY);
    const timestampStr = localStorage.getItem(SESSION_TIMESTAMP_KEY);

    if (existingId && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      if (!isNaN(timestamp) && !isSessionExpired(timestamp)) {
        // Update timestamp to extend the session
        localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
        return existingId;
      }
    }

    // Create new session
    const newId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, newId);
    localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    return newId;
  } catch (error) {
    // Fallback if localStorage is unavailable
    console.warn("Failed to access localStorage for session ID:", error);
    return generateSessionId();
  }
}

/**
 * Clear the current session (useful for testing or manual reset).
 */
export function clearSession(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(SESSION_ID_KEY);
    localStorage.removeItem(SESSION_TIMESTAMP_KEY);
  } catch (error) {
    console.warn("Failed to clear session from localStorage:", error);
  }
}
