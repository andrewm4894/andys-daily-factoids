// frontend/src/hooks/useFactoids.js
import { useState, useCallback, useEffect } from "react";

export function useFactoids(API_BASE_URL) {
  const [factoids, setFactoids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // === Fetch existing factoids ===
  const fetchFactoids = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/getFactoids`
      );
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setFactoids(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch factoids:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  // Call fetchFactoids when component mounts
  useEffect(() => {
    fetchFactoids();
  }, [fetchFactoids]);

  // === Voting logic ===
  const voteFactoid = async (id, voteType) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/voteFactoid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factoidId: id, voteType }),
        }
      );
      if (!response.ok) {
        throw new Error(`Vote failed: ${response.status} ${response.statusText}`);
      }
      const updatedFactoid = await response.json();
      setFactoids((prev) =>
        prev.map((f) => (f.id === updatedFactoid.id ? updatedFactoid : f))
      );
    } catch (err) {
      console.error("Failed to vote:", err);
      alert("Failed to register your vote. Please try again.");
    }
  };

  // === Shuffle factoids ===
  const shuffleFactoids = () => {
    const shuffled = [...factoids].sort(() => Math.random() - 0.5);
    setFactoids(shuffled);
  };

  return {
    factoids,
    loading,
    error,
    fetchFactoids,
    voteFactoid,
    shuffleFactoids,
  };
}
