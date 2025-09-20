// frontend/src/components/FactoidCard.js

import React, { useState } from "react";
import "./FactoidCard.css";

function FactoidCard({ factoid, onVote, initiallyRevealed = false }) {
  const [isRevealed, setIsRevealed] = useState(initiallyRevealed);
  const [showMetadata, setShowMetadata] = useState(false);

  const handleCardClick = () => {
    setIsRevealed(!isRevealed);
  };

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(factoid.text);
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, "_blank");
  };

  const handleVote = (event, voteType) => {
    event.stopPropagation();
    const button = event.target;

    // Call the onVote function
    onVote(factoid.id, voteType);

    // Change button text to green tick
    button.innerHTML = "✅";

    setTimeout(() => {
      if (voteType === "up") {
        button.innerHTML = `🤯 <span class="votes">${factoid.votesUp}</span>`;
      } else {
        button.innerHTML = `😒 <span class="votes">${factoid.votesDown}</span>`;
      }
    }, 3000);
  };

  const handleCopy = (event) => {
    event.stopPropagation();
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

  const handleInfoClick = (event) => {
    event.stopPropagation();
    setShowMetadata(!showMetadata);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div
      className={`factoid-card ${isRevealed ? "revealed" : ""}`}
      onClick={handleCardClick}
    >

      {!isRevealed ? (
        <div className="factoid-content">
          <p className="factoid-subject">
            {getTeaser(factoid.text, factoid.emoji) || "Surprise"}
          </p>
        </div>
      ) : (
        <p className="factoid-text">{factoid.text}</p>
      )}

      {/* Information icon */}
      {factoid.generationMetadata && (
        <button
          className="button info-button"
          onClick={handleInfoClick}
          title="Show generation details"
        >
          ℹ️
        </button>
      )}

      <div className={`meta ${isRevealed ? "" : "hidden"}`}>
        <button
          className="button vote-button upvote"
          onClick={(e) => handleVote(e, "up")}
          title="My mind is blown!"
        >
          🤯 <span className="votes">{factoid.votesUp}</span>
        </button>
        <button
          className="button vote-button downvote"
          onClick={(e) => handleVote(e, "down")}
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
        <button
          className="button copy-button"
          onClick={(e) => handleCopy(e)}
          title="Copy"
        >
          📋
        </button>
      </div>

      {/* Metadata display */}
      {showMetadata && factoid.generationMetadata && (
        <div className="metadata-panel">
          <h4>Generation Details</h4>
          <div className="metadata-content">
            <div className="metadata-item">
              <strong>Model:</strong> {factoid.generationMetadata.modelName} ({factoid.generationMetadata.provider})
            </div>
            <div className="metadata-item">
              <strong>Temperature:</strong> {factoid.generationMetadata.parameters?.temperature || 'N/A'}
            </div>
            <div className="metadata-item">
              <strong>Top P:</strong> {factoid.generationMetadata.parameters?.top_p || 'N/A'}
            </div>
            <div className="metadata-item">
              <strong>Max Tokens:</strong> {factoid.generationMetadata.parameters?.max_tokens || 'N/A'}
            </div>
            <div className="metadata-item">
              <strong>Generated:</strong> {formatTimestamp(factoid.generationMetadata.timestamp)}
            </div>
            <div className="metadata-item">
              <strong>Cost:</strong> ${factoid.generationMetadata.costPer1kTokens}/1k tokens
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FactoidCard;
