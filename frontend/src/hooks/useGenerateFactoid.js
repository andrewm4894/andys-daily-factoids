// frontend/src/hooks/useGenerateFactoid.js
import { useState } from "react";

export function useGenerateFactoid(API_BASE_URL, onRateLimitUpdate = null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFactoid, setGeneratedFactoid] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);
  const [generationError, setGenerationError] = useState(null);

  const generateFactoid = async (model = null, parameters = null, useRandomParams = true) => {
    setIsGenerating(true);
    setGeneratedFactoid(null);
    setRateLimitError(null);
    setGenerationError(null);

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

      let responseData = null;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.warn("Failed to parse response JSON:", parseError);
      }

      if (!response.ok) {
        if (response.status === 429 && responseData) {
          // Rate limit exceeded
          setRateLimitError(responseData);
          throw new Error(responseData.message || "Rate limit exceeded");
        }

        // Capture full error details for better debugging
        const fullErrorDetails = {
          status: response.status,
          statusText: response.statusText,
          error: responseData?.error,
          message: responseData?.message,
          details: responseData?.details,
          responseData: responseData
        };

        // Create a comprehensive error message
        let errorMessage = responseData?.error || responseData?.message || `Error generating factoid: ${response.status} ${response.statusText}`;
        
        // Add details if available
        if (responseData?.details) {
          errorMessage += `\n\nDetails: ${JSON.stringify(responseData.details, null, 2)}`;
        }

        const error = new Error(errorMessage);
        error.fullDetails = fullErrorDetails;
        throw error;
      }

      if (!responseData) {
        throw new Error("Unexpected empty response from factoid generator.");
      }

      const data = responseData;
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
        // Store the full error details for display
        const errorToStore = {
          message: err.message || "Failed to generate factoid. Please try again.",
          fullDetails: err.fullDetails || null
        };
        setGenerationError(errorToStore);
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
    setRateLimitError,
    generationError,
    setGenerationError,
  };
}
