// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import './App.css';
import FactoidCard from './components/FactoidCard';

function App() {
  const [factoids, setFactoids] = useState([]);
  const [loading, setLoading] = useState(true); // For loading state
  const [error, setError] = useState(null);     // For error handling

  // Determine API base URL based on environment
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

  useEffect(() => {
    const fetchFactoids = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/.netlify/functions/getFactoids`);
        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        setFactoids(data);
      } catch (err) {
        console.error('Failed to fetch factoids:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFactoids();
  }, [API_BASE_URL]);

  const handleVote = async (id, voteType) => {
    try {
      const response = await fetch(`${API_BASE_URL}/.netlify/functions/voteFactoid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoidId: id, voteType }),
      });

      if (!response.ok) {
        throw new Error(`Vote failed: ${response.status} ${response.statusText}`);
      }

      const updatedFactoid = await response.json();
      setFactoids(prev =>
        prev.map(f => f.id === updatedFactoid.id ? updatedFactoid : f)
      );
    } catch (err) {
      console.error('Failed to vote:', err);
      alert('Failed to register your vote. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
        <h1>Andy's Daily Factoids 🤯</h1>
        <p>(llm powered of course)</p>
        </header>
        <p>Loading factoids...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Andy's Daily Factoids 🤯</h1>
          <p>(llm powered of course)</p>
        </header>
        <p style={{ color: 'red' }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Andy's Daily Factoids 🤯</h1>
        <a href="https://github.com/andrewm4894/andys-daily-factoids/blob/main/scripts/generateFactoid.mjs" target="_blank" rel="noopener noreferrer">
        (llm powered of course)
        </a>
      </header>
      <div className="factoid-list">
        {factoids.length > 0 ? (
          factoids.map(factoid => (
            <FactoidCard factoid={factoid} onVote={handleVote} key={factoid.id} />
          ))
        ) : (
          <p>No factoids available.</p>
        )}
      </div>
    </div>
  );
}

export default App;
