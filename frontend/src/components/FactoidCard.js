// frontend/src/components/FactoidCard.js
import React from 'react';
import './FactoidCard.css'; // Ensure the path is correct

function FactoidCard({ factoid, onVote }) {
  return (
    <div className="factoid-card">
      <p>{factoid.text}</p>
      <div className="meta">
        <button onClick={() => onVote(factoid.id, 'up')}>👍<span> ({factoid.votesUp})</span></button>
        <button onClick={() => onVote(factoid.id, 'down')}>👎<span> ({factoid.votesDown})</span></button>
        <span>{new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default FactoidCard;
