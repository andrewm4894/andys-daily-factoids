// frontend/src/components/FactoidCard.js
import React from 'react';
import './FactoidCard.css';

function FactoidCard({ factoid, onVote }) {
  return (
    <div className="factoid-card">
      <p className="factoid-text">{factoid.text}</p>
      <div className="meta">
        <button className="vote-button upvote" onClick={() => onVote(factoid.id, 'up')}>👍 <span className="votes">{factoid.votesUp}</span></button>
        <button className="vote-button downvote" onClick={() => onVote(factoid.id, 'down')}>👎 <span className="votes">{factoid.votesDown}</span></button>
        <span className="created-at">{new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default FactoidCard;
