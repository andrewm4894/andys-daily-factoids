import React, { useEffect, useState } from 'react';

function App() {
  const [factoids, setFactoids] = useState([]);

  useEffect(() => {
    fetch('/.netlify/functions/getFactoids')
      .then((res) => res.json())
      .then((data) => setFactoids(data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div className="App">
      <h1>Daily Factoids</h1>
      <ul>
        {factoids.map((factoid) => (
          <li key={factoid.id}>
            <p>{factoid.text}</p>
            <p><strong>Created:</strong> {new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</p>
            <p>Upvotes: {factoid.votesUp} | Downvotes: {factoid.votesDown}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
