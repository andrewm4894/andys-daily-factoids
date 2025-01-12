// frontend/src/App.js
import React, { useState } from "react";
import Modal from "react-modal";

import "./App.css";

import { useFactoids } from "./hooks/useFactoids";
import { useGenerateFactoid } from "./hooks/useGenerateFactoid";
import { usePayPerFactoid } from "./hooks/usePayPerFactoid";

import Header from "./components/Header";
import Loader from "./components/Loader";
import ErrorMessage from "./components/ErrorMessage";
import FactoidCard from "./components/FactoidCard";
import ModalContent from "./components/ModalContent";

import { customModalStyles } from "./styles/ModalStyles";

function App() {
  const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "https://andys-daily-factoids.com";

  // Our Stripe price ID for pay-per-factoid
  const priceId = "price_1Qg9W2DuK9b9aydC1SXsQob8";

  // Local state for controlling the modal
  const [modalIsOpen, setModalIsOpen] = useState(false);

  // Hooks for existing factoids
  const {
    factoids,
    loading,
    error,
    fetchFactoids,
    voteFactoid,
    shuffleFactoids,
  } = useFactoids(API_BASE_URL);

  // Hook for generating a new factoid
  const {
    isGenerating,
    generatedFactoid,
    generateFactoid,
    setGeneratedFactoid,
  } = useGenerateFactoid(API_BASE_URL);

  // Our new custom hook for the pay-per-factoid flow
  const { isProcessing, sessionVerified, handlePayAndGenerateFactoid } =
    usePayPerFactoid({ generateFactoid });

  // Close the modal and refresh the factoids list
  const handleCloseModal = () => {
    setModalIsOpen(false);
    setGeneratedFactoid(null);
    fetchFactoids();
  };

  // We only open the modal if we do have a generated factoid
  // (the hook calls generateFactoid once payment is verified)
  // so we can check if we should show the modal here.
  if (sessionVerified && generatedFactoid && !modalIsOpen) {
    // Open the modal once session verified & factoid is generated
    setModalIsOpen(true);
  }

  // === Loading states ===
  if (loading) {
    return (
      <div className="App">
        <Header />
        <Loader message="Loading factoids..." />
      </div>
    );
  }

  // === Error states ===
  if (error) {
    return (
      <div className="App">
        <Header />
        <ErrorMessage error={error} />
      </div>
    );
  }

  // === Main UI ===
  return (
    <div className="App">
      <Header />

      <div className="factoid-list">
        <div className="button-container">
          <button
            className="factoid-button generate-button"
            onClick={() => handlePayAndGenerateFactoid(priceId)}
            disabled={isProcessing || isGenerating}
          >
            {isProcessing
              ? "Processing Payment..."
              : isGenerating
              ? "Generating...🪄"
              : "Generate Factoid 🧙"}
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
        style={customModalStyles}
      >
        <ModalContent
          isGenerating={isGenerating}
          generatedFactoid={generatedFactoid}
          onClose={handleCloseModal}
        />
      </Modal>
    </div>
  );
}

export default App;
