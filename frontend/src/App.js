import React, { useEffect, useState } from 'react';
import FactoidCard from './components/FactoidCard';

function App() {
  const [factoids, setFactoids] = useState([]);

  useEffect(() => {
    fetch('/.netlify/functions/getFactoids')
      .then(res => res.json())
      .then(data => setFactoids(data))
      .catch(err => console.error(err));
  }, []);

  const handleVote = (id, voteType) => {
    fetch('/.netlify/functions/voteFactoid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoidId: id, voteType })
    })
    .then(res => res.json())
    .then(updatedFactoid => {
      // Update the factoids state with the updated factoid
      setFactoids(prev =>
        prev.map(f => f.id === updatedFactoid.id ? updatedFactoid : f)
      );
    })
    .catch(err => console.error(err));
  };

  return (
    <div className="App">
      <h1>Daily Factoids</h1>
      <div className="factoid-list">
        {factoids.map(factoid => (
          <FactoidCard factoid={factoid} onVote={handleVote} key={factoid.id} />
        ))}
      </div>
    </div>
  );
}

export default App;
