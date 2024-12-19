// frontend/src/components/FactoidCard.js

import React, { useState } from "react";
import "./FactoidCard.css";

function FactoidCard({ factoid, onVote }) {
  const [isRevealed, setIsRevealed] = useState(false);

  const handleCardClick = () => {
    setIsRevealed(!isRevealed);
  };

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(factoid.text);
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, "_blank");
  };

  const handleCopy = (event) => {
    const textToCopy = factoid.text;
    const button = event.target;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          button.textContent = "✅";
          setTimeout(() => {
            button.textContent = "📋";
          }, 2000);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
        });
    } else {
      console.error("Clipboard API not supported or not available over HTTP");
    }
  };

  const getTeaser = (text, emoji) => {
    const teaser = text.length > 50 ? text.substring(0, 50) + "..." : text;
    return emoji ? `${emoji} ${teaser}` : teaser;
  };

  return (
    <div
      className={`factoid-card ${isRevealed ? "revealed" : ""}`}
      onClick={handleCardClick}
    >
      {isRevealed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(e);
          }}
          className="copy-button"
          title="Copy"
        >
          📋
        </button>
      )}
      {!isRevealed ? (
        <div className="factoid-content">
          <p className="factoid-subject">{getTeaser(factoid.text, factoid.emoji) || "Surprise"}</p>
        </div>
      ) : (
        <p className="factoid-text">{factoid.text}</p>
      )}
      <div className={`meta ${isRevealed ? "" : "hidden"}`}>
        <button
          className="button vote-button upvote"
          onClick={(e) => {
            e.stopPropagation();
            onVote(factoid.id, "up");
          }}
          title="My mind is blown!"
        >
          🤯 <span className="votes">{factoid.votesUp}</span>
        </button>
        <button
          className="button vote-button downvote"
          onClick={(e) => {
            e.stopPropagation();
            onVote(factoid.id, "down");
          }}
          title="Meh"
        >
          😒 <span className="votes">{factoid.votesDown}</span>
        </button>
        <button
          className="button google-button"
          onClick={(e) => {
            e.stopPropagation();
            handleGoogleSearch();
          }}
          title="Search up that bad boy"
        >
          Google this ASAP!
        </button>
        <span className="created-at" title="Created At">
          {new Date(factoid.createdAt._seconds * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export default FactoidCard;
