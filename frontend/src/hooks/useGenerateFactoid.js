// src/hooks/useGenerateFactoid.js
import { useState } from "react";

export function useGenerateFactoid(API_BASE_URL) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFactoid, setGeneratedFactoid] = useState(null);

  const generateFactoid = async () => {
    setIsGenerating(true);
    setGeneratedFactoid(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/generateFactoid`,
        {
          method: "POST",
          headers: {
            "x-api-key": process.env.REACT_APP_FUNCTIONS_API_KEY || "",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Error generating factoid: ${response.status} ${response.statusText}`
        );
      }
      const data = await response.json();
      setGeneratedFactoid(data);
    } catch (err) {
      console.error("Failed to generate factoid:", err);
      alert("Failed to generate factoid. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return { isGenerating, generatedFactoid, generateFactoid, setGeneratedFactoid };
}
