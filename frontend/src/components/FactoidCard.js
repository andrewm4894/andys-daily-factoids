// frontend/src/components/FactoidCard.js
import React from 'react';
import './FactoidCard.css';

function FactoidCard({ factoid, onVote }) {

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(factoid.text);
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, '_blank');
  };


  return (
    <div className="factoid-card">
      <p className="factoid-text">{factoid.text}</p>
      <div className="meta">
        <button className="vote-button upvote" onClick={() => onVote(factoid.id, 'up')} title="My mind is blown!">🤯 <span className="votes">{factoid.votesUp}</span></button>
        <button className="vote-button downvote" onClick={() => onVote(factoid.id, 'down')} title="Meh">😒 <span className="votes">{factoid.votesDown}</span></button>
        <button onClick={handleGoogleSearch} className="google-button" title="Search up that bad doy">Google!</button>
        <span className="created-at" title="Created At">{new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default FactoidCard;
