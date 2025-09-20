// frontend/src/hooks/useModels.js
import { useState, useEffect } from "react";

export function useModels(API_BASE_URL) {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchModels = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/getModels`,
        {
          method: "GET",
          headers: {
            "x-api-key": process.env.REACT_APP_FUNCTIONS_API_KEY || "",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Error fetching models: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      console.error("Failed to fetch models:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  return { models, isLoading, error, refetch: fetchModels };
}