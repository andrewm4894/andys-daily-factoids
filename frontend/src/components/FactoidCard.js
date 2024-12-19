// frontend/src/components/FactoidCard.js
import React from 'react';
import './FactoidCard.css';

function FactoidCard({ factoid, onVote }) {

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(factoid.text);
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, '_blank');
  };

  const handleCopy = (event) => {
    const textToCopy = factoid.text;
    const button = event.target;
  
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        button.textContent = '✅';
        setTimeout(() => {
          button.textContent = '📋';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    } else {
      console.error('Clipboard API not supported or not available over HTTP');
    }
  };

  return (
    <div className="factoid-card">
      <p className="factoid-text">{factoid.text}</p>
      <div className="meta">
        <button className="vote-button upvote" onClick={() => onVote(factoid.id, 'up')} title="My mind is blown!">🤯 <span className="votes">{factoid.votesUp}</span></button>
        <button className="vote-button downvote" onClick={() => onVote(factoid.id, 'down')} title="Meh">😒 <span className="votes">{factoid.votesDown}</span></button>
        <button onClick={handleGoogleSearch} className="google-button" title="Search up that bad boy">Google this ASAP!</button>
        <button onClick={handleCopy} className="copy-button" title="Copy">📋</button>
        <span className="created-at" title="Created At">{new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default FactoidCard;
