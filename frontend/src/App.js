import React, { useEffect, useState } from 'react';
import FactoidCard from './components/FactoidCard';

function App() {
  const [factoids, setFactoids] = useState([]);

  useEffect(() => {
    fetch('/.netlify/functions/getFactoids')
      .then(res => res.json())
      .then(data => setFactoids(data));
  }, []);

  const handleVote = (id, voteType) => {
    fetch('/.netlify/functions/voteFactoid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoidId: id, voteType }),
    })
      .then(res => res.json())
      .then(updatedFactoid => {
        // Update the local state with the new vote counts
        setFactoids(prevFactoids => prevFactoids.map(f => f.id === id ? updatedFactoid : f));
      })
      .catch(err => console.error(err));
  };

  return (
    <div>
      <h1>Daily Factoids</h1>
      <div className="factoid-list">
        {factoids.map(f => (
          <FactoidCard factoid={f} key={f.id} onVote={handleVote} />
        ))}
      </div>
    </div>
  );
}

export default App;
