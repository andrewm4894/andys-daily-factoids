// src/components/ModalContent.js
import React from "react";
import FactoidCard from "./FactoidCard";

export default function ModalContent({
  isGenerating,
  generatedFactoid,
  onClose,
}) {
  if (isGenerating) {
    return <p>Generating a new factoid...🪄</p>;
  }

  if (!generatedFactoid) {
    return <p>Something went wrong, please try again.</p>;
  }

  return (
    <>
      <h2>New Factoid Generated!</h2>
      <FactoidCard
        factoid={{
          id: generatedFactoid.id,
          text: generatedFactoid.factoidText,
          subject: generatedFactoid.factoidSubject,
          emoji: generatedFactoid.factoidEmoji,
          votesUp: 0,
          votesDown: 0,
        }}
        onVote={() => {}}
        initiallyRevealed={true}
      />
      <p>
        <em>Close and refresh the page to see this new factoid on the homepage.</em>
      </p>
      <button onClick={onClose}>Close</button>
    </>
  );
}
