// src/App.js
import React, { useState } from "react";
import Modal from "react-modal";

import "./App.css";

import { useFactoids } from "./hooks/useFactoids";
import { useGenerateFactoid } from "./hooks/useGenerateFactoid";

import Header from "./components/Header";
import Loader from "./components/Loader";
import ErrorMessage from "./components/ErrorMessage";
import FactoidCard from "./components/FactoidCard";

import { customModalStyles } from "./styles/ModalStyles"; // optional

function App() {
  const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "https://andys-daily-factoids.com";

  // From custom hooks
  const {
    factoids,
    loading,
    error,
    fetchFactoids,
    voteFactoid,
    shuffleFactoids,
  } = useFactoids(API_BASE_URL);

  const {
    isGenerating,
    generatedFactoid,
    generateFactoid,
    setGeneratedFactoid,
  } = useGenerateFactoid(API_BASE_URL);

  // Local state for controlling the modal
  const [modalIsOpen, setModalIsOpen] = useState(false);

  // Handle generation + open modal
  const handleGenerateFactoid = async () => {
    await generateFactoid();
    setModalIsOpen(true);
  };

  // Close modal and refresh the factoids
  const handleCloseModal = () => {
    setModalIsOpen(false);
    setGeneratedFactoid(null);
    fetchFactoids();
  };

  if (loading) {
    return (
      <div className="App">
        <Header />
        <Loader message="Loading factoids..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <Header />
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="App">
      <Header />

      <div className="factoid-list">
        <div className="button-container">
          <button
            className="factoid-button generate-button"
            onClick={handleGenerateFactoid}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating...🪄" : "Generate Factoid 🧙"}
          </button>
          <button
            className="factoid-button transparent-button"
            title="shuffle"
            onClick={shuffleFactoids}
          >
            🔀
          </button>
        </div>

        {factoids.length > 0 ? (
          factoids.map((factoid) => (
            <FactoidCard
              key={factoid.id}
              factoid={factoid}
              onVote={voteFactoid}
            />
          ))
        ) : (
          <p>No factoids available.</p>
        )}
      </div>

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={handleCloseModal}
        contentLabel="Generated Factoid Modal"
        style={customModalStyles} // from external file
      >
        {isGenerating ? (
          <p>Generating a new factoid...🪄</p>
        ) : generatedFactoid ? (
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
          </>
        ) : (
          <p>Something went wrong, please try again.</p>
        )}
        <button onClick={handleCloseModal}>Close</button>
      </Modal>
    </div>
  );
}

export default App;
