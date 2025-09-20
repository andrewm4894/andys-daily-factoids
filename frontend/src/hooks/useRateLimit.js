// frontend/src/hooks/useRateLimit.js
import { useState, useEffect, useCallback } from "react";

export function useRateLimit(API_BASE_URL) {
  const [rateLimitInfo, setRateLimitInfo] = useState({
    // Global limits
    globalLimits: {
      hourlyUsage: 0,
      dailyUsage: 0,
      hourlyLimit: 50,
      dailyLimit: 200
    },
    // IP limits
    ipLimits: {
      hourlyUsage: 0,
      minuteUsage: 0,
      hourlyLimit: 10,
      minuteLimit: 3
    },
    limitType: null, // 'global', 'ip', or null
    isLoading: true,
    error: null
  });

  const [isCheckingRateLimit, setIsCheckingRateLimit] = useState(false);

  // Fetch current rate limit status
  const fetchRateLimitStatus = useCallback(async () => {
    setIsCheckingRateLimit(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/checkRateLimit`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FUNCTIONS_API_KEY || "",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch rate limit status: ${response.status}`);
      }

      const data = await response.json();
      setRateLimitInfo({
        ...data,
        isLoading: false,
        error: null
      });
    } catch (err) {
      console.error("Failed to fetch rate limit status:", err);
      setRateLimitInfo(prev => ({
        ...prev,
        isLoading: false,
        error: err.message
      }));
    } finally {
      setIsCheckingRateLimit(false);
    }
  }, [API_BASE_URL]);

  // Update rate limit info from a successful generation response
  const updateFromGenerationResponse = useCallback((generationResponse) => {
    if (generationResponse && generationResponse.rateLimitInfo) {
      setRateLimitInfo(prev => ({
        ...prev,
        ...generationResponse.rateLimitInfo,
        isLoading: false,
        error: null
      }));
    }
  }, []);

  // Calculate time remaining until next generation is allowed
  const getTimeUntilReset = useCallback(() => {
    if (!rateLimitInfo.resetTime) return null;
    
    const now = Date.now();
    const resetTime = new Date(rateLimitInfo.resetTime).getTime();
    const timeRemaining = Math.max(0, resetTime - now);
    
    return timeRemaining;
  }, [rateLimitInfo.resetTime]);

  // Format time remaining as human-readable string
  const getFormattedTimeRemaining = useCallback(() => {
    const timeRemaining = getTimeUntilReset();
    if (!timeRemaining) return null;

    const minutes = Math.ceil(timeRemaining / (1000 * 60));
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.ceil(minutes / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
  }, [getTimeUntilReset]);

  // Check if user can generate more factoids
  const canGenerateMore = useCallback(() => {
    return rateLimitInfo.limitType === null; // No limits exceeded
  }, [rateLimitInfo.limitType]);

  // Get status message for UI
  const getStatusMessage = useCallback(() => {
    if (rateLimitInfo.isLoading) {
      return "Checking usage...";
    }

    if (rateLimitInfo.error) {
      return "Unable to check usage";
    }

    if (rateLimitInfo.limitType === 'global') {
      return `Global rate limit reached: ${rateLimitInfo.globalLimits.hourlyUsage}/${rateLimitInfo.globalLimits.hourlyLimit} per hour`;
    } else if (rateLimitInfo.limitType === 'ip') {
      return `IP rate limit reached: ${rateLimitInfo.ipLimits.minuteUsage}/${rateLimitInfo.ipLimits.minuteLimit} per minute`;
    } else {
      // Show global usage info
      return `Global: ${rateLimitInfo.globalLimits.hourlyUsage}/${rateLimitInfo.globalLimits.hourlyLimit} per hour`;
    }
  }, [rateLimitInfo]);

  // Fetch rate limit status on mount
  useEffect(() => {
    fetchRateLimitStatus();
  }, [fetchRateLimitStatus]);

  return {
    rateLimitInfo,
    isCheckingRateLimit,
    fetchRateLimitStatus,
    updateFromGenerationResponse,
    getTimeUntilReset,
    getFormattedTimeRemaining,
    canGenerateMore,
    getStatusMessage
  };
}
