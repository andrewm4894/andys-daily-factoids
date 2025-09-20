// frontend/src/hooks/useGenerateFactoid.js
import { useState } from "react";

export function useGenerateFactoid(API_BASE_URL, onRateLimitUpdate = null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFactoid, setGeneratedFactoid] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);

  const generateFactoid = async (model = null, parameters = null, useRandomParams = true) => {
    setIsGenerating(true);
    setGeneratedFactoid(null);
    setRateLimitError(null);

    try {
      const requestBody = {
        model,
        parameters,
        useRandomParams,
      };

      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/generateFactoid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FUNCTIONS_API_KEY || "",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit exceeded
          const errorData = await response.json();
          setRateLimitError(errorData);
          throw new Error(errorData.message || "Rate limit exceeded");
        }
        throw new Error(
          `Error generating factoid: ${response.status} ${response.statusText}`
        );
      }
      
      const data = await response.json();
      setGeneratedFactoid(data);
      
      // Update rate limit info if callback provided
      if (onRateLimitUpdate && data.rateLimitInfo) {
        onRateLimitUpdate(data);
      }
    } catch (err) {
      console.error("Failed to generate factoid:", err);
      if (err.message.includes("Rate limit")) {
        // Don't show alert for rate limit errors, let the UI handle it
        console.warn("Rate limit exceeded:", err.message);
      } else {
        alert("Failed to generate factoid. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return { 
    isGenerating, 
    generatedFactoid, 
    generateFactoid, 
    setGeneratedFactoid,
    rateLimitError,
    setRateLimitError
  };
}
