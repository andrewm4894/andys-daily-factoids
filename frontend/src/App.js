// frontend/src/App.js
import React, { useEffect, useRef, useState } from "react";
import Modal from "react-modal";

import "./App.css";

import { useFactoids } from "./hooks/useFactoids";
import { useGenerateFactoid } from "./hooks/useGenerateFactoid";
import { usePayPerFactoid } from "./hooks/usePayPerFactoid";
import { useRateLimit } from "./hooks/useRateLimit";

import Header from "./components/Header";
import Loader from "./components/Loader";
import ErrorMessage from "./components/ErrorMessage";
import FactoidCard from "./components/FactoidCard";
import ModalContent from "./components/ModalContent";
import ModelSelector from "./components/ModelSelector";
import RateLimitStatus from "./components/RateLimitStatus";

import { customModalStyles } from "./styles/ModalStyles";

function App() {
  const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "https://andys-daily-factoids.com";

  // Stripe price ID for pay-per-factoid
  const priceId = "price_1Qg9W2DuK9b9aydC1SXsQob8";

  // Local state for controlling modals
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [configModalIsOpen, setConfigModalIsOpen] = useState(false);
  
  // State for model selection
  const [selectedModel, setSelectedModel] = useState("");
  const [parameters, setParameters] = useState({});
  const [useRandomParams, setUseRandomParams] = useState(true);
  const latestGenerationConfigRef = useRef({
    model: null,
    parameters: null,
    useRandomParams: true,
  });

  // Hooks for existing factoids
  const {
    factoids,
    loading,
    error,
    fetchFactoids,
    voteFactoid,
    shuffleFactoids,
  } = useFactoids(API_BASE_URL);

  // Hook for rate limiting
  const {
    rateLimitInfo,
    isCheckingRateLimit,
    fetchRateLimitStatus,
    updateFromGenerationResponse,
    canGenerateMore,
    getStatusMessage,
  } = useRateLimit(API_BASE_URL);

  // Hook for generating a new factoid
  const {
    isGenerating,
    generatedFactoid,
    generateFactoid,
    setGeneratedFactoid,
    rateLimitError,
  } = useGenerateFactoid(API_BASE_URL, updateFromGenerationResponse);

  // Our new custom hook for the pay-per-factoid flow
  const { isProcessing, sessionVerified, handlePayAndGenerateFactoid } =
    usePayPerFactoid({
      generateFactoid: () => {
        const config = latestGenerationConfigRef.current;
        return generateFactoid(
          config.model,
          config.parameters,
          config.useRandomParams
        );
      },
    });

  const resetGenerationConfig = () => {
    setSelectedModel("");
    setParameters({});
    setUseRandomParams(true);
  };

  const openGenerationConfigModal = () => {
    resetGenerationConfig();
    setConfigModalIsOpen(true);
  };

  const closeGenerationConfigModal = () => {
    setConfigModalIsOpen(false);
  };

  const handleGenerationConfigSubmit = async () => {
    const config = {
      model: selectedModel || null,
      parameters: useRandomParams ? null : parameters,
      useRandomParams,
    };

    latestGenerationConfigRef.current = config;
    setConfigModalIsOpen(false);

    if (canGenerateMore()) {
      await generateFactoid(config.model, config.parameters, config.useRandomParams);
    } else {
      await handlePayAndGenerateFactoid(priceId);
    }
  };

  // Close the modal and refresh the factoids list
  const handleCloseModal = () => {
    setModalIsOpen(false);
    setGeneratedFactoid(null);
    fetchFactoids();
  };

  // We only open the modal if we do have a generated factoid
  // (the hook calls generateFactoid once payment is verified)
  // so we can check if we should show the modal here.
  useEffect(() => {
    if (generatedFactoid) {
      setModalIsOpen(true);
    }
  }, [generatedFactoid]);

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
        <RateLimitStatus
          rateLimitInfo={rateLimitInfo}
          isCheckingRateLimit={isCheckingRateLimit}
          rateLimitError={rateLimitError}
          onRefresh={fetchRateLimitStatus}
        />

        <div className="button-container">
          <button
            className="factoid-button generate-button"
            onClick={openGenerationConfigModal}
            disabled={isProcessing || isGenerating}
            title={!canGenerateMore() && !rateLimitError ? getStatusMessage() : ""}
          >
            {isProcessing
              ? "Loading Stripe checkout...💸"
              : isGenerating
              ? "Generating...🪄"
              : !canGenerateMore() && !rateLimitError
              ? "Upgrade to Generate More 🚀"
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
        isOpen={configModalIsOpen}
        onRequestClose={closeGenerationConfigModal}
        contentLabel="Configure Factoid Generation"
        style={customModalStyles}
      >
        <div className="generation-config-modal">
          <div className="generation-config-header">
            <h2>Configure your generation</h2>
            <p className="modal-subtitle">
              We picked a random model and creative settings to keep things fresh. Tweak anything before you roll!
            </p>
          </div>
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            parameters={parameters}
            onParametersChange={setParameters}
            useRandomParams={useRandomParams}
            onUseRandomParamsChange={setUseRandomParams}
            API_BASE_URL={API_BASE_URL}
          />
          <div className="modal-actions">
            <button
              className="factoid-button transparent-button"
              onClick={closeGenerationConfigModal}
              disabled={isProcessing || isGenerating}
            >
              Cancel
            </button>
            <button
              className="factoid-button generate-button"
              onClick={handleGenerationConfigSubmit}
              disabled={isProcessing || isGenerating}
            >
              {isProcessing
                ? "Loading Stripe checkout...💸"
                : isGenerating
                ? "Generating...🪄"
                : canGenerateMore()
                ? "Generate Factoid 🧙"
                : "Upgrade & Generate 🚀"}
            </button>
          </div>
        </div>
      </Modal>

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
